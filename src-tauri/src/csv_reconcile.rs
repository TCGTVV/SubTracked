//! Ist-Soll-Abgleich über Bank-CSV: matcht Buchungen eines Kontoauszugs gegen
//! *bestehende* Abos und meldet Abweichungen — Preisänderung („X hat 19,99 €
//! statt 17,99 € abgebucht") oder ausbleibende Abbuchung („Y wurde seit 2 Zyklen
//! nicht mehr abgebucht — gekündigt?"). Reine Analyse: `reconcile_csv` schreibt
//! nichts; Preis-Übernahme und Archivierung laufen über die bestehenden
//! Commands `update_subscription` / `set_subscription_active` aus dem Frontend.
//!
//! Matching per Namens-Ähnlichkeit (`csv_import::names_similar`) — bewusst ohne
//! Betrag, denn genau Betrags-Abweichungen sollen ja gefunden werden. Abos ohne
//! einzige passende Buchung werden übersprungen (der Auszug kann von einem
//! anderen Konto stammen und beweist nichts).

use serde::Serialize;
use tauri::State;

use crate::csv_import::{names_similar, parse_bank_csv, BankTransaction};
use crate::db::AppState;
use crate::recurrence::{interval_step, IntervalStep};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileFinding {
    pub subscription_id: i64,
    pub subscription_name: String,
    /// "price_changed" oder "possibly_cancelled".
    pub kind: String,
    pub expected_amount_cents: i64,
    /// Zuletzt abgebuchter Betrag — nur bei "price_changed" gesetzt.
    pub actual_amount_cents: Option<i64>,
    /// Datum der jüngsten passenden Abbuchung im Auszug (ISO).
    pub last_charge_date: String,
    /// Wie viele Abbuchungen im Auszug zum Abo gepasst haben.
    pub matched_count: usize,
}

/// Minimaler Abo-Ausschnitt für den Abgleich — direkt aus der DB ladbar und in
/// Tests ohne die vielen übrigen `Subscription`-Felder konstruierbar.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ReconcileSubInfo {
    pub id: i64,
    pub name: String,
    pub amount_cents: i64,
    pub pending_amount_cents: Option<i64>,
    pub interval: String,
}

/// Grobe Zykluslänge in Tagen für das „2 Zyklen still"-Fenster. Monate zählen
/// pauschal 30 Tage — für einen Schwellwert reicht das (yearly: 720 statt 730).
fn interval_days(interval: &str) -> Option<i64> {
    match interval_step(interval).ok()? {
        IntervalStep::Days(d) => Some(d),
        IntervalStep::Months(m) => Some(i64::from(m) * 30),
    }
}

/// Pure Abgleich-Logik, unabhängig von Datei-I/O und DB. Pro Abo höchstens ein
/// Befund; „still seit 2 Zyklen" gewinnt vor „Preis weicht ab", weil der letzte
/// bekannte Preis bei einer vermuteten Kündigung keine Aussage mehr hat.
pub fn reconcile_transactions(
    transactions: &[BankTransaction],
    subs: &[ReconcileSubInfo],
) -> Vec<ReconcileFinding> {
    let Some(csv_end) = transactions.iter().map(|t| t.date).max() else {
        return Vec::new();
    };
    let mut findings = Vec::new();
    for sub in subs {
        let Some(cycle_days) = interval_days(&sub.interval) else {
            continue;
        };
        let mut matches: Vec<&BankTransaction> = transactions
            .iter()
            .filter(|t| t.amount_cents < 0 && names_similar(&t.description, &sub.name))
            .collect();
        if matches.is_empty() {
            continue;
        }
        matches.sort_by_key(|t| t.date);
        let last = matches.last().expect("matches ist nicht leer");
        let last_charge_date = last.date.format("%Y-%m-%d").to_string();
        let silent_days = (csv_end - last.date).num_days();
        if silent_days >= 2 * cycle_days {
            findings.push(ReconcileFinding {
                subscription_id: sub.id,
                subscription_name: sub.name.clone(),
                kind: "possibly_cancelled".to_string(),
                expected_amount_cents: sub.amount_cents,
                actual_amount_cents: None,
                last_charge_date,
                matched_count: matches.len(),
            });
            continue;
        }
        let actual = last.amount_cents.abs();
        // Deckt sich der Ist-Betrag mit dem geplanten Preis (pending), ist das
        // keine Abweichung — der Rollover zieht den Soll-Preis ohnehin nach.
        if actual != sub.amount_cents && Some(actual) != sub.pending_amount_cents {
            findings.push(ReconcileFinding {
                subscription_id: sub.id,
                subscription_name: sub.name.clone(),
                kind: "price_changed".to_string(),
                expected_amount_cents: sub.amount_cents,
                actual_amount_cents: Some(actual),
                last_charge_date,
                matched_count: matches.len(),
            });
        }
    }
    findings.sort_by(|a, b| a.subscription_name.cmp(&b.subscription_name));
    findings
}

#[tauri::command(rename_all = "camelCase")]
pub async fn reconcile_csv(
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<ReconcileFinding>, String> {
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Konnte CSV nicht lesen: {e}"))?;
    let transactions = parse_bank_csv(&content)?;
    // Nur aktive, wiederkehrende Abos mit echtem Preis: Einmalausgaben haben
    // keinen Zyklus, 0-€-Trials keine Abbuchung, Archivierte keinen Soll-Wert.
    let subs: Vec<ReconcileSubInfo> = sqlx::query_as(
        "SELECT id, name, amount_cents, pending_amount_cents, interval \
         FROM subscriptions WHERE active = 1 AND one_time = 0 AND amount_cents > 0",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(reconcile_transactions(&transactions, &subs))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn date(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn tx(date_str: &str, desc: &str, amount_cents: i64) -> BankTransaction {
        BankTransaction {
            date: date(date_str),
            description: desc.to_string(),
            amount_cents,
        }
    }

    fn sub(id: i64, name: &str, amount_cents: i64, interval: &str) -> ReconcileSubInfo {
        ReconcileSubInfo {
            id,
            name: name.to_string(),
            amount_cents,
            pending_amount_cents: None,
            interval: interval.to_string(),
        }
    }

    #[test]
    fn reports_price_change_from_latest_charge() {
        let txs = vec![
            tx("2026-04-15", "PayPal Netflix.com", -1799),
            tx("2026-05-15", "PayPal Netflix.com", -1999),
            tx("2026-06-15", "PayPal Netflix.com", -1999),
            tx("2026-06-20", "REWE Markt", -5423),
        ];
        let findings = reconcile_transactions(&txs, &[sub(1, "Netflix", 1799, "monthly")]);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].kind, "price_changed");
        assert_eq!(findings[0].expected_amount_cents, 1799);
        assert_eq!(findings[0].actual_amount_cents, Some(1999));
        assert_eq!(findings[0].last_charge_date, "2026-06-15");
        assert_eq!(findings[0].matched_count, 3);
    }

    #[test]
    fn matching_price_produces_no_finding() {
        let txs = vec![
            tx("2026-05-15", "Netflix.com", -1799),
            tx("2026-06-15", "Netflix.com", -1799),
        ];
        assert!(reconcile_transactions(&txs, &[sub(1, "Netflix", 1799, "monthly")]).is_empty());
    }

    #[test]
    fn pending_price_is_not_a_deviation() {
        let txs = vec![
            tx("2026-06-15", "Netflix.com", -1999),
            tx("2026-06-20", "REWE Markt", -5423),
        ];
        let mut s = sub(1, "Netflix", 1799, "monthly");
        s.pending_amount_cents = Some(1999);
        assert!(reconcile_transactions(&txs, &[s]).is_empty());
    }

    #[test]
    fn reports_possibly_cancelled_after_two_silent_cycles() {
        // Letzte Netflix-Abbuchung im März, der Auszug reicht bis Ende Juni:
        // > 60 Tage still bei monthly → Kündigungs-Verdacht.
        let txs = vec![
            tx("2026-02-15", "Netflix.com", -1799),
            tx("2026-03-15", "Netflix.com", -1799),
            tx("2026-06-28", "REWE Markt", -5423),
        ];
        let findings = reconcile_transactions(&txs, &[sub(1, "Netflix", 1799, "monthly")]);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].kind, "possibly_cancelled");
        assert_eq!(findings[0].actual_amount_cents, None);
        assert_eq!(findings[0].last_charge_date, "2026-03-15");
    }

    #[test]
    fn cancelled_wins_over_stale_price_deviation() {
        // Alte Abbuchungen mit abweichendem Betrag, dann Stille: Der Preis-Befund
        // wäre irreführend, gemeldet wird nur der Kündigungs-Verdacht.
        let txs = vec![
            tx("2026-03-15", "Netflix.com", -1999),
            tx("2026-06-28", "REWE Markt", -5423),
        ];
        let findings = reconcile_transactions(&txs, &[sub(1, "Netflix", 1799, "monthly")]);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].kind, "possibly_cancelled");
    }

    #[test]
    fn unmatched_subscription_is_skipped() {
        // Kein einziger Treffer im Auszug → keine Aussage (fremdes Konto möglich).
        let txs = vec![tx("2026-06-20", "REWE Markt", -5423)];
        assert!(reconcile_transactions(&txs, &[sub(1, "Netflix", 1799, "monthly")]).is_empty());
    }

    #[test]
    fn credits_never_match() {
        // Eine Gutschrift mit passendem Namen ist keine Abbuchung.
        let txs = vec![
            tx("2026-06-15", "Netflix Erstattung", 1799),
            tx("2026-06-28", "REWE Markt", -5423),
        ];
        assert!(reconcile_transactions(&txs, &[sub(1, "Netflix", 1799, "monthly")]).is_empty());
    }

    #[test]
    fn yearly_interval_needs_a_long_silence() {
        // 5 Monate still ist bei yearly kein Kündigungs-Verdacht.
        let txs = vec![
            tx("2026-01-10", "Domain Hosting", -12000),
            tx("2026-06-28", "REWE Markt", -5423),
        ];
        assert!(
            reconcile_transactions(&txs, &[sub(1, "Domain Hosting", 12000, "yearly")]).is_empty()
        );
    }

    #[test]
    fn unknown_interval_is_skipped() {
        let txs = vec![tx("2026-06-15", "Netflix.com", -1999)];
        assert!(reconcile_transactions(&txs, &[sub(1, "Netflix", 1799, "daily")]).is_empty());
    }
}
