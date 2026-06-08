use chrono::{Months, NaiveDate};

pub fn parse_iso_date_strict(date: &str) -> Result<NaiveDate, String> {
    // chrono's %Y-%m-%d akzeptiert auch unpadded Werte wie "2026-6-8".
    // In der DB speichern wir strikt YYYY-MM-DD, damit Read- und Write-Pfad
    // dieselbe Datumssprache sprechen.
    let bytes = date.as_bytes();
    let strict = bytes.len() == 10 && bytes[4] == b'-' && bytes[7] == b'-';
    if !strict {
        return Err(format!("Ungueltiges Datum: {date}. Erwartet: YYYY-MM-DD."));
    }
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| format!("Ungueltiges Datum: {date}. Erwartet: YYYY-MM-DD."))
}

pub fn months_per_interval(interval: &str) -> Result<u32, String> {
    match interval {
        "monthly" => Ok(1),
        "quarterly" => Ok(3),
        "yearly" => Ok(12),
        _ => Err(format!("Unbekanntes Intervall: {interval}")),
    }
}

/// Naechstes Faelligkeitsdatum am oder nach `from`.
/// Anker-additiv: due = anchor + k * step (Monate). Niemals iterativ vom letzten
/// Termin weiter, sonst driften 31.-Anker weg (siehe Anker-Drift-Test).
pub fn next_due_date(
    anchor: NaiveDate,
    interval: &str,
    from: NaiveDate,
) -> Result<NaiveDate, String> {
    let step = months_per_interval(interval)?;
    let mut k: u32 = 0;
    let mut due = anchor;
    while due < from {
        k += 1;
        due = anchor
            .checked_add_months(Months::new(k * step))
            .ok_or_else(|| format!("Datum-Overflow bei k={k}"))?;
    }
    Ok(due)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).expect("invalid date")
    }

    #[test]
    fn strict_iso_date_parser_rejects_unpadded_dates() {
        assert_eq!(parse_iso_date_strict("2026-06-08").unwrap(), d(2026, 6, 8));
        assert!(parse_iso_date_strict("2026-6-8").is_err());
        assert!(parse_iso_date_strict("2026-06-8").is_err());
        assert!(parse_iso_date_strict("08.06.2026").is_err());
        assert!(parse_iso_date_strict("2025-02-29").is_err());
    }

    #[test]
    fn months_mapping() {
        assert_eq!(months_per_interval("monthly").unwrap(), 1);
        assert_eq!(months_per_interval("quarterly").unwrap(), 3);
        assert_eq!(months_per_interval("yearly").unwrap(), 12);
        assert!(months_per_interval("foobar").is_err());
    }

    /// Kritischer Test: Anker 31.01. darf nicht auf den 28. driften,
    /// wenn anker-additiv addiert wird. Maerz/Mai/Juli muessen wieder
    /// auf den 31. fallen.
    #[test]
    fn anker_additive_drift_31() {
        let anchor = d(2025, 1, 31);
        assert_eq!(
            next_due_date(anchor, "monthly", d(2025, 1, 31)).unwrap(),
            d(2025, 1, 31)
        );
        assert_eq!(
            next_due_date(anchor, "monthly", d(2025, 2, 1)).unwrap(),
            d(2025, 2, 28)
        );
        assert_eq!(
            next_due_date(anchor, "monthly", d(2025, 3, 1)).unwrap(),
            d(2025, 3, 31)
        );
        assert_eq!(
            next_due_date(anchor, "monthly", d(2025, 4, 1)).unwrap(),
            d(2025, 4, 30)
        );
        assert_eq!(
            next_due_date(anchor, "monthly", d(2025, 5, 1)).unwrap(),
            d(2025, 5, 31)
        );
        assert_eq!(
            next_due_date(anchor, "monthly", d(2025, 6, 1)).unwrap(),
            d(2025, 6, 30)
        );
        assert_eq!(
            next_due_date(anchor, "monthly", d(2025, 7, 1)).unwrap(),
            d(2025, 7, 31)
        );
    }

    #[test]
    fn quarterly_step() {
        let anchor = d(2025, 1, 15);
        assert_eq!(
            next_due_date(anchor, "quarterly", d(2025, 4, 15)).unwrap(),
            d(2025, 4, 15)
        );
        assert_eq!(
            next_due_date(anchor, "quarterly", d(2025, 4, 16)).unwrap(),
            d(2025, 7, 15)
        );
    }

    #[test]
    fn yearly_step_leap() {
        let anchor = d(2024, 2, 29);
        // 2025-02-29 existiert nicht, chrono klemmt auf 28.02
        assert_eq!(
            next_due_date(anchor, "yearly", d(2025, 2, 28)).unwrap(),
            d(2025, 2, 28)
        );
        // Weiter in die Zukunft -> 2026-02-28
        assert_eq!(
            next_due_date(anchor, "yearly", d(2025, 3, 1)).unwrap(),
            d(2026, 2, 28)
        );
    }

    #[test]
    fn unbekanntes_interval() {
        assert!(next_due_date(d(2025, 1, 1), "foobar", d(2025, 1, 1)).is_err());
    }

    /// Geteilte Testvektoren mit `src/lib/recurrence.ts`. Drift zwischen den beiden
    /// Implementierungen faellt damit auf, sobald eine Seite sich anders entscheidet.
    /// Vektoren leben unter `tests/fixtures/recurrence-vectors.json` im Repo-Root.
    #[test]
    fn shared_vectors_match_typescript_impl() {
        #[derive(serde::Deserialize)]
        struct NextDueVector {
            name: String,
            anchor: String,
            interval: String,
            from: String,
            expected: String,
        }
        #[derive(serde::Deserialize)]
        struct SharedVectors {
            next_due_date: Vec<NextDueVector>,
        }
        let json = include_str!("../../tests/fixtures/recurrence-vectors.json");
        let vectors: SharedVectors = serde_json::from_str(json).expect("parse fixtures");
        assert!(
            !vectors.next_due_date.is_empty(),
            "fixtures sollten min. einen Vektor enthalten"
        );
        for v in vectors.next_due_date {
            let anchor = NaiveDate::parse_from_str(&v.anchor, "%Y-%m-%d")
                .unwrap_or_else(|e| panic!("{}: anchor parse {e}", v.name));
            let from = NaiveDate::parse_from_str(&v.from, "%Y-%m-%d")
                .unwrap_or_else(|e| panic!("{}: from parse {e}", v.name));
            let expected = NaiveDate::parse_from_str(&v.expected, "%Y-%m-%d")
                .unwrap_or_else(|e| panic!("{}: expected parse {e}", v.name));
            let got = next_due_date(anchor, &v.interval, from)
                .unwrap_or_else(|e| panic!("{}: next_due_date err {e}", v.name));
            assert_eq!(got, expected, "vektor {}", v.name);
        }
    }
}
