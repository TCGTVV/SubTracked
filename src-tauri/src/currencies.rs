use std::sync::LazyLock;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Currency {
    code: String,
    subdivisions: u32,
}

#[derive(Debug, Deserialize)]
struct CurrenciesFile {
    currencies: Vec<Currency>,
}

/// Geladen aus [`tests/fixtures/currencies.json`] zur Compile-Zeit; geparst
/// einmalig beim ersten Zugriff. Wer eine neue Waehrung hinzufuegt, aendert
/// nur die JSON — TS-Seite (src/lib/format.ts) zieht ueber denselben
/// Fixture-Pfad gleichzeitig nach.
static CURRENCIES: LazyLock<Vec<Currency>> = LazyLock::new(|| {
    let json = include_str!("../../tests/fixtures/currencies.json");
    serde_json::from_str::<CurrenciesFile>(json)
        .expect("tests/fixtures/currencies.json muss valides JSON sein")
        .currencies
});

/// Alle erlaubten Waehrungscodes als Slice von `'static`-Strings — bei
/// statischer JSON gibt der Allocator die Strings nicht wieder her.
pub fn allowed_codes() -> Vec<&'static str> {
    CURRENCIES.iter().map(|c| c.code.as_str()).collect()
}

pub fn is_allowed(code: &str) -> bool {
    CURRENCIES.iter().any(|c| c.code == code)
}

/// Smallest currency unit pro Hauptwaehrung. Default 100 (EUR/USD/etc.); KRW
/// = 1. Default greift, wenn die Waehrung dem Backend voellig fremd ist —
/// das sollte im normalen Betrieb nicht passieren (Whitelist greift vorher).
pub fn subdivisor(code: &str) -> i64 {
    CURRENCIES
        .iter()
        .find(|c| c.code == code)
        .map(|c| i64::from(c.subdivisions))
        .unwrap_or(100)
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn fixtures_load_without_panic() {
        let codes = allowed_codes();
        assert!(
            !codes.is_empty(),
            "Mindestens eine Waehrung muss erlaubt sein"
        );
    }

    #[test]
    fn known_currencies_are_allowed() {
        for code in ["EUR", "USD", "GBP", "CHF", "KRW"] {
            assert!(is_allowed(code), "{code} sollte erlaubt sein");
        }
    }

    #[test]
    fn unknown_currency_is_rejected() {
        assert!(!is_allowed("BTC"));
        assert!(!is_allowed("eur"), "case sensitive");
        assert!(!is_allowed(""));
    }

    #[test]
    fn fixture_codes_are_not_empty() {
        for currency in CURRENCIES.iter() {
            assert!(
                !currency.code.trim().is_empty(),
                "Waehrungscode darf nicht leer sein"
            );
            assert_eq!(
                currency.code,
                currency.code.trim(),
                "Waehrungscode darf keine fuehrenden oder folgenden Leerzeichen enthalten"
            );
        }
    }

    #[test]
    fn fixture_codes_are_unique() {
        let mut seen = HashSet::new();

        for currency in CURRENCIES.iter() {
            assert!(
                seen.insert(currency.code.as_str()),
                "Waehrungscode '{}' ist doppelt in tests/fixtures/currencies.json",
                currency.code
            );
        }
    }

    #[test]
    fn fixture_subdivisions_are_positive() {
        for currency in CURRENCIES.iter() {
            assert!(
                currency.subdivisions > 0,
                "Waehrungscode '{}' muss subdivisions > 0 haben",
                currency.code
            );
        }
    }

    #[test]
    fn subdivisor_reflects_currency_unit() {
        assert_eq!(subdivisor("EUR"), 100);
        assert_eq!(subdivisor("USD"), 100);
        assert_eq!(subdivisor("KRW"), 1);
    }

    #[test]
    fn subdivisor_defaults_to_100_for_unknown() {
        assert_eq!(subdivisor("BTC"), 100);
    }
}
