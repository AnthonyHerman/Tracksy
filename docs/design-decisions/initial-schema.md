# Initial Schema: work_items table

## Decision

The initial SQLite schema consists of a single `work_items` table as defined in SPEC.md § 5.1.

## Migration

File: `src-tauri/src/db/migrations/001_create_work_items.sql`

## Rollback

Drop the table: `DROP TABLE IF EXISTS work_items;`

This is the first migration on an empty database, so rollback is equivalent to starting fresh.

## Schema notes

- `id` is TEXT (UUID v4), not INTEGER — sync-readiness (GP-3).
- `parent_id` has `ON DELETE SET NULL` — if a parent is removed at the SQLite level, children become roots rather than being cascade-deleted. In practice, hard deletes never occur (GP-1), so this is a safety net only.
- `sort_order` is REAL for fractional indexing (GP-8).
- `deleted_at` nullable TEXT for soft deletes (GP-1).
- `created_at` and `updated_at` are TEXT (ISO 8601 UTC), written only by the Rust handler (GP-2).
- CHECK constraint on `status` enforces the five permitted values at the database level.
