use chrono::{Duration, Local, NaiveDate};
use sqlx::SqlitePool;
use tauri::AppHandle;
use tauri_plugin_notification::{NotificationExt, PermissionState};

use crate::db::Subscription;
use crate::recurrence::{next_due_date, parse_iso_date_strict};
use crate::validation::validate_lead_days;

/// Eine im Vorlauf-Fenster faellige Erinnerung. Pure-Output von
/// [`compute_due_reminders`]; enthaelt nur die Daten, die der Dispatcher zum
/// Senden + Schreiben braucht — kein DB- oder App-Handle-Bezug.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DueReminder {
    pub subscription_id: i64,
    pub subscription_name: String,
    pub amount_cents: i64,
    pub currency: String,
    pub due_date: NaiveDate,
}

/// Bestimmt fuer die uebergebenen Abos diejenigen, deren naechste Faelligkeit
/// im konfigurierten Vorlauf-Fenster liegt. Reine Funktion ohne Side-Effects:
/// kein DB-Zugriff, keine Notification, kein Tauri-AppHandle. Stumme Abos
/// (`notify = false`) werden uebersprungen; der Idempotenz-Check (bereits
/// gesendet?) gehoert in den Dispatcher, weil er DB braucht.
pub fn compute_due_reminders(
    subs: &[Subscription],
    today: NaiveDate,
) -> Result<Vec<DueReminder>, String> {
    let mut out = Vec::new();
    for sub in subs {
        if !sub.notify {
            continue;
        }
        if let Err(e) = validate_lead_days(sub.lead_days) {
            tracing::warn!(
                subscription_id = sub.id,
                lead_days = sub.lead_days,
                error = %e,
                "Abo wegen ungueltigem Reminder-Vorlauf uebersprungen"
            );
            continue;
        }
        let anchor = match parse_iso_date_strict(&sub.anchor_date) {
            Ok(anchor) => anchor,
            Err(e) => {
                tracing::warn!(
                    subscription_id = sub.id,
                    anchor_date = %sub.anchor_date,
                    error = %e,
                    "Abo wegen ungueltigem Ankerdatum beim Reminder-Check uebersprungen"
                );
                continue;
            }
        };
        let due = match next_due_date(anchor, &sub.interval, today) {
            Ok(due) => due,
            Err(e) => {
                tracing::warn!(
                    subscription_id = sub.id,
                    interval = %sub.interval,
                    error = %e,
                    "Abo wegen ungueltiger Wiederholung beim Reminder-Check uebersprungen"
                );
                continue;
            }
        };
        let remind_from = due - Duration::days(sub.lead_days);
        if today < remind_from {
            continue;
        }
        out.push(DueReminder {
            subscription_id: sub.id,
            subscription_name: sub.name.clone(),
            amount_cents: sub.amount_cents,
            currency: sub.currency.clone(),
            due_date: due,
        });
    }
    Ok(out)
}

/// Versendet Notifications und schreibt Reminder-Rows fuer die uebergebenen
/// Faelligkeiten. Side-Effect-Seite zu [`compute_due_reminders`].
///
/// Idempotenz: Bei fehlender Permission wird nichts als gesendet markiert. Bei
/// vorhandener Permission reserviert `INSERT OR IGNORE` die Faelligkeit direkt
/// vor `show()`, damit ein Shutdown zwischen OS-Notification und DB-Write nicht
/// zu Doppelbenachrichtigungen fuehrt. Schlaegt `show()` fehl, wird die
/// Reservierung wieder entfernt, damit der Check spaeter erneut versuchen kann.
async fn dispatch_due_reminders(
    pool: &SqlitePool,
    app: &AppHandle,
    granted: bool,
    due: &[DueReminder],
) -> Result<u32, String> {
    let mut sent = 0u32;
    for d in due {
        let due_str = d.due_date.format("%Y-%m-%d").to_string();
        if reminder_already_sent(pool, d.subscription_id, &due_str).await? {
            continue;
        }
        if !granted {
            tracing::info!(
                subscription_id = d.subscription_id,
                due_date = %due_str,
                "Erinnerung faellig, aber Notification-Berechtigung fehlt; nicht als gesendet markiert"
            );
            continue;
        }
        if !insert_reminder_if_new(pool, d.subscription_id, &due_str).await? {
            continue;
        }

        let title = format!("{} fällig", d.subscription_name);
        let body = format!(
            "{}: {}. Konto rechtzeitig decken.",
            d.due_date.format("%d.%m.%Y"),
            format_amount_for_notification(d.amount_cents, &d.currency),
        );
        if let Err(e) = app.notification().builder().title(title).body(body).show() {
            if let Err(delete_err) =
                delete_reminder_reservation(pool, d.subscription_id, &due_str).await
            {
                tracing::error!(
                    subscription_id = d.subscription_id,
                    due_date = %due_str,
                    error = %delete_err,
                    "Reminder-Reservierung nach Notification-Fehler konnte nicht entfernt werden"
                );
            }
            return Err(e.to_string());
        }
        sent += 1;
    }
    Ok(sent)
}

/// Orchestriert den Reminder-Check: laedt aktive Abos, berechnet faellige
/// Erinnerungen ([`compute_due_reminders`]) und dispatcht sie
/// ([`dispatch_due_reminders`]).
pub async fn run_reminder_check(pool: &SqlitePool, app: &AppHandle) -> Result<u32, String> {
    let granted = matches!(
        app.notification()
            .permission_state()
            .map_err(|e| e.to_string())?,
        PermissionState::Granted
    );

    let today = Local::now().date_naive();

    let subs = sqlx::query_as::<_, Subscription>(
        "SELECT id, name, amount_cents, currency, account_id, interval, anchor_date, \
         lead_days, active, notify FROM subscriptions WHERE active = 1",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let due = compute_due_reminders(&subs, today)?;
    dispatch_due_reminders(pool, app, granted, &due).await
}

async fn reminder_already_sent(
    pool: &SqlitePool,
    subscription_id: i64,
    due_date: &str,
) -> Result<bool, String> {
    let found: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM reminders WHERE subscription_id = ? AND due_date = ? LIMIT 1",
    )
    .bind(subscription_id)
    .bind(due_date)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(found.is_some())
}

async fn insert_reminder_if_new(
    pool: &SqlitePool,
    subscription_id: i64,
    due_date: &str,
) -> Result<bool, String> {
    let res =
        sqlx::query("INSERT OR IGNORE INTO reminders (subscription_id, due_date) VALUES (?, ?)")
            .bind(subscription_id)
            .bind(due_date)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    Ok(res.rows_affected() > 0)
}

async fn delete_reminder_reservation(
    pool: &SqlitePool,
    subscription_id: i64,
    due_date: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM reminders WHERE subscription_id = ? AND due_date = ?")
        .bind(subscription_id)
        .bind(due_date)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn currency_subdivisor(currency: &str) -> i64 {
    match currency {
        "KRW" => 1,
        _ => 100,
    }
}

fn format_amount_for_notification(amount_minor: i64, currency: &str) -> String {
    let divisor = currency_subdivisor(currency);
    if divisor == 1 {
        return format!("{} {}", format_whole_number_de(amount_minor), currency);
    }

    let sign = if amount_minor < 0 { "-" } else { "" };
    let abs = amount_minor.unsigned_abs();
    let divisor = divisor as u64;
    let major = abs / divisor;
    let minor = abs % divisor;
    let major = format_unsigned_whole_number_de(major);
    format!("{sign}{major},{minor:02} {currency}")
}

fn format_whole_number_de(value: i64) -> String {
    let grouped = format_unsigned_whole_number_de(value.unsigned_abs());
    if value < 0 {
        format!("-{grouped}")
    } else {
        grouped
    }
}

fn format_unsigned_whole_number_de(value: u64) -> String {
    let digits = value.to_string();
    let mut reversed = String::with_capacity(digits.len() + digits.len() / 3);

    for (idx, ch) in digits.chars().rev().enumerate() {
        if idx > 0 && idx % 3 == 0 {
            reversed.push('.');
        }
        reversed.push(ch);
    }

    reversed.chars().rev().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sub(id: i64, anchor: &str, lead_days: i64, notify: bool) -> Subscription {
        Subscription {
            id,
            name: format!("Sub{id}"),
            amount_cents: 1_799,
            currency: "EUR".to_string(),
            account_id: None,
            interval: "monthly".to_string(),
            anchor_date: anchor.to_string(),
            lead_days,
            active: true,
            notify,
        }
    }

    fn d(y: i32, m: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, day).unwrap()
    }

    #[test]
    fn compute_skips_muted_subscriptions() {
        let subs = vec![sub(1, "2025-01-15", 7, false)];
        let due = compute_due_reminders(&subs, d(2025, 1, 10)).unwrap();
        assert!(due.is_empty(), "stumme Abos werden ignoriert");
    }

    #[test]
    fn compute_skips_when_today_before_lead_window() {
        // Faellig am 2025-02-15, lead_days = 7 -> Vorlauf startet 2025-02-08.
        // Am 2025-02-07 ist das Fenster noch nicht offen.
        let subs = vec![sub(1, "2025-02-15", 7, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 7)).unwrap();
        assert!(due.is_empty(), "vor dem Vorlauf-Fenster keine Erinnerung");
    }

    #[test]
    fn compute_includes_when_today_inside_lead_window() {
        let subs = vec![sub(1, "2025-02-15", 7, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 8)).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].subscription_id, 1);
        assert_eq!(due[0].due_date, d(2025, 2, 15));
    }

    #[test]
    fn compute_includes_when_today_equals_due_date() {
        // Selbst am Faelligkeitstag soll noch erinnert werden (lead_days = 0).
        let subs = vec![sub(1, "2025-02-15", 0, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 15)).unwrap();
        assert_eq!(due.len(), 1);
    }

    #[test]
    fn compute_uses_anker_additive_next_due_not_anchor() {
        // 31.-Anker im Januar; today = 2025-03-25, lead_days = 14.
        // Naechster Termin nach today ist 2025-03-31 (anker-additiv, kein Drift),
        // Vorlauf startet 2025-03-17 -> 2025-03-25 liegt drin.
        let subs = vec![sub(1, "2025-01-31", 14, true)];
        let due = compute_due_reminders(&subs, d(2025, 3, 25)).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(
            due[0].due_date,
            d(2025, 3, 31),
            "31.-Anker darf nicht auf 28. driften"
        );
    }

    #[test]
    fn compute_skips_bad_anchor_date_and_continues_batch() {
        let subs = vec![sub(1, "31.01.2025", 7, true), sub(2, "2025-02-15", 7, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 10)).unwrap();
        let ids: Vec<i64> = due.iter().map(|d| d.subscription_id).collect();
        assert_eq!(ids, vec![2]);
    }

    #[test]
    fn compute_skips_unpadded_anchor_date_and_continues_batch() {
        let subs = vec![sub(1, "2025-2-15", 7, true), sub(2, "2025-02-15", 7, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 10)).unwrap();
        let ids: Vec<i64> = due.iter().map(|d| d.subscription_id).collect();
        assert_eq!(ids, vec![2]);
    }

    #[test]
    fn compute_skips_bad_interval_and_continues_batch() {
        let mut bad = sub(1, "2025-02-15", 7, true);
        bad.interval = "weekly".to_string();
        let subs = vec![bad, sub(2, "2025-02-15", 7, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 10)).unwrap();
        let ids: Vec<i64> = due.iter().map(|d| d.subscription_id).collect();
        assert_eq!(ids, vec![2]);
    }

    #[test]
    fn compute_skips_bad_lead_days_and_continues_batch() {
        let subs = vec![
            sub(1, "2025-02-15", -1, true),
            sub(2, "2025-02-15", 366, true),
            sub(3, "2025-02-15", 7, true),
        ];
        let due = compute_due_reminders(&subs, d(2025, 2, 10)).unwrap();
        let ids: Vec<i64> = due.iter().map(|d| d.subscription_id).collect();
        assert_eq!(ids, vec![3]);
    }

    #[test]
    fn compute_handles_mixed_batch() {
        let subs = vec![
            sub(1, "2025-02-15", 7, true),  // inside window
            sub(2, "2025-02-15", 7, false), // muted
            sub(3, "2025-04-01", 7, true),  // outside window
        ];
        let due = compute_due_reminders(&subs, d(2025, 2, 10)).unwrap();
        let ids: Vec<i64> = due.iter().map(|d| d.subscription_id).collect();
        assert_eq!(ids, vec![1]);
    }

    #[test]
    fn formats_regular_currency_for_notifications() {
        assert_eq!(format_amount_for_notification(1799, "EUR"), "17,99 EUR");
        assert_eq!(
            format_amount_for_notification(123456, "USD"),
            "1.234,56 USD"
        );
    }

    #[test]
    fn formats_zero_decimal_currency_for_notifications() {
        assert_eq!(format_amount_for_notification(1500, "KRW"), "1.500 KRW");
        assert_eq!(format_amount_for_notification(0, "KRW"), "0 KRW");
    }

    #[test]
    fn formats_negative_amounts_defensively() {
        assert_eq!(format_amount_for_notification(-1799, "EUR"), "-17,99 EUR");
        assert_eq!(format_amount_for_notification(-1500, "KRW"), "-1.500 KRW");
    }
}
