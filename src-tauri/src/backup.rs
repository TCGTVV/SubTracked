//! Vollständiges JSON-Backup/Restore aller Nutzdaten.
//!
//! Die Datei-Auswahl passiert im Frontend (`tauri-plugin-dialog`); hier wird nur
//! gegen einen bereits gewählten Pfad gelesen/geschrieben. Die testbare Kern-Logik
//! (`collect_backup`/`restore_backup`) ist von der Datei-Schicht und vom Tauri-State
//! getrennt — analog zum `update_subscription_in_db`-Seam in `commands.rs`.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::db::{Account, AppState, Income, PriceHistoryEntry, Subscription};
use crate::validation::{
    validate_account_fields, validate_amount_cents, validate_anchor_date, validate_currency,
    validate_interval, validate_name, validate_subscription_fields,
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

/// Liest alle Tabellen in einen `BackupFile`. `ORDER BY id` macht den Export
/// deterministisch (stabiler Diff zwischen zwei Backups).
pub async fn collect_backup(db: &SqlitePool) -> Result<BackupFile, String> {
    let accounts = sqlx::query_as::<_, Account>(
        "SELECT id, name, note, currency, balance_cents, min_buffer_cents, balance_updated_at \
         FROM accounts ORDER BY id",
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let subscriptions = sqlx::query_as::<_, Subscription>(
        "SELECT id, name, amount_cents, currency, account_id, interval, anchor_date, \
         lead_days, active, notify FROM subscriptions ORDER BY id",
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let incomes = sqlx::query_as::<_, Income>(
        "SELECT id, name, amount_cents, currency, account_id, interval, anchor_date, active \
         FROM incomes ORDER BY id",
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let price_history = sqlx::query_as::<_, PriceHistoryEntry>(
        "SELECT id, subscription_id, amount_cents, currency, changed_at \
         FROM subscription_price_history ORDER BY id",
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())?;

    let reminders = sqlx::query_as::<_, ReminderRow>(
        "SELECT id, subscription_id, due_date, sent_at FROM reminders ORDER BY id",
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
    for a in &backup.accounts {
        validate_account_fields(&a.name, &a.currency, a.balance_cents, a.min_buffer_cents)
            .map_err(|e| format!("Konto \"{}\": {e}", a.name))?;
    }
    for s in &backup.subscriptions {
        validate_subscription_fields(
            &s.name,
            s.amount_cents,
            &s.currency,
            &s.interval,
            &s.anchor_date,
            s.lead_days,
        )
        .map_err(|e| format!("Abo \"{}\": {e}", s.name))?;
    }
    for i in &backup.incomes {
        let label = || format!("Einnahme \"{}\"", i.name);
        validate_name(&i.name).map_err(|e| format!("{}: {e}", label()))?;
        validate_amount_cents(i.amount_cents).map_err(|e| format!("{}: {e}", label()))?;
        validate_currency(&i.currency).map_err(|e| format!("{}: {e}", label()))?;
        validate_interval(&i.interval).map_err(|e| format!("{}: {e}", label()))?;
        validate_anchor_date(&i.anchor_date).map_err(|e| format!("{}: {e}", label()))?;
    }
    Ok(())
}

/// Ersetzt den gesamten Datenbestand durch den Backup-Inhalt (Restore-Semantik).
/// Alles in einer Transaktion: Bei jedem Fehler rollt SQLite zurück, es entsteht
/// kein Teilzustand. IDs werden erhalten, damit FK-Verknüpfungen (Konto↔Abo,
/// Abo↔Historie/Reminder) korrekt bleiben.
pub async fn restore_backup(db: &SqlitePool, backup: &BackupFile) -> Result<(), String> {
    validate_backup(backup)?;

    let mut tx = db.begin().await.map_err(|e| e.to_string())?;

    // DELETE: Kinder zuerst (FK-Constraints sind in sqlx aktiv und werden sofort
    // geprüft). Statische Literale, weil sqlx 0.9 dynamisches Query-SQL ablehnt.
    for stmt in [
        "DELETE FROM reminders",
        "DELETE FROM subscription_price_history",
        "DELETE FROM incomes",
        "DELETE FROM subscriptions",
        "DELETE FROM accounts",
    ] {
        sqlx::query(stmt)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // INSERT: Eltern zuerst, IDs explizit übernehmen.
    for a in &backup.accounts {
        sqlx::query(
            "INSERT INTO accounts \
               (id, name, note, currency, balance_cents, min_buffer_cents, balance_updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(a.id)
        .bind(&a.name)
        .bind(&a.note)
        .bind(&a.currency)
        .bind(a.balance_cents)
        .bind(a.min_buffer_cents)
        .bind(&a.balance_updated_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    for s in &backup.subscriptions {
        sqlx::query(
            "INSERT INTO subscriptions \
               (id, name, amount_cents, currency, account_id, interval, anchor_date, \
                lead_days, active, notify) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(s.id)
        .bind(&s.name)
        .bind(s.amount_cents)
        .bind(&s.currency)
        .bind(s.account_id)
        .bind(&s.interval)
        .bind(&s.anchor_date)
        .bind(s.lead_days)
        .bind(s.active)
        .bind(s.notify)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    for i in &backup.incomes {
        sqlx::query(
            "INSERT INTO incomes \
               (id, name, amount_cents, currency, account_id, interval, anchor_date, active) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(i.id)
        .bind(&i.name)
        .bind(i.amount_cents)
        .bind(&i.currency)
        .bind(i.account_id)
        .bind(&i.interval)
        .bind(&i.anchor_date)
        .bind(i.active)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    for p in &backup.price_history {
        sqlx::query(
            "INSERT INTO subscription_price_history \
               (id, subscription_id, amount_cents, currency, changed_at) \
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(p.id)
        .bind(p.subscription_id)
        .bind(p.amount_cents)
        .bind(&p.currency)
        .bind(&p.changed_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    for r in &backup.reminders {
        sqlx::query(
            "INSERT INTO reminders (id, subscription_id, due_date, sent_at) \
             VALUES (?, ?, ?, ?)",
        )
        .bind(r.id)
        .bind(r.subscription_id)
        .bind(&r.due_date)
        .bind(&r.sent_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn export_backup(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let backup = collect_backup(&state.db).await?;
    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Konnte Backup nicht schreiben: {e}"))?;
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

    /// Legt einen kleinen, vollständig verknüpften Bestand an: Konto → Abo
    /// (mit Preis-Historie + Reminder) und eine Einnahme.
    async fn seed(db: &SqlitePool) {
        sqlx::query(
            "INSERT INTO accounts (id, name, note, currency, balance_cents, min_buffer_cents, balance_updated_at) \
             VALUES (1, 'Giro', 'Hauptkonto', 'EUR', 120000, 50000, '2026-06-01 10:00:00')",
        )
        .execute(db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO subscriptions (id, name, amount_cents, currency, account_id, interval, anchor_date, lead_days, active, notify) \
             VALUES (1, 'Netflix', 1799, 'EUR', 1, 'monthly', '2026-01-15', 7, 1, 1)",
        )
        .execute(db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO subscription_price_history (id, subscription_id, amount_cents, currency, changed_at) \
             VALUES (1, 1, 1799, 'EUR', '2026-01-15 09:00:00')",
        )
        .execute(db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO reminders (id, subscription_id, due_date, sent_at) \
             VALUES (1, 1, '2026-02-15', '2026-02-08 08:00:00')",
        )
        .execute(db)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO incomes (id, name, amount_cents, currency, account_id, interval, anchor_date, active) \
             VALUES (1, 'Gehalt', 250000, 'EUR', 1, 'monthly', '2026-01-30', 1)",
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

    /// Restore ersetzt den bestehenden Bestand vollständig (kein Merge).
    #[tokio::test]
    async fn restore_replaces_existing_data() {
        let source = test_pool().await;
        seed(&source).await;
        let backup = collect_backup(&source).await.unwrap();

        let target = test_pool().await;
        // Anderer Vorbestand, der verschwinden muss.
        sqlx::query(
            "INSERT INTO accounts (id, name, note, currency, balance_cents, min_buffer_cents) \
             VALUES (99, 'Altkonto', NULL, 'USD', 1, 0)",
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
}
