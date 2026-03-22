# Notes Panel Design

## Decision

Add a detail/notes panel below the tree view. Clicking a tree item selects it and opens the panel. The panel shows the item's title (read-only) and an editable plain-text notes field.

## Rationale

- The `notes` field exists in the schema but has no UI — this completes the data model's surface area.
- SPEC.md § 13 defers the Markdown vs. plain text decision. We start with plain text (`<textarea>`) which is the simplest option and can be upgraded later.
- A bottom panel (rather than inline expansion or a modal) keeps the tree view uncluttered and avoids layout shifts.

## Keyboard shortcuts added

- **Ctrl+N** — Add a new root item (mirrors common "new item" conventions).
- **Escape** — Deselect the current item / close the notes panel.

These are lightweight additions that don't conflict with existing shortcuts (Ctrl+Q quit).

## Rollback

Remove the `NotesPanel` component and the selection state from `TreeView`. No schema or backend changes required.
