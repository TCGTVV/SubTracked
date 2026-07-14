use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::db::{
    Account, AppInfo, AppState, Income, NewIncome, NewSubscription, PriceHistoryEntry,
    ReminderState, Subscription,
};
use crate::validation::{
    validate_account_exists, validate_account_fields, validate_cancellation,
    validate_subscription_fields,
};

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> Result<AppInfo, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        config_dir: config_dir.display().to_string(),
        log_dir: log_dir.display().to_string(),
    })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_subscriptions(
    state: State<'_, AppState>,
    only_active: Option<bool>,
) -> Result<Vec<Subscription>, String> {
    let only_active = only_active.unwrap_or(true);
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
        .fetch_all(&state.db)
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
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    sqlx::query_as!(
        Account,
        r#"SELECT id, name, note, currency, balance_cents, min_buffer_cents, balance_updated_at
           FROM accounts ORDER BY name"#
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
    validate_subscription_fields(
        &sub.name,
        sub.amount_cents,
        &sub.currency,
        &sub.interval,
        &sub.anchor_date,
        sub.lead_days,
        sub.category.as_deref(),
        sub.pending_amount_cents,
        sub.pending_from.as_deref(),
    )?;
    validate_cancellation(
        sub.cancel_mode.as_deref(),
        sub.cancel_period_value,
        sub.cancel_period_unit.as_deref(),
        sub.cancel_date.as_deref(),
    )?;
    if let Some(account_id) = sub.account_id {
        validate_account_exists(&state.db, account_id).await?;
    }
    let active = sub.active.unwrap_or(true);
    let notify = sub.notify.unwrap_or(true);
    let one_time = sub.one_time.unwrap_or(false);
    let res = sqlx::query!(
        "INSERT INTO subscriptions \
           (name, amount_cents, currency, account_id, interval, anchor_date, lead_days, active, notify, \
            cancel_mode, cancel_period_value, cancel_period_unit, cancel_date, category, one_time, \
            pending_amount_cents, pending_from) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        sub.name,
        sub.amount_cents,
        sub.currency,
        sub.account_id,
        sub.interval,
        sub.anchor_date,
        sub.lead_days,
        active,
        notify,
        sub.cancel_mode,
        sub.cancel_period_value,
        sub.cancel_period_unit,
        sub.cancel_date,
        sub.category,
        one_time,
        sub.pending_amount_cents,
        sub.pending_from,
    )
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let new_id = res.last_insert_rowid();
    sqlx::query!(
        "INSERT INTO subscription_price_history (subscription_id, amount_cents, currency, changed_at) \
         VALUES (?, ?, ?, datetime('now'))",
        new_id,
        sub.amount_cents,
        sub.currency,
    )
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(new_id)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_subscription(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let mut tx = state.db.begin().await.map_err(|e| e.to_string())?;
    sqlx::query!("DELETE FROM reminders WHERE subscription_id = ?", id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query!(
        "DELETE FROM subscription_price_history WHERE subscription_id = ?",
        id
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query!("DELETE FROM subscriptions WHERE id = ?", id)
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
    validate_account_fields(&name, &currency, balance_cents, min_buffer_cents)?;
    let res = sqlx::query!(
        "INSERT INTO accounts \
           (name, note, currency, balance_cents, min_buffer_cents, balance_updated_at) \
         VALUES (?, ?, ?, ?, ?, datetime('now'))",
        name,
        note,
        currency,
        balance_cents,
        min_buffer_cents,
    )
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(res.last_insert_rowid())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_account(state: State<'_, AppState>, account: Account) -> Result<(), String> {
    validate_account_fields(
        &account.name,
        &account.currency,
        account.balance_cents,
        account.min_buffer_cents,
    )?;
    let current = sqlx::query!(
        "SELECT balance_cents FROM accounts WHERE id = ?",
        account.id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let balance_changed = current.map(|r| r.balance_cents) != Some(account.balance_cents);
    if balance_changed {
        sqlx::query!(
            "UPDATE accounts \
             SET name = ?, note = ?, currency = ?, balance_cents = ?, min_buffer_cents = ?, \
                 balance_updated_at = datetime('now') \
             WHERE id = ?",
            account.name,
            account.note,
            account.currency,
            account.balance_cents,
            account.min_buffer_cents,
            account.id,
        )
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query!(
            "UPDATE accounts \
             SET name = ?, note = ?, currency = ?, balance_cents = ?, min_buffer_cents = ? \
             WHERE id = ?",
            account.name,
            account.note,
            account.currency,
            account.balance_cents,
            account.min_buffer_cents,
            account.id,
        )
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub(crate) async fn confirm_account_balance_in_db(
    db: &sqlx::SqlitePool,
    id: i64,
) -> Result<(), String> {
    let res = sqlx::query!(
        "UPDATE accounts SET balance_updated_at = datetime('now') WHERE id = ?",
        id
    )
    .execute(db)
    .await
    .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err(format!("Konto {id} existiert nicht"));
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn confirm_account_balance(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    confirm_account_balance_in_db(&state.db, id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_account(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    sqlx::query!("DELETE FROM accounts WHERE id = ?", id)
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
    let row = sqlx::query!(
        r#"SELECT COUNT(*) as "n!: i64" FROM subscriptions WHERE account_id = ?"#,
        account_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(row.n)
}

pub(crate) async fn update_subscription_in_db(
    db: &sqlx::SqlitePool,
    sub: &Subscription,
) -> Result<(), String> {
    validate_subscription_fields(
        &sub.name,
        sub.amount_cents,
        &sub.currency,
        &sub.interval,
        &sub.anchor_date,
        sub.lead_days,
        sub.category.as_deref(),
        sub.pending_amount_cents,
        sub.pending_from.as_deref(),
    )?;
    validate_cancellation(
        sub.cancel_mode.as_deref(),
        sub.cancel_period_value,
        sub.cancel_period_unit.as_deref(),
        sub.cancel_date.as_deref(),
    )?;
    let current = sqlx::query!(
        "SELECT account_id, amount_cents, currency FROM subscriptions WHERE id = ?",
        sub.id
    )
    .fetch_optional(db)
    .await
    .map_err(|e| e.to_string())?;
    let (current_account_id, current_amount_cents, current_currency) = match current {
        Some(r) => (r.account_id, r.amount_cents, r.currency),
        None => (None, sub.amount_cents, sub.currency.clone()),
    };
    let account_id_changed = current_account_id != sub.account_id;
    let price_changed =
        current_amount_cents != sub.amount_cents || current_currency != sub.currency;
    if account_id_changed {
        if let Some(new_account_id) = sub.account_id {
            validate_account_exists(db, new_account_id).await?;
        }
        sqlx::query!(
            "UPDATE subscriptions \
             SET name = ?, amount_cents = ?, currency = ?, account_id = ?, \
                 interval = ?, anchor_date = ?, lead_days = ?, active = ?, notify = ?, \
                 cancel_mode = ?, cancel_period_value = ?, cancel_period_unit = ?, cancel_date = ?, \
                 category = ?, one_time = ?, pending_amount_cents = ?, pending_from = ? \
             WHERE id = ?",
            sub.name,
            sub.amount_cents,
            sub.currency,
            sub.account_id,
            sub.interval,
            sub.anchor_date,
            sub.lead_days,
            sub.active,
            sub.notify,
            sub.cancel_mode,
            sub.cancel_period_value,
            sub.cancel_period_unit,
            sub.cancel_date,
            sub.category,
            sub.one_time,
            sub.pending_amount_cents,
            sub.pending_from,
            sub.id,
        )
        .execute(db)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query!(
            "UPDATE subscriptions \
             SET name = ?, amount_cents = ?, currency = ?, \
                 interval = ?, anchor_date = ?, lead_days = ?, active = ?, notify = ?, \
                 cancel_mode = ?, cancel_period_value = ?, cancel_period_unit = ?, cancel_date = ?, \
                 category = ?, one_time = ?, pending_amount_cents = ?, pending_from = ? \
             WHERE id = ?",
            sub.name,
            sub.amount_cents,
            sub.currency,
            sub.interval,
            sub.anchor_date,
            sub.lead_days,
            sub.active,
            sub.notify,
            sub.cancel_mode,
            sub.cancel_period_value,
            sub.cancel_period_unit,
            sub.cancel_date,
            sub.category,
            sub.one_time,
            sub.pending_amount_cents,
            sub.pending_from,
            sub.id,
        )
        .execute(db)
        .await
        .map_err(|e| e.to_string())?;
    }
    if price_changed {
        sqlx::query!(
            "INSERT INTO subscription_price_history \
               (subscription_id, amount_cents, currency, changed_at) \
             VALUES (?, ?, ?, datetime('now'))",
            sub.id,
            sub.amount_cents,
            sub.currency,
        )
        .execute(db)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_subscription(
    state: State<'_, AppState>,
    sub: Subscription,
) -> Result<(), String> {
    update_subscription_in_db(&state.db, &sub).await
}

pub(crate) async fn set_subscription_active_in_db(
    db: &sqlx::SqlitePool,
    id: i64,
    active: bool,
) -> Result<(), String> {
    sqlx::query!(
        "UPDATE subscriptions \
         SET active = ?, \
             archived_at = CASE \
               WHEN ? THEN NULL \
               WHEN archived_at IS NULL THEN datetime('now') \
               ELSE archived_at \
             END \
         WHERE id = ?",
        active,
        active,
        id,
    )
    .execute(db)
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
    set_subscription_active_in_db(&state.db, id, active).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_incomes(
    state: State<'_, AppState>,
    only_active: Option<bool>,
) -> Result<Vec<Income>, String> {
    let only_active = only_active.unwrap_or(false);
    if only_active {
        sqlx::query_as!(
            Income,
            r#"SELECT id, name, amount_cents, currency, account_id, interval, anchor_date,
               active as "active: bool", one_time as "one_time: bool"
               FROM incomes WHERE active = 1 ORDER BY name"#
        )
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
    } else {
        sqlx::query_as!(
            Income,
            r#"SELECT id, name, amount_cents, currency, account_id, interval, anchor_date,
               active as "active: bool", one_time as "one_time: bool"
               FROM incomes ORDER BY name"#
        )
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn add_income(state: State<'_, AppState>, income: NewIncome) -> Result<i64, String> {
    use crate::validation::{
        validate_amount_cents, validate_anchor_date, validate_currency, validate_interval,
        validate_name,
    };
    validate_name(&income.name)?;
    validate_amount_cents(income.amount_cents)?;
    validate_currency(&income.currency)?;
    validate_interval(&income.interval)?;
    validate_anchor_date(&income.anchor_date)?;
    if let Some(account_id) = income.account_id {
        validate_account_exists(&state.db, account_id).await?;
    }
    let active = income.active.unwrap_or(true);
    let one_time = income.one_time.unwrap_or(false);
    let result = sqlx::query!(
        "INSERT INTO incomes (name, amount_cents, currency, account_id, interval, anchor_date, active, one_time) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        income.name,
        income.amount_cents,
        income.currency,
        income.account_id,
        income.interval,
        income.anchor_date,
        active,
        one_time,
    )
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(result.last_insert_rowid())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_income(state: State<'_, AppState>, income: Income) -> Result<(), String> {
    use crate::validation::{
        validate_amount_cents, validate_anchor_date, validate_currency, validate_interval,
        validate_name,
    };
    validate_name(&income.name)?;
    validate_amount_cents(income.amount_cents)?;
    validate_currency(&income.currency)?;
    validate_interval(&income.interval)?;
    validate_anchor_date(&income.anchor_date)?;
    let current = sqlx::query!("SELECT account_id FROM incomes WHERE id = ?", income.id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    let current_account_id = current.and_then(|r| r.account_id);
    if current_account_id != income.account_id {
        if let Some(new_id) = income.account_id {
            validate_account_exists(&state.db, new_id).await?;
        }
        sqlx::query!(
            "UPDATE incomes SET name = ?, amount_cents = ?, currency = ?, account_id = ?, \
             interval = ?, anchor_date = ?, active = ?, one_time = ? WHERE id = ?",
            income.name,
            income.amount_cents,
            income.currency,
            income.account_id,
            income.interval,
            income.anchor_date,
            income.active,
            income.one_time,
            income.id,
        )
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query!(
            "UPDATE incomes SET name = ?, amount_cents = ?, currency = ?, \
             interval = ?, anchor_date = ?, active = ?, one_time = ? WHERE id = ?",
            income.name,
            income.amount_cents,
            income.currency,
            income.interval,
            income.anchor_date,
            income.active,
            income.one_time,
            income.id,
        )
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_income(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    sqlx::query!("DELETE FROM incomes WHERE id = ?", id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_income_active(
    state: State<'_, AppState>,
    id: i64,
    active: bool,
) -> Result<(), String> {
    sqlx::query!("UPDATE incomes SET active = ? WHERE id = ?", active, id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_price_history(
    state: State<'_, AppState>,
    subscription_id: i64,
) -> Result<Vec<PriceHistoryEntry>, String> {
    sqlx::query_as!(
        PriceHistoryEntry,
        r#"SELECT id, subscription_id, amount_cents, currency, changed_at
           FROM subscription_price_history
           WHERE subscription_id = ?
           ORDER BY changed_at DESC"#,
        subscription_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())
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
    let last_check_at = reminder_state.last_check().map(|dt| dt.to_rfc3339());

    let last_sent = sqlx::query!(
        "SELECT r.due_date as due_date, s.name as subscription_name, r.sent_at as sent_at \
         FROM reminders r \
         JOIN subscriptions s ON r.subscription_id = s.id \
         ORDER BY r.sent_at DESC LIMIT 1"
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(ReminderStatus {
        last_check_at,
        interval_secs: crate::REMINDER_INTERVAL.as_secs(),
        last_sent: last_sent.map(|r| LastSentReminder {
            due_date: r.due_date,
            subscription_name: r.subscription_name,
            sent_at: r.sent_at,
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

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    /// In-memory SQLite-Pool mit Migrations. `max_connections=1` weil
    /// `sqlite::memory:` pro Connection eine eigene DB anlegt — wir wollen
    /// aber durchgaengig dieselbe Test-DB.
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

    async fn insert_account(db: &SqlitePool, name: &str) -> i64 {
        let res = sqlx::query!(
            "INSERT INTO accounts (name, note, currency, balance_cents, min_buffer_cents) \
             VALUES (?, NULL, 'EUR', 0, 0)",
            name
        )
        .execute(db)
        .await
        .expect("insert account");
        res.last_insert_rowid()
    }

    async fn insert_sub(db: &SqlitePool, account_id: Option<i64>) -> Subscription {
        let res = sqlx::query!(
            "INSERT INTO subscriptions \
               (name, amount_cents, currency, account_id, interval, anchor_date, \
                lead_days, active, notify) \
             VALUES ('Netflix', 1799, 'EUR', ?, 'monthly', '2026-01-15', 7, 1, 1)",
            account_id
        )
        .execute(db)
        .await
        .expect("insert subscription");
        Subscription {
            id: res.last_insert_rowid(),
            name: "Netflix".into(),
            amount_cents: 1799,
            currency: "EUR".into(),
            account_id,
            interval: "monthly".into(),
            anchor_date: "2026-01-15".into(),
            lead_days: 7,
            active: true,
            notify: true,
            cancel_mode: None,
            cancel_period_value: None,
            cancel_period_unit: None,
            cancel_date: None,
            category: None,
            one_time: false,
            archived_at: None,
            pending_amount_cents: None,
            pending_from: None,
        }
    }

    async fn fetch_account_id(db: &SqlitePool, sub_id: i64) -> Option<i64> {
        sqlx::query!("SELECT account_id FROM subscriptions WHERE id = ?", sub_id)
            .fetch_one(db)
            .await
            .expect("fetch account_id")
            .account_id
    }

    async fn make_orphan_sub(db: &SqlitePool) -> (Subscription, i64) {
        let orphan_account_id = insert_account(db, "Altes Konto").await;
        let sub = insert_sub(db, Some(orphan_account_id)).await;
        sqlx::query!("PRAGMA foreign_keys = OFF")
            .execute(db)
            .await
            .expect("pragma off");
        sqlx::query!("DELETE FROM accounts WHERE id = ?", orphan_account_id)
            .execute(db)
            .await
            .expect("delete account");
        sqlx::query!("PRAGMA foreign_keys = ON")
            .execute(db)
            .await
            .expect("pragma on");
        (sub, orphan_account_id)
    }

    /// Orphan-Pfad #1: Sub zeigt auf geloeschtes Konto. Wer nur den Namen
    /// aendert (account_id unveraendert), darf nicht am Existence-Check
    /// scheitern. Vor dem Fix war genau das blockiert.
    #[tokio::test]
    async fn update_subscription_with_unchanged_orphan_account_id_passes() {
        let db = test_pool().await;
        let (mut sub, orphan_account_id) = make_orphan_sub(&db).await;

        sub.name = "Netflix Premium".into();
        update_subscription_in_db(&db, &sub)
            .await
            .expect("unchanged orphan account_id sollte durchgehen");

        assert_eq!(fetch_account_id(&db, sub.id).await, Some(orphan_account_id));
    }

    /// Orphan-Pfad #2: Wechsel auf ein existierendes anderes Konto.
    /// validate_account_exists muss die neue ID akzeptieren.
    #[tokio::test]
    async fn update_subscription_changing_orphan_to_valid_account_passes() {
        let db = test_pool().await;
        let (mut sub, _orphan_account_id) = make_orphan_sub(&db).await;

        let new_account_id = insert_account(&db, "Neues Konto").await;
        sub.account_id = Some(new_account_id);
        update_subscription_in_db(&db, &sub)
            .await
            .expect("Wechsel auf gueltiges Konto sollte durchgehen");

        assert_eq!(fetch_account_id(&db, sub.id).await, Some(new_account_id));
    }

    /// Orphan-Pfad #3: Wechsel auf ein nicht existierendes Konto bleibt
    /// blockiert — der Existence-Check soll genau das verhindern.
    #[tokio::test]
    async fn update_subscription_changing_to_nonexistent_account_is_rejected() {
        let db = test_pool().await;
        let (mut sub, orphan_account_id) = make_orphan_sub(&db).await;

        sub.account_id = Some(9999);
        let err = update_subscription_in_db(&db, &sub)
            .await
            .expect_err("nicht existierendes Konto muss abgelehnt werden");
        assert!(
            err.contains("9999"),
            "Fehlertext referenziert die ID: {err}"
        );
        assert_eq!(fetch_account_id(&db, sub.id).await, Some(orphan_account_id));
    }

    /// Orphan-Pfad #4: account_id auf null setzen, um die Orphan-Bindung
    /// abzuhaengen, muss ohne Validierung des alten Werts durchgehen.
    #[tokio::test]
    async fn update_subscription_clearing_orphan_account_passes() {
        let db = test_pool().await;
        let (mut sub, _orphan_account_id) = make_orphan_sub(&db).await;

        sub.account_id = None;
        update_subscription_in_db(&db, &sub)
            .await
            .expect("account_id auf null darf nicht blockiert sein");

        assert_eq!(fetch_account_id(&db, sub.id).await, None);
    }

    #[tokio::test]
    async fn update_subscription_roundtrips_period_cancellation() {
        let db = test_pool().await;
        let mut sub = insert_sub(&db, None).await;
        sub.cancel_mode = Some("period".into());
        sub.cancel_period_value = Some(3);
        sub.cancel_period_unit = Some("months".into());
        update_subscription_in_db(&db, &sub)
            .await
            .expect("period cancellation sollte durchgehen");

        let row = sqlx::query!(
            "SELECT cancel_mode, cancel_period_value, cancel_period_unit, cancel_date \
             FROM subscriptions WHERE id = ?",
            sub.id
        )
        .fetch_one(&db)
        .await
        .expect("fetch cancel fields");
        assert_eq!(
            (
                row.cancel_mode,
                row.cancel_period_value,
                row.cancel_period_unit,
                row.cancel_date
            ),
            (Some("period".into()), Some(3), Some("months".into()), None)
        );
    }

    #[tokio::test]
    async fn update_subscription_roundtrips_fixed_date_then_clears() {
        let db = test_pool().await;
        let mut sub = insert_sub(&db, None).await;
        sub.cancel_mode = Some("date".into());
        sub.cancel_date = Some("2026-12-01".into());
        update_subscription_in_db(&db, &sub)
            .await
            .expect("date cancellation sollte durchgehen");

        let row = sqlx::query!(
            "SELECT cancel_mode, cancel_date FROM subscriptions WHERE id = ?",
            sub.id
        )
        .fetch_one(&db)
        .await
        .expect("fetch date cancellation");
        assert_eq!(row.cancel_mode.as_deref(), Some("date"));
        assert_eq!(row.cancel_date.as_deref(), Some("2026-12-01"));

        // Zurueck auf None loescht alle Kuendigungsfelder.
        sub.cancel_mode = None;
        sub.cancel_date = None;
        update_subscription_in_db(&db, &sub)
            .await
            .expect("clear cancellation sollte durchgehen");
        let row2 = sqlx::query!("SELECT cancel_mode FROM subscriptions WHERE id = ?", sub.id)
            .fetch_one(&db)
            .await
            .expect("fetch cleared cancellation");
        assert_eq!(row2.cancel_mode, None);
    }

    #[tokio::test]
    async fn update_subscription_rejects_inconsistent_cancellation() {
        let db = test_pool().await;
        let mut sub = insert_sub(&db, None).await;
        sub.cancel_mode = Some("period".into()); // ohne value/unit
        let err = update_subscription_in_db(&db, &sub)
            .await
            .expect_err("period ohne Frist muss abgelehnt werden");
        assert!(err.contains("Kündigungsfrist"), "Fehlertext: {err}");
    }

    #[tokio::test]
    async fn confirm_account_balance_sets_timestamp_without_touching_balance() {
        let db = test_pool().await;
        let id = insert_account(&db, "Giro").await;
        let before = sqlx::query!("SELECT balance_updated_at FROM accounts WHERE id = ?", id)
            .fetch_one(&db)
            .await
            .expect("fetch before");
        assert_eq!(
            before.balance_updated_at, None,
            "frisches Konto hat keinen Zeitstempel"
        );

        confirm_account_balance_in_db(&db, id)
            .await
            .expect("confirm sollte durchgehen");

        let after = sqlx::query!(
            "SELECT balance_updated_at, balance_cents FROM accounts WHERE id = ?",
            id
        )
        .fetch_one(&db)
        .await
        .expect("fetch after");
        assert!(
            after.balance_updated_at.is_some(),
            "Zeitstempel muss gesetzt sein"
        );
        assert_eq!(after.balance_cents, 0, "Saldo bleibt unangetastet");
    }

    #[tokio::test]
    async fn set_active_tracks_archived_at_lifecycle() {
        let db = test_pool().await;
        let sub = insert_sub(&db, None).await;

        let fetch = |db: &SqlitePool| {
            let db = db.clone();
            let id = sub.id;
            async move {
                sqlx::query!("SELECT archived_at FROM subscriptions WHERE id = ?", id)
                    .fetch_one(&db)
                    .await
                    .expect("fetch archived_at")
                    .archived_at
            }
        };

        assert_eq!(fetch(&db).await, None, "aktives Abo hat keinen Zeitstempel");

        // Archivieren setzt den Zeitstempel.
        set_subscription_active_in_db(&db, sub.id, false)
            .await
            .expect("archivieren");
        let first = fetch(&db).await;
        assert!(first.is_some(), "Archivieren muss archived_at setzen");

        // Erneutes Deaktivieren behält den ursprünglichen Zeitstempel.
        set_subscription_active_in_db(&db, sub.id, false)
            .await
            .expect("erneut archivieren");
        assert_eq!(fetch(&db).await, first, "Zeitstempel bleibt idempotent");

        // Reaktivieren löscht den Zeitstempel.
        set_subscription_active_in_db(&db, sub.id, true)
            .await
            .expect("reaktivieren");
        assert_eq!(
            fetch(&db).await,
            None,
            "Reaktivieren muss archived_at löschen"
        );
    }

    #[tokio::test]
    async fn confirm_account_balance_rejects_unknown_account() {
        let db = test_pool().await;
        let err = confirm_account_balance_in_db(&db, 999)
            .await
            .expect_err("unbekanntes Konto muss abgelehnt werden");
        assert!(err.contains("existiert nicht"), "Fehlertext: {err}");
    }
}
