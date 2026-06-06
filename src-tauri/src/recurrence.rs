use chrono::{Months, NaiveDate};

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
}
