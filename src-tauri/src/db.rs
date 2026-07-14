use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
#[cfg(feature = "ts-rs-export")]
use ts_rs::TS;

pub struct AppState {
    pub db: SqlitePool,
}

/// Diagnose-State des Reminder-Loops: wann lief der letzte Check?
/// Bewusst in-memory (geht beim App-Restart verloren) — fuer "laeuft der Loop ueberhaupt?"-
/// Diagnose reicht das, Persistenz waere Overhead.
#[derive(Default)]
pub struct ReminderState {
    last_check_at: Mutex<Option<DateTime<Utc>>>,
}

impl ReminderState {
    /// Schreibt den Zeitstempel des letzten Checks. Poison-resilient: wenn ein
    /// vorheriger Panic den Mutex poisoned hat, heilen wir ihn und schreiben
    /// den neuen Wert trotzdem. Der Diagnose-Zeitstempel ist lose genug, dass
    /// ein verlorener Vorgaenger-Wert kein semantisches Problem ist.
    pub fn record_check(&self, when: DateTime<Utc>) {
        let mut guard = self.last_check_at.lock().unwrap_or_else(|poisoned| {
            tracing::error!(
                "ReminderState-Mutex war poisoned — wird geheilt und neuer Zeitstempel geschrieben."
            );
            self.last_check_at.clear_poison();
            poisoned.into_inner()
        });
        *guard = Some(when);
    }

    /// Liest den Zeitstempel des letzten Checks. Poison-resilient analog zu
    /// `record_check`: bei poisoned Mutex liefern wir den letzten gehaltenen
    /// Wert zurueck und heilen den Mutex, damit der naechste Settings-Refresh
    /// wieder regulaer laeuft.
    pub fn last_check(&self) -> Option<DateTime<Utc>> {
        let guard = self.last_check_at.lock().unwrap_or_else(|poisoned| {
            tracing::error!(
                "ReminderState-Mutex war poisoned — letzter bekannter Wert wird gelesen, Mutex geheilt."
            );
            self.last_check_at.clear_poison();
            poisoned.into_inner()
        });
        *guard
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[cfg_attr(feature = "ts-rs-export", derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-rs-export",
    ts(export, export_to = "../../src/generated/Subscription.ts")
)]
pub struct Subscription {
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number"))]
    pub id: i64,
    pub name: String,
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number"))]
    pub amount_cents: i64,
    pub currency: String,
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number | null"))]
    pub account_id: Option<i64>,
    pub interval: String,
    pub anchor_date: String,
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number"))]
    pub lead_days: i64,
    pub active: bool,
    pub notify: bool,
    /// Kündigungsmodus: None = nicht getrackt, "period" = Frist, "date" = festes Datum.
    pub cancel_mode: Option<String>,
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number | null"))]
    pub cancel_period_value: Option<i64>,
    pub cancel_period_unit: Option<String>,
    pub cancel_date: Option<String>,
    /// Optionale Kategorie (Freitext, Presets im Frontend); None = keine.
    pub category: Option<String>,
    /// Einmalige Ausgabe: true = einzelne Buchung am anchor_date (interval/Kündigung
    /// werden ignoriert), false = wiederkehrend. Analog zu incomes.one_time.
    pub one_time: bool,
    /// Archivierungszeitpunkt (SQLite datetime UTC). None = aktiv oder vor
    /// Migration 0013 archiviert (Zeitpunkt unbekannt). serde-default, damit
    /// Backups aus älteren Versionen ohne das Feld importierbar bleiben.
    #[serde(default)]
    pub archived_at: Option<String>,
    /// Geplante Preisänderung: neuer Betrag (kleinste Währungseinheit), wirksam ab
    /// `pending_from`. Beide Felder immer gemeinsam gesetzt oder gemeinsam None
    /// (validation.rs). Trial-/Probeabo = amount_cents 0 + gesetzte Änderung.
    /// serde-default, damit Alt-Backups ohne die Felder importierbar bleiben.
    #[serde(default)]
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number | null"))]
    pub pending_amount_cents: Option<i64>,
    /// Wirksamkeitsdatum (ISO "YYYY-MM-DD") der geplanten Preisänderung.
    #[serde(default)]
    pub pending_from: Option<String>,
}

/// Alle Subscription-Spalten, `ORDER BY name`. Geteilt von `commands::list_subscriptions`
/// und `csv_export::export_subscriptions_csv` (beide wollen exakt das). `reminders::
/// run_reminder_check` nutzt sie ebenfalls fuer den `only_active = true`-Fall — die
/// Reihenfolge ist dort irrelevant (jede Subscription wird unabhaengig verarbeitet).
/// `backup::collect_backup` bleibt bewusst bei einer eigenen `ORDER BY id`-Query,
/// weil die Backup-Determinismus-Garantie (stabiler Diff zwischen zwei Backups) an
/// der ID haengt, nicht am Namen.
pub(crate) async fn fetch_subscriptions(
    pool: &SqlitePool,
    only_active: bool,
) -> Result<Vec<Subscription>, String> {
    if only_active {
        sqlx::query_as!(
            Subscription,
            r#"SELECT id, name, amount_cents, currency, account_id, interval, anchor_date,
               lead_days, active as "active: bool", notify as "notify: bool",
               cancel_mode, cancel_period_value, cancel_period_unit, cancel_date,
               category, one_time as "one_time: bool", archived_at,
               pending_amount_cents, pending_from
               FROM subscriptions WHERE active = 1 ORDER BY name"#
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
    } else {
        sqlx::query_as!(
            Subscription,
            r#"SELECT id, name, amount_cents, currency, account_id, interval, anchor_date,
               lead_days, active as "active: bool", notify as "notify: bool",
               cancel_mode, cancel_period_value, cancel_period_unit, cancel_date,
               category, one_time as "one_time: bool", archived_at,
               pending_amount_cents, pending_from
               FROM subscriptions ORDER BY name"#
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[cfg_attr(feature = "ts-rs-export", derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-rs-export",
    ts(export, export_to = "../../src/generated/Account.ts")
)]
pub struct Account {
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number"))]
    pub id: i64,
    pub name: String,
    pub note: Option<String>,
    pub currency: String,
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number"))]
    pub balance_cents: i64,
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number"))]
    pub min_buffer_cents: i64,
    /// SQLite `datetime('now')` string (UTC). Absent on Tauri-command input — set server-side.
    #[serde(default)]
    pub balance_updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[cfg_attr(feature = "ts-rs-export", derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-rs-export",
    ts(export, export_to = "../../src/generated/Income.ts")
)]
pub struct Income {
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number"))]
    pub id: i64,
    pub name: String,
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number"))]
    pub amount_cents: i64,
    pub currency: String,
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number | null"))]
    pub account_id: Option<i64>,
    pub interval: String,
    pub anchor_date: String,
    pub active: bool,
    #[serde(default)]
    pub one_time: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewIncome {
    pub name: String,
    pub amount_cents: i64,
    pub currency: String,
    pub account_id: Option<i64>,
    pub interval: String,
    pub anchor_date: String,
    pub active: Option<bool>,
    pub one_time: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSubscription {
    pub name: String,
    pub amount_cents: i64,
    pub currency: String,
    pub account_id: Option<i64>,
    pub interval: String,
    pub anchor_date: String,
    pub lead_days: i64,
    pub active: Option<bool>,
    pub notify: Option<bool>,
    pub cancel_mode: Option<String>,
    pub cancel_period_value: Option<i64>,
    pub cancel_period_unit: Option<String>,
    pub cancel_date: Option<String>,
    /// Optionale Kategorie (Freitext, Presets im Frontend); None = keine.
    pub category: Option<String>,
    /// Einmalige Ausgabe (analog incomes.one_time); None = false.
    pub one_time: Option<bool>,
    /// Geplante Preisänderung (s. Subscription); beide gemeinsam oder gar nicht.
    #[serde(default)]
    pub pending_amount_cents: Option<i64>,
    #[serde(default)]
    pub pending_from: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[cfg_attr(feature = "ts-rs-export", derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "ts-rs-export",
    ts(export, export_to = "../../src/generated/PriceHistoryEntry.ts")
)]
pub struct PriceHistoryEntry {
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number"))]
    pub id: i64,
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number"))]
    pub subscription_id: i64,
    #[cfg_attr(feature = "ts-rs-export", ts(type = "number"))]
    pub amount_cents: i64,
    pub currency: String,
    pub changed_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub config_dir: String,
    pub log_dir: String,
}
