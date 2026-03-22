# Notes Panel Redesign

## Changes

1. **Vertical split layout** — tree on left, notes panel on right (replaces bottom panel)
2. **Resizable divider** — drag the border between tree and notes to resize
3. **Markdown toggle** — switch between raw textarea editing and rendered Markdown preview

## Rationale

- The horizontal split (tree on top, notes on bottom) compressed the tree view and made the notes feel like an afterthought.
- A vertical split gives both panes full height, which is more natural for a work-tracking app.
- Resizable divider lets users choose their own balance between tree and notes.
- Markdown rendering (using `marked` library) gives formatted output for notes with headers, lists, links, etc., while still allowing raw editing.

## Implementation

- Divider width persisted in `localStorage` under `tracksy:notes-width`.
- Markdown mode persisted in `localStorage` under `tracksy:notes-mode`.
- `marked` chosen as Markdown renderer: small, fast, zero dependencies, widely used.
- Rendered HTML is sanitized by disabling `html` input in marked options.

## Rollback

Revert to the previous NotesPanel component and TreeView layout.
