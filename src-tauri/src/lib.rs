mod commands;
mod db;
mod recurrence;
mod reminders;

use std::str::FromStr;
use std::time::Duration as StdDuration;

use crate::db::AppState;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::SqlitePool;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

const REMINDER_INTERVAL: StdDuration = StdDuration::from_secs(60 * 60);

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
        .invoke_handler(tauri::generate_handler![
            commands::list_subscriptions,
            commands::list_accounts,
            commands::add_subscription,
            commands::delete_subscription,
            commands::add_account,
            commands::delete_account,
            commands::count_subs_for_account,
            commands::update_subscription,
            commands::insert_reminder_if_new,
        ])
        .setup(|app| {
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
                .journal_mode(SqliteJournalMode::Wal);
                let pool = SqlitePool::connect_with(options).await?;
                sqlx::migrate!("./migrations").run(&pool).await?;
                Ok::<SqlitePool, Box<dyn std::error::Error>>(pool)
            })?;
            app.manage(AppState { db: pool.clone() });

            // Reminder-Scheduler im Rust-Hauptprozess: initial Check + stuendlich.
            // Loest die Webview-Pause-Probleme der frueheren useReminderLoop-Variante.
            let app_handle = app.handle().clone();
            let pool_for_loop = pool;
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Err(e) = reminders::run_reminder_check(&pool_for_loop, &app_handle).await
                    {
                        eprintln!("Reminder-Check fehlgeschlagen: {e}");
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
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
