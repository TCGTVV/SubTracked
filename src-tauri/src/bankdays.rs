//! Bankarbeitstage und Termin-Verschiebung.
//!
//! Fällt ein Abbuchungs- oder Gutschriftstermin auf Wochenende oder Feiertag, bucht die
//! Bank am nächsten (Lastschrift) bzw. vorigen (z.B. Gehalt) Bankarbeitstag. Für die
//! Kontodeckung kann das einen Tag Unterschied machen.
//!
//! Bankarbeitstag = Mo–Fr außer den bundeseinheitlichen Feiertagen: Neujahr, Karfreitag,
//! Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag, 3. Oktober, 1. und 2.
//! Weihnachtstag. Regionale Feiertage zählen bewusst nicht (die App kennt kein Bundesland).
//!
//! Spiegel zu `src/lib/bankdays.ts`; beide Seiten sind über
//! `tests/fixtures/bankday-vectors.json` gegen Drift abgesichert.

use chrono::{Datelike, Duration, NaiveDate, Weekday};

pub const SHIFT_RULES: &[&str] = &["none", "next", "previous"];

/// Ostersonntag (Gregorianischer Kalender, "anonymer" Algorithmus nach Meeus/Jones/Butcher).
pub fn easter_sunday(year: i32) -> NaiveDate {
    let a = year % 19;
    let b = year / 100;
    let c = year % 100;
    let d = b / 4;
    let e = b % 4;
    let f = (b + 8) / 25;
    let g = (b - f + 1) / 3;
    let h = (19 * a + b - d - g + 15) % 30;
    let i = c / 4;
    let k = c % 4;
    let l = (32 + 2 * e + 2 * i - h - k) % 7;
    let m = (a + 11 * h + 22 * l) / 451;
    let month = (h + l - 7 * m + 114) / 31;
    let day = (h + l - 7 * m + 114) % 31 + 1;
    NaiveDate::from_ymd_opt(year, month as u32, day as u32).expect("Ostertermin ist immer gültig")
}

/// Bundeseinheitlicher Feiertag?
pub fn is_bank_holiday(date: NaiveDate) -> bool {
    let fixed = matches!(
        (date.month(), date.day()),
        (1, 1) | (5, 1) | (10, 3) | (12, 25) | (12, 26)
    );
    if fixed {
        return true;
    }
    let easter = easter_sunday(date.year());
    // Karfreitag, Ostermontag, Christi Himmelfahrt, Pfingstmontag
    [-2, 1, 39, 50]
        .iter()
        .any(|offset| date == easter + Duration::days(*offset))
}

pub fn is_bank_day(date: NaiveDate) -> bool {
    !matches!(date.weekday(), Weekday::Sat | Weekday::Sun) && !is_bank_holiday(date)
}

/// Verschiebt `date` gemäß Regel: `none` unverändert, `next` auf den nächsten und
/// `previous` auf den vorigen Bankarbeitstag (ist `date` selbst einer, bleibt es).
/// Unbekannte Regeln werden wie `none` behandelt; die Validierung passiert vorher.
pub fn shift_to_bank_day(date: NaiveDate, rule: &str) -> NaiveDate {
    let step = match rule {
        "next" => 1,
        "previous" => -1,
        _ => return date,
    };
    let mut d = date;
    while !is_bank_day(d) {
        d += Duration::days(step);
    }
    d
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[derive(Deserialize)]
    struct HolidayYear {
        year: i32,
        easter: String,
        dates: Vec<String>,
    }

    #[derive(Deserialize)]
    struct ShiftVector {
        name: String,
        date: String,
        rule: String,
        expected: String,
    }

    #[derive(Deserialize)]
    struct Vectors {
        holidays: Vec<HolidayYear>,
        shift: Vec<ShiftVector>,
    }

    fn vectors() -> Vectors {
        serde_json::from_str(include_str!("../../tests/fixtures/bankday-vectors.json"))
            .expect("bankday-vectors.json parsen")
    }

    #[test]
    fn easter_and_holiday_sets_match_shared_vectors() {
        let v = vectors();
        assert!(!v.holidays.is_empty());
        for y in v.holidays {
            assert_eq!(easter_sunday(y.year), d(&y.easter), "Ostern {}", y.year);
            let mut found = Vec::new();
            let mut day = d(&format!("{}-01-01", y.year));
            while day.year() == y.year {
                if is_bank_holiday(day) {
                    found.push(day.format("%Y-%m-%d").to_string());
                }
                day += Duration::days(1);
            }
            assert_eq!(found, y.dates, "Feiertage {}", y.year);
        }
    }

    #[test]
    fn shift_matches_shared_vectors() {
        let v = vectors();
        assert!(!v.shift.is_empty());
        for s in v.shift {
            assert_eq!(
                shift_to_bank_day(d(&s.date), &s.rule),
                d(&s.expected),
                "{}",
                s.name
            );
        }
    }

    #[test]
    fn shifted_date_is_always_a_bank_day_for_next_and_previous() {
        let mut day = d("2025-01-01");
        while day < d("2031-01-01") {
            assert!(is_bank_day(shift_to_bank_day(day, "next")), "next {day}");
            assert!(
                is_bank_day(shift_to_bank_day(day, "previous")),
                "prev {day}"
            );
            day += Duration::days(1);
        }
    }

    #[test]
    fn next_never_moves_backwards_and_previous_never_forwards() {
        let mut day = d("2026-01-01");
        while day < d("2027-01-01") {
            assert!(shift_to_bank_day(day, "next") >= day);
            assert!(shift_to_bank_day(day, "previous") <= day);
            day += Duration::days(1);
        }
    }

    #[test]
    fn unknown_rule_behaves_like_none() {
        assert_eq!(shift_to_bank_day(d("2026-01-31"), "bogus"), d("2026-01-31"));
    }
}
