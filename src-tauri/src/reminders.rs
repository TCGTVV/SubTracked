use chrono::{Duration, Local, NaiveDate};
use sqlx::SqlitePool;
use tauri::AppHandle;
use tauri_plugin_notification::{NotificationExt, PermissionState};

use crate::db::Subscription;
use crate::recurrence::next_due_date;

/// Pruegt alle aktiven Abos und sendet Notifications fuer Faelligkeiten
/// im Vorlauf-Fenster.
///
/// Idempotenz: Ein Reminder-Row bedeutet "Notification wurde erfolgreich
/// angestossen". Bei fehlender Permission oder show()-Fehler wird nichts als
/// gesendet markiert, damit der Check spaeter erneut versuchen kann.
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

    let mut sent = 0u32;
    for sub in subs {
        if !sub.notify {
            continue;
        }
        let anchor = NaiveDate::parse_from_str(&sub.anchor_date, "%Y-%m-%d")
            .map_err(|e| format!("anchor_date parse '{}': {e}", sub.anchor_date))?;
        let due = next_due_date(anchor, &sub.interval, today)?;
        let remind_from = due - Duration::days(sub.lead_days);
        if today < remind_from {
            continue;
        }

        let due_str = due.format("%Y-%m-%d").to_string();
        if reminder_already_sent(pool, sub.id, &due_str).await? {
            continue;
        }

        if !granted {
            tracing::info!(
                subscription_id = sub.id,
                due_date = %due_str,
                "Erinnerung faellig, aber Notification-Berechtigung fehlt; nicht als gesendet markiert"
            );
            continue;
        }

        let title = format!("{} fällig", sub.name);
        let body = format!(
            "{}: {}. Konto rechtzeitig decken.",
            due.format("%d.%m.%Y"),
            format_amount_for_notification(sub.amount_cents, &sub.currency),
        );
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|e| e.to_string())?;

        if insert_reminder_if_new(pool, sub.id, &due_str).await? {
            sent += 1;
        }
    }

    Ok(sent)
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
