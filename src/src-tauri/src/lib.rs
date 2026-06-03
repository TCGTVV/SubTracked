// src-tauri/src/lib.rs
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hallo, {}!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create initial tables",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
    .plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
    ))
    .plugin(tauri_plugin_notification::init())
    .plugin(
        tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:subtracker.db", migrations)
        .build(),
    )
    .invoke_handler(tauri::generate_handler![greet])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
