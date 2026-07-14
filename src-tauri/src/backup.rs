//! Vollständiges JSON-Backup/Restore aller Nutzdaten.
//!
//! Die Datei-Auswahl passiert im Frontend (`tauri-plugin-dialog`); hier wird nur
//! gegen einen bereits gewählten Pfad gelesen/geschrieben. Die testbare Kern-Logik
//! (`collect_backup`/`restore_backup`) ist von der Datei-Schicht und vom Tauri-State
//! getrennt — analog zum `update_subscription_in_db`-Seam in `commands.rs`.

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::{
    collections::HashSet,
    ffi::OsString,
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

use crate::db::{Account, AppState, Income, PriceHistoryEntry, Subscription};
use crate::validation::{
    validate_account_fields, validate_amount_cents, validate_anchor_date, validate_cancellation,
    validate_currency, validate_interval, validate_name, validate_subscription_fields,
};

/// Aktuelle Backup-Format-Version. Bei Schema-Änderungen nach Release hochzählen
/// und im Import einen Migrationspfad ergänzen (siehe BACKLOG).
const BACKUP_SCHEMA_VERSION: u32 = 1;
const BACKUP_APP: &str = "SubTracked";

/// Eine Zeile der `reminders`-Tabelle. Gibt es sonst nirgends als Struct, weil nur
/// das Backup die Roh-Zeilen braucht (Production schreibt sie über `reminders.rs`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReminderRow {
    pub id: i64,
    pub subscription_id: i64,
    pub due_date: String,
    pub sent_at: String,
}

/// Vollständiger Snapshot aller fünf Tabellen plus Format-Metadaten.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub schema_version: u32,
    pub app: String,
    pub exported_at: String,
    pub accounts: Vec<Account>,
    pub subscriptions: Vec<Subscription>,
    pub incomes: Vec<Income>,
    pub price_history: Vec<PriceHistoryEntry>,
    pub reminders: Vec<ReminderRow>,
}

pub async fn collect_backup(db: &SqlitePool) -> Result<BackupFile, String> {
    let accounts = sqlx::query_as!(
        Account,
        r#"SELECT id, name, note, currency, balance_cents, min_buffer_cents, balance_updated_at
           FROM accounts ORDER BY id"#
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let subscriptions = sqlx::query_as!(
        Subscription,
        r#"SELECT id, name, amount_cents, currency, account_id, interval, anchor_date,
           lead_days, active as "active: bool", notify as "notify: bool",
           cancel_mode, cancel_period_value, cancel_period_unit, cancel_date,
           category, one_time as "one_time: bool", archived_at,
           pending_amount_cents, pending_from
           FROM subscriptions ORDER BY id"#
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let incomes = sqlx::query_as!(
        Income,
        r#"SELECT id, name, amount_cents, currency, account_id, interval, anchor_date,
           active as "active: bool", one_time as "one_time: bool"
           FROM incomes ORDER BY id"#
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let price_history = sqlx::query_as!(
        PriceHistoryEntry,
        r#"SELECT id, subscription_id, amount_cents, currency, changed_at
           FROM subscription_price_history ORDER BY id"#
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let reminders = sqlx::query_as!(
        ReminderRow,
        r#"SELECT id, subscription_id, due_date, sent_at FROM reminders ORDER BY id"#
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(BackupFile {
        schema_version: BACKUP_SCHEMA_VERSION,
        app: BACKUP_APP.to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        accounts,
        subscriptions,
        incomes,
        price_history,
        reminders,
    })
}

fn validate_row_id(seen_ids: &mut HashSet<i64>, id: i64, label: &str) -> Result<(), String> {
    if id <= 0 {
        return Err(format!("{label}: ID muss groesser als 0 sein."));
    }
    if !seen_ids.insert(id) {
        return Err(format!("{label}: ID {id} kommt mehrfach im Backup vor."));
    }
    Ok(())
}

fn validate_existing_id(
    existing_ids: &HashSet<i64>,
    id: i64,
    label: &str,
    referenced_label: &str,
) -> Result<(), String> {
    if !existing_ids.contains(&id) {
        return Err(format!(
            "{label}: {referenced_label} mit ID {id} existiert nicht im Backup."
        ));
    }
    Ok(())
}

fn validate_sqlite_datetime(label: &str, value: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    let strict = bytes.len() == 19
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[10] == b' '
        && bytes[13] == b':'
        && bytes[16] == b':';
    if !strict {
        return Err(format!(
            "{label}: Ungueltiger Zeitpunkt: {value}. Erwartet: YYYY-MM-DD HH:MM:SS."
        ));
    }
    NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
        .map(|_| ())
        .map_err(|_| {
            format!("{label}: Ungueltiger Zeitpunkt: {value}. Erwartet: YYYY-MM-DD HH:MM:SS.")
        })
}

fn validate_optional_sqlite_datetime(label: &str, value: Option<&str>) -> Result<(), String> {
    if let Some(value) = value {
        validate_sqlite_datetime(label, value)?;
    }
    Ok(())
}

/// Prüft Format-Metadaten und jede Zeile gegen dieselben Validatoren wie die
/// regulären Commands. Läuft VOR jeder DB-Mutation, damit ein ungültiges Backup
/// den Bestand nicht anrührt.
fn validate_backup(backup: &BackupFile) -> Result<(), String> {
    if backup.app != BACKUP_APP {
        return Err(format!(
            "Unbekanntes Backup-Format (app = \"{}\", erwartet \"{BACKUP_APP}\").",
            backup.app
        ));
    }
    if backup.schema_version != BACKUP_SCHEMA_VERSION {
        return Err(format!(
            "Nicht unterstützte Backup-Version {} (erwartet {BACKUP_SCHEMA_VERSION}).",
            backup.schema_version
        ));
    }
    chrono::DateTime::parse_from_rfc3339(&backup.exported_at)
        .map_err(|_| "Backup-Zeitstempel ist ungueltig.".to_string())?;

    let mut account_ids = HashSet::new();
    let mut subscription_ids = HashSet::new();
    let mut income_ids = HashSet::new();
    let mut price_history_ids = HashSet::new();
    let mut reminder_ids = HashSet::new();
    let mut reminder_keys = HashSet::new();

    for a in &backup.accounts {
        let label = format!("Konto \"{}\"", a.name);
        validate_row_id(&mut account_ids, a.id, &label)?;
        validate_account_fields(&a.name, &a.currency, a.balance_cents, a.min_buffer_cents)
            .map_err(|e| format!("Konto \"{}\": {e}", a.name))?;
        validate_optional_sqlite_datetime(&label, a.balance_updated_at.as_deref())?;
    }
    for s in &backup.subscriptions {
        let label = format!("Abo \"{}\"", s.name);
        validate_row_id(&mut subscription_ids, s.id, &label)?;
        validate_subscription_fields(
            &s.name,
            s.amount_cents,
            &s.currency,
            &s.interval,
            &s.anchor_date,
            s.lead_days,
            s.category.as_deref(),
            s.pending_amount_cents,
            s.pending_from.as_deref(),
        )
        .map_err(|e| format!("Abo \"{}\": {e}", s.name))?;
        validate_cancellation(
            s.cancel_mode.as_deref(),
            s.cancel_period_value,
            s.cancel_period_unit.as_deref(),
            s.cancel_date.as_deref(),
        )
        .map_err(|e| format!("Abo \"{}\": {e}", s.name))?;
        if let Some(account_id) = s.account_id {
            validate_existing_id(&account_ids, account_id, &label, "Konto")?;
        }
    }
    for i in &backup.incomes {
        let label = || format!("Einnahme \"{}\"", i.name);
        validate_row_id(&mut income_ids, i.id, &label())?;
        validate_name(&i.name).map_err(|e| format!("{}: {e}", label()))?;
        validate_amount_cents(i.amount_cents).map_err(|e| format!("{}: {e}", label()))?;
        validate_currency(&i.currency).map_err(|e| format!("{}: {e}", label()))?;
        validate_interval(&i.interval).map_err(|e| format!("{}: {e}", label()))?;
        validate_anchor_date(&i.anchor_date).map_err(|e| format!("{}: {e}", label()))?;
        if let Some(account_id) = i.account_id {
            validate_existing_id(&account_ids, account_id, &label(), "Konto")?;
        }
    }
    for p in &backup.price_history {
        let label = format!("Preis-Historie #{}", p.id);
        validate_row_id(&mut price_history_ids, p.id, &label)?;
        validate_existing_id(&subscription_ids, p.subscription_id, &label, "Abo")?;
        validate_amount_cents(p.amount_cents).map_err(|e| format!("{label}: {e}"))?;
        validate_currency(&p.currency).map_err(|e| format!("{label}: {e}"))?;
        validate_sqlite_datetime(&label, &p.changed_at)?;
    }
    for r in &backup.reminders {
        let label = format!("Reminder #{}", r.id);
        validate_row_id(&mut reminder_ids, r.id, &label)?;
        validate_existing_id(&subscription_ids, r.subscription_id, &label, "Abo")?;
        validate_anchor_date(&r.due_date).map_err(|e| format!("{label}: {e}"))?;
        validate_sqlite_datetime(&label, &r.sent_at)?;
        if !reminder_keys.insert((r.subscription_id, r.due_date.clone())) {
            return Err(format!(
                "{label}: Reminder fuer Abo {} und Faelligkeit {} kommt mehrfach vor.",
                r.subscription_id, r.due_date
            ));
        }
    }
    Ok(())
}

pub async fn restore_backup(db: &SqlitePool, backup: &BackupFile) -> Result<(), String> {
    validate_backup(backup)?;

    let mut tx = db.begin().await.map_err(|e| e.to_string())?;

    // DELETE: Kinder zuerst (FK-Constraints sind in sqlx aktiv und werden sofort
    // geprüft). Einzeln statt in einer Schleife ueber ein Array, damit jede
    // Anweisung als Literal fuer sqlx::query! compile-time-verifiziert wird.
    sqlx::query!("DELETE FROM reminders")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query!("DELETE FROM subscription_price_history")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query!("DELETE FROM incomes")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query!("DELETE FROM subscriptions")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query!("DELETE FROM accounts")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // INSERT: Eltern zuerst, IDs explizit übernehmen.
    for a in &backup.accounts {
        sqlx::query!(
            "INSERT INTO accounts \
               (id, name, note, currency, balance_cents, min_buffer_cents, balance_updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            a.id,
            a.name,
            a.note,
            a.currency,
            a.balance_cents,
            a.min_buffer_cents,
            a.balance_updated_at,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    for s in &backup.subscriptions {
        sqlx::query!(
            "INSERT INTO subscriptions \
               (id, name, amount_cents, currency, account_id, interval, anchor_date, \
                lead_days, active, notify, cancel_mode, cancel_period_value, \
                cancel_period_unit, cancel_date, category, one_time, archived_at, \
                pending_amount_cents, pending_from) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            s.id,
            s.name,
            s.amount_cents,
            s.currency,
            s.account_id,
            s.interval,
            s.anchor_date,
            s.lead_days,
            s.active,
            s.notify,
            s.cancel_mode,
            s.cancel_period_value,
            s.cancel_period_unit,
            s.cancel_date,
            s.category,
            s.one_time,
            s.archived_at,
            s.pending_amount_cents,
            s.pending_from,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    for i in &backup.incomes {
        sqlx::query!(
            "INSERT INTO incomes \
               (id, name, amount_cents, currency, account_id, interval, anchor_date, active, one_time) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            i.id,
            i.name,
            i.amount_cents,
            i.currency,
            i.account_id,
            i.interval,
            i.anchor_date,
            i.active,
            i.one_time,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    for p in &backup.price_history {
        sqlx::query!(
            "INSERT INTO subscription_price_history \
               (id, subscription_id, amount_cents, currency, changed_at) \
             VALUES (?, ?, ?, ?, ?)",
            p.id,
            p.subscription_id,
            p.amount_cents,
            p.currency,
            p.changed_at,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    for r in &backup.reminders {
        sqlx::query!(
            "INSERT INTO reminders (id, subscription_id, due_date, sent_at) \
             VALUES (?, ?, ?, ?)",
            r.id,
            r.subscription_id,
            r.due_date,
            r.sent_at,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

fn temp_backup_path(target: &Path) -> Result<PathBuf, String> {
    let parent = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = target
        .file_name()
        .ok_or_else(|| "Ungueltiger Backup-Pfad.".to_string())?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let mut tmp_name = OsString::from(".");
    tmp_name.push(file_name);
    tmp_name.push(format!(".tmp-{}-{nonce}", std::process::id()));
    Ok(parent.join(tmp_name))
}

fn write_temp_and_replace(tmp_path: &Path, target: &Path, contents: &[u8]) -> io::Result<()> {
    let mut file = File::options()
        .write(true)
        .create_new(true)
        .open(tmp_path)?;
    file.write_all(contents)?;
    file.sync_all()?;
    drop(file);

    fs::rename(tmp_path, target)?;
    let _ = sync_parent_dir(target);
    Ok(())
}

#[cfg(unix)]
fn sync_parent_dir(target: &Path) -> io::Result<()> {
    if let Some(parent) = target.parent().filter(|p| !p.as_os_str().is_empty()) {
        File::open(parent)?.sync_all()?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn sync_parent_dir(_target: &Path) -> io::Result<()> {
    Ok(())
}

fn write_backup_json_atomic(path: &str, contents: &str) -> Result<(), String> {
    let target = Path::new(path);
    let tmp_path = temp_backup_path(target)?;
    write_temp_and_replace(&tmp_path, target, contents.as_bytes()).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("Konnte Backup nicht schreiben: {e}")
    })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn export_backup(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let backup = collect_backup(&state.db).await?;
    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    write_backup_json_atomic(&path, &json)?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn import_backup(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Konnte Backup nicht lesen: {e}"))?;
    let backup: BackupFile =
        serde_json::from_str(&content).map_err(|e| format!("Ungültiges Backup-Format: {e}"))?;
    restore_backup(&state.db, &backup).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    fn unique_test_dir(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default();
        let dir =
            std::env::temp_dir().join(format!("subtracked-{name}-{}-{nonce}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create test dir");
        dir
    }

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect in-memory sqlite");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("apply migrations");
        pool
    }

    async fn seed(db: &SqlitePool) {
        sqlx::query!(
            "INSERT INTO accounts (id, name, note, currency, balance_cents, min_buffer_cents, balance_updated_at) \
             VALUES (1, 'Giro', 'Hauptkonto', 'EUR', 120000, 50000, '2026-06-01 10:00:00')"
        )
        .execute(db)
        .await
        .unwrap();
        sqlx::query!(
            "INSERT INTO subscriptions (id, name, amount_cents, currency, account_id, interval, anchor_date, lead_days, active, notify) \
             VALUES (1, 'Netflix', 1799, 'EUR', 1, 'monthly', '2026-01-15', 7, 1, 1)"
        )
        .execute(db)
        .await
        .unwrap();
        sqlx::query!(
            "INSERT INTO subscription_price_history (id, subscription_id, amount_cents, currency, changed_at) \
             VALUES (1, 1, 1799, 'EUR', '2026-01-15 09:00:00')"
        )
        .execute(db)
        .await
        .unwrap();
        sqlx::query!(
            "INSERT INTO reminders (id, subscription_id, due_date, sent_at) \
             VALUES (1, 1, '2026-02-15', '2026-02-08 08:00:00')"
        )
        .execute(db)
        .await
        .unwrap();
        sqlx::query!(
            "INSERT INTO incomes (id, name, amount_cents, currency, account_id, interval, anchor_date, active) \
             VALUES (1, 'Gehalt', 250000, 'EUR', 1, 'monthly', '2026-01-30', 1)"
        )
        .execute(db)
        .await
        .unwrap();
    }

    /// Export → Restore in eine leere DB → identischer Inhalt (alle fünf Tabellen).
    #[tokio::test]
    async fn roundtrip_preserves_all_tables() {
        let source = test_pool().await;
        seed(&source).await;
        let backup = collect_backup(&source).await.unwrap();

        let target = test_pool().await;
        restore_backup(&target, &backup).await.unwrap();
        let restored = collect_backup(&target).await.unwrap();

        assert_eq!(backup.accounts, restored.accounts);
        assert_eq!(backup.subscriptions, restored.subscriptions);
        assert_eq!(backup.incomes, restored.incomes);
        assert_eq!(backup.price_history, restored.price_history);
        assert_eq!(backup.reminders, restored.reminders);
    }

    #[tokio::test]
    async fn restore_replaces_existing_data() {
        let source = test_pool().await;
        seed(&source).await;
        let backup = collect_backup(&source).await.unwrap();

        let target = test_pool().await;
        // Anderer Vorbestand, der verschwinden muss.
        sqlx::query!(
            "INSERT INTO accounts (id, name, note, currency, balance_cents, min_buffer_cents) \
             VALUES (99, 'Altkonto', NULL, 'USD', 1, 0)"
        )
        .execute(&target)
        .await
        .unwrap();

        restore_backup(&target, &backup).await.unwrap();
        let restored = collect_backup(&target).await.unwrap();

        assert_eq!(restored.accounts.len(), 1);
        assert_eq!(restored.accounts[0].id, 1);
        assert_eq!(restored.accounts[0].name, "Giro");
    }

    /// Eine ungültige Zeile (unbekannte Währung) lässt den Restore scheitern,
    /// OHNE den Zielbestand anzurühren — Validierung läuft vor der Transaktion.
    #[tokio::test]
    async fn invalid_row_rolls_back_without_touching_data() {
        let target = test_pool().await;
        seed(&target).await;

        let mut backup = collect_backup(&target).await.unwrap();
        backup.subscriptions[0].currency = "BTC".into();

        let err = restore_backup(&target, &backup).await.unwrap_err();
        assert!(
            err.contains("Netflix") && err.contains("BTC"),
            "Fehlertext: {err}"
        );

        // Bestand unverändert.
        let after = collect_backup(&target).await.unwrap();
        assert_eq!(after.subscriptions[0].currency, "EUR");
        assert_eq!(after.accounts.len(), 1);
    }

    /// Historie/Reminder werden ebenfalls vor der Transaktion validiert.
    #[tokio::test]
    async fn invalid_history_or_reminder_rows_fail_before_touching_data() {
        let target = test_pool().await;
        seed(&target).await;
        let original = collect_backup(&target).await.unwrap();

        let mut backup = collect_backup(&target).await.unwrap();
        backup.price_history[0].currency = "BTC".into();
        let err = restore_backup(&target, &backup).await.unwrap_err();
        assert!(
            err.contains("Preis-Historie") && err.contains("BTC"),
            "Fehlertext: {err}"
        );
        let after = collect_backup(&target).await.unwrap();
        assert_eq!(after.price_history, original.price_history);
        assert_eq!(after.reminders, original.reminders);

        let mut backup = collect_backup(&target).await.unwrap();
        backup.reminders[0].due_date = "not-a-date".into();
        let err = restore_backup(&target, &backup).await.unwrap_err();
        assert!(
            err.contains("Reminder") && err.contains("not-a-date"),
            "Fehlertext: {err}"
        );
        let after = collect_backup(&target).await.unwrap();
        assert_eq!(after.price_history, original.price_history);
        assert_eq!(after.reminders, original.reminders);
    }

    /// Falsche App-Kennung bzw. unbekannte Format-Version werden abgewiesen.
    #[tokio::test]
    async fn wrong_app_or_version_is_rejected() {
        let db = test_pool().await;
        let mut backup = collect_backup(&db).await.unwrap();

        backup.app = "SomethingElse".into();
        assert!(restore_backup(&db, &backup).await.is_err());

        backup.app = BACKUP_APP.into();
        backup.schema_version = 999;
        assert!(restore_backup(&db, &backup).await.is_err());
    }

    #[test]
    fn export_write_replaces_existing_file_via_temp_path() {
        let dir = unique_test_dir("atomic-export");
        let path = dir.join("backup.json");
        std::fs::write(&path, "alt").unwrap();

        write_backup_json_atomic(path.to_str().unwrap(), "{\"ok\":true}").unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"ok\":true}");
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
