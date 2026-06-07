use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

pub struct AppState {
    pub db: SqlitePool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
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
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: i64,
    pub name: String,
    pub note: Option<String>,
    pub currency: String,
    pub balance_cents: i64,
    pub min_buffer_cents: i64,
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
}
