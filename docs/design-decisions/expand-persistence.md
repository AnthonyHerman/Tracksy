# Expand/Collapse Persistence

## Decision

Persist the set of expanded tree item IDs in `localStorage` under the key `tracksy:expanded`. On load, restore the set; on every toggle, write the updated set.

## Rationale

- Users expect their tree state to survive page reloads and app restarts.
- localStorage is the simplest persistence mechanism for UI-only state that doesn't belong in the database.
- The expanded set is small (just IDs), so serialization cost is negligible.

## Cleanup

Stale IDs (items that no longer exist) are harmless — they're never looked up. No periodic cleanup is needed.

## Rollback

Remove the localStorage read/write calls. The tree reverts to fully collapsed on load.
