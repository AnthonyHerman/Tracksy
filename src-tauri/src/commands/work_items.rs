use serde::Deserialize;
use sqlx::SqlitePool;
use tauri::State;

use crate::db::queries::{self, WorkItem};

#[tauri::command]
pub async fn create_work_item(
    pool: State<'_, SqlitePool>,
    id: String,
    title: String,
    parent_id: Option<String>,
    notes: Option<String>,
    status: Option<String>,
    sort_order: f64,
) -> Result<WorkItem, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Title must not be empty".to_string());
    }

    let status = status.unwrap_or_else(|| "todo".to_string());
    queries::validate_status(&status)?;

    if let Some(ref pid) = parent_id {
        queries::validate_parent_exists(&pool, pid).await?;
    }

    let now = queries::now_utc();

    let item = WorkItem {
        id,
        parent_id,
        title,
        status,
        notes,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    };

    queries::insert_item(&pool, &item).await?;

    Ok(item)
}

/// Deserializer for `Option<Option<T>>`: absent key → `None`, explicit null → `Some(None)`,
/// present value → `Some(Some(value))`.
fn deserialize_double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

#[derive(Debug, Deserialize)]
pub struct UpdateFields {
    pub title: Option<String>,
    pub status: Option<String>,
    pub notes: Option<String>,
    pub sort_order: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub parent_id: Option<Option<String>>,
}

#[tauri::command]
pub async fn update_work_item(
    pool: State<'_, SqlitePool>,
    id: String,
    fields: UpdateFields,
) -> Result<WorkItem, String> {
    let mut item = queries::fetch_item(&pool, &id).await?;

    if let Some(title) = fields.title {
        let title = title.trim().to_string();
        if title.is_empty() {
            return Err("Title must not be empty".to_string());
        }
        item.title = title;
    }

    if let Some(status) = fields.status {
        queries::validate_status(&status)?;
        item.status = status;
    }

    if let Some(notes) = fields.notes {
        item.notes = Some(notes);
    }

    if let Some(sort_order) = fields.sort_order {
        item.sort_order = sort_order;
    }

    if let Some(ref new_parent) = fields.parent_id {
        if let Some(ref pid) = new_parent {
            queries::detect_cycle(&pool, &id, pid).await?;
            queries::validate_parent_exists(&pool, pid).await?;
        }
        item.parent_id = new_parent.clone();
    }

    item.updated_at = queries::now_utc();

    queries::update_item(&pool, &item).await?;

    Ok(item)
}

#[tauri::command]
pub async fn delete_work_item(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    let now = queries::now_utc();
    queries::soft_delete_item(&pool, &id, &now).await
}

#[tauri::command]
pub async fn get_tree(pool: State<'_, SqlitePool>) -> Result<Vec<WorkItem>, String> {
    queries::fetch_all_live(&pool).await
}
