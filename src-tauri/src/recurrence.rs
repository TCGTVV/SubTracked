use chrono::{Duration, Months, NaiveDate};

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

#[derive(Clone, Copy)]
pub enum IntervalStep {
    Months(u32),
    Days(i64),
}

/// Single Source of Truth fuer Intervalle: Name + Schritt. Wer ein neues
/// Intervall einfuehrt, ergaenzt hier eine Zeile — `interval_step` und
/// `validation::validate_interval` ziehen daraus automatisch nach.
pub const ALLOWED_INTERVALS: &[(&str, IntervalStep)] = &[
    ("weekly", IntervalStep::Days(7)),
    ("biweekly", IntervalStep::Days(14)),
    ("monthly", IntervalStep::Months(1)),
    ("bimonthly", IntervalStep::Months(2)),
    ("quarterly", IntervalStep::Months(3)),
    ("semiannual", IntervalStep::Months(6)),
    ("yearly", IntervalStep::Months(12)),
];

#[cfg(test)]
fn months_per_interval(interval: &str) -> Result<u32, String> {
    match interval_step(interval)? {
        IntervalStep::Months(months) => Ok(months),
        IntervalStep::Days(_) => Err(format!(
            "Intervall {interval} ist kein Monatsintervall. Erlaubt fuer Monatsfaktor: monthly, quarterly, yearly."
        )),
    }
}

pub fn interval_step(interval: &str) -> Result<IntervalStep, String> {
    ALLOWED_INTERVALS
        .iter()
        .find(|(name, _)| *name == interval)
        .map(|(_, step)| *step)
        .ok_or_else(|| {
            format!(
                "Unbekanntes Intervall: {interval}. Erlaubt: {}.",
                allowed_interval_names()
            )
        })
}

fn allowed_interval_names() -> String {
    ALLOWED_INTERVALS
        .iter()
        .map(|(name, _)| *name)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Naechstes Faelligkeitsdatum am oder nach `from`.
/// Anker-additiv: due = anchor + k * step (Monate). Niemals iterativ vom letzten
/// Termin weiter, sonst driften 31.-Anker weg (siehe Anker-Drift-Test).
pub fn next_due_date(
    anchor: NaiveDate,
    interval: &str,
    from: NaiveDate,
) -> Result<NaiveDate, String> {
    let step = interval_step(interval)?;
    let mut k: u32 = 0;
    let mut due = anchor;
    while due < from {
        k += 1;
        due = match step {
            IntervalStep::Months(months) => anchor
                .checked_add_months(Months::new(k * months))
                .ok_or_else(|| format!("Datum-Overflow bei k={k}"))?,
            IntervalStep::Days(days) => anchor
                .checked_add_signed(Duration::days(i64::from(k) * days))
                .ok_or_else(|| format!("Datum-Overflow bei k={k}"))?,
        };
    }
    Ok(due)
}

/// Zieht eine Kündigungsfrist von einem Datum ab. Monate werden date-additiv
/// (kalendarisch, mit Monatsende-Klemmung) abgezogen — parallel zu `subtractPeriod`
/// in `src/lib/cancellation.ts`.
fn subtract_period(date: NaiveDate, value: i64, unit: &str) -> Result<NaiveDate, String> {
    let result = match unit {
        "days" => date.checked_sub_signed(Duration::days(value)),
        "weeks" => date.checked_sub_signed(Duration::days(value * 7)),
        "months" => {
            let months = u32::try_from(value)
                .map_err(|_| format!("Kündigungsfrist außerhalb des gültigen Bereichs: {value}"))?;
            date.checked_sub_months(Months::new(months))
        }
        other => return Err(format!("Ungültige Kündigungsfrist-Einheit: {other}")),
    };
    result.ok_or_else(|| "Datum-Overflow bei Kündigungsfrist".to_string())
}

/// Rust-Spiegel von `cancelDeadline` (`src/lib/cancellation.ts`): nächstes relevantes
/// „kündigen bis"-Datum, oder None wenn keine Kündigung getrackt ist.
///
/// - mode "date": festes Stichdatum (auch wenn in der Vergangenheit).
/// - mode "period": nächste Fälligkeit minus Frist; ist die Frist für den aktuellen
///   Zyklus verstrichen, wird zur nächsten Fälligkeit weitergerückt.
///
/// Beide Implementierungen werden durch die geteilten Vektoren in
/// `tests/fixtures/recurrence-vectors.json` gegen Drift abgesichert.
pub fn cancel_deadline(
    mode: Option<&str>,
    period_value: Option<i64>,
    period_unit: Option<&str>,
    fixed_date: Option<&str>,
    anchor: NaiveDate,
    interval: &str,
    from: NaiveDate,
) -> Result<Option<NaiveDate>, String> {
    match mode {
        Some("date") => match fixed_date {
            Some(date) => Ok(Some(parse_iso_date_strict(date)?)),
            None => Ok(None),
        },
        Some("period") => {
            let (value, unit) = match (period_value, period_unit) {
                (Some(value), Some(unit)) => (value, unit),
                _ => return Ok(None),
            };
            let mut renewal = next_due_date(anchor, interval, from)?;
            let mut deadline = subtract_period(renewal, value, unit)?;
            while deadline < from {
                renewal = next_due_date(anchor, interval, renewal + Duration::days(1))?;
                deadline = subtract_period(renewal, value, unit)?;
            }
            Ok(Some(deadline))
        }
        _ => Ok(None),
    }
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
        assert_eq!(months_per_interval("bimonthly").unwrap(), 2);
        assert_eq!(months_per_interval("quarterly").unwrap(), 3);
        assert_eq!(months_per_interval("semiannual").unwrap(), 6);
        assert_eq!(months_per_interval("yearly").unwrap(), 12);
        assert!(months_per_interval("biweekly").is_err());
        assert!(months_per_interval("weekly").is_err());
        assert!(months_per_interval("foobar").is_err());
    }

    #[test]
    fn biweekly_step() {
        let anchor = d(2026, 1, 5);
        assert_eq!(
            next_due_date(anchor, "biweekly", d(2026, 1, 18)).unwrap(),
            d(2026, 1, 19)
        );
        assert_eq!(
            next_due_date(anchor, "biweekly", d(2026, 2, 2)).unwrap(),
            d(2026, 2, 2)
        );
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
        struct CancelVector {
            name: String,
            mode: Option<String>,
            period_value: Option<i64>,
            period_unit: Option<String>,
            cancel_date: Option<String>,
            anchor: String,
            interval: String,
            from: String,
            expected: Option<String>,
        }
        #[derive(serde::Deserialize)]
        struct SharedVectors {
            next_due_date: Vec<NextDueVector>,
            cancel_deadline: Vec<CancelVector>,
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

        assert!(
            !vectors.cancel_deadline.is_empty(),
            "cancel-fixtures sollten min. einen Vektor enthalten"
        );
        for v in vectors.cancel_deadline {
            let anchor = NaiveDate::parse_from_str(&v.anchor, "%Y-%m-%d")
                .unwrap_or_else(|e| panic!("{}: anchor parse {e}", v.name));
            let from = NaiveDate::parse_from_str(&v.from, "%Y-%m-%d")
                .unwrap_or_else(|e| panic!("{}: from parse {e}", v.name));
            let got = cancel_deadline(
                v.mode.as_deref(),
                v.period_value,
                v.period_unit.as_deref(),
                v.cancel_date.as_deref(),
                anchor,
                &v.interval,
                from,
            )
            .unwrap_or_else(|e| panic!("{}: cancel_deadline err {e}", v.name));
            let got = got.map(|d| d.format("%Y-%m-%d").to_string());
            assert_eq!(got, v.expected, "cancel vektor {}", v.name);
        }
    }
}
