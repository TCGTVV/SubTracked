use chrono::{Duration, Local, NaiveDate};
use sqlx::SqlitePool;
use tauri::AppHandle;
use tauri_plugin_notification::{NotificationExt, PermissionState};

use crate::db::Subscription;
use crate::recurrence::{next_due_date, parse_iso_date_strict};
use crate::validation::validate_lead_days;

/// Side-Effect-Seam fuer den Dispatcher. Production-Pfad ist
/// [`AppNotifier`] (Tauri-Notification-Plugin); im Test bekommt der Dispatcher
/// eine Stub-Implementierung, deren Success/Failure kontrolliert werden kann.
///
/// `Send + Sync`: der Reminder-Loop laeuft als `tauri::async_runtime::spawn`-
/// Task und braucht deshalb ein Send-Future. `&dyn Notifier` muss daher
/// thread-sicher sein.
trait Notifier: Send + Sync {
    fn show(&self, title: &str, body: &str) -> Result<(), String>;
}

struct AppNotifier<'a>(&'a AppHandle);

impl Notifier for AppNotifier<'_> {
    fn show(&self, title: &str, body: &str) -> Result<(), String> {
        self.0
            .notification()
            .builder()
            .title(title.to_string())
            .body(body.to_string())
            .show()
            .map_err(|e| e.to_string())
    }
}

/// Eine im Vorlauf-Fenster faellige Erinnerung. Pure-Output von
/// [`compute_due_reminders`]; enthaelt nur die Daten, die der Dispatcher zum
/// Senden + Schreiben braucht — kein DB- oder App-Handle-Bezug.
#[derive(Debug, Clone, PartialEq, Eq)]
struct DueReminder {
    subscription_id: i64,
    subscription_name: String,
    amount_cents: i64,
    currency: String,
    due_date: NaiveDate,
}

/// Bestimmt fuer die uebergebenen Abos diejenigen, deren naechste Faelligkeit
/// im konfigurierten Vorlauf-Fenster liegt. Reine Funktion ohne Side-Effects:
/// kein DB-Zugriff, keine Notification, kein Tauri-AppHandle. Stumme Abos
/// (`notify = false`) werden uebersprungen; der Idempotenz-Check (bereits
/// gesendet?) gehoert in den Dispatcher, weil er DB braucht.
fn compute_due_reminders(
    subs: &[Subscription],
    today: NaiveDate,
) -> Result<Vec<DueReminder>, String> {
    let mut out = Vec::new();
    for sub in subs {
        if !sub.notify {
            continue;
        }
        if let Err(e) = validate_lead_days(sub.lead_days) {
            tracing::warn!(
                subscription_id = sub.id,
                lead_days = sub.lead_days,
                error = %e,
                "Abo wegen ungueltigem Reminder-Vorlauf uebersprungen"
            );
            continue;
        }
        let anchor = match parse_iso_date_strict(&sub.anchor_date) {
            Ok(anchor) => anchor,
            Err(e) => {
                tracing::warn!(
                    subscription_id = sub.id,
                    anchor_date = %sub.anchor_date,
                    error = %e,
                    "Abo wegen ungueltigem Ankerdatum beim Reminder-Check uebersprungen"
                );
                continue;
            }
        };
        let due = match next_due_date(anchor, &sub.interval, today) {
            Ok(due) => due,
            Err(e) => {
                tracing::warn!(
                    subscription_id = sub.id,
                    interval = %sub.interval,
                    error = %e,
                    "Abo wegen ungueltiger Wiederholung beim Reminder-Check uebersprungen"
                );
                continue;
            }
        };
        let remind_from = due - Duration::days(sub.lead_days);
        if today < remind_from {
            continue;
        }
        out.push(DueReminder {
            subscription_id: sub.id,
            subscription_name: sub.name.clone(),
            amount_cents: sub.amount_cents,
            currency: sub.currency.clone(),
            due_date: due,
        });
    }
    Ok(out)
}

/// Versendet Notifications und schreibt Reminder-Rows fuer die uebergebenen
/// Faelligkeiten. Side-Effect-Seite zu [`compute_due_reminders`].
///
/// Idempotenz: Bei fehlender Permission wird nichts als gesendet markiert. Bei
/// vorhandener Permission reserviert `INSERT OR IGNORE` die Faelligkeit direkt
/// vor `show()`, damit ein Shutdown zwischen OS-Notification und DB-Write nicht
/// zu Doppelbenachrichtigungen fuehrt. Schlaegt `show()` fehl, wird die
/// Reservierung wieder entfernt, damit der Check spaeter erneut versuchen kann.
async fn dispatch_due_reminders(
    pool: &SqlitePool,
    notifier: &dyn Notifier,
    granted: bool,
    due: &[DueReminder],
) -> Result<u32, String> {
    let mut sent = 0u32;
    // Pro Tick einmal aggregiert loggen, damit dauerhaft abgelehnte Permission
    // bei N faelligen Abos nicht N Info-Zeilen pro Stunde ins 7-Tage-Log
    // schreibt und echte Errors verdraengt.
    let mut skipped_no_permission = 0u32;
    for d in due {
        let due_str = d.due_date.format("%Y-%m-%d").to_string();
        if reminder_already_sent(pool, d.subscription_id, &due_str).await? {
            continue;
        }
        if !granted {
            skipped_no_permission += 1;
            continue;
        }
        if !insert_reminder_if_new(pool, d.subscription_id, &due_str).await? {
            continue;
        }

        let title = format!("{} fällig", d.subscription_name);
        let body = format!(
            "{}: {}. Konto rechtzeitig decken.",
            d.due_date.format("%d.%m.%Y"),
            format_amount_for_notification(d.amount_cents, &d.currency),
        );
        if let Err(e) = notifier.show(&title, &body) {
            if let Err(delete_err) =
                delete_reminder_reservation(pool, d.subscription_id, &due_str).await
            {
                tracing::error!(
                    subscription_id = d.subscription_id,
                    due_date = %due_str,
                    error = %delete_err,
                    "Reminder-Reservierung nach Notification-Fehler konnte nicht entfernt werden"
                );
            }
            return Err(e);
        }
        sent += 1;
    }
    if skipped_no_permission > 0 {
        tracing::info!(
            count = skipped_no_permission,
            "Faellige Erinnerungen uebersprungen, weil Notification-Berechtigung fehlt; spaetere Checks koennen sie nachtragen."
        );
    }
    Ok(sent)
}

/// Orchestriert den Reminder-Check: laedt aktive Abos, berechnet faellige
/// Erinnerungen ([`compute_due_reminders`]) und dispatcht sie
/// ([`dispatch_due_reminders`]).
pub async fn run_reminder_check(pool: &SqlitePool, app: &AppHandle) -> Result<u32, String> {
    let granted = matches!(
        app.notification()
            .permission_state()
            .map_err(|e| e.to_string())?,
        PermissionState::Granted
    );

    let today = Local::now().date_naive();

    let subs = sqlx::query_as::<_, Subscription>(
        "SELECT id, name, amount_cents, currency, account_id, interval, anchor_date, \
         lead_days, active, notify FROM subscriptions WHERE active = 1",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let due = compute_due_reminders(&subs, today)?;
    let notifier = AppNotifier(app);
    dispatch_due_reminders(pool, &notifier, granted, &due).await
}

async fn reminder_already_sent(
    pool: &SqlitePool,
    subscription_id: i64,
    due_date: &str,
) -> Result<bool, String> {
    let found: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM reminders WHERE subscription_id = ? AND due_date = ? LIMIT 1",
    )
    .bind(subscription_id)
    .bind(due_date)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(found.is_some())
}

async fn insert_reminder_if_new(
    pool: &SqlitePool,
    subscription_id: i64,
    due_date: &str,
) -> Result<bool, String> {
    let res =
        sqlx::query("INSERT OR IGNORE INTO reminders (subscription_id, due_date) VALUES (?, ?)")
            .bind(subscription_id)
            .bind(due_date)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    Ok(res.rows_affected() > 0)
}

async fn delete_reminder_reservation(
    pool: &SqlitePool,
    subscription_id: i64,
    due_date: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM reminders WHERE subscription_id = ? AND due_date = ?")
        .bind(subscription_id)
        .bind(due_date)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn format_amount_for_notification(amount_minor: i64, currency: &str) -> String {
    let divisor = crate::currencies::subdivisor(currency);
    if divisor == 1 {
        return format!("{} {}", format_whole_number_de(amount_minor), currency);
    }

    let sign = if amount_minor < 0 { "-" } else { "" };
    let abs = amount_minor.unsigned_abs();
    let divisor = divisor as u64;
    let major = abs / divisor;
    let minor = abs % divisor;
    let major = format_unsigned_whole_number_de(major);
    format!("{sign}{major},{minor:02} {currency}")
}

fn format_whole_number_de(value: i64) -> String {
    let grouped = format_unsigned_whole_number_de(value.unsigned_abs());
    if value < 0 {
        format!("-{grouped}")
    } else {
        grouped
    }
}

fn format_unsigned_whole_number_de(value: u64) -> String {
    let digits = value.to_string();
    let mut reversed = String::with_capacity(digits.len() + digits.len() / 3);

    for (idx, ch) in digits.chars().rev().enumerate() {
        if idx > 0 && idx % 3 == 0 {
            reversed.push('.');
        }
        reversed.push(ch);
    }

    reversed.chars().rev().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sub(id: i64, anchor: &str, lead_days: i64, notify: bool) -> Subscription {
        Subscription {
            id,
            name: format!("Sub{id}"),
            amount_cents: 1_799,
            currency: "EUR".to_string(),
            account_id: None,
            interval: "monthly".to_string(),
            anchor_date: anchor.to_string(),
            lead_days,
            active: true,
            notify,
        }
    }

    fn d(y: i32, m: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, day).unwrap()
    }

    #[test]
    fn compute_skips_muted_subscriptions() {
        let subs = vec![sub(1, "2025-01-15", 7, false)];
        let due = compute_due_reminders(&subs, d(2025, 1, 10)).unwrap();
        assert!(due.is_empty(), "stumme Abos werden ignoriert");
    }

    #[test]
    fn compute_skips_when_today_before_lead_window() {
        // Faellig am 2025-02-15, lead_days = 7 -> Vorlauf startet 2025-02-08.
        // Am 2025-02-07 ist das Fenster noch nicht offen.
        let subs = vec![sub(1, "2025-02-15", 7, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 7)).unwrap();
        assert!(due.is_empty(), "vor dem Vorlauf-Fenster keine Erinnerung");
    }

    #[test]
    fn compute_includes_when_today_inside_lead_window() {
        let subs = vec![sub(1, "2025-02-15", 7, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 8)).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].subscription_id, 1);
        assert_eq!(due[0].due_date, d(2025, 2, 15));
    }

    #[test]
    fn compute_includes_when_today_equals_due_date() {
        // Selbst am Faelligkeitstag soll noch erinnert werden (lead_days = 0).
        let subs = vec![sub(1, "2025-02-15", 0, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 15)).unwrap();
        assert_eq!(due.len(), 1);
    }

    #[test]
    fn compute_uses_anker_additive_next_due_not_anchor() {
        // 31.-Anker im Januar; today = 2025-03-25, lead_days = 14.
        // Naechster Termin nach today ist 2025-03-31 (anker-additiv, kein Drift),
        // Vorlauf startet 2025-03-17 -> 2025-03-25 liegt drin.
        let subs = vec![sub(1, "2025-01-31", 14, true)];
        let due = compute_due_reminders(&subs, d(2025, 3, 25)).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(
            due[0].due_date,
            d(2025, 3, 31),
            "31.-Anker darf nicht auf 28. driften"
        );
    }

    #[test]
    fn compute_skips_bad_anchor_date_and_continues_batch() {
        let subs = vec![sub(1, "31.01.2025", 7, true), sub(2, "2025-02-15", 7, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 10)).unwrap();
        let ids: Vec<i64> = due.iter().map(|d| d.subscription_id).collect();
        assert_eq!(ids, vec![2]);
    }

    #[test]
    fn compute_skips_unpadded_anchor_date_and_continues_batch() {
        let subs = vec![sub(1, "2025-2-15", 7, true), sub(2, "2025-02-15", 7, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 10)).unwrap();
        let ids: Vec<i64> = due.iter().map(|d| d.subscription_id).collect();
        assert_eq!(ids, vec![2]);
    }

    #[test]
    fn compute_skips_bad_interval_and_continues_batch() {
        let mut bad = sub(1, "2025-02-15", 7, true);
        bad.interval = "weekly".to_string();
        let subs = vec![bad, sub(2, "2025-02-15", 7, true)];
        let due = compute_due_reminders(&subs, d(2025, 2, 10)).unwrap();
        let ids: Vec<i64> = due.iter().map(|d| d.subscription_id).collect();
        assert_eq!(ids, vec![2]);
    }

    #[test]
    fn compute_skips_bad_lead_days_and_continues_batch() {
        let subs = vec![
            sub(1, "2025-02-15", -1, true),
            sub(2, "2025-02-15", 366, true),
            sub(3, "2025-02-15", 7, true),
        ];
        let due = compute_due_reminders(&subs, d(2025, 2, 10)).unwrap();
        let ids: Vec<i64> = due.iter().map(|d| d.subscription_id).collect();
        assert_eq!(ids, vec![3]);
    }

    #[test]
    fn compute_handles_mixed_batch() {
        let subs = vec![
            sub(1, "2025-02-15", 7, true),  // inside window
            sub(2, "2025-02-15", 7, false), // muted
            sub(3, "2025-04-01", 7, true),  // outside window
        ];
        let due = compute_due_reminders(&subs, d(2025, 2, 10)).unwrap();
        let ids: Vec<i64> = due.iter().map(|d| d.subscription_id).collect();
        assert_eq!(ids, vec![1]);
    }

    #[test]
    fn formats_regular_currency_for_notifications() {
        assert_eq!(format_amount_for_notification(1799, "EUR"), "17,99 EUR");
        assert_eq!(
            format_amount_for_notification(123456, "USD"),
            "1.234,56 USD"
        );
    }

    #[test]
    fn formats_zero_decimal_currency_for_notifications() {
        assert_eq!(format_amount_for_notification(1500, "KRW"), "1.500 KRW");
        assert_eq!(format_amount_for_notification(0, "KRW"), "0 KRW");
    }

    #[test]
    fn formats_negative_amounts_defensively() {
        assert_eq!(format_amount_for_notification(-1799, "EUR"), "-17,99 EUR");
        assert_eq!(format_amount_for_notification(-1500, "KRW"), "-1.500 KRW");
    }

    // -- Dispatcher-Tests: Reservierung + Rollback --------------------------
    //
    // Der Dispatcher koppelt INSERT OR IGNORE, notification.show() und DELETE
    // (bei show()-Fehler) in genau dieser Reihenfolge. Damit das auch nach
    // Refactorings stabil bleibt, simulieren wir show() ueber den
    // `Notifier`-Seam und pruefen den DB-Endzustand.

    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;
    use std::sync::Mutex;

    struct MockNotifier {
        calls: Mutex<u32>,
        result: Result<(), String>,
    }

    impl MockNotifier {
        fn success() -> Self {
            Self {
                calls: Mutex::new(0),
                result: Ok(()),
            }
        }

        fn failure(msg: &str) -> Self {
            Self {
                calls: Mutex::new(0),
                result: Err(msg.to_string()),
            }
        }

        fn call_count(&self) -> u32 {
            *self.calls.lock().unwrap()
        }
    }

    impl Notifier for MockNotifier {
        fn show(&self, _title: &str, _body: &str) -> Result<(), String> {
            *self.calls.lock().unwrap() += 1;
            self.result.clone()
        }
    }

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect in-memory sqlite");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("apply migrations");
        // Subscription-Row fuer FK-Bindung der reminders-Tabelle (FK an per
        // sqlx-Default). subscription_id = 1 wird in den Tests genutzt.
        sqlx::query(
            "INSERT INTO subscriptions \
               (id, name, amount_cents, currency, account_id, interval, anchor_date, \
                lead_days, active, notify) \
             VALUES (1, 'Netflix', 1799, 'EUR', NULL, 'monthly', '2025-02-15', 7, 1, 1)",
        )
        .execute(&pool)
        .await
        .expect("seed subscription");
        pool
    }

    fn due_reminder() -> DueReminder {
        DueReminder {
            subscription_id: 1,
            subscription_name: "Netflix".into(),
            amount_cents: 1799,
            currency: "EUR".into(),
            due_date: d(2025, 2, 15),
        }
    }

    async fn reservation_exists(pool: &SqlitePool, subscription_id: i64, due_date: &str) -> bool {
        let row: Option<(i64,)> = sqlx::query_as(
            "SELECT 1 FROM reminders WHERE subscription_id = ? AND due_date = ? LIMIT 1",
        )
        .bind(subscription_id)
        .bind(due_date)
        .fetch_optional(pool)
        .await
        .unwrap();
        row.is_some()
    }

    /// Pfad #1: erfolgreiches show() laesst die Reservierung in der DB stehen.
    /// Damit ist die Erinnerung gegen Doppelversand abgesichert.
    #[tokio::test]
    async fn dispatch_persists_reservation_on_show_success() {
        let pool = test_pool().await;
        let notifier = MockNotifier::success();
        let due = vec![due_reminder()];

        let sent = dispatch_due_reminders(&pool, &notifier, true, &due)
            .await
            .expect("dispatch ok");

        assert_eq!(sent, 1);
        assert_eq!(
            notifier.call_count(),
            1,
            "show() muss aufgerufen worden sein"
        );
        assert!(
            reservation_exists(&pool, 1, "2025-02-15").await,
            "Reservierung muss nach erfolgreichem show() in der DB stehen"
        );
    }

    /// Pfad #2: schlaegt show() fehl, muss die zuvor reservierte Row wieder
    /// entfernt werden — sonst wuerde ein spaeterer Check die Erinnerung als
    /// gesendet betrachten und nie nachtragen.
    #[tokio::test]
    async fn dispatch_rolls_back_reservation_on_show_failure() {
        let pool = test_pool().await;
        let notifier = MockNotifier::failure("OS-Notification kaputt");
        let due = vec![due_reminder()];

        let err = dispatch_due_reminders(&pool, &notifier, true, &due)
            .await
            .expect_err("dispatch muss show()-Fehler durchreichen");

        assert!(
            err.contains("OS-Notification kaputt"),
            "Fehler aus dem Notifier muss propagiert werden: {err}"
        );
        assert_eq!(notifier.call_count(), 1, "show() wurde versucht");
        assert!(
            !reservation_exists(&pool, 1, "2025-02-15").await,
            "Reservierung muss nach Notification-Fehler zurueckgerollt sein"
        );
    }

    /// Pfad #3: Idempotenz — eine bereits vorhandene Reservierung blockiert
    /// sowohl INSERT als auch show(). Der Dispatcher darf an einer schon
    /// gesendeten Erinnerung nicht erneut versuchen.
    #[tokio::test]
    async fn dispatch_skips_already_reserved_reminder() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO reminders (subscription_id, due_date) VALUES (1, '2025-02-15')")
            .execute(&pool)
            .await
            .expect("seed reminder");
        let notifier = MockNotifier::success();
        let due = vec![due_reminder()];

        let sent = dispatch_due_reminders(&pool, &notifier, true, &due)
            .await
            .expect("dispatch ok");

        assert_eq!(sent, 0, "doppelte Erinnerung darf nicht gezaehlt werden");
        assert_eq!(
            notifier.call_count(),
            0,
            "show() darf bei bereits gesendeter Erinnerung nicht aufgerufen werden"
        );
        assert!(reservation_exists(&pool, 1, "2025-02-15").await);
    }

    /// Pfad #4: ohne Permission wird weder reserviert noch show() aufgerufen,
    /// damit ein spaeterer Check nach Permission-Erteilung die Erinnerung noch
    /// nachtragen kann.
    #[tokio::test]
    async fn dispatch_without_permission_does_not_reserve_or_show() {
        let pool = test_pool().await;
        let notifier = MockNotifier::success();
        let due = vec![due_reminder()];

        let sent = dispatch_due_reminders(&pool, &notifier, false, &due)
            .await
            .expect("dispatch ok");

        assert_eq!(sent, 0);
        assert_eq!(notifier.call_count(), 0);
        assert!(
            !reservation_exists(&pool, 1, "2025-02-15").await,
            "ohne Permission darf keine Reservierung entstehen"
        );
    }
}
