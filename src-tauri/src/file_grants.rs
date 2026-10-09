//! Pfad-Freigaben fuer Backup-/CSV-Commands.
//!
//! Der Renderer darf keine freien Dateipfade an Commands uebergeben: Bei einem
//! Renderer-XSS koennten sonst beliebige les-/beschreibbare Pfade angesteuert
//! werden. Stattdessen oeffnet Rust den nativen Datei-Dialog selbst
//! (`pick_save_file`/`pick_open_file`), merkt sich den vom Nutzer gewaehlten
//! Pfad unter einem zufaelligen, einmal gueltigen Token und gibt dem Renderer nur
//! dieses Token zurueck. Die Datei-Commands loesen das Token ueber
//! [`FileGrants::take`] ein.

use std::{
    collections::HashMap,
    hash::{BuildHasher, Hasher},
    path::PathBuf,
    sync::Mutex,
};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// Wofuer ein Token eingeloest werden darf. Ein Schreib-Token kann nicht zum Lesen
/// missbraucht werden und umgekehrt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GrantKind {
    Read,
    Write,
}

/// Mehr offene Freigaben als das hat kein legitimer Ablauf (ein Dialog gleichzeitig);
/// aeltere werden verworfen, damit der Speicher nicht unbegrenzt waechst.
const MAX_OPEN_GRANTS: usize = 16;

#[derive(Default)]
pub struct FileGrants {
    inner: Mutex<HashMap<String, (GrantKind, PathBuf)>>,
}

fn random_token() -> String {
    // RandomState ist pro Instanz zufaellig geseedet — reicht fuer ein
    // nicht erratbares Einmal-Token, ohne eine weitere Dependency.
    let mut token = String::with_capacity(32);
    for _ in 0..2 {
        let value = std::collections::hash_map::RandomState::new()
            .build_hasher()
            .finish();
        token.push_str(&format!("{value:016x}"));
    }
    token
}

impl FileGrants {
    pub fn grant(&self, kind: GrantKind, path: PathBuf) -> String {
        let token = random_token();
        let mut map = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if map.len() >= MAX_OPEN_GRANTS {
            map.clear();
        }
        map.insert(token.clone(), (kind, path));
        token
    }

    /// Loest ein Token ein (einmalig). Ein Token mit falschem Typ bleibt unberuehrt.
    pub fn take(&self, token: &str, kind: GrantKind) -> Result<PathBuf, String> {
        let mut map = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        match map.get(token) {
            Some((granted, _)) if *granted == kind => {
                let (_, path) = map.remove(token).expect("eben noch vorhanden");
                Ok(path)
            }
            Some(_) => Err("Datei-Freigabe passt nicht zur Aktion.".to_string()),
            None => Err(
                "Datei-Freigabe ungueltig oder bereits verbraucht. Bitte Datei erneut waehlen."
                    .to_string(),
            ),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedFile {
    /// Einmal gueltiges Token fuer den Datei-Command.
    pub token: String,
    /// Nur zur Anzeige ("Backup gespeichert: …") — wird nie als Eingabe akzeptiert.
    pub path: String,
}

fn into_picked(
    grants: &FileGrants,
    kind: GrantKind,
    picked: Option<tauri_plugin_dialog::FilePath>,
) -> Result<Option<PickedFile>, String> {
    let Some(file) = picked else {
        return Ok(None); // Dialog abgebrochen
    };
    let path = file
        .into_path()
        .map_err(|e| format!("Ungueltiger Dateipfad: {e}"))?;
    let display = path.display().to_string();
    let token = grants.grant(kind, path);
    Ok(Some(PickedFile {
        token,
        path: display,
    }))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn pick_save_file(
    app: AppHandle,
    grants: State<'_, FileGrants>,
    default_name: String,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<PickedFile>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
        app.dialog()
            .file()
            .set_file_name(default_name)
            .add_filter(filter_name, &exts)
            .blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    into_picked(&grants, GrantKind::Write, picked)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn pick_open_file(
    app: AppHandle,
    grants: State<'_, FileGrants>,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<PickedFile>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
        app.dialog()
            .file()
            .add_filter(filter_name, &exts)
            .blocking_pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    into_picked(&grants, GrantKind::Read, picked)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_is_single_use() {
        let grants = FileGrants::default();
        let token = grants.grant(GrantKind::Write, PathBuf::from("/tmp/x.json"));
        assert_eq!(
            grants.take(&token, GrantKind::Write).unwrap(),
            PathBuf::from("/tmp/x.json")
        );
        assert!(grants.take(&token, GrantKind::Write).is_err());
    }

    #[test]
    fn unknown_token_is_rejected() {
        let grants = FileGrants::default();
        assert!(grants.take("/etc/passwd", GrantKind::Read).is_err());
        assert!(grants.take("", GrantKind::Read).is_err());
    }

    #[test]
    fn token_kind_is_enforced_and_wrong_kind_does_not_consume() {
        let grants = FileGrants::default();
        let token = grants.grant(GrantKind::Write, PathBuf::from("/tmp/x.json"));
        assert!(grants.take(&token, GrantKind::Read).is_err());
        // Das falsch eingeloeste Token ist weiter fuer den richtigen Zweck gueltig.
        assert!(grants.take(&token, GrantKind::Write).is_ok());
    }

    #[test]
    fn tokens_are_unique_and_open_grants_are_capped() {
        let grants = FileGrants::default();
        let first = grants.grant(GrantKind::Read, PathBuf::from("/a"));
        let mut seen = std::collections::HashSet::new();
        seen.insert(first.clone());
        for i in 0..(MAX_OPEN_GRANTS * 2) {
            let t = grants.grant(GrantKind::Read, PathBuf::from(format!("/p{i}")));
            assert!(seen.insert(t), "Token doppelt vergeben");
        }
        // Das aelteste Token wurde beim Ueberlauf verworfen.
        assert!(grants.take(&first, GrantKind::Read).is_err());
        let inner = grants.inner.lock().unwrap();
        assert!(inner.len() <= MAX_OPEN_GRANTS);
    }
}
