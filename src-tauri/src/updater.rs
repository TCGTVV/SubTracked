//! In-App-Update über `tauri-plugin-updater`.
//!
//! Läuft komplett in Rust: der Renderer bekommt nur zwei Commands (prüfen, installieren) und
//! keine eigene Updater-Permission. Die Update-Quelle steht in `tauri.conf.json`
//! (`plugins.updater.endpoints` → `latest.json` des jüngsten veröffentlichten GitHub-Releases),
//! die Signaturprüfung gegen den dort hinterlegten öffentlichen Schlüssel macht das Plugin.
//!
//! Gebaut wird nichts automatisch: Es wird nur auf Klick geprüft und nur auf Klick installiert.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// Verfügbare Version (z.B. "0.6.0").
    pub version: String,
    /// Aktuell installierte Version.
    pub current_version: String,
    /// Release-Notizen aus `latest.json`, falls vorhanden.
    pub notes: Option<String>,
}

fn to_message(context: &str, error: impl std::fmt::Display) -> String {
    format!("{context}: {error}")
}

/// Fragt den Update-Server, ob eine neuere Version existiert. `None` = aktuell.
#[tauri::command(rename_all = "camelCase")]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app
        .updater()
        .map_err(|e| to_message("Update-Prüfung nicht verfügbar", e))?;
    let update = updater
        .check()
        .await
        .map_err(|e| to_message("Update-Prüfung fehlgeschlagen", e))?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        notes: u.body.clone(),
    }))
}

/// Lädt das verfügbare Update, prüft die Signatur, installiert und startet die App neu.
/// Prüft dafür selbst erneut (kein Zustand zwischen `check_for_update` und hier).
/// Kehrt nur bei einem Fehler oder „kein Update" zurück; nach Erfolg startet die App neu.
#[tauri::command(rename_all = "camelCase")]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|e| to_message("Update nicht verfügbar", e))?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|e| to_message("Update-Prüfung fehlgeschlagen", e))?
    else {
        return Err("Es ist kein Update mehr verfügbar.".to_string());
    };
    tracing::info!(
        from = %update.current_version,
        to = %update.version,
        "Update wird heruntergeladen und installiert"
    );
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| to_message("Update-Installation fehlgeschlagen", e))?;
    tracing::info!("Update installiert, App wird neu gestartet");
    app.restart();
}
