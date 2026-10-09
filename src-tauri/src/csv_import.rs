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
use crate::file_grants::{FileGrants, GrantKind};

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
///
/// Alle Vergleiche laufen gegen `normalize_header` (klein, Umlaute → ae/oe/ue/ss,
/// ohne `*`-Gender-Marker), die Kandidaten hier sind also ASCII.
const DATE_COLUMNS: &[&str] = &[
    "buchungstag",
    "valutadatum",
    "buchungsdatum",
    "buchung", // ING
    "datum",
    "date",
    "wertstellung",
    "valuta",
];
/// Gegenpartei (Empfänger/Auftraggeber). Hat Vorrang vor dem Verwendungszweck, weil sie
/// über die Monate stabil ist, während Zwecke oft wechselnde Rechnungsnummern tragen.
/// Bei Abbuchungen steht der Zahlungsempfänger vor dem (bei DKB: eigenen) Zahlungspflichtigen.
const PAYEE_COLUMNS: &[&str] = &[
    "zahlungsempfaenger",                // DKB: "Zahlungsempfänger*in"
    "beguenstigter/zahlungspflichtiger", // Sparkasse
    "auftraggeber/empfaenger",           // ING
    "name zahlungsbeteiligter",          // Volks-/Raiffeisenbanken
    "empfaenger",                        // N26
    "payee",
    "zahlungspflichtige",
];
const PURPOSE_COLUMNS: &[&str] = &[
    "verwendungszweck",
    "buchungstext",
    "umsatztext",
    "payment reference",
    "description",
    "text",
];
const AMOUNT_COLUMNS: &[&str] = &["betrag", "amount", "umsatz"];
/// Eigene Spalten für Belastung/Gutschrift (statt einer vorzeichenbehafteten Betragsspalte).
const DEBIT_COLUMNS: &[&str] = &["soll", "belastung", "debit"];
const CREDIT_COLUMNS: &[&str] = &["haben", "gutschrift", "credit"];
/// Vorzeichen-Kennung neben einer unsignierten Betragsspalte ("S"/"H").
const SIGN_COLUMNS: &[&str] = &["soll/haben", "s/h"];

pub fn parse_bank_csv(content: &str) -> Result<Vec<BankTransaction>, String> {
    let content = content.trim_start_matches('\u{feff}');
    let records: Vec<String> = split_records(content)
        .into_iter()
        .filter(|r| !r.trim().is_empty())
        .collect();
    if records.is_empty() {
        return Err("Die CSV-Datei ist leer.".to_string());
    }

    // Banken schreiben Kontodaten/Hinweise vor die Kopfzeile (ING, DKB, comdirect).
    // Die Kopfzeile ist die erste Zeile mit Datums-, Text- und Betragsspalte; findet sich
    // keine, gilt die erste Zeile als Kopf, damit die Fehlermeldung konkret bleibt.
    let header_pos = records
        .iter()
        .position(|r| ColumnMap::detect(r).is_complete())
        .unwrap_or(0);
    let header_line = &records[header_pos];
    let columns = ColumnMap::detect(header_line);

    let date_idx = columns.date.ok_or_else(|| {
        "Keine Datums-Spalte gefunden (erwartet z.B. \"Buchungstag\" oder \"Datum\").".to_string()
    })?;
    let desc_idx = columns
        .payee
        .or(columns.purpose)
        .ok_or_else(|| "Keine Verwendungszweck-/Text-Spalte gefunden.".to_string())?;
    if columns.amount.is_none() && columns.debit.is_none() && columns.credit.is_none() {
        return Err("Keine Betrags-Spalte gefunden.".to_string());
    }

    let mut transactions = Vec::new();
    for (offset, record) in records.iter().enumerate().skip(header_pos + 1) {
        let line_no = offset + 1;
        let fields = split_csv_line(record, columns.delimiter);
        let get = |idx: usize| {
            fields
                .get(idx)
                .map(|s| s.trim().to_string())
                .unwrap_or_default()
        };
        let raw_date = get(date_idx);
        let raw_desc = {
            let primary = get(desc_idx);
            match (primary.is_empty(), columns.purpose) {
                (true, Some(p)) => get(p),
                _ => primary,
            }
        };
        let raw_amount = columns.amount.map(get).unwrap_or_default();
        let raw_debit = columns.debit.map(get).unwrap_or_default();
        let raw_credit = columns.credit.map(get).unwrap_or_default();
        if raw_date.is_empty()
            && raw_amount.is_empty()
            && raw_debit.is_empty()
            && raw_credit.is_empty()
        {
            continue;
        }
        let date = parse_flexible_date(&raw_date)
            .ok_or_else(|| format!("Zeile {line_no}: ungültiges Datum \"{raw_date}\"."))?;

        let amount_cents = if !raw_amount.is_empty() || columns.amount.is_some() {
            let mut cents = parse_localized_amount(&raw_amount)
                .ok_or_else(|| format!("Zeile {line_no}: ungültiger Betrag \"{raw_amount}\"."))?;
            // Unsignierter Betrag + "S"/"H"-Kennung (Soll = Abbuchung).
            if let Some(sign_idx) = columns.sign {
                let indicator = get(sign_idx).to_uppercase();
                if matches!(indicator.as_str(), "S" | "D" | "SOLL" | "DEBIT") {
                    cents = -cents.abs();
                } else if matches!(indicator.as_str(), "H" | "C" | "HABEN" | "CREDIT") {
                    cents = cents.abs();
                }
            }
            cents
        } else if !raw_debit.is_empty() {
            -parse_localized_amount(&raw_debit)
                .ok_or_else(|| format!("Zeile {line_no}: ungültiger Betrag \"{raw_debit}\"."))?
                .abs()
        } else {
            parse_localized_amount(&raw_credit)
                .ok_or_else(|| format!("Zeile {line_no}: ungültiger Betrag \"{raw_credit}\"."))?
                .abs()
        };
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

/// Spaltenzuordnung einer Kopfzeile.
struct ColumnMap {
    delimiter: char,
    date: Option<usize>,
    payee: Option<usize>,
    purpose: Option<usize>,
    amount: Option<usize>,
    debit: Option<usize>,
    credit: Option<usize>,
    sign: Option<usize>,
}

impl ColumnMap {
    fn detect(header_line: &str) -> Self {
        let delimiter = detect_delimiter(header_line);
        let headers: Vec<String> = split_csv_line(header_line, delimiter)
            .iter()
            .map(|h| normalize_header(h))
            .collect();
        // "soll/haben" darf nicht als Betrags- oder Soll-Spalte fehlgedeutet werden.
        let sign = headers
            .iter()
            .position(|h| SIGN_COLUMNS.contains(&h.as_str()));
        let masked: Vec<String> = headers
            .iter()
            .enumerate()
            .map(|(i, h)| {
                if Some(i) == sign {
                    String::new()
                } else {
                    h.clone()
                }
            })
            .collect();
        Self {
            delimiter,
            date: find_column(&masked, DATE_COLUMNS),
            payee: find_column(&masked, PAYEE_COLUMNS),
            purpose: find_column(&masked, PURPOSE_COLUMNS),
            amount: find_column(&masked, AMOUNT_COLUMNS),
            debit: find_column(&masked, DEBIT_COLUMNS),
            credit: find_column(&masked, CREDIT_COLUMNS),
            sign,
        }
    }

    /// Kopfzeile gefunden: Datum, ein Text und ein Betrag (oder Soll+Haben).
    fn is_complete(&self) -> bool {
        self.date.is_some()
            && (self.payee.is_some() || self.purpose.is_some())
            && (self.amount.is_some() || (self.debit.is_some() && self.credit.is_some()))
    }
}

/// Vergleichsform eines Spaltennamens: klein, Umlaute ausgeschrieben, ohne `*`
/// (DKB: "Zahlungsempfänger*in"), Whitespace vereinheitlicht.
fn normalize_header(header: &str) -> String {
    let mut out = String::new();
    for c in header.trim().chars().flat_map(char::to_lowercase) {
        match c {
            'ä' => out.push_str("ae"),
            'ö' => out.push_str("oe"),
            'ü' => out.push_str("ue"),
            'ß' => out.push_str("ss"),
            '*' | '\u{feff}' => {}
            c => out.push(c),
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Teilt den Text in logische Datensätze: ein Anführungszeichen-offenes Feld darf über
/// Zeilenumbrüche laufen (Verwendungszwecke mit Zeilenumbruch in Quotes).
fn split_records(content: &str) -> Vec<String> {
    let mut records = Vec::new();
    let mut current = String::new();
    for line in content.lines() {
        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line);
        if current.matches('"').count() % 2 == 0 {
            records.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        records.push(current);
    }
    records
}

/// Dekodiert den Rohinhalt einer Bank-CSV: UTF-8 (mit/ohne BOM), UTF-16 (BOM) oder
/// Windows-1252 als Rückfall (ING, Sparkasse und comdirect exportieren oft so).
pub fn decode_csv_bytes(bytes: &[u8]) -> String {
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return decode_utf16(rest, u16::from_le_bytes);
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return decode_utf16(rest, u16::from_be_bytes);
    }
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => bytes.iter().map(|&b| cp1252_char(b)).collect(),
    }
}

fn decode_utf16(bytes: &[u8], from_bytes: fn([u8; 2]) -> u16) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| from_bytes([pair[0], pair[1]]))
        .collect();
    String::from_utf16_lossy(&units)
}

/// Windows-1252 → Unicode. 0x00–0x7F und 0xA0–0xFF stimmen mit Latin-1 überein; nur der
/// Block 0x80–0x9F weicht ab (€, typografische Anführungszeichen, …).
fn cp1252_char(byte: u8) -> char {
    const HIGH: [char; 32] = [
        '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž',
        '\u{8f}', '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9d}',
        'ž', 'Ÿ',
    ];
    match byte {
        0x80..=0x9F => HIGH[(byte - 0x80) as usize],
        b => b as char,
    }
}

/// Liest eine Bank-CSV-Datei (siehe [`decode_csv_bytes`] für die Kodierungen).
pub fn read_csv_file(path: &std::path::Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Konnte CSV nicht lesen: {e}"))?;
    Ok(decode_csv_bytes(&bytes))
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
    let s = s.trim();
    // Zeitstempel ("2024-01-15 10:22:00", "2024-01-15T10:22:00") → nur der Datumsteil zählt.
    let date_part = s
        .get(..10)
        .filter(|p| p.as_bytes().get(4) == Some(&b'-'))
        .unwrap_or(s);
    NaiveDate::parse_from_str(date_part, "%Y-%m-%d")
        .or_else(|_| NaiveDate::parse_from_str(s, "%d.%m.%Y"))
        .or_else(|_| NaiveDate::parse_from_str(s, "%d.%m.%y")) // DKB/Sparkasse-CAMT: "15.01.24"
        .or_else(|_| NaiveDate::parse_from_str(s, "%d/%m/%Y"))
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
    let first_digit = trimmed.find(|c: char| c.is_ascii_digit())?;
    let last_digit = trimmed.rfind(|c: char| c.is_ascii_digit())?;
    // Vorzeichen steht vor der ersten oder hinter der letzten Ziffer: "-12,34", "−12,34"
    // (Unicode-Minus), "EUR -12,34", "12,34-" (SAP-Stil) oder Klammern "(12,34)".
    // Ein stillschweigend verlorenes Minus würde aus einer Abbuchung eine Gutschrift machen.
    let prefix = &trimmed[..first_digit];
    let suffix = &trimmed[last_digit + 1..];
    let is_minus = |c: char| matches!(c, '-' | '\u{2212}' | '\u{2013}');
    let negative = prefix.chars().any(is_minus)
        || suffix.chars().any(is_minus)
        || (prefix.contains('(') && suffix.contains(')'));
    let cleaned: String = trimmed[first_digit..=last_digit]
        .chars()
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
pub(crate) fn names_similar(a: &str, b: &str) -> bool {
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
    grants: State<'_, FileGrants>,
    token: String,
) -> Result<Vec<RecurringCandidate>, String> {
    let path = grants.take(&token, GrantKind::Read)?;
    let content = read_csv_file(&path)?;
    let transactions = parse_bank_csv(&content)?;
    let mut candidates = detect_recurring_candidates(&transactions);
    let existing: Vec<(String, i64)> = sqlx::query!("SELECT name, amount_cents FROM subscriptions")
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|r| (r.name, r.amount_cents))
        .collect();
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

    // --- Bank-Formate ---------------------------------------------------------------
    // Synthetische Auszüge im Aufbau der gängigen deutschen Exporte (Spaltennamen,
    // Vorspann, Kodierung, Datums-/Betragsformate). Echte Dateien nicht im Repo
    // (Finanzdaten) — Praxistest mit einem echten Auszug steht im BACKLOG.

    /// Drei monatliche Netflix-Abbuchungen plus Gehaltseingang → genau ein Kandidat.
    fn assert_monthly_netflix(txs: &[BankTransaction]) {
        let debits: Vec<_> = txs.iter().filter(|t| t.amount_cents < 0).collect();
        assert_eq!(debits.len(), 3, "drei Abbuchungen: {txs:?}");
        assert!(
            txs.iter().any(|t| t.amount_cents > 0),
            "Gutschrift bleibt positiv"
        );
        let candidates = detect_recurring_candidates(txs);
        assert_eq!(candidates.len(), 1, "{candidates:?}");
        assert_eq!(candidates[0].amount_cents, 1299);
        assert_eq!(candidates[0].interval, "monthly");
        assert!(
            candidates[0].name.to_lowercase().contains("netflix"),
            "Name: {}",
            candidates[0].name
        );
    }

    #[test]
    fn dkb_format_with_preamble_two_digit_year_and_gendered_headers() {
        let csv = "\"Konto\";\"Girokonto DE12 3456\"\n\
                   \"\";\"\"\n\
                   \"Kontostand vom 02.04.2024:\";\"1.234,56 EUR\"\n\
                   \n\
                   \"Buchungsdatum\";\"Wertstellung\";\"Status\";\"Zahlungspflichtige*r\";\"Zahlungsempfänger*in\";\"Verwendungszweck\";\"Umsatztyp\";\"IBAN\";\"Betrag (€)\"\n\
                   \"15.03.24\";\"15.03.24\";\"Gebucht\";\"Max Mustermann\";\"Netflix International B.V.\";\"Rechnung 9918\";\"Ausgang\";\"NL00\";\"-12,99\"\n\
                   \"15.02.24\";\"15.02.24\";\"Gebucht\";\"Max Mustermann\";\"Netflix International B.V.\";\"Rechnung 8812\";\"Ausgang\";\"NL00\";\"-12,99\"\n\
                   \"15.01.24\";\"15.01.24\";\"Gebucht\";\"Max Mustermann\";\"Netflix International B.V.\";\"Rechnung 7701\";\"Ausgang\";\"NL00\";\"-12,99\"\n\
                   \"01.03.24\";\"01.03.24\";\"Gebucht\";\"Firma GmbH\";\"Max Mustermann\";\"Gehalt\";\"Eingang\";\"DE00\";\"2.500,00\"\n";
        let txs = parse_bank_csv(csv).expect("DKB");
        // Der Empfänger (nicht der wechselnde Verwendungszweck) ist der Gruppenschlüssel.
        assert_monthly_netflix(&txs);
    }

    #[test]
    fn ing_format_with_long_preamble_and_buchung_valuta_columns() {
        let csv = "Umsatzanzeige;Datei erstellt am: 02.04.2024 10:00\n\
                   ;Letztes Update: aktuell\n\
                   \n\
                   IBAN;DE12 3456\n\
                   Kontoname;Girokonto\n\
                   Bank;ING\n\
                   Zeitraum;01.01.2024 - 31.03.2024\n\
                   Saldo;1.234,56;EUR\n\
                   \n\
                   Sortierung;Datum absteigend\n\
                   \n\
                   Buchung;Valuta;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung\n\
                   15.03.2024;15.03.2024;Netflix International B.V.;Lastschrift;NETFLIX.COM;1.000,00;EUR;-12,99;EUR\n\
                   15.02.2024;15.02.2024;Netflix International B.V.;Lastschrift;NETFLIX.COM;1.100,00;EUR;-12,99;EUR\n\
                   15.01.2024;15.01.2024;Netflix International B.V.;Lastschrift;NETFLIX.COM;1.200,00;EUR;-12,99;EUR\n\
                   01.03.2024;01.03.2024;Firma GmbH;Gehalt/Rente;Gehalt;3.500,00;EUR;2.500,00;EUR\n";
        assert_monthly_netflix(&parse_bank_csv(csv).expect("ING"));
    }

    #[test]
    fn sparkasse_camt_format_with_two_digit_year() {
        let csv = "\"Auftragskonto\";\"Buchungstag\";\"Valutadatum\";\"Buchungstext\";\"Verwendungszweck\";\"Glaeubiger ID\";\"Mandatsreferenz\";\"Beguenstigter/Zahlungspflichtiger\";\"Kontonummer/IBAN\";\"Betrag\";\"Waehrung\";\"Info\"\n\
                   \"DE00\";\"15.03.24\";\"15.03.24\";\"FOLGELASTSCHRIFT\";\"Rechnung 99 vom 01.03.\";\"NL1\";\"M1\";\"Netflix International B.V.\";\"NL00\";\"-12,99\";\"EUR\";\"Umsatz gebucht\"\n\
                   \"DE00\";\"15.02.24\";\"15.02.24\";\"FOLGELASTSCHRIFT\";\"Rechnung 88 vom 01.02.\";\"NL1\";\"M1\";\"Netflix International B.V.\";\"NL00\";\"-12,99\";\"EUR\";\"Umsatz gebucht\"\n\
                   \"DE00\";\"15.01.24\";\"15.01.24\";\"FOLGELASTSCHRIFT\";\"Rechnung 77 vom 01.01.\";\"NL1\";\"M1\";\"Netflix International B.V.\";\"NL00\";\"-12,99\";\"EUR\";\"Umsatz gebucht\"\n\
                   \"DE00\";\"01.03.24\";\"01.03.24\";\"GEHALT/RENTE\";\"Gehalt\";\"\";\"\";\"Firma GmbH\";\"DE00\";\"2.500,00\";\"EUR\";\"Umsatz gebucht\"\n";
        assert_monthly_netflix(&parse_bank_csv(csv).expect("Sparkasse"));
    }

    #[test]
    fn n26_format_with_payee_and_iso_dates() {
        let csv = "\"Datum\",\"Empfänger\",\"Kontonummer\",\"Transaktionstyp\",\"Verwendungszweck\",\"Betrag (EUR)\"\n\
                   \"2024-03-15\",\"Netflix\",\"NL00\",\"Lastschrift\",\"\",\"-12.99\"\n\
                   \"2024-02-15\",\"Netflix\",\"NL00\",\"Lastschrift\",\"\",\"-12.99\"\n\
                   \"2024-01-15\",\"Netflix\",\"NL00\",\"Lastschrift\",\"\",\"-12.99\"\n\
                   \"2024-03-01\",\"Firma GmbH\",\"DE00\",\"Gutschrift\",\"Gehalt\",\"2500.00\"\n";
        assert_monthly_netflix(&parse_bank_csv(csv).expect("N26"));
    }

    #[test]
    fn comdirect_format_with_umsatz_column() {
        let csv = "\"Umsätze Girokonto\";\"Zeitraum: 01.01.2024 - 31.03.2024\"\n\
                   \"Neuer Kontostand\";\"1.234,56 EUR\"\n\
                   \n\
                   \"Buchungstag\";\"Wertstellung (Valuta)\";\"Vorgang\";\"Buchungstext\";\"Umsatz in EUR\"\n\
                   \"15.03.2024\";\"15.03.2024\";\"Lastschrift / Belastung\";\"Auftraggeber: Netflix International B.V. Buchungstext: NETFLIX.COM\";\"-12,99\"\n\
                   \"15.02.2024\";\"15.02.2024\";\"Lastschrift / Belastung\";\"Auftraggeber: Netflix International B.V. Buchungstext: NETFLIX.COM\";\"-12,99\"\n\
                   \"15.01.2024\";\"15.01.2024\";\"Lastschrift / Belastung\";\"Auftraggeber: Netflix International B.V. Buchungstext: NETFLIX.COM\";\"-12,99\"\n\
                   \"01.03.2024\";\"01.03.2024\";\"Übertrag / Überweisung\";\"Auftraggeber: Firma GmbH Buchungstext: Gehalt\";\"2.500,00\"\n";
        assert_monthly_netflix(&parse_bank_csv(csv).expect("comdirect"));
    }

    #[test]
    fn separate_debit_and_credit_columns() {
        let csv = "Buchungstag;Text;Soll;Haben\n\
                   15.03.2024;Netflix;12,99;\n\
                   15.02.2024;Netflix;12,99;\n\
                   15.01.2024;Netflix;12,99;\n\
                   01.03.2024;Gehalt;;2.500,00\n";
        assert_monthly_netflix(&parse_bank_csv(csv).expect("Soll/Haben"));
    }

    #[test]
    fn unsigned_amount_with_soll_haben_indicator_column() {
        let csv = "Buchungstag;Text;Betrag;Soll/Haben\n\
                   15.03.2024;Netflix;12,99;S\n\
                   15.02.2024;Netflix;12,99;S\n\
                   15.01.2024;Netflix;12,99;S\n\
                   01.03.2024;Gehalt;2.500,00;H\n";
        assert_monthly_netflix(&parse_bank_csv(csv).expect("S/H"));
    }

    #[test]
    fn quoted_field_with_embedded_newline_stays_one_record() {
        let csv = "Buchungstag;Verwendungszweck;Betrag\n\
                   15.03.2024;\"NETFLIX\nRechnung 99\";-12,99\n\
                   15.02.2024;\"NETFLIX\nRechnung 88\";-12,99\n";
        let txs = parse_bank_csv(csv).expect("Mehrzeiler");
        assert_eq!(txs.len(), 2);
        assert!(txs[0].description.contains("NETFLIX"));
    }

    #[test]
    fn amount_sign_variants_never_turn_debits_into_credits() {
        for (input, expected) in [
            ("-12,99", -1299),
            ("\u{2212}12,99", -1299), // Unicode-Minus
            ("\u{2013}12,99", -1299), // Halbgeviertstrich
            ("12,99-", -1299),        // nachgestelltes Minus
            ("EUR -12,99", -1299),
            ("-12,99 €", -1299),
            ("(12,99)", -1299),
            ("-1.234,56", -123456),
            ("+12,99", 1299),
            ("12,99", 1299),
            ("1 234,56", 123456),
        ] {
            assert_eq!(
                parse_localized_amount(input),
                Some(expected),
                "Eingabe: {input:?}"
            );
        }
        assert_eq!(parse_localized_amount("abc"), None);
        assert_eq!(parse_localized_amount("-"), None);
    }

    #[test]
    fn decodes_windows_1252_and_utf16_exports() {
        // "Zahlungsempfänger" + "€" in Windows-1252: ä = 0xE4, € = 0x80
        let cp1252 =
            b"Buchungstag;Zahlungsempf\xE4nger;Betrag\n15.01.2024;M\xFCller K\xE4se;-5,00 \x80\n";
        let text = decode_csv_bytes(cp1252);
        let txs = parse_bank_csv(&text).expect("cp1252");
        assert_eq!(txs[0].description, "Müller Käse");
        assert_eq!(txs[0].amount_cents, -500);

        // UTF-16LE mit BOM (Excel "Unicode-Text")
        let mut utf16 = vec![0xFF, 0xFE];
        for unit in "Buchungstag;Text;Betrag\n15.01.2024;Käse;-5,00\n".encode_utf16() {
            utf16.extend_from_slice(&unit.to_le_bytes());
        }
        let txs = parse_bank_csv(&decode_csv_bytes(&utf16)).expect("utf16");
        assert_eq!(txs[0].description, "Käse");

        // Gültiges UTF-8 (mit BOM) bleibt unverändert.
        let mut utf8 = vec![0xEF, 0xBB, 0xBF];
        utf8.extend_from_slice("Buchungstag;Text;Betrag\n15.01.2024;Käse;-5,00\n".as_bytes());
        assert!(decode_csv_bytes(&utf8).starts_with("Buchungstag"));
    }

    #[test]
    fn timestamps_are_reduced_to_their_date() {
        let csv = "Date,Description,Amount\n2024-01-15 10:22:00,Netflix,-12.99\n";
        let txs = parse_bank_csv(csv).expect("Revolut-artig");
        assert_eq!(txs[0].date, NaiveDate::from_ymd_opt(2024, 1, 15).unwrap());
    }

    #[test]
    fn missing_columns_still_report_a_specific_error() {
        let err = parse_bank_csv("Foo;Bar\n1;2\n").unwrap_err();
        assert!(err.contains("Datums-Spalte"), "{err}");
    }
}
