//! CSV-Import von Bank-Kontoauszügen mit heuristischer Erkennung wiederkehrender
//! Abbuchungen. Reine Vorschau: `preview_csv_import` liest+parst die Datei und
//! liefert Kandidaten ans Frontend, das den User auswählen/bearbeiten lässt.
//! Das eigentliche Anlegen läuft über das bestehende `add_subscription` —
//! bewusst kein eigener DB-Schreibpfad, um Validierung nicht zu duplizieren.
//!
//! Erkennung: Buchungen mit identischem (normalisiertem) Verwendungszweck und
//! identischem Betrag werden gruppiert; passt der Datums-Abstand zwischen allen
//! Vorkommen zu einem der bekannten Intervalle (siehe `recurrence::ALLOWED_INTERVALS`),
//! wird ein Kandidat vorgeschlagen. Nur Abbuchungen (negative Beträge) zählen —
//! Gutschriften sind hier keine Abo-Kandidaten. Preisänderungen über die Zeit
//! werden bewusst nicht erkannt (andere Betrag-Gruppe); der User kann den
//! vorgeschlagenen Betrag vor dem Anlegen manuell korrigieren.

use std::collections::HashMap;

use chrono::NaiveDate;
use serde::Serialize;
use tauri::State;

use crate::db::AppState;

#[derive(Debug, Clone, PartialEq)]
pub struct BankTransaction {
    pub date: NaiveDate,
    pub description: String,
    /// Vorzeichenbehaftet wie im Kontoauszug: negativ = Abbuchung, positiv = Gutschrift.
    pub amount_cents: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringCandidate {
    pub name: String,
    pub amount_cents: i64,
    pub interval: String,
    /// Jüngstes erkanntes Vorkommen — taugt direkt als `anchor_date` fürs Anlegen.
    pub anchor_date: String,
    pub first_date: String,
    pub occurrence_count: usize,
    /// Name eines bestehenden Abos, das vermutlich derselbe Posten ist
    /// (identischer Betrag + Namens-Ähnlichkeit). None = kein Verdacht.
    /// Das Frontend wählt solche Kandidaten default ab (Duplikat-Schutz).
    pub matched_subscription: Option<String>,
}

/// Bekannte Spaltennamen deutscher/englischer Bank-CSV-Exports. Exakter Treffer
/// hat Vorrang vor Teilstring-Treffer (vermeidet Fehlzuordnung durch zu grobe
/// `contains`-Heuristik).
const DATE_COLUMNS: &[&str] = &[
    "buchungstag",
    "valutadatum",
    "buchungsdatum",
    "datum",
    "date",
];
const DESC_COLUMNS: &[&str] = &[
    "verwendungszweck",
    "buchungstext",
    "beguenstigter/zahlungspflichtiger",
    "empfaenger",
    "umsatztext",
    "description",
    "text",
];
const AMOUNT_COLUMNS: &[&str] = &["betrag", "amount", "umsatz", "betrag (eur)"];

pub fn parse_bank_csv(content: &str) -> Result<Vec<BankTransaction>, String> {
    let content = content.trim_start_matches('\u{feff}');
    let mut lines = content.lines().filter(|l| !l.trim().is_empty());

    let header_line = lines
        .next()
        .ok_or_else(|| "Die CSV-Datei ist leer.".to_string())?;
    let delimiter = detect_delimiter(header_line);
    let headers: Vec<String> = split_csv_line(header_line, delimiter)
        .into_iter()
        .map(|h| h.trim().to_lowercase())
        .collect();

    let date_idx = find_column(&headers, DATE_COLUMNS).ok_or_else(|| {
        "Keine Datums-Spalte gefunden (erwartet z.B. \"Buchungstag\" oder \"Datum\").".to_string()
    })?;
    let desc_idx = find_column(&headers, DESC_COLUMNS)
        .ok_or_else(|| "Keine Verwendungszweck-/Text-Spalte gefunden.".to_string())?;
    let amount_idx = find_column(&headers, AMOUNT_COLUMNS)
        .ok_or_else(|| "Keine Betrags-Spalte gefunden.".to_string())?;

    let mut transactions = Vec::new();
    for (offset, line) in lines.enumerate() {
        let line_no = offset + 2; // +1 fuer 1-basiert, +1 weil die Kopfzeile schon konsumiert ist
        let fields = split_csv_line(line, delimiter);
        let get = |idx: usize| {
            fields
                .get(idx)
                .map(|s| s.trim().to_string())
                .unwrap_or_default()
        };
        let raw_date = get(date_idx);
        let raw_desc = get(desc_idx);
        let raw_amount = get(amount_idx);
        if raw_date.is_empty() && raw_amount.is_empty() {
            continue;
        }
        let date = parse_flexible_date(&raw_date)
            .ok_or_else(|| format!("Zeile {line_no}: ungültiges Datum \"{raw_date}\"."))?;
        let amount_cents = parse_localized_amount(&raw_amount)
            .ok_or_else(|| format!("Zeile {line_no}: ungültiger Betrag \"{raw_amount}\"."))?;
        transactions.push(BankTransaction {
            date,
            description: raw_desc,
            amount_cents,
        });
    }

    if transactions.is_empty() {
        return Err("Keine gültigen Buchungszeilen gefunden.".to_string());
    }
    Ok(transactions)
}

fn detect_delimiter(header_line: &str) -> char {
    let semi = header_line.matches(';').count();
    let comma = header_line.matches(',').count();
    let tab = header_line.matches('\t').count();
    if tab > semi && tab > comma {
        '\t'
    } else if semi >= comma {
        ';'
    } else {
        ','
    }
}

/// Minimaler RFC4180-artiger Feld-Split: unterstützt in `"…"` gequotete Felder
/// (inkl. `""`-escapte Anführungszeichen), damit Verwendungszwecke mit Kommas
/// innerhalb von Quotes nicht fälschlich aufgesplittet werden.
fn split_csv_line(line: &str, delimiter: char) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                current.push(c);
            }
        } else if c == '"' {
            in_quotes = true;
        } else if c == delimiter {
            fields.push(std::mem::take(&mut current));
        } else {
            current.push(c);
        }
    }
    fields.push(current);
    fields
}

fn find_column(headers: &[String], candidates: &[&str]) -> Option<usize> {
    for cand in candidates {
        if let Some(pos) = headers.iter().position(|h| h == cand) {
            return Some(pos);
        }
    }
    for cand in candidates {
        if let Some(pos) = headers.iter().position(|h| h.contains(cand)) {
            return Some(pos);
        }
    }
    None
}

fn parse_flexible_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .or_else(|_| NaiveDate::parse_from_str(s, "%d.%m.%Y"))
        .ok()
}

/// Portiert dieselbe Trennzeichen-Heuristik wie `src/lib/format.ts::parseLocalizedAmountInput`
/// (bei beiden Trennzeichen zaehlt das spaetere als Dezimaltrenner; bei genau
/// einem mit 3 Nachkommastellen wird er als Tausender gedeutet), damit Frontend
/// und Bank-CSV-Import dieselben Eingaben gleich interpretieren. Ignoriert
/// Waehrungssymbole/-codes und Leerzeichen; nimmt immer 2 Nachkommastellen an
/// (Bank-Exports sind praktisch nie Zero-Decimal-Waehrungen wie KRW).
fn parse_localized_amount(input: &str) -> Option<i64> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut chars = trimmed.chars().peekable();
    let mut negative = false;
    if let Some(&c) = chars.peek() {
        if c == '-' {
            negative = true;
            chars.next();
        } else if c == '+' {
            chars.next();
        }
    }
    let cleaned: String = chars
        .filter(|c| c.is_ascii_digit() || *c == ',' || *c == '.')
        .collect();
    if cleaned.is_empty() {
        return None;
    }

    let last_comma = cleaned.rfind(',');
    let last_dot = cleaned.rfind('.');
    let normalized = match (last_comma, last_dot) {
        (Some(c), Some(d)) if c > d => cleaned.replace('.', "").replace(',', "."),
        (Some(_), Some(_)) => cleaned.replace(',', ""),
        (Some(idx), None) | (None, Some(idx)) => {
            let sep = if last_comma.is_some() { ',' } else { '.' };
            let count = cleaned.matches(sep).count();
            let tail_len = cleaned.chars().count() - 1 - cleaned[..idx].chars().count();
            let is_thousands = count >= 2 || (count == 1 && tail_len == 3);
            if is_thousands {
                cleaned.replace(sep, "")
            } else if sep == ',' {
                cleaned.replace(',', ".")
            } else {
                cleaned.clone()
            }
        }
        (None, None) => cleaned.clone(),
    };

    let value: f64 = normalized.parse().ok()?;
    if !value.is_finite() {
        return None;
    }
    let cents = (value * 100.0).round() as i64;
    Some(if negative { -cents } else { cents })
}

fn normalize_description(desc: &str) -> String {
    desc.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// (Name, Erwarteter Tage-Abstand, Toleranz) — aufsteigend sortiert, damit die
/// engste passende Intervall-Klasse zuerst gewinnt. Namen decken sich mit
/// `recurrence::ALLOWED_INTERVALS`, damit erkannte Kandidaten direkt als
/// `interval`-Wert fürs Anlegen taugen.
const INTERVAL_DAY_TOLERANCE: &[(&str, i64, i64)] = &[
    ("weekly", 7, 2),
    ("biweekly", 14, 3),
    ("monthly", 30, 4),
    ("bimonthly", 61, 6),
    ("quarterly", 91, 7),
    ("semiannual", 182, 10),
    ("yearly", 365, 12),
];

fn detect_interval(dates: &[NaiveDate]) -> Option<&'static str> {
    let gaps: Vec<i64> = dates.windows(2).map(|w| (w[1] - w[0]).num_days()).collect();
    if gaps.is_empty() {
        return None;
    }
    for (name, expected, tolerance) in INTERVAL_DAY_TOLERANCE {
        if gaps.iter().all(|gap| (gap - expected).abs() <= *tolerance) {
            return Some(name);
        }
    }
    None
}

/// Gruppiert Abbuchungen nach (normalisierter Beschreibung, Betrag) und schlägt
/// pro Gruppe mit erkennbarem Intervall einen Kandidaten vor. Pure Funktion,
/// unabhängig von Datei-I/O und DB — direkt mit synthetischen Vektoren testbar.
pub fn detect_recurring_candidates(transactions: &[BankTransaction]) -> Vec<RecurringCandidate> {
    let mut groups: HashMap<(String, i64), (String, Vec<NaiveDate>)> = HashMap::new();
    for tx in transactions {
        if tx.amount_cents >= 0 {
            continue; // nur Abbuchungen sind Abo-Kandidaten
        }
        let key = (
            normalize_description(&tx.description),
            tx.amount_cents.abs(),
        );
        let entry = groups
            .entry(key)
            .or_insert_with(|| (tx.description.trim().to_string(), Vec::new()));
        entry.1.push(tx.date);
    }

    let mut candidates: Vec<RecurringCandidate> = groups
        .into_iter()
        .filter_map(|((_, amount_cents), (display_name, mut dates))| {
            dates.sort();
            dates.dedup();
            if dates.len() < 2 {
                return None;
            }
            let interval = detect_interval(&dates)?;
            let first = *dates.first()?;
            let last = *dates.last()?;
            Some(RecurringCandidate {
                name: display_name,
                amount_cents,
                interval: interval.to_string(),
                anchor_date: last.format("%Y-%m-%d").to_string(),
                first_date: first.format("%Y-%m-%d").to_string(),
                occurrence_count: dates.len(),
                matched_subscription: None,
            })
        })
        .collect();

    candidates.sort_by(|a, b| {
        b.occurrence_count
            .cmp(&a.occurrence_count)
            .then_with(|| a.name.cmp(&b.name))
    });
    candidates
}

/// Namens-Ähnlichkeit für Duplikat-/Abgleich-Matching: normalisierter Teilstring
/// in eine der beiden Richtungen. Sehr kurze Namen (< 3 Zeichen) matchen nie —
/// sonst träfe „TV" jeden Verwendungszweck mit diesen Buchstaben.
fn names_similar(a: &str, b: &str) -> bool {
    let a = normalize_description(a);
    let b = normalize_description(b);
    if a.chars().count() < 3 || b.chars().count() < 3 {
        return false;
    }
    a.contains(&b) || b.contains(&a)
}

/// Markiert Kandidaten, die vermutlich ein bereits gepflegtes Abo sind:
/// identischer Betrag + Namens-Ähnlichkeit. Pure Funktion, `existing` sind
/// (Name, amount_cents)-Paare aller Abos — bewusst inkl. archivierter, denn
/// ein Re-Import eines archivierten Abos wäre genauso Datenmüll.
pub fn mark_probable_duplicates(candidates: &mut [RecurringCandidate], existing: &[(String, i64)]) {
    for c in candidates.iter_mut() {
        c.matched_subscription = existing
            .iter()
            .find(|(name, amount)| *amount == c.amount_cents && names_similar(name, &c.name))
            .map(|(name, _)| name.clone());
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn preview_csv_import(
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<RecurringCandidate>, String> {
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Konnte CSV nicht lesen: {e}"))?;
    let transactions = parse_bank_csv(&content)?;
    let mut candidates = detect_recurring_candidates(&transactions);
    let existing: Vec<(String, i64)> =
        sqlx::query_as("SELECT name, amount_cents FROM subscriptions")
            .fetch_all(&state.db)
            .await
            .map_err(|e| e.to_string())?;
    mark_probable_duplicates(&mut candidates, &existing);
    Ok(candidates)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn parses_semicolon_german_bank_csv() {
        let csv = "Buchungstag;Verwendungszweck;Betrag\n\
                   15.01.2026;Netflix.com;-17,99\n\
                   15.02.2026;Netflix.com;-17,99\n";
        let txs = parse_bank_csv(csv).unwrap();
        assert_eq!(txs.len(), 2);
        assert_eq!(txs[0].date, date("2026-01-15"));
        assert_eq!(txs[0].description, "Netflix.com");
        assert_eq!(txs[0].amount_cents, -1799);
    }

    #[test]
    fn parses_comma_english_bank_csv_with_quoted_description() {
        let csv = "Date,Description,Amount\n\
                   2026-01-15,\"Spotify, Premium\",-9.99\n\
                   2026-02-15,\"Spotify, Premium\",-9.99\n";
        let txs = parse_bank_csv(csv).unwrap();
        assert_eq!(txs[0].description, "Spotify, Premium");
        assert_eq!(txs[0].amount_cents, -999);
    }

    #[test]
    fn rejects_csv_without_recognizable_columns() {
        let csv = "Foo;Bar;Baz\n1;2;3\n";
        let err = parse_bank_csv(csv).unwrap_err();
        assert!(err.contains("Datums-Spalte"));
    }

    #[test]
    fn rejects_invalid_amount() {
        let csv = "Datum;Verwendungszweck;Betrag\n15.01.2026;Test;abc\n";
        let err = parse_bank_csv(csv).unwrap_err();
        assert!(err.contains("ungültiger Betrag"));
    }

    #[test]
    fn skips_bom_and_blank_lines() {
        let csv = "\u{feff}Datum;Verwendungszweck;Betrag\n\n15.01.2026;Test;-5,00\n\n";
        let txs = parse_bank_csv(csv).unwrap();
        assert_eq!(txs.len(), 1);
    }

    fn tx(date_str: &str, desc: &str, amount_cents: i64) -> BankTransaction {
        BankTransaction {
            date: date(date_str),
            description: desc.to_string(),
            amount_cents,
        }
    }

    #[test]
    fn detects_monthly_subscription() {
        let txs = vec![
            tx("2026-01-15", "Netflix.com", -1799),
            tx("2026-02-15", "Netflix.com", -1799),
            tx("2026-03-15", "Netflix.com", -1799),
        ];
        let candidates = detect_recurring_candidates(&txs);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].name, "Netflix.com");
        assert_eq!(candidates[0].amount_cents, 1799);
        assert_eq!(candidates[0].interval, "monthly");
        assert_eq!(candidates[0].anchor_date, "2026-03-15");
        assert_eq!(candidates[0].first_date, "2026-01-15");
        assert_eq!(candidates[0].occurrence_count, 3);
    }

    #[test]
    fn detects_weekly_and_yearly_side_by_side() {
        let txs = vec![
            tx("2026-01-05", "Fitness Weekly", -500),
            tx("2026-01-12", "Fitness Weekly", -500),
            tx("2026-01-19", "Fitness Weekly", -500),
            tx("2025-06-01", "Domain Hosting", -12000),
            tx("2026-06-01", "Domain Hosting", -12000),
        ];
        let candidates = detect_recurring_candidates(&txs);
        assert_eq!(candidates.len(), 2);
        let weekly = candidates
            .iter()
            .find(|c| c.name == "Fitness Weekly")
            .unwrap();
        assert_eq!(weekly.interval, "weekly");
        let yearly = candidates
            .iter()
            .find(|c| c.name == "Domain Hosting")
            .unwrap();
        assert_eq!(yearly.interval, "yearly");
    }

    #[test]
    fn ignores_single_occurrence() {
        let txs = vec![tx("2026-01-15", "Einmalkauf", -4999)];
        assert!(detect_recurring_candidates(&txs).is_empty());
    }

    #[test]
    fn ignores_credits() {
        let txs = vec![
            tx("2026-01-01", "Gehalt", 300000),
            tx("2026-02-01", "Gehalt", 300000),
            tx("2026-03-01", "Gehalt", 300000),
        ];
        assert!(detect_recurring_candidates(&txs).is_empty());
    }

    #[test]
    fn ignores_irregular_gaps() {
        let txs = vec![
            tx("2026-01-01", "Sporadisch", -1000),
            tx("2026-01-10", "Sporadisch", -1000),
            tx("2026-03-20", "Sporadisch", -1000),
        ];
        assert!(detect_recurring_candidates(&txs).is_empty());
    }

    fn candidate(name: &str, amount_cents: i64) -> RecurringCandidate {
        RecurringCandidate {
            name: name.to_string(),
            amount_cents,
            interval: "monthly".to_string(),
            anchor_date: "2026-03-15".to_string(),
            first_date: "2026-01-15".to_string(),
            occurrence_count: 3,
            matched_subscription: None,
        }
    }

    #[test]
    fn marks_duplicate_on_amount_and_name_similarity() {
        // Bank-Verwendungszweck enthält den Abo-Namen (Teilstring, case-insensitiv).
        let mut candidates = vec![candidate("PayPal Europe NETFLIX.com", 1799)];
        mark_probable_duplicates(&mut candidates, &[("Netflix".to_string(), 1799)]);
        assert_eq!(
            candidates[0].matched_subscription.as_deref(),
            Some("Netflix")
        );
    }

    #[test]
    fn no_duplicate_when_amount_differs() {
        let mut candidates = vec![candidate("PayPal Europe Netflix.com", 1999)];
        mark_probable_duplicates(&mut candidates, &[("Netflix".to_string(), 1799)]);
        assert_eq!(candidates[0].matched_subscription, None);
    }

    #[test]
    fn no_duplicate_when_names_unrelated() {
        let mut candidates = vec![candidate("Netflix.com", 1799)];
        mark_probable_duplicates(&mut candidates, &[("Spotify".to_string(), 1799)]);
        assert_eq!(candidates[0].matched_subscription, None);
    }

    #[test]
    fn very_short_names_never_match() {
        // „TV" wäre in fast jedem Verwendungszweck enthalten — Guard gegen Zufallstreffer.
        let mut candidates = vec![candidate("Waipu TV Monatsabo", 1799)];
        mark_probable_duplicates(&mut candidates, &[("TV".to_string(), 1799)]);
        assert_eq!(candidates[0].matched_subscription, None);
    }

    #[test]
    fn amount_change_only_groups_the_matching_occurrences() {
        // Ein Preiswechsel wird bewusst NICHT als eine Serie erkannt (siehe Modul-Doku):
        // die beiden 999er-Buchungen bilden eine Gruppe, die einzelne 1299er-Buchung
        // bleibt unter der Mindest-Vorkommen-Schwelle und wird ignoriert.
        let txs = vec![
            tx("2026-01-15", "Streaming", -999),
            tx("2026-02-15", "Streaming", -999),
            tx("2026-03-15", "Streaming", -1299),
        ];
        let candidates = detect_recurring_candidates(&txs);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].amount_cents, 999);
        assert_eq!(candidates[0].occurrence_count, 2);
    }

    #[test]
    fn parses_amount_with_dot_decimal() {
        assert_eq!(parse_localized_amount("-17.99").unwrap(), -1799);
    }

    #[test]
    fn parses_amount_with_comma_decimal() {
        assert_eq!(parse_localized_amount("-17,99").unwrap(), -1799);
    }

    #[test]
    fn parses_amount_with_german_thousands_separator() {
        assert_eq!(parse_localized_amount("-1.234,56").unwrap(), -123456);
    }

    #[test]
    fn parses_amount_with_english_thousands_separator() {
        assert_eq!(parse_localized_amount("-1,234.56").unwrap(), -123456);
    }

    #[test]
    fn parses_amount_with_currency_suffix() {
        assert_eq!(parse_localized_amount("-17,99 EUR").unwrap(), -1799);
    }

    #[test]
    fn rejects_empty_amount() {
        assert_eq!(parse_localized_amount(""), None);
        assert_eq!(parse_localized_amount("EUR"), None);
    }
}
