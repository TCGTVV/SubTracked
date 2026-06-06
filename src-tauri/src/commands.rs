use tauri::State;

use crate::db::{Account, AppState, NewSubscription, Subscription};

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
    sqlx::query_as::<_, Account>("SELECT id, name, note FROM accounts ORDER BY name")
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
) -> Result<i64, String> {
    let res = sqlx::query("INSERT INTO accounts (name, note) VALUES (?, ?)")
        .bind(&name)
        .bind(&note)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(res.last_insert_rowid())
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
