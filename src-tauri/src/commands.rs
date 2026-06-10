use serde::Serialize;
use tauri::State;
use tauri_plugin_notification::NotificationExt;

use crate::db::{
    Account, AppState, Income, NewIncome, NewSubscription, ReminderState, Subscription,
};
use crate::validation::{
    validate_account_exists, validate_account_fields, validate_subscription_fields,
};

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
    validate_subscription_fields(
        &sub.name,
        sub.amount_cents,
        &sub.currency,
        &sub.interval,
        &sub.anchor_date,
        sub.lead_days,
    )?;
    if let Some(account_id) = sub.account_id {
        validate_account_exists(&state.db, account_id).await?;
    }
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
    validate_account_fields(&name, &currency, balance_cents, min_buffer_cents)?;
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
    validate_account_fields(
        &account.name,
        &account.currency,
        account.balance_cents,
        account.min_buffer_cents,
    )?;
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

async fn fetch_current_account_id(
    db: &sqlx::SqlitePool,
    subscription_id: i64,
) -> Result<Option<i64>, String> {
    let row: Option<(Option<i64>,)> =
        sqlx::query_as("SELECT account_id FROM subscriptions WHERE id = ? LIMIT 1")
            .bind(subscription_id)
            .fetch_optional(db)
            .await
            .map_err(|e| e.to_string())?;
    Ok(row.and_then(|(account_id,)| account_id))
}

/// Tatsaechlicher Update-Pfad fuer Subscriptions. Direkt testbar mit einem
/// in-memory-Pool, ohne Tauri-State-Setup. Der `#[tauri::command]`-Wrapper
/// `update_subscription` darunter delegiert nur.
///
/// account_id-Sonderbehandlung: bei unveraendertem account_id lassen wir die
/// Spalte komplett aus dem SET-Clause. Sonst pruefte SQLite (FK an per
/// sqlx-Default) die FK-Bindung auch fuer den unveraenderten Wert und Legacy-
/// Orphan-Rows aus der `tauri-plugin-sql`-Aera wuerden den UPDATE blockieren.
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
    )?;
    let current_account_id = fetch_current_account_id(db, sub.id).await?;
    let account_id_changed = current_account_id != sub.account_id;
    if account_id_changed {
        if let Some(new_account_id) = sub.account_id {
            validate_account_exists(db, new_account_id).await?;
        }
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
        .execute(db)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE subscriptions \
             SET name = ?, amount_cents = ?, currency = ?, \
                 interval = ?, anchor_date = ?, lead_days = ?, active = ?, notify = ? \
             WHERE id = ?",
        )
        .bind(&sub.name)
        .bind(sub.amount_cents)
        .bind(&sub.currency)
        .bind(&sub.interval)
        .bind(&sub.anchor_date)
        .bind(sub.lead_days)
        .bind(sub.active)
        .bind(sub.notify)
        .bind(sub.id)
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
pub async fn list_incomes(
    state: State<'_, AppState>,
    only_active: Option<bool>,
) -> Result<Vec<Income>, String> {
    let only_active = only_active.unwrap_or(false);
    let sql = if only_active {
        "SELECT id, name, amount_cents, currency, account_id, interval, anchor_date, active \
         FROM incomes WHERE active = 1 ORDER BY name"
    } else {
        "SELECT id, name, amount_cents, currency, account_id, interval, anchor_date, active \
         FROM incomes ORDER BY name"
    };
    sqlx::query_as::<_, Income>(sql)
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
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
    let result = sqlx::query(
        "INSERT INTO incomes (name, amount_cents, currency, account_id, interval, anchor_date, active) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&income.name)
    .bind(income.amount_cents)
    .bind(&income.currency)
    .bind(income.account_id)
    .bind(&income.interval)
    .bind(&income.anchor_date)
    .bind(active)
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
    let current: Option<(Option<i64>,)> =
        sqlx::query_as("SELECT account_id FROM incomes WHERE id = ?")
            .bind(income.id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| e.to_string())?;
    let current_account_id = current.map(|(id,)| id).flatten();
    if current_account_id != income.account_id {
        if let Some(new_id) = income.account_id {
            validate_account_exists(&state.db, new_id).await?;
        }
        sqlx::query(
            "UPDATE incomes SET name = ?, amount_cents = ?, currency = ?, account_id = ?, \
             interval = ?, anchor_date = ?, active = ? WHERE id = ?",
        )
        .bind(&income.name)
        .bind(income.amount_cents)
        .bind(&income.currency)
        .bind(income.account_id)
        .bind(&income.interval)
        .bind(&income.anchor_date)
        .bind(income.active)
        .bind(income.id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE incomes SET name = ?, amount_cents = ?, currency = ?, \
             interval = ?, anchor_date = ?, active = ? WHERE id = ?",
        )
        .bind(&income.name)
        .bind(income.amount_cents)
        .bind(&income.currency)
        .bind(&income.interval)
        .bind(&income.anchor_date)
        .bind(income.active)
        .bind(income.id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_income(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM incomes WHERE id = ?")
        .bind(id)
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
    sqlx::query("UPDATE incomes SET active = ? WHERE id = ?")
        .bind(active)
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
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
        let res = sqlx::query(
            "INSERT INTO accounts (name, note, currency, balance_cents, min_buffer_cents) \
             VALUES (?, NULL, 'EUR', 0, 0)",
        )
        .bind(name)
        .execute(db)
        .await
        .expect("insert account");
        res.last_insert_rowid()
    }

    async fn insert_sub(db: &SqlitePool, account_id: Option<i64>) -> Subscription {
        let res = sqlx::query(
            "INSERT INTO subscriptions \
               (name, amount_cents, currency, account_id, interval, anchor_date, \
                lead_days, active, notify) \
             VALUES ('Netflix', 1799, 'EUR', ?, 'monthly', '2026-01-15', 7, 1, 1)",
        )
        .bind(account_id)
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
        }
    }

    async fn fetch_account_id(db: &SqlitePool, sub_id: i64) -> Option<i64> {
        let (account_id,): (Option<i64>,) =
            sqlx::query_as("SELECT account_id FROM subscriptions WHERE id = ?")
                .bind(sub_id)
                .fetch_one(db)
                .await
                .expect("fetch account_id");
        account_id
    }

    /// Baut eine Subscription nach, deren account_id auf ein nicht mehr
    /// existierendes Konto zeigt. Echte Orphan-Rows entstehen so nur aus
    /// der `tauri-plugin-sql`-Aera, in der FK-Enforcement nicht garantiert
    /// war — sqlx schaltet FKs per Default ein. Hier wird FK kurz aus
    /// geschaltet, damit das DELETE durchgeht, danach wieder an, damit der
    /// Testpfad genau die Production-Bedingung sieht.
    async fn make_orphan_sub(db: &SqlitePool) -> (Subscription, i64) {
        let orphan_account_id = insert_account(db, "Altes Konto").await;
        let sub = insert_sub(db, Some(orphan_account_id)).await;
        sqlx::query("PRAGMA foreign_keys = OFF")
            .execute(db)
            .await
            .expect("pragma off");
        sqlx::query("DELETE FROM accounts WHERE id = ?")
            .bind(orphan_account_id)
            .execute(db)
            .await
            .expect("delete account");
        sqlx::query("PRAGMA foreign_keys = ON")
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
}
