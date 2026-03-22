# Sort Order Rebalancing

## Problem

Fractional sort_order values (midpoint insertion) lose precision after many reorderings. Per SPEC.md § 5.2, when adjacent values differ by less than 1e-10, floating-point precision degrades and ordering becomes unreliable.

## Decision

Add a server-side `rebalance_siblings` command that reassigns sort_order values as 1.0, 2.0, 3.0, ... for all live siblings of a given parent (or all roots when parent is null). The frontend calls this automatically after any drag-and-drop when `needsRebalance()` detects adjacent values are too close.

## Why server-side

- Sort_order is persisted in SQLite; rebalancing must update all affected rows atomically.
- The frontend already sends the reorder via `update_work_item`; the rebalance is a separate follow-up call that refreshes the full tree.
- Server-side timestamps (GP-2) are maintained since the Rust handler writes `updated_at`.

## Trigger

After every drag-and-drop, the frontend scans the affected sibling group for any adjacent pair closer than 1e-10. If found, it calls `rebalance_siblings` for that parent_id and reloads the tree.

## Rollback

Remove the `rebalance_siblings` command and the post-drop check. The app continues to work — precision loss just isn't corrected.
