use crate::types::HourBucket;
use rusqlite::Connection;
use std::path::Path;

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS hourly_tokens (
                hour_key   TEXT PRIMARY KEY,
                token_total INTEGER NOT NULL DEFAULT 0,
                cost_usd   REAL NOT NULL DEFAULT 0.0
            )",
        )?;
        Ok(Self { conn })
    }

    pub fn upsert_bucket(&self, hour_key: &str, tokens: u64, cost: f64) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO hourly_tokens (hour_key, token_total, cost_usd)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(hour_key) DO UPDATE SET
               token_total = token_total + excluded.token_total,
               cost_usd = cost_usd + excluded.cost_usd",
            rusqlite::params![hour_key, tokens, cost],
        )?;
        Ok(())
    }

    pub fn query_since(&self, since_key: &str) -> rusqlite::Result<Vec<HourBucket>> {
        let mut stmt = self.conn.prepare(
            "SELECT hour_key, token_total, cost_usd FROM hourly_tokens
             WHERE hour_key >= ?1 ORDER BY hour_key",
        )?;
        let rows = stmt.query_map(rusqlite::params![since_key], |row| {
            Ok(HourBucket {
                hour_key: row.get(0)?,
                token_total: row.get(1)?,
                cost_usd: row.get(2)?,
            })
        })?;
        rows.collect()
    }

    pub fn query_totals(&self) -> rusqlite::Result<(u64, f64)> {
        self.conn.query_row(
            "SELECT COALESCE(SUM(token_total), 0), COALESCE(SUM(cost_usd), 0.0)
             FROM hourly_tokens",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
    }

    pub fn prune_before(&self, before_key: &str) -> rusqlite::Result<usize> {
        self.conn.execute(
            "DELETE FROM hourly_tokens WHERE hour_key < ?1",
            rusqlite::params![before_key],
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn open_temp_db() -> (Db, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let path = dir.path().join("test.db");
        let db = Db::open(&path).unwrap();
        (db, dir)
    }

    #[test]
    fn test_db_open_creates_table() {
        let (db, _dir) = open_temp_db();
        let count: i64 = db
            .conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='hourly_tokens'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_db_upsert_new_bucket() {
        let (db, _dir) = open_temp_db();
        db.upsert_bucket("2025-01-01T14", 100, 0.05).unwrap();
        let rows = db.query_since("").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].hour_key, "2025-01-01T14");
        assert_eq!(rows[0].token_total, 100);
        assert!((rows[0].cost_usd - 0.05).abs() < 1e-9);
    }

    #[test]
    fn test_db_upsert_existing_accumulates() {
        let (db, _dir) = open_temp_db();
        db.upsert_bucket("2025-01-01T14", 100, 0.05).unwrap();
        db.upsert_bucket("2025-01-01T14", 200, 0.10).unwrap();
        let rows = db.query_since("").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].token_total, 300);
        assert!((rows[0].cost_usd - 0.15).abs() < 1e-9);
    }

    #[test]
    fn test_db_query_since_filters() {
        let (db, _dir) = open_temp_db();
        db.upsert_bucket("2025-01-01T10", 10, 0.01).unwrap();
        db.upsert_bucket("2025-01-01T12", 20, 0.02).unwrap();
        db.upsert_bucket("2025-01-01T14", 30, 0.03).unwrap();
        let rows = db.query_since("2025-01-01T12").unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].hour_key, "2025-01-01T12");
        assert_eq!(rows[1].hour_key, "2025-01-01T14");
    }

    #[test]
    fn test_db_query_totals() {
        let (db, _dir) = open_temp_db();
        db.upsert_bucket("2025-01-01T10", 100, 0.05).unwrap();
        db.upsert_bucket("2025-01-01T12", 200, 0.10).unwrap();
        let (total_tokens, total_cost) = db.query_totals().unwrap();
        assert_eq!(total_tokens, 300);
        assert!((total_cost - 0.15).abs() < 1e-9);
    }

    #[test]
    fn test_db_prune_before() {
        let (db, _dir) = open_temp_db();
        db.upsert_bucket("2025-01-01T10", 10, 0.01).unwrap();
        db.upsert_bucket("2025-01-01T12", 20, 0.02).unwrap();
        db.upsert_bucket("2025-01-01T14", 30, 0.03).unwrap();
        let deleted = db.prune_before("2025-01-01T12").unwrap();
        assert_eq!(deleted, 1);
        let rows = db.query_since("").unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].hour_key, "2025-01-01T12");
    }

    #[test]
    fn test_db_reopen_preserves_data() {
        let (db, dir) = open_temp_db();
        db.upsert_bucket("2025-01-01T14", 100, 0.05).unwrap();
        drop(db);

        let db2 = Db::open(&dir.path().join("test.db")).unwrap();
        let rows = db2.query_since("").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].token_total, 100);
    }
}
