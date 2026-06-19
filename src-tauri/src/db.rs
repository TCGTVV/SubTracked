use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

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
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    pub id: i64,
    pub name: String,
    pub amount_cents: i64,
    pub currency: String,
    pub account_id: Option<i64>,
    pub interval: String,
    pub anchor_date: String,
    pub lead_days: i64,
    pub active: bool,
    pub notify: bool,
    /// Kündigungsmodus: None = nicht getrackt, "period" = Frist, "date" = festes Datum.
    pub cancel_mode: Option<String>,
    pub cancel_period_value: Option<i64>,
    pub cancel_period_unit: Option<String>,
    pub cancel_date: Option<String>,
    /// Optionale Kategorie (Freitext, Presets im Frontend); None = keine.
    pub category: Option<String>,
    /// Einmalige Ausgabe: true = einzelne Buchung am anchor_date (interval/Kündigung
    /// werden ignoriert), false = wiederkehrend. Analog zu incomes.one_time.
    pub one_time: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: i64,
    pub name: String,
    pub note: Option<String>,
    pub currency: String,
    pub balance_cents: i64,
    pub min_buffer_cents: i64,
    /// SQLite `datetime('now')` string (UTC). Absent on Tauri-command input — set server-side.
    #[serde(default)]
    pub balance_updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Income {
    pub id: i64,
    pub name: String,
    pub amount_cents: i64,
    pub currency: String,
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
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PriceHistoryEntry {
    pub id: i64,
    pub subscription_id: i64,
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
