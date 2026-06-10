mod backup;
mod commands;
mod currencies;
mod db;
mod recurrence;
mod reminders;
mod validation;

use std::str::FromStr;
use std::time::Duration as StdDuration;

use crate::db::{AppState, ReminderState};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::SqlitePool;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tracing_appender::rolling::Rotation;
use tracing_subscriber::prelude::*;

pub const REMINDER_INTERVAL: StdDuration = StdDuration::from_secs(60 * 60);
const TRAY_FOCUS_RETRY_DELAY: StdDuration = StdDuration::from_millis(80);
const TRAY_FOCUS_RAISE_DELAY: StdDuration = StdDuration::from_millis(40);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK 2.46+ hat unter Wayland einen DMABUF-Renderer-Bug, der die App
    // beim Start crashen laesst ("Gdk-Message Error 71"). Workaround: DMABUF aus.
    // Auf X11 no-op, daher kein Aufruf-Schaden.
    #[cfg(target_os = "linux")]
    unsafe {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_subscriptions,
            commands::list_accounts,
            commands::add_subscription,
            commands::delete_subscription,
            commands::add_account,
            commands::update_account,
            commands::delete_account,
            commands::count_subs_for_account,
            commands::update_subscription,
            commands::set_subscription_active,
            commands::get_reminder_status,
            commands::send_test_notification,
            commands::list_incomes,
            commands::add_income,
            commands::update_income,
            commands::delete_income,
            commands::set_income_active,
            commands::list_price_history,
            backup::export_backup,
            backup::import_backup,
        ])
        .setup(|app| {
            // Logging: stdout (sichtbar nur bei `pnpm tauri dev`) + rolling-Datei
            // im app_log_dir (~/.local/share/com.tcgtvv.subtracked/logs auf Linux),
            // damit sich Fehler aus dem installierten Binary nachvollziehen lassen.
            let log_dir = app
                .path()
                .app_log_dir()
                .expect("failed to resolve app log dir");
            std::fs::create_dir_all(&log_dir)?;
            let file_appender = tracing_appender::rolling::Builder::new()
                .rotation(Rotation::DAILY)
                .filename_prefix("subtracked")
                .filename_suffix("log")
                .max_log_files(7)
                .build(&log_dir)?;
            let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
            // WorkerGuard muss leben, solange die App laeuft, sonst koennen Logs
            // verloren gehen. app.manage haelt den Wert bis zum Programmende.
            app.manage(guard);
            tracing_subscriber::registry()
                .with(
                    tracing_subscriber::EnvFilter::try_from_default_env()
                        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
                )
                .with(tracing_subscriber::fmt::layer().with_writer(std::io::stdout))
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_writer(non_blocking)
                        .with_ansi(false),
                )
                .init();
            tracing::info!(log_dir = %log_dir.display(), "SubTracked startet");

            let config_dir = app
                .path()
                .app_config_dir()
                .expect("failed to resolve app config dir");
            std::fs::create_dir_all(&config_dir)?;
            let db_path = config_dir.join("subtracker.db");
            let pool = tauri::async_runtime::block_on(async move {
                let options = SqliteConnectOptions::from_str(&format!(
                    "sqlite://{}",
                    db_path.to_string_lossy()
                ))?
                .create_if_missing(true)
                .journal_mode(SqliteJournalMode::Wal)
                // FK-Enforcement explizit setzen, statt auf den sqlx-Default zu
                // vertrauen. Der Update-Pfad in commands::update_subscription_in_db
                // verlaesst sich darauf, dass FK aktiv ist (siehe dort: account_id
                // wird nur dann ins SET aufgenommen, wenn sie wirklich aendert,
                // damit Legacy-Orphans nicht am FK-Check scheitern).
                .foreign_keys(true);
                let pool = SqlitePool::connect_with(options).await?;
                sqlx::migrate!("./migrations").run(&pool).await?;
                Ok::<SqlitePool, Box<dyn std::error::Error>>(pool)
            })?;
            app.manage(AppState { db: pool.clone() });
            app.manage(ReminderState::default());

            // Reminder-Scheduler im Rust-Hauptprozess: initial Check + stuendlich.
            // Loest die Webview-Pause-Probleme der frueheren useReminderLoop-Variante.
            let app_handle = app.handle().clone();
            let pool_for_loop = pool;
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Err(e) = reminders::run_reminder_check(&pool_for_loop, &app_handle).await
                    {
                        tracing::error!(error = %e, "Reminder-Check fehlgeschlagen");
                    }
                    // Last-Check-Zeitstempel immer aktualisieren, auch bei Error —
                    // semantisch "Loop ist gelaufen", egal ob er was geschickt hat.
                    if let Some(state) = app_handle.try_state::<ReminderState>() {
                        state.record_check(chrono::Utc::now());
                    }
                    tokio::time::sleep(REMINDER_INTERVAL).await;
                }
            });

            let show_item = MenuItem::with_id(app, "show", "Fenster zeigen", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Beenden", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let was_visible = window.is_visible().unwrap_or(false);
        let was_minimized = window.is_minimized().unwrap_or(false);
        tracing::info!(
            was_visible,
            was_minimized,
            "Fenster aus Tray-Aktion anzeigen"
        );

        if let Err(e) = window.show() {
            tracing::error!(error = %e, "Fenster konnte nicht angezeigt werden");
        }
        if let Err(e) = window.unminimize() {
            tracing::error!(error = %e, "Fenster konnte nicht entminimiert werden");
        }

        focus_main_window_after_show(window);
    } else {
        tracing::warn!("Tray-Aktion konnte kein main-Fenster finden");
    }
}

fn focus_main_window_after_show(window: tauri::WebviewWindow) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(TRAY_FOCUS_RETRY_DELAY).await;

        if let Err(e) = window.set_focus() {
            tracing::error!(error = %e, "Fenster-Fokus nach Tray-Aktion fehlgeschlagen");
        }

        // KDE Plasma/Wayland kann ein gerade aus dem Tray wieder eingeblendetes
        // Fenster zwar in der Taskleiste hervorheben, aber nicht zuverlaessig
        // nach vorne heben. Ein kurzes Keep-Above-Toggle nach dem Show-Request
        // gibt KWin einen expliziten Raise-Impuls, danach wird der Normalzustand
        // sofort wiederhergestellt.
        #[cfg(target_os = "linux")]
        {
            if let Err(e) = window.set_always_on_top(true) {
                tracing::error!(error = %e, "Fenster konnte nicht kurz angehoben werden");
            }
            tokio::time::sleep(TRAY_FOCUS_RAISE_DELAY).await;
            if let Err(e) = window.set_always_on_top(false) {
                tracing::error!(error = %e, "Fenster-Anheben konnte nicht zurueckgesetzt werden");
            }
            if let Err(e) = window.set_focus() {
                tracing::error!(error = %e, "Zweiter Fenster-Fokus nach Tray-Aktion fehlgeschlagen");
            }
        }
    });
}
