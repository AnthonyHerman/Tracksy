use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WorkItem {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub status: String,
    pub notes: Option<String>,
    pub sort_order: f64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

const VALID_STATUSES: &[&str] = &["todo", "active", "done", "blocked", "cancelled"];

pub fn validate_status(status: &str) -> Result<(), String> {
    if VALID_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(format!(
            "Invalid status '{}'. Must be one of: {}",
            status,
            VALID_STATUSES.join(", ")
        ))
    }
}

pub fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub async fn fetch_item(pool: &SqlitePool, id: &str) -> Result<WorkItem, String> {
    sqlx::query_as::<_, WorkItem>("SELECT * FROM work_items WHERE id = ? AND deleted_at IS NULL")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| format!("Work item '{}' not found", id))
}

pub async fn validate_parent_exists(pool: &SqlitePool, parent_id: &str) -> Result<(), String> {
    let exists = sqlx::query_scalar::<_, i32>(
        "SELECT COUNT(*) FROM work_items WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(parent_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    if exists == 0 {
        Err(format!("Parent '{}' does not exist or is deleted", parent_id))
    } else {
        Ok(())
    }
}

/// Walk the ancestor chain from `new_parent_id` upward. If we encounter `item_id`,
/// that means setting this parent would create a cycle.
pub async fn detect_cycle(
    pool: &SqlitePool,
    item_id: &str,
    new_parent_id: &str,
) -> Result<(), String> {
    let mut current = Some(new_parent_id.to_string());
    while let Some(ref pid) = current {
        if pid == item_id {
            return Err("Cycle detected: cannot set an item as its own descendant".to_string());
        }
        let row: Option<(Option<String>,)> = sqlx::query_as(
            "SELECT parent_id FROM work_items WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(pid)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

        current = row.and_then(|r| r.0);
    }
    Ok(())
}

pub async fn insert_item(pool: &SqlitePool, item: &WorkItem) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO work_items (id, parent_id, title, status, notes, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&item.id)
    .bind(&item.parent_id)
    .bind(&item.title)
    .bind(&item.status)
    .bind(&item.notes)
    .bind(item.sort_order)
    .bind(&item.created_at)
    .bind(&item.updated_at)
    .execute(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    Ok(())
}

pub async fn update_item(pool: &SqlitePool, item: &WorkItem) -> Result<(), String> {
    sqlx::query(
        "UPDATE work_items SET parent_id = ?, title = ?, status = ?, notes = ?, sort_order = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(&item.parent_id)
    .bind(&item.title)
    .bind(&item.status)
    .bind(&item.notes)
    .bind(item.sort_order)
    .bind(&item.updated_at)
    .bind(&item.id)
    .execute(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    Ok(())
}

pub async fn soft_delete_item(pool: &SqlitePool, id: &str, now: &str) -> Result<(), String> {
    let result = sqlx::query(
        "UPDATE work_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(now)
    .bind(now)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    if result.rows_affected() == 0 {
        return Err(format!("Work item '{}' not found or already deleted", id));
    }
    Ok(())
}

pub async fn fetch_all_live(pool: &SqlitePool) -> Result<Vec<WorkItem>, String> {
    sqlx::query_as::<_, WorkItem>(
        "SELECT * FROM work_items WHERE deleted_at IS NULL ORDER BY sort_order ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))
}
