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

/// Reassign sort_order as 1.0, 2.0, 3.0, ... for all live siblings of a given parent.
/// Pass `None` for root-level items. Runs in a transaction to prevent race conditions.
pub async fn rebalance_siblings(pool: &SqlitePool, parent_id: Option<&str>) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| format!("Database error: {}", e))?;

    let siblings = match parent_id {
        Some(pid) => {
            sqlx::query_as::<_, WorkItem>(
                "SELECT * FROM work_items WHERE parent_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC",
            )
            .bind(pid)
            .fetch_all(&mut *tx)
            .await
        }
        None => {
            sqlx::query_as::<_, WorkItem>(
                "SELECT * FROM work_items WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order ASC",
            )
            .fetch_all(&mut *tx)
            .await
        }
    }
    .map_err(|e| format!("Database error: {}", e))?;

    let now = now_utc();
    for (i, sibling) in siblings.iter().enumerate() {
        let new_order = (i + 1) as f64;
        if (sibling.sort_order - new_order).abs() > f64::EPSILON {
            sqlx::query("UPDATE work_items SET sort_order = ?, updated_at = ? WHERE id = ?")
                .bind(new_order)
                .bind(&now)
                .bind(&sibling.id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Database error: {}", e))?;
        }
    }

    tx.commit().await.map_err(|e| format!("Database error: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        let migration = include_str!("migrations/001_create_work_items.sql");
        for statement in migration.split(';') {
            let stmt = statement.trim();
            if !stmt.is_empty() {
                sqlx::query(stmt).execute(&pool).await.unwrap();
            }
        }

        pool
    }

    fn make_item(id: &str, title: &str, parent_id: Option<&str>, sort_order: f64) -> WorkItem {
        let now = now_utc();
        WorkItem {
            id: id.to_string(),
            parent_id: parent_id.map(|s| s.to_string()),
            title: title.to_string(),
            status: "todo".to_string(),
            notes: None,
            sort_order,
            created_at: now.clone(),
            updated_at: now,
            deleted_at: None,
        }
    }

    // --- § 12.1: Work item created at root level; appears in get_tree ---

    #[tokio::test]
    async fn create_root_item_appears_in_get_tree() {
        let pool = setup_pool().await;
        let item = make_item("id-1", "Root item", None, 1.0);
        insert_item(&pool, &item).await.unwrap();

        let all = fetch_all_live(&pool).await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "id-1");
        assert_eq!(all[0].title, "Root item");
        assert!(all[0].parent_id.is_none());
    }

    // --- § 12.1: Work item created as child; parent_id is set correctly ---

    #[tokio::test]
    async fn create_child_item_has_correct_parent_id() {
        let pool = setup_pool().await;
        let parent = make_item("parent-1", "Parent", None, 1.0);
        insert_item(&pool, &parent).await.unwrap();

        let child = make_item("child-1", "Child", Some("parent-1"), 1.0);
        insert_item(&pool, &child).await.unwrap();

        let fetched = fetch_item(&pool, "child-1").await.unwrap();
        assert_eq!(fetched.parent_id.as_deref(), Some("parent-1"));
    }

    // --- § 12.1: created_at and updated_at are present and valid ISO 8601 UTC ---

    #[tokio::test]
    async fn timestamps_are_valid_iso8601() {
        let pool = setup_pool().await;
        let item = make_item("id-1", "Test", None, 1.0);
        insert_item(&pool, &item).await.unwrap();

        let fetched = fetch_item(&pool, "id-1").await.unwrap();
        assert!(!fetched.created_at.is_empty());
        assert!(!fetched.updated_at.is_empty());
        // Parse to verify valid RFC 3339 / ISO 8601
        chrono::DateTime::parse_from_rfc3339(&fetched.created_at)
            .expect("created_at should be valid RFC 3339");
        chrono::DateTime::parse_from_rfc3339(&fetched.updated_at)
            .expect("updated_at should be valid RFC 3339");
    }

    // --- § 12.1: Soft delete sets deleted_at; item does not appear in get_tree ---

    #[tokio::test]
    async fn soft_delete_hides_item_from_get_tree() {
        let pool = setup_pool().await;
        let item = make_item("id-1", "To delete", None, 1.0);
        insert_item(&pool, &item).await.unwrap();

        let now = now_utc();
        soft_delete_item(&pool, "id-1", &now).await.unwrap();

        let all = fetch_all_live(&pool).await.unwrap();
        assert!(all.is_empty(), "Soft-deleted item should not appear in get_tree");
    }

    #[tokio::test]
    async fn soft_delete_sets_deleted_at() {
        let pool = setup_pool().await;
        let item = make_item("id-1", "To delete", None, 1.0);
        insert_item(&pool, &item).await.unwrap();

        let now = now_utc();
        soft_delete_item(&pool, "id-1", &now).await.unwrap();

        // Fetch directly (bypassing deleted_at filter) to verify the field
        let row: (Option<String>,) =
            sqlx::query_as("SELECT deleted_at FROM work_items WHERE id = ?")
                .bind("id-1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(row.0.is_some(), "deleted_at should be set after soft delete");
    }

    // --- § 12.1: No hard deletes (GP-1) ---
    // This is a code audit assertion: no DELETE FROM in the codebase.
    // Verified here by confirming the record still exists after soft delete.

    #[tokio::test]
    async fn soft_delete_preserves_record() {
        let pool = setup_pool().await;
        let item = make_item("id-1", "Preserved", None, 1.0);
        insert_item(&pool, &item).await.unwrap();

        soft_delete_item(&pool, "id-1", &now_utc()).await.unwrap();

        let count: (i32,) = sqlx::query_as("SELECT COUNT(*) FROM work_items WHERE id = ?")
            .bind("id-1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1, "Record must still exist after soft delete");
    }

    // --- § 12.1: parent_id cycle is rejected ---

    #[tokio::test]
    async fn cycle_detection_rejects_self_parent() {
        let pool = setup_pool().await;
        let item = make_item("id-1", "Self", None, 1.0);
        insert_item(&pool, &item).await.unwrap();

        let result = detect_cycle(&pool, "id-1", "id-1").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cycle detected"));
    }

    #[tokio::test]
    async fn cycle_detection_rejects_ancestor_loop() {
        let pool = setup_pool().await;
        // A -> B -> C, then try to set A.parent = C
        let a = make_item("a", "A", None, 1.0);
        let b = make_item("b", "B", Some("a"), 2.0);
        let c = make_item("c", "C", Some("b"), 3.0);
        insert_item(&pool, &a).await.unwrap();
        insert_item(&pool, &b).await.unwrap();
        insert_item(&pool, &c).await.unwrap();

        // Setting A's parent to C would create: C -> B -> A -> C (cycle)
        let result = detect_cycle(&pool, "a", "c").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cycle detected"));
    }

    #[tokio::test]
    async fn cycle_detection_allows_valid_reparent() {
        let pool = setup_pool().await;
        let a = make_item("a", "A", None, 1.0);
        let b = make_item("b", "B", None, 2.0);
        let c = make_item("c", "C", Some("a"), 3.0);
        insert_item(&pool, &a).await.unwrap();
        insert_item(&pool, &b).await.unwrap();
        insert_item(&pool, &c).await.unwrap();

        // Moving C from A to B is valid (no cycle)
        let result = detect_cycle(&pool, "c", "b").await;
        assert!(result.is_ok());
    }

    // --- § 12.1: Reorder sets sort_order; sibling values unchanged ---

    #[tokio::test]
    async fn reorder_changes_only_moved_item_sort_order() {
        let pool = setup_pool().await;
        let a = make_item("a", "A", None, 1.0);
        let b = make_item("b", "B", None, 2.0);
        let c = make_item("c", "C", None, 3.0);
        insert_item(&pool, &a).await.unwrap();
        insert_item(&pool, &b).await.unwrap();
        insert_item(&pool, &c).await.unwrap();

        // Move C between A and B: midpoint of 1.0 and 2.0 = 1.5
        let mut c_updated = fetch_item(&pool, "c").await.unwrap();
        c_updated.sort_order = 1.5;
        c_updated.updated_at = now_utc();
        update_item(&pool, &c_updated).await.unwrap();

        let a_after = fetch_item(&pool, "a").await.unwrap();
        let b_after = fetch_item(&pool, "b").await.unwrap();
        let c_after = fetch_item(&pool, "c").await.unwrap();

        assert_eq!(a_after.sort_order, 1.0, "A's sort_order must not change");
        assert_eq!(b_after.sort_order, 2.0, "B's sort_order must not change");
        assert_eq!(c_after.sort_order, 1.5, "C should have midpoint sort_order");

        // Verify ordering: A(1.0), C(1.5), B(2.0)
        let all = fetch_all_live(&pool).await.unwrap();
        let ids: Vec<&str> = all.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(ids, vec!["a", "c", "b"]);
    }

    // --- § 12.1: updated_at changes on mutation; created_at never changes ---

    #[tokio::test]
    async fn updated_at_changes_on_mutation_created_at_does_not() {
        let pool = setup_pool().await;
        let item = make_item("id-1", "Original", None, 1.0);
        insert_item(&pool, &item).await.unwrap();

        let before = fetch_item(&pool, "id-1").await.unwrap();
        let original_created = before.created_at.clone();
        let original_updated = before.updated_at.clone();

        // Small delay to ensure timestamp differs
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;

        let mut updated = before;
        updated.title = "Modified".to_string();
        updated.updated_at = now_utc();
        update_item(&pool, &updated).await.unwrap();

        let after = fetch_item(&pool, "id-1").await.unwrap();
        assert_eq!(after.created_at, original_created, "created_at must never change");
        assert_ne!(after.updated_at, original_updated, "updated_at must change on mutation");
    }

    // --- Status validation ---

    #[test]
    fn validate_status_accepts_all_five() {
        for s in &["todo", "active", "done", "blocked", "cancelled"] {
            assert!(validate_status(s).is_ok());
        }
    }

    #[test]
    fn validate_status_rejects_invalid() {
        assert!(validate_status("invalid").is_err());
        assert!(validate_status("").is_err());
    }

    // --- Parent validation ---

    #[tokio::test]
    async fn validate_parent_rejects_nonexistent() {
        let pool = setup_pool().await;
        let result = validate_parent_exists(&pool, "nonexistent").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn validate_parent_rejects_deleted_parent() {
        let pool = setup_pool().await;
        let item = make_item("parent-1", "Parent", None, 1.0);
        insert_item(&pool, &item).await.unwrap();
        soft_delete_item(&pool, "parent-1", &now_utc()).await.unwrap();

        let result = validate_parent_exists(&pool, "parent-1").await;
        assert!(result.is_err(), "Deleted parent should not be valid");
    }

    // --- Double soft-delete ---

    #[tokio::test]
    async fn double_soft_delete_returns_error() {
        let pool = setup_pool().await;
        let item = make_item("id-1", "Test", None, 1.0);
        insert_item(&pool, &item).await.unwrap();

        soft_delete_item(&pool, "id-1", &now_utc()).await.unwrap();
        let result = soft_delete_item(&pool, "id-1", &now_utc()).await;
        assert!(result.is_err(), "Second soft delete should fail");
    }

    // --- Rebalance siblings ---

    #[tokio::test]
    async fn rebalance_reassigns_integer_sort_orders() {
        let pool = setup_pool().await;
        // Create items with fractional sort_orders that need rebalancing
        let a = make_item("a", "A", None, 1.0);
        let b = make_item("b", "B", None, 1.5);
        let c = make_item("c", "C", None, 1.75);
        insert_item(&pool, &a).await.unwrap();
        insert_item(&pool, &b).await.unwrap();
        insert_item(&pool, &c).await.unwrap();

        rebalance_siblings(&pool, None).await.unwrap();

        let all = fetch_all_live(&pool).await.unwrap();
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].id, "a");
        assert_eq!(all[0].sort_order, 1.0);
        assert_eq!(all[1].id, "b");
        assert_eq!(all[1].sort_order, 2.0);
        assert_eq!(all[2].id, "c");
        assert_eq!(all[2].sort_order, 3.0);
    }

    #[tokio::test]
    async fn rebalance_preserves_order_for_children() {
        let pool = setup_pool().await;
        let parent = make_item("p", "Parent", None, 1.0);
        insert_item(&pool, &parent).await.unwrap();

        let c1 = make_item("c1", "C1", Some("p"), 0.5);
        let c2 = make_item("c2", "C2", Some("p"), 0.75);
        insert_item(&pool, &c1).await.unwrap();
        insert_item(&pool, &c2).await.unwrap();

        rebalance_siblings(&pool, Some("p")).await.unwrap();

        let c1_after = fetch_item(&pool, "c1").await.unwrap();
        let c2_after = fetch_item(&pool, "c2").await.unwrap();
        assert_eq!(c1_after.sort_order, 1.0);
        assert_eq!(c2_after.sort_order, 2.0);

        // Parent should be unchanged
        let p_after = fetch_item(&pool, "p").await.unwrap();
        assert_eq!(p_after.sort_order, 1.0);
    }

    // --- fetch_item does not return deleted items ---

    #[tokio::test]
    async fn fetch_item_excludes_deleted() {
        let pool = setup_pool().await;
        let item = make_item("id-1", "Test", None, 1.0);
        insert_item(&pool, &item).await.unwrap();
        soft_delete_item(&pool, "id-1", &now_utc()).await.unwrap();

        let result = fetch_item(&pool, "id-1").await;
        assert!(result.is_err(), "Deleted item should not be fetchable");
    }
}
