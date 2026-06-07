use serde::Serialize;
use tauri::State;
use tauri_plugin_notification::NotificationExt;

use crate::db::{Account, AppState, NewSubscription, ReminderState, Subscription};

#[tauri::command(rename_all = "camelCase")]
pub async fn list_subscriptions(
    state: State<'_, AppState>,
    only_active: Option<bool>,
) -> Result<Vec<Subscription>, String> {
    let only_active = only_active.unwrap_or(true);
    let sql = if only_active {
        "SELECT id, name, amount_cents, currency, account_id, interval, anchor_date, \
         lead_days, active, notify FROM subscriptions WHERE active = 1 ORDER BY name"
    } else {
        "SELECT id, name, amount_cents, currency, account_id, interval, anchor_date, \
         lead_days, active, notify FROM subscriptions ORDER BY name"
    };
    sqlx::query_as::<_, Subscription>(sql)
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    sqlx::query_as::<_, Account>(
        "SELECT id, name, note, currency, balance_cents, min_buffer_cents \
         FROM accounts ORDER BY name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn add_subscription(
    state: State<'_, AppState>,
    sub: NewSubscription,
) -> Result<i64, String> {
    let res = sqlx::query(
        "INSERT INTO subscriptions \
           (name, amount_cents, currency, account_id, interval, anchor_date, lead_days, active, notify) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&sub.name)
    .bind(sub.amount_cents)
    .bind(&sub.currency)
    .bind(sub.account_id)
    .bind(&sub.interval)
    .bind(&sub.anchor_date)
    .bind(sub.lead_days)
    .bind(sub.active.unwrap_or(true))
    .bind(sub.notify.unwrap_or(true))
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(res.last_insert_rowid())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_subscription(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let mut tx = state.db.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM reminders WHERE subscription_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM subscriptions WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn add_account(
    state: State<'_, AppState>,
    name: String,
    note: Option<String>,
    currency: Option<String>,
    balance_cents: Option<i64>,
    min_buffer_cents: Option<i64>,
) -> Result<i64, String> {
    let currency = currency.unwrap_or_else(|| "EUR".to_string());
    let balance_cents = balance_cents.unwrap_or(0);
    let min_buffer_cents = min_buffer_cents.unwrap_or(0);
    let res = sqlx::query(
        "INSERT INTO accounts (name, note, currency, balance_cents, min_buffer_cents) \
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&name)
    .bind(&note)
    .bind(&currency)
    .bind(balance_cents)
    .bind(min_buffer_cents)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(res.last_insert_rowid())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_account(state: State<'_, AppState>, account: Account) -> Result<(), String> {
    sqlx::query(
        "UPDATE accounts \
         SET name = ?, note = ?, currency = ?, balance_cents = ?, min_buffer_cents = ? \
         WHERE id = ?",
    )
    .bind(&account.name)
    .bind(&account.note)
    .bind(&account.currency)
    .bind(account.balance_cents)
    .bind(account.min_buffer_cents)
    .bind(account.id)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_account(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM accounts WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn count_subs_for_account(
    state: State<'_, AppState>,
    account_id: i64,
) -> Result<i64, String> {
    let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM subscriptions WHERE account_id = ?")
        .bind(account_id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(n)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_subscription(
    state: State<'_, AppState>,
    sub: Subscription,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE subscriptions \
         SET name = ?, amount_cents = ?, currency = ?, account_id = ?, \
             interval = ?, anchor_date = ?, lead_days = ?, active = ?, notify = ? \
         WHERE id = ?",
    )
    .bind(&sub.name)
    .bind(sub.amount_cents)
    .bind(&sub.currency)
    .bind(sub.account_id)
    .bind(&sub.interval)
    .bind(&sub.anchor_date)
    .bind(sub.lead_days)
    .bind(sub.active)
    .bind(sub.notify)
    .bind(sub.id)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_subscription_active(
    state: State<'_, AppState>,
    id: i64,
    active: bool,
) -> Result<(), String> {
    sqlx::query("UPDATE subscriptions SET active = ? WHERE id = ?")
        .bind(active)
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn insert_reminder_if_new(
    state: State<'_, AppState>,
    subscription_id: i64,
    due_date: String,
) -> Result<bool, String> {
    let res =
        sqlx::query("INSERT OR IGNORE INTO reminders (subscription_id, due_date) VALUES (?, ?)")
            .bind(subscription_id)
            .bind(&due_date)
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
    Ok(res.rows_affected() > 0)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastSentReminder {
    pub due_date: String,
    pub subscription_name: String,
    pub sent_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderStatus {
    /// ISO 8601 UTC, null wenn Loop noch keinen Check abgeschlossen hat.
    pub last_check_at: Option<String>,
    pub interval_secs: u64,
    pub last_sent: Option<LastSentReminder>,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_reminder_status(
    state: State<'_, AppState>,
    reminder_state: State<'_, ReminderState>,
) -> Result<ReminderStatus, String> {
    let last_check_at = reminder_state
        .last_check_at
        .lock()
        .map_err(|e| format!("reminder state lock: {e}"))?
        .map(|dt| dt.to_rfc3339());

    let last_sent: Option<(String, String, String)> = sqlx::query_as(
        "SELECT r.due_date, s.name, r.sent_at FROM reminders r \
         JOIN subscriptions s ON r.subscription_id = s.id \
         ORDER BY r.sent_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(ReminderStatus {
        last_check_at,
        interval_secs: crate::REMINDER_INTERVAL.as_secs(),
        last_sent: last_sent.map(|(due_date, subscription_name, sent_at)| LastSentReminder {
            due_date,
            subscription_name,
            sent_at,
        }),
    })
}

#[tauri::command]
pub async fn send_test_notification(app: tauri::AppHandle) -> Result<(), String> {
    app.notification()
        .builder()
        .title("SubTracked Test")
        .body("Erinnerungen funktionieren — diese Test-Nachricht kam direkt aus den Einstellungen.")
        .show()
        .map_err(|e| e.to_string())
}
