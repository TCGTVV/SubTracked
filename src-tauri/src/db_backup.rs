//! Pre-Migration-Sicherung und Integritätsprüfung der SQLite-Datenbank.
//!
//! Vor jeder ausstehenden Migration wird – sofern die DB bereits Daten enthält –
//! ein konsistenter Snapshot via `VACUUM INTO` angelegt. `VACUUM INTO` ist
//! WAL-sicher (anders als ein nacktes File-Copy von `subtracker.db`, das die noch
//! nicht eingecheckten Seiten im `-wal`-File verpassen würde). Davor steht ein
//! `PRAGMA integrity_check` als Tor: Ist die DB schon beschädigt, wird die Migration
//! NICHT ausgeführt und der Start abgebrochen (das beschädigte File wird aber noch
//! gesichert). Nach der Migration laufen integrity_check + foreign_key_check als
//! Kontrolle und werden bei Auffälligkeiten laut geloggt.
//!
//! Recovery: Backups liegen in `<config_dir>/backups/`. Zum Wiederherstellen die
//! App schließen, `subtracker.db` (sowie `-wal`/`-shm`) durch die gewünschte
//! `subtracker-pre-migrate-<ts>.db` ersetzen (auf `subtracker.db` umbenennen),
//! dann App neu starten.

use std::path::{Path, PathBuf};

use sqlx::migrate::Migrator;
use sqlx::SqlitePool;

type BoxError = Box<dyn std::error::Error>;

/// Wie viele Pre-Migration-Backups aufbewahrt werden (ältere werden gelöscht).
const KEEP_BACKUPS: usize = 5;
const BACKUP_PREFIX: &str = "subtracker-pre-migrate-";

/// Läuft vor `migrator.run(...)`. Legt – wenn Migrationen anstehen und die DB bereits
/// Daten enthält – ein Backup an und prüft die Integrität (Abbruch bei Schaden).
/// Gibt `true` zurück, wenn Migrationen ausstehen (rein informativ für den Aufrufer).
pub async fn before_migrations(
    pool: &SqlitePool,
    db_path: &Path,
    migrator: &Migrator,
) -> Result<bool, BoxError> {
    if !has_pending(pool, migrator).await? {
        return Ok(false);
    }
    // Nur sichern, wenn die DB schon Schema/Daten hat. Frische Installation: nichts zu verlieren.
    if has_applied_migrations(pool).await? {
        let status = integrity_check(pool).await?;
        if status != "ok" {
            // Trotzdem ein Backup der (beschädigten) DB anlegen, dann abbrechen.
            match backup(pool, db_path).await {
                Ok(path) => tracing::error!(
                    backup = %path.display(),
                    status = %status,
                    "DB-Integritätsprüfung vor Migration fehlgeschlagen – Backup angelegt, Start wird abgebrochen"
                ),
                Err(e) => tracing::error!(
                    error = %e,
                    status = %status,
                    "DB-Integritätsprüfung fehlgeschlagen UND Backup misslang"
                ),
            }
            return Err(format!(
                "Datenbank-Integritätsprüfung fehlgeschlagen vor Migration: {status}. \
                 Migration abgebrochen, um weiteren Schaden zu vermeiden."
            )
            .into());
        }
        let path = backup(pool, db_path).await?;
        tracing::info!(backup = %path.display(), "Pre-Migration-Backup erstellt");
        prune(db_path)?;
    }
    Ok(true)
}

/// Läuft nach `migrator.run(...)`. Kontrolliert integrity_check + foreign_key_check und
/// loggt Auffälligkeiten als Error (das Pre-Migration-Backup ist das Sicherheitsnetz).
pub async fn verify_after_migrations(pool: &SqlitePool) -> Result<(), BoxError> {
    let status = integrity_check(pool).await?;
    if status != "ok" {
        tracing::error!(status = %status, "integrity_check nach Migration NICHT ok");
    }
    let violations = foreign_key_violations(pool).await?;
    if violations > 0 {
        tracing::error!(
            count = violations,
            "foreign_key_check nach Migration: Verletzungen gefunden"
        );
    }
    if status == "ok" && violations == 0 {
        tracing::info!("DB-Integrität nach Migration ok");
    }
    Ok(())
}

async fn has_pending(pool: &SqlitePool, migrator: &Migrator) -> Result<bool, BoxError> {
    let applied = applied_versions(pool).await?;
    Ok(migrator.iter().any(|m| !applied.contains(&m.version)))
}

async fn has_applied_migrations(pool: &SqlitePool) -> Result<bool, BoxError> {
    Ok(!applied_versions(pool).await?.is_empty())
}

async fn applied_versions(pool: &SqlitePool) -> Result<Vec<i64>, BoxError> {
    let table_exists: Option<(String,)> = sqlx::query_as(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_optional(pool)
    .await?;
    if table_exists.is_none() {
        return Ok(Vec::new());
    }
    let rows: Vec<(i64,)> = sqlx::query_as("SELECT version FROM _sqlx_migrations")
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(|(v,)| v).collect())
}

async fn integrity_check(pool: &SqlitePool) -> Result<String, BoxError> {
    // Bei Schaden liefert integrity_check mehrere Fehlerzeilen statt nur "ok".
    let rows: Vec<(String,)> = sqlx::query_as("PRAGMA integrity_check")
        .fetch_all(pool)
        .await?;
    Ok(rows
        .into_iter()
        .map(|(s,)| s)
        .collect::<Vec<_>>()
        .join("; "))
}

async fn foreign_key_violations(pool: &SqlitePool) -> Result<usize, BoxError> {
    // Eine Zeile pro Verletzung (Tabelle, rowid, Eltern-Tabelle, fkid).
    let rows = sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(pool)
        .await?;
    Ok(rows.len())
}

async fn backup(pool: &SqlitePool, db_path: &Path) -> Result<PathBuf, BoxError> {
    let dir = backup_dir(db_path)?;
    std::fs::create_dir_all(&dir)?;
    let ts = chrono::Utc::now().format("%Y%m%dT%H%M%S%3fZ");
    let target = dir.join(format!("{BACKUP_PREFIX}{ts}.db"));
    // Pfad als SQL-String-Literal; einfache Anführungszeichen verdoppeln. Der Pfad ist
    // app-kontrolliert (config_dir + eigener Zeitstempel), daher mit AssertSqlSafe ok
    // (VACUUM INTO erlaubt keine Bind-Parameter für den Zielnamen).
    let escaped = target.to_string_lossy().replace('\'', "''");
    sqlx::query(sqlx::AssertSqlSafe(format!("VACUUM INTO '{escaped}'")))
        .execute(pool)
        .await?;
    Ok(target)
}

fn backup_dir(db_path: &Path) -> Result<PathBuf, BoxError> {
    let parent = db_path
        .parent()
        .ok_or("DB-Pfad hat kein übergeordnetes Verzeichnis")?;
    Ok(parent.join("backups"))
}

fn prune(db_path: &Path) -> Result<(), BoxError> {
    let dir = backup_dir(db_path)?;
    let mut backups: Vec<PathBuf> = std::fs::read_dir(&dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(BACKUP_PREFIX) && n.ends_with(".db"))
        })
        .collect();
    // Zeitstempel-Dateinamen sind lexikographisch sortierbar → neueste am Ende.
    backups.sort();
    if backups.len() > KEEP_BACKUPS {
        for old in &backups[..backups.len() - KEEP_BACKUPS] {
            if let Err(e) = std::fs::remove_file(old) {
                tracing::warn!(
                    file = %old.display(),
                    error = %e,
                    "Altes Backup konnte nicht gelöscht werden"
                );
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::SqlitePool;
    use std::str::FromStr;

    /// File-basierter Pool (VACUUM INTO braucht eine echte Quelle/WAL), in temp-Dir.
    async fn file_pool(dir: &Path) -> SqlitePool {
        let db_path = dir.join("subtracker.db");
        let options =
            SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.to_string_lossy()))
                .unwrap()
                .create_if_missing(true)
                .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
                .foreign_keys(true);
        SqlitePool::connect_with(options).await.unwrap()
    }

    fn temp_dir(name: &str) -> PathBuf {
        let nonce: u64 = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64;
        let dir = std::env::temp_dir().join(format!("subtracked-dbbackup-{name}-{nonce}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn integrity_check_ok_on_fresh_db() {
        let dir = temp_dir("integ");
        let pool = file_pool(&dir).await;
        assert_eq!(integrity_check(&pool).await.unwrap(), "ok");
        assert_eq!(foreign_key_violations(&pool).await.unwrap(), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn backup_writes_consistent_snapshot() {
        let dir = temp_dir("snap");
        let pool = file_pool(&dir).await;
        sqlx::query("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO t (v) VALUES ('hallo')")
            .execute(&pool)
            .await
            .unwrap();

        let path = backup(&pool, &dir.join("subtracker.db")).await.unwrap();
        assert!(path.exists());

        // Snapshot öffnen und Daten gegenchecken → echte Kopie, nicht leer.
        let snap = SqlitePool::connect(&format!("sqlite://{}", path.to_string_lossy()))
            .await
            .unwrap();
        let (v,): (String,) = sqlx::query_as("SELECT v FROM t WHERE id = 1")
            .fetch_one(&snap)
            .await
            .unwrap();
        assert_eq!(v, "hallo");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn prune_keeps_only_last_five() {
        let dir = temp_dir("prune");
        let backups = dir.join("backups");
        std::fs::create_dir_all(&backups).unwrap();
        // 8 Backups + eine Fremddatei, die nicht angefasst werden darf.
        for i in 0..8 {
            std::fs::write(
                backups.join(format!("{BACKUP_PREFIX}2026010{i}T000000000Z.db")),
                b"x",
            )
            .unwrap();
        }
        std::fs::write(backups.join("nicht-meins.db"), b"x").unwrap();

        prune(&dir.join("subtracker.db")).unwrap();

        let remaining: Vec<String> = std::fs::read_dir(&backups)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with(BACKUP_PREFIX))
            .collect();
        assert_eq!(remaining.len(), KEEP_BACKUPS);
        // Die neuesten (höchste Indizes) bleiben erhalten.
        assert!(remaining.iter().any(|n| n.contains("20260107")));
        assert!(!remaining.iter().any(|n| n.contains("20260100")));
        // Fremddatei unangetastet.
        assert!(backups.join("nicht-meins.db").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
