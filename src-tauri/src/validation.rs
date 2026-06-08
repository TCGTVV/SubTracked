use sqlx::SqlitePool;

use crate::recurrence::parse_iso_date_strict;

pub const ALLOWED_CURRENCIES: &[&str] = &["EUR", "USD", "GBP", "CHF", "KRW"];
pub const ALLOWED_INTERVALS: &[&str] = &["monthly", "quarterly", "yearly"];
pub const MAX_LEAD_DAYS: i64 = 365;
pub const MAX_ACCOUNT_BALANCE_CENTS: i64 = 9_000_000_000_000_000;

pub fn validate_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Name darf nicht leer sein.".to_string());
    }
    Ok(())
}

pub fn validate_currency(currency: &str) -> Result<(), String> {
    if !ALLOWED_CURRENCIES.contains(&currency) {
        return Err(format!(
            "Unbekannte Waehrung: {currency}. Erlaubt: {}.",
            ALLOWED_CURRENCIES.join(", ")
        ));
    }
    Ok(())
}

pub fn validate_interval(interval: &str) -> Result<(), String> {
    if !ALLOWED_INTERVALS.contains(&interval) {
        return Err(format!(
            "Unbekanntes Intervall: {interval}. Erlaubt: {}.",
            ALLOWED_INTERVALS.join(", ")
        ));
    }
    Ok(())
}

pub fn validate_anchor_date(date: &str) -> Result<(), String> {
    parse_iso_date_strict(date).map(|_| ())
}

pub fn validate_amount_cents(amount_cents: i64) -> Result<(), String> {
    if amount_cents <= 0 {
        return Err("Betrag muss groesser als 0 sein.".to_string());
    }
    Ok(())
}

pub fn validate_balance_cents(balance_cents: i64) -> Result<(), String> {
    if !(-MAX_ACCOUNT_BALANCE_CENTS..=MAX_ACCOUNT_BALANCE_CENTS).contains(&balance_cents) {
        return Err(format!(
            "Saldo muss zwischen -{MAX_ACCOUNT_BALANCE_CENTS} und {MAX_ACCOUNT_BALANCE_CENTS} kleinsten Waehrungseinheiten liegen."
        ));
    }
    Ok(())
}

pub fn validate_lead_days(lead_days: i64) -> Result<(), String> {
    if !(0..=MAX_LEAD_DAYS).contains(&lead_days) {
        return Err(format!(
            "Vorlauf muss zwischen 0 und {MAX_LEAD_DAYS} Tagen liegen."
        ));
    }
    Ok(())
}

pub fn validate_min_buffer_cents(min_buffer_cents: i64) -> Result<(), String> {
    if min_buffer_cents < 0 {
        return Err("Mindestpuffer darf nicht negativ sein.".to_string());
    }
    Ok(())
}

pub fn validate_subscription_fields(
    name: &str,
    amount_cents: i64,
    currency: &str,
    interval: &str,
    anchor_date: &str,
    lead_days: i64,
) -> Result<(), String> {
    validate_name(name)?;
    validate_amount_cents(amount_cents)?;
    validate_currency(currency)?;
    validate_interval(interval)?;
    validate_anchor_date(anchor_date)?;
    validate_lead_days(lead_days)?;
    Ok(())
}

pub fn validate_account_fields(
    name: &str,
    currency: &str,
    balance_cents: i64,
    min_buffer_cents: i64,
) -> Result<(), String> {
    validate_name(name)?;
    validate_currency(currency)?;
    validate_balance_cents(balance_cents)?;
    validate_min_buffer_cents(min_buffer_cents)?;
    Ok(())
}

/// Verifiziert, dass das angegebene Konto in der DB existiert. SQLite-Foreign-Keys
/// sind in dieser App nicht aktiviert (kein `PRAGMA foreign_keys=ON`), deshalb ist
/// der explizite Check noetig, sonst werden Abos auch mit nicht existenter
/// `account_id` widerspruchsfrei geschrieben.
pub async fn validate_account_exists(db: &SqlitePool, account_id: i64) -> Result<(), String> {
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM accounts WHERE id = ?")
        .bind(account_id)
        .fetch_one(db)
        .await
        .map_err(|e| e.to_string())?;
    if count == 0 {
        return Err(format!("Konto mit ID {account_id} existiert nicht."));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_rejects_empty_or_whitespace() {
        assert!(validate_name("").is_err());
        assert!(validate_name("   ").is_err());
        assert!(validate_name("\t\n").is_err());
        assert!(validate_name("Netflix").is_ok());
        assert!(validate_name("  Spotify  ").is_ok());
    }

    #[test]
    fn currency_whitelist_matches_frontend() {
        for currency in ALLOWED_CURRENCIES {
            assert!(validate_currency(currency).is_ok(), "{currency}");
        }
        assert!(validate_currency("eur").is_err(), "case sensitive");
        assert!(validate_currency("BTC").is_err());
        assert!(validate_currency("").is_err());
    }

    #[test]
    fn interval_whitelist_matches_schema() {
        for interval in ALLOWED_INTERVALS {
            assert!(validate_interval(interval).is_ok(), "{interval}");
        }
        assert!(validate_interval("weekly").is_err());
        assert!(validate_interval("Monthly").is_err());
        assert!(validate_interval("").is_err());
    }

    #[test]
    fn anchor_date_requires_iso_format() {
        assert!(validate_anchor_date("2026-06-08").is_ok());
        assert!(validate_anchor_date("2024-02-29").is_ok());
        assert!(
            validate_anchor_date("2025-02-29").is_err(),
            "kein Schaltjahr"
        );
        assert!(validate_anchor_date("08.06.2026").is_err(), "DE-Format");
        assert!(validate_anchor_date("2026-6-8").is_err(), "ohne Padding");
        assert!(validate_anchor_date("2026-13-01").is_err(), "Monat 13");
        assert!(validate_anchor_date("").is_err());
    }

    #[test]
    fn amount_cents_must_be_positive() {
        assert!(validate_amount_cents(1).is_ok());
        assert!(validate_amount_cents(1_799).is_ok());
        assert!(validate_amount_cents(0).is_err());
        assert!(validate_amount_cents(-1).is_err());
    }

    #[test]
    fn balance_cents_allows_realistic_negative_and_positive_values() {
        assert!(validate_balance_cents(0).is_ok());
        assert!(validate_balance_cents(50_000).is_ok());
        assert!(validate_balance_cents(-12_550).is_ok());
        assert!(validate_balance_cents(MAX_ACCOUNT_BALANCE_CENTS).is_ok());
        assert!(validate_balance_cents(-MAX_ACCOUNT_BALANCE_CENTS).is_ok());
        assert!(validate_balance_cents(MAX_ACCOUNT_BALANCE_CENTS + 1).is_err());
        assert!(validate_balance_cents(-MAX_ACCOUNT_BALANCE_CENTS - 1).is_err());
    }

    #[test]
    fn lead_days_in_range() {
        assert!(validate_lead_days(0).is_ok());
        assert!(validate_lead_days(60).is_ok());
        assert!(validate_lead_days(365).is_ok());
        assert!(validate_lead_days(-1).is_err());
        assert!(validate_lead_days(366).is_err());
    }

    #[test]
    fn min_buffer_cents_non_negative() {
        assert!(validate_min_buffer_cents(0).is_ok());
        assert!(validate_min_buffer_cents(50_000).is_ok());
        assert!(validate_min_buffer_cents(-1).is_err());
    }

    #[test]
    fn subscription_fields_composed_check() {
        assert!(
            validate_subscription_fields("Netflix", 1_799, "EUR", "monthly", "2026-06-01", 7)
                .is_ok()
        );
        assert!(
            validate_subscription_fields("", 1_799, "EUR", "monthly", "2026-06-01", 7).is_err()
        );
        assert!(
            validate_subscription_fields("Netflix", 0, "EUR", "monthly", "2026-06-01", 7).is_err()
        );
        assert!(
            validate_subscription_fields("Netflix", 1_799, "XYZ", "monthly", "2026-06-01", 7)
                .is_err()
        );
        assert!(
            validate_subscription_fields("Netflix", 1_799, "EUR", "weekly", "2026-06-01", 7)
                .is_err()
        );
        assert!(
            validate_subscription_fields("Netflix", 1_799, "EUR", "monthly", "08.06.2026", 7)
                .is_err()
        );
        assert!(validate_subscription_fields(
            "Netflix",
            1_799,
            "EUR",
            "monthly",
            "2026-06-01",
            400
        )
        .is_err());
    }

    #[test]
    fn account_fields_composed_check() {
        assert!(validate_account_fields("Hauptkonto", "EUR", 0, 0).is_ok());
        assert!(validate_account_fields("Hauptkonto", "EUR", -12_550, 50_000).is_ok());
        assert!(validate_account_fields("", "EUR", 0, 0).is_err());
        assert!(validate_account_fields("Hauptkonto", "BTC", 0, 0).is_err());
        assert!(
            validate_account_fields("Hauptkonto", "EUR", MAX_ACCOUNT_BALANCE_CENTS + 1, 0).is_err()
        );
        assert!(validate_account_fields("Hauptkonto", "EUR", 0, -1).is_err());
    }
}
