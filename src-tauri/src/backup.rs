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

use crate::db::{
    Account, AppState, ExchangeRate, Income, PriceHistoryEntry, Subscription, SubscriptionSkip,
};
use crate::file_grants::{FileGrants, GrantKind};
use crate::validation::{
    validate_account_fields, validate_amount_cents, validate_anchor_date, validate_cancellation,
    validate_currency, validate_exchange_rate, validate_interval, validate_name,
    validate_shift_rule, validate_subscription_fields,
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
    /// Übersprungene Einzeltermine (seit Migration 0016). `default`, damit ältere
    /// Backup-Dateien ohne dieses Feld weiter importierbar bleiben.
    #[serde(default)]
    pub skips: Vec<SubscriptionSkip>,
    /// Manuelle Wechselkurse (seit Migration 0018); `default` für ältere Backup-Dateien.
    #[serde(default)]
    pub rates: Vec<ExchangeRate>,
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
           pending_amount_cents, pending_from, shift_rule
           FROM subscriptions ORDER BY id"#
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let incomes = sqlx::query_as!(
        Income,
        r#"SELECT id, name, amount_cents, currency, account_id, interval, anchor_date,
           active as "active: bool", one_time as "one_time: bool", shift_rule
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

    let skips = sqlx::query_as!(
        SubscriptionSkip,
        r#"SELECT id, subscription_id, due_date, created_at
           FROM subscription_skips ORDER BY id"#
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let rates = sqlx::query_as!(
        ExchangeRate,
        r#"SELECT from_currency, to_currency, rate_micros, updated_at
           FROM exchange_rates ORDER BY from_currency, to_currency"#
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
        skips,
        rates,
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
    let mut skip_ids = HashSet::new();
    let mut skip_keys = HashSet::new();
    let mut rate_keys = HashSet::new();

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
        validate_shift_rule(&s.shift_rule).map_err(|e| format!("Abo \"{}\": {e}", s.name))?;
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
        validate_shift_rule(&i.shift_rule).map_err(|e| format!("{}: {e}", label()))?;
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
    for k in &backup.skips {
        let label = format!("Übersprungener Termin #{}", k.id);
        validate_row_id(&mut skip_ids, k.id, &label)?;
        validate_existing_id(&subscription_ids, k.subscription_id, &label, "Abo")?;
        validate_anchor_date(&k.due_date).map_err(|e| format!("{label}: {e}"))?;
        validate_sqlite_datetime(&label, &k.created_at)?;
        if !skip_keys.insert((k.subscription_id, k.due_date.clone())) {
            return Err(format!(
                "{label}: Termin {} für Abo {} kommt mehrfach vor.",
                k.due_date, k.subscription_id
            ));
        }
    }
    for r in &backup.rates {
        let label = format!("Kurs {} → {}", r.from_currency, r.to_currency);
        validate_exchange_rate(&r.from_currency, &r.to_currency, r.rate_micros)
            .map_err(|e| format!("{label}: {e}"))?;
        validate_sqlite_datetime(&label, &r.updated_at)?;
        if !rate_keys.insert((r.from_currency.clone(), r.to_currency.clone())) {
            return Err(format!("{label}: Kurs kommt mehrfach vor."));
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
    sqlx::query!("DELETE FROM subscription_skips")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query!("DELETE FROM exchange_rates")
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
                pending_amount_cents, pending_from, shift_rule) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
            s.shift_rule,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    for i in &backup.incomes {
        sqlx::query!(
            "INSERT INTO incomes \
               (id, name, amount_cents, currency, account_id, interval, anchor_date, active, one_time, shift_rule) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            i.id,
            i.name,
            i.amount_cents,
            i.currency,
            i.account_id,
            i.interval,
            i.anchor_date,
            i.active,
            i.one_time,
            i.shift_rule,
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
    for k in &backup.skips {
        sqlx::query!(
            "INSERT INTO subscription_skips (id, subscription_id, due_date, created_at) \
             VALUES (?, ?, ?, ?)",
            k.id,
            k.subscription_id,
            k.due_date,
            k.created_at,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    for r in &backup.rates {
        sqlx::query!(
            "INSERT INTO exchange_rates (from_currency, to_currency, rate_micros, updated_at) \
             VALUES (?, ?, ?, ?)",
            r.from_currency,
            r.to_currency,
            r.rate_micros,
            r.updated_at,
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
pub async fn export_backup(
    state: State<'_, AppState>,
    grants: State<'_, FileGrants>,
    token: String,
) -> Result<(), String> {
    let path = grants.take(&token, GrantKind::Write)?;
    let backup = collect_backup(&state.db).await?;
    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    write_backup_json_atomic(&path.to_string_lossy(), &json)?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn import_backup(
    state: State<'_, AppState>,
    grants: State<'_, FileGrants>,
    token: String,
) -> Result<(), String> {
    let path = grants.take(&token, GrantKind::Read)?;
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
    async fn roundtrip_preserves_skipped_occurrences() {
        let source = test_pool().await;
        seed(&source).await;
        sqlx::query(
            "INSERT INTO subscription_skips (id, subscription_id, due_date, created_at) \
             VALUES (1, 1, '2026-03-15', '2026-03-01 08:00:00')",
        )
        .execute(&source)
        .await
        .unwrap();
        let backup = collect_backup(&source).await.unwrap();
        assert_eq!(backup.skips.len(), 1);

        let target = test_pool().await;
        restore_backup(&target, &backup).await.unwrap();
        let restored = collect_backup(&target).await.unwrap();
        assert_eq!(backup.skips, restored.skips);
    }

    #[tokio::test]
    async fn roundtrip_preserves_shift_rules_and_rejects_unknown_ones() {
        let source = test_pool().await;
        seed(&source).await;
        sqlx::query("UPDATE subscriptions SET shift_rule = 'next' WHERE id = 1")
            .execute(&source)
            .await
            .unwrap();
        sqlx::query("UPDATE incomes SET shift_rule = 'previous' WHERE id = 1")
            .execute(&source)
            .await
            .unwrap();
        let backup = collect_backup(&source).await.unwrap();
        assert_eq!(backup.subscriptions[0].shift_rule, "next");
        assert_eq!(backup.incomes[0].shift_rule, "previous");

        let target = test_pool().await;
        restore_backup(&target, &backup).await.unwrap();
        let restored = collect_backup(&target).await.unwrap();
        assert_eq!(restored.subscriptions[0].shift_rule, "next");
        assert_eq!(restored.incomes[0].shift_rule, "previous");

        let mut bad = collect_backup(&source).await.unwrap();
        bad.subscriptions[0].shift_rule = "sideways".into();
        assert!(restore_backup(&target, &bad).await.is_err());
    }

    /// Backups aus der Zeit vor Migration 0017 kennen kein `shiftRule`.
    #[tokio::test]
    async fn old_backup_without_shift_rule_imports_as_none() {
        let source = test_pool().await;
        seed(&source).await;
        let mut json = serde_json::to_value(collect_backup(&source).await.unwrap()).unwrap();
        for table in ["subscriptions", "incomes"] {
            for row in json[table].as_array_mut().unwrap() {
                row.as_object_mut().unwrap().remove("shiftRule");
            }
        }
        let backup: BackupFile = serde_json::from_value(json).expect("ohne shiftRule lesbar");
        assert_eq!(backup.subscriptions[0].shift_rule, "none");
        assert_eq!(backup.incomes[0].shift_rule, "none");
        let target = test_pool().await;
        restore_backup(&target, &backup).await.expect("Import");
    }

    /// Backups aus der Zeit vor Migration 0016 kennen kein `skips`-Feld.
    #[tokio::test]
    async fn old_backup_without_skips_field_still_imports() {
        let source = test_pool().await;
        seed(&source).await;
        let mut json = serde_json::to_value(collect_backup(&source).await.unwrap()).unwrap();
        json.as_object_mut().unwrap().remove("skips");
        let backup: BackupFile = serde_json::from_value(json).expect("ohne skips lesbar");
        assert!(backup.skips.is_empty());

        let target = test_pool().await;
        restore_backup(&target, &backup)
            .await
            .expect("Import ohne skips");
    }

    #[tokio::test]
    async fn roundtrip_preserves_exchange_rates_and_old_backups_import_without_them() {
        let source = test_pool().await;
        seed(&source).await;
        sqlx::query(
            "INSERT INTO exchange_rates (from_currency, to_currency, rate_micros, updated_at) \
             VALUES ('USD', 'EUR', 920000, '2026-10-01 08:00:00')",
        )
        .execute(&source)
        .await
        .unwrap();
        let backup = collect_backup(&source).await.unwrap();
        assert_eq!(backup.rates.len(), 1);

        let target = test_pool().await;
        restore_backup(&target, &backup).await.unwrap();
        assert_eq!(collect_backup(&target).await.unwrap().rates, backup.rates);

        // Backup aus der Zeit vor Migration 0018: kein `rates`-Feld.
        let mut json = serde_json::to_value(&backup).unwrap();
        json.as_object_mut().unwrap().remove("rates");
        let old: BackupFile = serde_json::from_value(json).expect("ohne rates lesbar");
        assert!(old.rates.is_empty());
        restore_backup(&target, &old)
            .await
            .expect("Import ohne rates");
        assert!(collect_backup(&target).await.unwrap().rates.is_empty());
    }

    #[tokio::test]
    async fn invalid_or_duplicate_rates_are_rejected() {
        let source = test_pool().await;
        seed(&source).await;
        let base = collect_backup(&source).await.unwrap();
        let rate = |from: &str, to: &str, micros: i64| ExchangeRate {
            from_currency: from.into(),
            to_currency: to.into(),
            rate_micros: micros,
            updated_at: "2026-10-01 08:00:00".into(),
        };

        for (label, rates) in [
            ("gleiche Währung", vec![rate("EUR", "EUR", 1_000_000)]),
            ("Kurs 0", vec![rate("USD", "EUR", 0)]),
            ("unbekannte Währung", vec![rate("BTC", "EUR", 1_000_000)]),
            (
                "doppelt",
                vec![rate("USD", "EUR", 920_000), rate("USD", "EUR", 930_000)],
            ),
        ] {
            let mut backup = collect_backup(&source).await.unwrap();
            backup.rates = rates;
            assert!(restore_backup(&source, &backup).await.is_err(), "{label}");
        }
        // Der Bestand blieb durch die abgelehnten Imports unangetastet.
        assert_eq!(
            collect_backup(&source).await.unwrap().accounts,
            base.accounts
        );
    }

    #[tokio::test]
    async fn skip_for_unknown_subscription_is_rejected() {
        let source = test_pool().await;
        seed(&source).await;
        let mut backup = collect_backup(&source).await.unwrap();
        backup.skips.push(SubscriptionSkip {
            id: 1,
            subscription_id: 999,
            due_date: "2026-03-15".into(),
            created_at: "2026-03-01 08:00:00".into(),
        });
        assert!(restore_backup(&source, &backup).await.is_err());
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

    /// Sicherheitsnetz fuer die DELETE-Liste in `restore_backup`: sqlx::query!
    /// verlangt Literale, die Loeschreihenfolge kann also nicht mehr aus einer
    /// gemeinsamen Liste generiert werden (siehe Kommentar dort). Dieser Test
    /// bricht, sobald eine neue Tabelle im Schema auftaucht, die restore_backup
    /// noch nicht kennt — Erinnerung, die DELETE-Liste dort zu ergaenzen.
    #[tokio::test]
    async fn restore_backup_deletes_every_application_table() {
        let db = test_pool().await;
        let rows = sqlx::query_scalar!(
            "SELECT name FROM sqlite_master \
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_sqlx_migrations'"
        )
        .fetch_all(&db)
        .await
        .unwrap();
        let mut tables: Vec<&str> = rows.iter().flatten().map(String::as_str).collect();
        tables.sort_unstable();

        let mut expected = vec![
            "accounts",
            "exchange_rates",
            "incomes",
            "reminders",
            "subscription_price_history",
            "subscription_skips",
            "subscriptions",
        ];
        expected.sort_unstable();

        assert_eq!(
            tables, expected,
            "Schema hat eine neue Tabelle bekommen, die restore_backup() nicht kennt — \
             DELETE-Liste in restore_backup() ergaenzen!"
        );
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
