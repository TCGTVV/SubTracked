use chrono::{Duration, Local, NaiveDate};
use sqlx::SqlitePool;
use tauri::AppHandle;
use tauri_plugin_notification::{NotificationExt, PermissionState};

use crate::db::Subscription;
use crate::recurrence::next_due_date;

/// Pruegt alle aktiven Abos und sendet Notifications fuer Faelligkeiten
/// im Vorlauf-Fenster. Idempotent dank UNIQUE(subscription_id, due_date) +
/// INSERT OR IGNORE -- pro Faelligkeit max. eine Notification.
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
        let res = sqlx::query(
            "INSERT OR IGNORE INTO reminders (subscription_id, due_date) VALUES (?, ?)",
        )
        .bind(sub.id)
        .bind(&due_str)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        if res.rows_affected() == 0 {
            continue;
        }

        if granted {
            let amount = sub.amount_cents as f64 / 100.0;
            let title = format!("{} fällig", sub.name);
            let body = format!(
                "{}: {:.2} {}. Konto rechtzeitig decken.",
                due.format("%d.%m.%Y"),
                amount,
                sub.currency,
            );
            app.notification()
                .builder()
                .title(title)
                .body(body)
                .show()
                .map_err(|e| e.to_string())?;
        }
        sent += 1;
    }

    Ok(sent)
}
