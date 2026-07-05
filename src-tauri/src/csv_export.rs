//! CSV-Export der Abo-Liste. Reiner Lesezugriff auf bestehende Tabellen; kein
//! neues Datenmodell. Die Datei-Auswahl passiert im Frontend (`tauri-plugin-dialog`),
//! hier wird nur gegen einen bereits gewaehlten Pfad geschrieben — analog zu
//! `backup::export_backup`.

use std::collections::HashMap;

use tauri::State;

use crate::currencies;
use crate::db::{Account, AppState, Subscription};

const CSV_HEADER: &str =
    "name,amount,currency,interval,anchor_date,account,category,active,notify,one_time";

fn escape_csv_field(field: &str) -> String {
    if field.contains(',') || field.contains('"') || field.contains('\n') || field.contains('\r') {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

/// Formatiert `amount_cents` als lesbaren Dezimalbetrag passend zur Waehrungs-
/// Subdivision (EUR/USD/... 2 Nachkommastellen, KRW ganzzahlig ohne Punkt).
fn format_amount_decimal(amount_cents: i64, currency: &str) -> String {
    let sub = currencies::subdivisor(currency);
    if sub <= 1 {
        return amount_cents.to_string();
    }
    let digits = (sub - 1).to_string().len();
    let whole = amount_cents / sub;
    let frac = (amount_cents % sub).abs();
    format!("{whole}.{frac:0digits$}")
}

/// Baut den CSV-Inhalt aus Subscriptions + Konten-Namen. Pure Funktion, damit sie
/// ohne DB/Tauri-State getestet werden kann.
pub fn build_subscriptions_csv(subs: &[Subscription], accounts: &[Account]) -> String {
    let account_names: HashMap<i64, &str> =
        accounts.iter().map(|a| (a.id, a.name.as_str())).collect();

    let mut out = String::from(CSV_HEADER);
    out.push('\n');
    for s in subs {
        let account_name = s
            .account_id
            .and_then(|id| account_names.get(&id))
            .copied()
            .unwrap_or("");
        let row = [
            escape_csv_field(&s.name),
            format_amount_decimal(s.amount_cents, &s.currency),
            s.currency.clone(),
            s.interval.clone(),
            s.anchor_date.clone(),
            escape_csv_field(account_name),
            escape_csv_field(s.category.as_deref().unwrap_or("")),
            s.active.to_string(),
            s.notify.to_string(),
            s.one_time.to_string(),
        ];
        out.push_str(&row.join(","));
        out.push('\n');
    }
    out
}

#[tauri::command(rename_all = "camelCase")]
pub async fn export_subscriptions_csv(
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let subs = sqlx::query_as::<_, Subscription>(
        "SELECT id, name, amount_cents, currency, account_id, interval, anchor_date, \
         lead_days, active, notify, cancel_mode, cancel_period_value, cancel_period_unit, \
         cancel_date, category, one_time FROM subscriptions ORDER BY name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let accounts = sqlx::query_as::<_, Account>(
        "SELECT id, name, note, currency, balance_cents, min_buffer_cents, balance_updated_at \
         FROM accounts ORDER BY name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let csv = build_subscriptions_csv(&subs, &accounts);
    std::fs::write(&path, csv).map_err(|e| format!("Konnte CSV nicht schreiben: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sub(
        id: i64,
        name: &str,
        amount_cents: i64,
        currency: &str,
        account_id: Option<i64>,
    ) -> Subscription {
        Subscription {
            id,
            name: name.to_string(),
            amount_cents,
            currency: currency.to_string(),
            account_id,
            interval: "monthly".to_string(),
            anchor_date: "2026-01-15".to_string(),
            lead_days: 3,
            active: true,
            notify: true,
            cancel_mode: None,
            cancel_period_value: None,
            cancel_period_unit: None,
            cancel_date: None,
            category: None,
            one_time: false,
        }
    }

    fn account(id: i64, name: &str) -> Account {
        Account {
            id,
            name: name.to_string(),
            note: None,
            currency: "EUR".to_string(),
            balance_cents: 0,
            min_buffer_cents: 0,
            balance_updated_at: None,
        }
    }

    #[test]
    fn formats_eur_with_two_decimals() {
        assert_eq!(format_amount_decimal(1799, "EUR"), "17.99");
        assert_eq!(format_amount_decimal(100, "EUR"), "1.00");
    }

    #[test]
    fn formats_krw_without_decimals() {
        assert_eq!(format_amount_decimal(15000, "KRW"), "15000");
    }

    #[test]
    fn header_and_row_roundtrip() {
        let subs = vec![sub(1, "Netflix", 1799, "EUR", Some(1))];
        let accounts = vec![account(1, "Girokonto")];
        let csv = build_subscriptions_csv(&subs, &accounts);
        let mut lines = csv.lines();
        assert_eq!(lines.next().unwrap(), CSV_HEADER);
        assert_eq!(
            lines.next().unwrap(),
            "Netflix,17.99,EUR,monthly,2026-01-15,Girokonto,,true,true,false"
        );
        assert!(lines.next().is_none());
    }

    #[test]
    fn escapes_commas_and_quotes_in_name() {
        let subs = vec![sub(1, "Gym, \"Premium\"", 2500, "EUR", None)];
        let csv = build_subscriptions_csv(&subs, &[]);
        assert!(csv.contains("\"Gym, \"\"Premium\"\"\","));
    }

    #[test]
    fn empty_subscription_list_yields_only_header() {
        let csv = build_subscriptions_csv(&[], &[]);
        assert_eq!(csv, format!("{CSV_HEADER}\n"));
    }
}
