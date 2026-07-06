use sqlx::SqlitePool;

use crate::currencies;
use crate::recurrence::{interval_step, parse_iso_date_strict};

pub const MAX_LEAD_DAYS: i64 = 365;
pub const MAX_ACCOUNT_BALANCE_CENTS: i64 = 9_000_000_000_000_000;

pub fn validate_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Name darf nicht leer sein.".to_string());
    }
    Ok(())
}

/// Obergrenze für die (optionale) Kategorie.
/// Gespiegelt im Frontend: `MAX_CATEGORY_LENGTH` in `src/components/SubscriptionDialog.tsx`.
pub const MAX_CATEGORY_LENGTH: usize = 60;

/// Optionale Kategorie (Freitext): None/leer ist erlaubt, sonst nur eine Längen-Sanity.
pub fn validate_category(category: Option<&str>) -> Result<(), String> {
    if let Some(c) = category {
        if c.chars().count() > MAX_CATEGORY_LENGTH {
            return Err(format!(
                "Kategorie darf höchstens {MAX_CATEGORY_LENGTH} Zeichen lang sein."
            ));
        }
    }
    Ok(())
}

pub fn validate_currency(currency: &str) -> Result<(), String> {
    if !currencies::is_allowed(currency) {
        return Err(format!(
            "Unbekannte Waehrung: {currency}. Erlaubt: {}.",
            currencies::allowed_codes().join(", ")
        ));
    }
    Ok(())
}

pub fn validate_interval(interval: &str) -> Result<(), String> {
    interval_step(interval).map(|_| ())
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

// Bewusst ein Parameter pro Feld statt Params-Struct: die drei Aufrufer (add/update/
// Backup-Restore) haben unterschiedliche Quell-Structs, und die Feldliste wächst mit
// jeder Migration — Positions-Fehler fängt der Typ-Mix (i64/&str/Option) ab.
#[allow(clippy::too_many_arguments)]
pub fn validate_subscription_fields(
    name: &str,
    amount_cents: i64,
    currency: &str,
    interval: &str,
    anchor_date: &str,
    lead_days: i64,
    category: Option<&str>,
    pending_amount_cents: Option<i64>,
    pending_from: Option<&str>,
) -> Result<(), String> {
    validate_name(name)?;
    // Trial-/Probeabo: Betrag 0 ist nur erlaubt, wenn eine geplante Preisänderung
    // existiert („wird ab Datum X kostenpflichtig"). Negative Beträge nie.
    if amount_cents != 0 || pending_amount_cents.is_none() {
        validate_amount_cents(amount_cents)?;
    }
    validate_currency(currency)?;
    validate_interval(interval)?;
    validate_anchor_date(anchor_date)?;
    validate_lead_days(lead_days)?;
    validate_category(category)?;
    validate_pending_price(pending_amount_cents, pending_from)?;
    Ok(())
}

/// Geplante Preisänderung: Betrag und Wirksamkeitsdatum immer gemeinsam, Betrag > 0,
/// Datum strikt ISO. Vergangene Daten sind erlaubt — der Rollover im Reminder-Loop
/// schaltet sie beim nächsten Check scharf (max. 1h Verzug).
pub fn validate_pending_price(
    pending_amount_cents: Option<i64>,
    pending_from: Option<&str>,
) -> Result<(), String> {
    match (pending_amount_cents, pending_from) {
        (None, None) => Ok(()),
        (Some(cents), Some(from)) => {
            if cents <= 0 {
                return Err("Geplanter Preis muss groesser als 0 sein.".to_string());
            }
            parse_iso_date_strict(from).map(|_| ())
        }
        _ => Err(
            "Geplante Preisänderung braucht Betrag und Wirksamkeitsdatum gemeinsam.".to_string(),
        ),
    }
}

/// Erlaubte Einheiten für die Kündigungsfrist (cancel_mode = "period").
pub const CANCEL_PERIOD_UNITS: [&str; 3] = ["days", "weeks", "months"];
/// Obergrenze für die Kündigungsfrist (Sanity-Limit, gilt für jede Einheit).
/// Gespiegelt im Frontend: `MAX_CANCEL_PERIOD_VALUE` in `src/components/SubscriptionDialog.tsx` — bei Änderung beide anpassen.
pub const MAX_CANCEL_PERIOD_VALUE: i64 = 730;

/// Prüft die optionalen Kündigungsangaben auf Konsistenz. Die drei gültigen Zustände:
///   - mode = None              -> alle übrigen Felder müssen None sein.
///   - mode = Some("period")    -> value (1..=MAX) + unit gesetzt, date None.
///   - mode = Some("date")      -> date (gültiges ISO-Datum) gesetzt, value/unit None.
pub fn validate_cancellation(
    mode: Option<&str>,
    period_value: Option<i64>,
    period_unit: Option<&str>,
    date: Option<&str>,
) -> Result<(), String> {
    match mode {
        None => {
            if period_value.is_some() || period_unit.is_some() || date.is_some() {
                return Err("Kündigungsangaben ohne Kündigungsmodus".into());
            }
        }
        Some("period") => {
            let value = period_value.ok_or("Kündigungsfrist fehlt")?;
            if !(1..=MAX_CANCEL_PERIOD_VALUE).contains(&value) {
                return Err(format!(
                    "Kündigungsfrist muss zwischen 1 und {MAX_CANCEL_PERIOD_VALUE} liegen"
                ));
            }
            match period_unit {
                Some(unit) if CANCEL_PERIOD_UNITS.contains(&unit) => {}
                _ => return Err("Ungültige Einheit der Kündigungsfrist".into()),
            }
            if date.is_some() {
                return Err("Festes Kündigungsdatum im Frist-Modus nicht erlaubt".into());
            }
        }
        Some("date") => {
            let date = date.ok_or("Kündigungsdatum fehlt")?;
            validate_anchor_date(date)?;
            if period_value.is_some() || period_unit.is_some() {
                return Err("Kündigungsfrist im Datums-Modus nicht erlaubt".into());
            }
        }
        Some(_) => return Err("Ungültiger Kündigungsmodus".into()),
    }
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
/// sind in dieser App aktiv (siehe `lib.rs::run`, `foreign_keys(true)`); der
/// explizite Check existiert trotzdem, damit der User bei einem nicht
/// existierenden Konto einen lesbaren deutschen Fehler bekommt — statt der rohen
/// SQLite-FK-Constraint-Meldung, die SQLite sonst beim INSERT/UPDATE liefert.
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
    fn cancellation_none_requires_all_empty() {
        assert!(validate_cancellation(None, None, None, None).is_ok());
        assert!(validate_cancellation(None, Some(3), None, None).is_err());
        assert!(validate_cancellation(None, None, Some("months"), None).is_err());
        assert!(validate_cancellation(None, None, None, Some("2026-12-01")).is_err());
    }

    #[test]
    fn cancellation_period_validates_value_and_unit() {
        assert!(validate_cancellation(Some("period"), Some(3), Some("months"), None).is_ok());
        assert!(validate_cancellation(Some("period"), Some(1), Some("days"), None).is_ok());
        assert!(validate_cancellation(
            Some("period"),
            Some(MAX_CANCEL_PERIOD_VALUE),
            Some("weeks"),
            None
        )
        .is_ok());
        // fehlender Wert / Einheit
        assert!(validate_cancellation(Some("period"), None, Some("months"), None).is_err());
        assert!(validate_cancellation(Some("period"), Some(3), None, None).is_err());
        // außerhalb des Bereichs
        assert!(validate_cancellation(Some("period"), Some(0), Some("months"), None).is_err());
        assert!(validate_cancellation(
            Some("period"),
            Some(MAX_CANCEL_PERIOD_VALUE + 1),
            Some("months"),
            None
        )
        .is_err());
        // ungültige Einheit
        assert!(validate_cancellation(Some("period"), Some(3), Some("years"), None).is_err());
        // festes Datum im Frist-Modus verboten
        assert!(
            validate_cancellation(Some("period"), Some(3), Some("months"), Some("2026-12-01"))
                .is_err()
        );
    }

    #[test]
    fn cancellation_date_validates_iso_and_exclusivity() {
        assert!(validate_cancellation(Some("date"), None, None, Some("2026-12-01")).is_ok());
        // fehlendes / ungültiges Datum
        assert!(validate_cancellation(Some("date"), None, None, None).is_err());
        assert!(validate_cancellation(Some("date"), None, None, Some("2026-13-01")).is_err());
        assert!(validate_cancellation(Some("date"), None, None, Some("nope")).is_err());
        // Frist im Datums-Modus verboten
        assert!(validate_cancellation(Some("date"), Some(3), None, Some("2026-12-01")).is_err());
        assert!(
            validate_cancellation(Some("date"), None, Some("months"), Some("2026-12-01")).is_err()
        );
    }

    #[test]
    fn cancellation_rejects_unknown_mode() {
        assert!(validate_cancellation(Some("weird"), None, None, None).is_err());
    }

    #[test]
    fn currency_whitelist_matches_frontend() {
        for currency in currencies::allowed_codes() {
            assert!(validate_currency(currency).is_ok(), "{currency}");
        }
        assert!(validate_currency("eur").is_err(), "case sensitive");
        assert!(validate_currency("BTC").is_err());
        assert!(validate_currency("").is_err());
    }

    #[test]
    fn interval_whitelist_matches_schema() {
        for (interval, _) in crate::recurrence::ALLOWED_INTERVALS {
            assert!(validate_interval(interval).is_ok(), "{interval}");
        }
        assert!(validate_interval("fortnightly").is_err());
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
        assert!(validate_subscription_fields(
            "Netflix",
            1_799,
            "EUR",
            "monthly",
            "2026-06-01",
            7,
            None,
            None,
            None
        )
        .is_ok());
        assert!(validate_subscription_fields(
            "",
            1_799,
            "EUR",
            "monthly",
            "2026-06-01",
            7,
            None,
            None,
            None
        )
        .is_err());
        assert!(validate_subscription_fields(
            "Netflix",
            0,
            "EUR",
            "monthly",
            "2026-06-01",
            7,
            None,
            None,
            None
        )
        .is_err());
        assert!(validate_subscription_fields(
            "Netflix",
            1_799,
            "XYZ",
            "monthly",
            "2026-06-01",
            7,
            None,
            None,
            None
        )
        .is_err());
        assert!(validate_subscription_fields(
            "Netflix",
            1_799,
            "EUR",
            "fortnightly",
            "2026-06-01",
            7,
            None,
            None,
            None
        )
        .is_err());
        assert!(validate_subscription_fields(
            "Netflix",
            1_799,
            "EUR",
            "monthly",
            "08.06.2026",
            7,
            None,
            None,
            None
        )
        .is_err());
        assert!(validate_subscription_fields(
            "Netflix",
            1_799,
            "EUR",
            "monthly",
            "2026-06-01",
            400,
            None,
            None,
            None
        )
        .is_err());
    }

    #[test]
    fn pending_price_rules() {
        assert!(validate_pending_price(None, None).is_ok());
        assert!(validate_pending_price(Some(1_499), Some("2026-09-01")).is_ok());
        // Vergangene Wirksamkeitsdaten sind erlaubt — der Rollover wendet sie an.
        assert!(validate_pending_price(Some(1_499), Some("2020-01-01")).is_ok());
        assert!(validate_pending_price(Some(1_499), None).is_err());
        assert!(validate_pending_price(None, Some("2026-09-01")).is_err());
        assert!(validate_pending_price(Some(0), Some("2026-09-01")).is_err());
        assert!(validate_pending_price(Some(-5), Some("2026-09-01")).is_err());
        assert!(validate_pending_price(Some(1_499), Some("01.09.2026")).is_err());
    }

    #[test]
    fn trial_amount_zero_requires_pending_price() {
        // Betrag 0 ist nur mit geplanter Preisaenderung erlaubt (Trial/Probeabo).
        assert!(validate_subscription_fields(
            "Disney+",
            0,
            "EUR",
            "monthly",
            "2026-06-01",
            7,
            None,
            Some(1_499),
            Some("2026-09-01")
        )
        .is_ok());
        // Negative Betraege bleiben auch mit Pending verboten.
        assert!(validate_subscription_fields(
            "Disney+",
            -1,
            "EUR",
            "monthly",
            "2026-06-01",
            7,
            None,
            Some(1_499),
            Some("2026-09-01")
        )
        .is_err());
    }

    #[test]
    fn category_validation() {
        assert!(validate_category(None).is_ok());
        assert!(validate_category(Some("")).is_ok());
        assert!(validate_category(Some("Streaming")).is_ok());
        assert!(validate_category(Some(&"x".repeat(MAX_CATEGORY_LENGTH))).is_ok());
        assert!(validate_category(Some(&"x".repeat(MAX_CATEGORY_LENGTH + 1))).is_err());
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
