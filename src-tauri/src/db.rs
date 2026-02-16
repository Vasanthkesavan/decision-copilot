use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &str) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id)
            );
        ")?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn create_conversation(&self, title: &str) -> Result<Conversation, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, title, now, now],
        )?;
        Ok(Conversation { id, title: title.to_string(), created_at: now.clone(), updated_at: now })
    }

    pub fn get_conversations(&self) -> Result<Vec<Conversation>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?;
        rows.collect()
    }

    pub fn add_message(&self, conversation_id: &str, role: &str, content: &str) -> Result<Message, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, conversation_id, role, content, now],
        )?;
        conn.execute(
            "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
            params![now, conversation_id],
        )?;
        Ok(Message { id, conversation_id: conversation_id.to_string(), role: role.to_string(), content: content.to_string(), created_at: now })
    }

    pub fn get_messages(&self, conversation_id: &str) -> Result<Vec<Message>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC")?;
        let rows = stmt.query_map(params![conversation_id], |row| {
            Ok(Message {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn delete_conversation(&self, conversation_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM messages WHERE conversation_id = ?1", params![conversation_id])?;
        conn.execute("DELETE FROM conversations WHERE id = ?1", params![conversation_id])?;
        Ok(())
    }
}
