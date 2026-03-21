# Tracksy — Personal Work Tracker
## Product Specification v0.1

Status: Draft v1

Purpose: Define a personal desktop work tracking application that is buildable and maintainable
entirely by coding agents operating under harness engineering principles.

---

## 1. Problem Statement

Tracksy is a personal work tracking desktop application for Linux (KDE Plasma). It is a single-user
tool with no authentication. The owner of the machine is the only user.

The application solves four problems:

- It provides a persistent, structured place to track projects and the arbitrary-depth sub-work
  that belongs to them, replacing ad-hoc notes and mental overhead.
- It lives in the system tray so it is always one click away without occupying taskbar space.
- It stores data locally in SQLite with a schema designed to support future server sync without
  migration pain.
- It exposes the WebView via Chrome DevTools Protocol (CDP) so coding agents can boot the app,
  inspect its state, drive interactions, and validate behavior without human involvement.

The primary data model is a recursive tree of work items. A work item can represent a project, a
goal, a milestone, a task, or any other unit of work the user chooses to name. The hierarchy is
arbitrary depth. There is no enforced taxonomy — the user imposes meaning through naming and nesting.

---

## 2. Goals and Non-Goals

### 2.1 Goals

- Recursive tree of work items with arbitrary depth and no enforced node type.
- Full CRUD on work items via the UI with inline editing.
- Collapsible/expandable tree with drag-and-drop reordering of siblings.
- System tray integration on KDE Plasma (X11 and Wayland).
- Window hides on close; tray icon remains. App exits only via tray menu or Ctrl+Q.
- Local SQLite persistence via `tauri-plugin-sql`.
- Schema designed for future sync: UUIDs, soft deletes, server-side timestamps.
- CDP access enabled so agents can validate UI state and behavior without human QA.
- All interactive elements carry `data-testid` attributes for reliable agent targeting.
- Repository knowledge is the system of record: every architectural decision, taste preference,
  and constraint lives in a versioned markdown file before it influences agent behavior.

### 2.2 Non-Goals

- Authentication of any kind.
- Multi-user or multi-device sync (schema must support it; implementation is deferred).
- Reminders, notifications, or scheduled events.
- Time tracking.
- Attachments or file uploads.
- Mobile packaging (architecture must not preclude it; implementation is deferred).
- Cloud backup.
- Tagging, labels, or search.
- Windows or macOS support.

---

## 3. System Overview

### 3.1 Components

1. `Tauri Shell` (Rust)
   - Owns window lifecycle, tray icon and menu, SQLite access, IPC command dispatch, and the
     `devtools` feature flag that exposes the WebView for CDP connections.

2. `React Frontend` (TypeScript + Vite)
   - Owns all UI logic. Communicates with the Rust shell exclusively via Tauri `invoke` IPC.
   - Never touches the filesystem or database directly.

3. `Zustand Store`
   - Single in-memory store for UI state. Calls Tauri commands and optimistically updates local
     state. The store is the UI source of truth; SQLite is the persistence source of truth.

4. `SQLite Database`
   - One table: `work_items`. Schema defined in Section 5.
   - Accessed only via the Rust command layer.

5. `CDP Validation Layer`
   - Not a production runtime component — a convention. CDP scripts in `tests/cdp/` drive the app
     for agent validation. The Tauri `devtools` feature makes this possible in dev builds.

### 3.2 Abstraction Layers

Tracksy is easiest to extend when kept in these layers:

1. `Shell Layer` (Rust/Tauri) — OS integration, window management, tray, SQLite commands.
2. `State Layer` (Zustand) — in-memory tree, optimistic updates, command invocation.
3. `UI Layer` (React) — tree rendering, inline editing, drag-and-drop, status controls.
4. `Persistence Layer` (SQLite) — durable storage, accessed only via Shell Layer.
5. `Validation Layer` (CDP scripts) — agent-driven behavioral validation, no production dependency.

Dependency direction: UI → State → Shell → Persistence. No layer may import from a layer above it.

### 3.3 External Dependencies

- Tauri 2 (Rust shell and WebView host)
- React 18 + Vite (frontend framework and build tooling)
- TypeScript (frontend language)
- Zustand (state management)
- Tailwind CSS (styling — utility classes only, no CSS modules)
- TanStack Virtual (virtualized tree rendering for large item counts)
- `tauri-plugin-sql` (SQLite access from Rust)
- `tauri-plugin-positioner` (window position restoration across sessions)
- Zod (IPC boundary validation in the frontend)
- KDE Plasma system tray via Tauri's tray API

---

## 4. Domain Model

### 4.1 WorkItem

The single entity in the system. All persisted data is a flat table of WorkItems; the tree is
constructed in memory by the frontend from `parent_id` references.

Fields:

- `id` (TEXT, PRIMARY KEY)
  - UUID v4. Generated client-side before the Tauri command is invoked. Never a sequential integer.
- `parent_id` (TEXT, nullable, FK → work_items.id ON DELETE SET NULL)
  - NULL means root node.
- `title` (TEXT, NOT NULL)
  - Display label. Required. May not be empty string after trimming.
- `status` (TEXT, NOT NULL, DEFAULT 'todo')
  - Permitted values: `todo`, `active`, `done`, `blocked`, `cancelled`.
  - Enforced by CHECK constraint at schema level and validated in the Rust handler.
- `notes` (TEXT, nullable)
  - Freetext. May be null or empty string interchangeably.
- `sort_order` (REAL, NOT NULL, DEFAULT 0)
  - Fractional index for sibling ordering. See Section 5.2.
- `created_at` (TEXT, NOT NULL)
  - ISO 8601 UTC string. Written by Rust command handler only. Never by the frontend.
- `updated_at` (TEXT, NOT NULL)
  - ISO 8601 UTC string. Written by Rust command handler only. Never by the frontend.
- `deleted_at` (TEXT, nullable)
  - NULL = live. Non-null = soft-deleted. Hard deletes are not permitted.

### 4.2 In-Memory Store Shape

```typescript
interface StoreState {
  items: Map<string, WorkItem>;      // keyed by id, non-deleted items only
  rootIds: string[];                 // ordered ids where parent_id is null
  childrenMap: Map<string, string[]>; // parent_id → ordered child ids
  isLoading: boolean;
  error: string | null;
}
```

The frontend builds this structure from the flat array returned by `get_tree`. The Rust layer
never assembles nested structures.

---

## 5. Persistence Specification

### 5.1 Schema

```sql
CREATE TABLE work_items (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES work_items(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'todo'
                CHECK(status IN ('todo','active','done','blocked','cancelled')),
  notes       TEXT,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE INDEX idx_work_items_parent  ON work_items(parent_id);
CREATE INDEX idx_work_items_status  ON work_items(status);
CREATE INDEX idx_work_items_deleted ON work_items(deleted_at);
```

Schema changes require a migration file in `src-tauri/src/db/migrations/` numbered sequentially
(e.g. `002_add_notes_index.sql`) and a design decision record in `docs/design-decisions/`. No
migration may alter the sync-readiness invariants (UUIDs, soft deletes, server-side timestamps)
without explicit architecture review documented before the change lands.

### 5.2 Sort Order

Sibling items are ordered by `sort_order` ascending. Reordering uses fractional indexing: the new
`sort_order` for a moved item is the arithmetic midpoint between its new neighbors' `sort_order`
values. This avoids bulk rewrites of sibling values on every reorder.

Invariants:
- Never shift `sort_order` of siblings when reordering. Move only the target item.
- If midpoint precision falls below `1e-10`, trigger a rebalance: renumber all siblings in that
  parent with integer spacing (1.0, 2.0, 3.0, ...) in a single atomic transaction.
- Rebalance is rare by design. If it happens more than once per session, investigate.

### 5.3 Timestamp Invariants

`created_at` and `updated_at` are always written by the Rust command handler using UTC wall time.
The frontend never provides these values. This is a deliberate sync-readiness invariant: when a
sync layer is added, timestamps must be trustworthy regardless of the client's clock state or
timezone configuration.

### 5.4 Soft Delete Invariants

Deletion sets `deleted_at` to current UTC time. The record remains. Hard deletes are not permitted.
`get_tree` and all read operations filter `WHERE deleted_at IS NULL`.

Children of a soft-deleted parent are not automatically deleted. Their `parent_id` points to a
deleted record and they become orphaned. The current behavior for orphaned items is: hide them
(they do not appear in `get_tree` because `get_tree` returns items where `deleted_at IS NULL`,
which orphans still satisfy if they themselves are not deleted). This means a parent soft-delete
effectively hides the subtree. This behavior must be documented in `docs/design-decisions/`
when first validated.

---

## 6. IPC Command Surface

The frontend communicates with the database only through these Tauri commands. No other access
path is permitted.

Invocation pattern: `await invoke('<command_name>', { ...args })` from the frontend.

```
create_work_item(
  id: string,           // UUID v4, generated by caller
  title: string,        // trimmed, must be non-empty
  parent_id?: string,   // omit for root item
  notes?: string,
  status?: string,      // defaults to 'todo'
  sort_order: number    // caller computes midpoint before invoking
) -> WorkItem

update_work_item(
  id: string,
  fields: {
    title?: string,
    status?: string,
    notes?: string,
    sort_order?: number,
    parent_id?: string | null
  }
) -> WorkItem

delete_work_item(
  id: string            // sets deleted_at; never hard deletes
) -> void

get_tree() -> WorkItem[]
  // Returns all non-deleted items as a flat array.
  // Frontend builds the tree from parent_id references.
  // Ordered by sort_order within each parent group.
```

Rust command handler responsibilities:
- Set `created_at` on create. Set `updated_at` on every mutating command.
- Validate `parent_id`, if provided, refers to a non-deleted item.
- Enforce cycle prevention: a `parent_id` update must not create an ancestor loop.
  Traverse the full ancestor chain before committing. Reject with a typed error if cycle detected.
- Validate `status` is one of the five permitted values (belt-and-suspenders beyond CHECK).
- Validate `title` is non-empty after trimming.
- Return typed `WorkItem` structs as JSON. Never return raw SQLite row maps.
- On error, return a typed error string; never panic.

---

## 7. Tray and Window Behavior

### 7.1 Launch

- Main window opens to its last saved position and size (restored via `tauri-plugin-positioner`).
- Tray icon registers in KDE system tray.
- Both window and tray icon are present from first launch.

### 7.2 Visibility Toggle

- Clicking X (window close button) hides the window. Does not quit.
- Clicking tray icon: shows window if hidden, hides window if visible.
- Tray context menu contains exactly: "Show Tracksy", "Quit".
- "Quit" and `Ctrl+Q` terminate the process cleanly (exit code 0).

### 7.3 Display Server Compatibility

Tray behavior differs between X11 and Wayland on KDE Plasma.

X11: uses `XEmbed` protocol. Tauri's built-in tray API handles this reliably.

Wayland: KDE uses the `StatusNotifierItem` (SNI) protocol via DBus. Tauri 2 supports SNI, but
`tauri-plugin-positioner` window restoration semantics may differ. Test explicitly.

Before implementing tray behavior: run `echo $XDG_SESSION_TYPE`, determine which display server
is in use, and document findings in `docs/design-decisions/display-server.md`. That file must
exist before tray implementation begins. An agent must not proceed with tray implementation
without first creating that file — this is a specification-before-execution requirement.

---

## 8. CDP / Agent Validation

### 8.1 Dev Mode Exposure

The Tauri `devtools` feature must be enabled in `tauri.conf.json` under the `build` section
for development builds. This exposes the WebView on a local CDP port logged by Tauri at startup.

Dev server: `http://localhost:1420`. CDP endpoint: logged to stdout at startup.

### 8.2 Standard Validation Loop

```
1. Boot app: cargo tauri dev
2. Connect to CDP endpoint from startup log
3. Snapshot initial DOM state using data-testid selectors
4. Execute action (CDP input simulation or Runtime.evaluate)
5. Snapshot post-action DOM state
6. Assert against data-testid attributes and DOM structure
   - Never assert against pixel coordinates
   - Never assert against CSS class names
   - Never assert against element indices
7. Report PASS or FAIL with both snapshots as evidence
```

### 8.3 data-testid Convention

Every interactive element must carry a `data-testid`. This is GP-5 and is a hard requirement.

Naming: `{component}-{element}` in kebab-case.

Required testids (non-exhaustive; add as features are built):

| testid | element |
|---|---|
| `tree-item-title` | title text/input of a tree node |
| `tree-item-status-select` | status dropdown on a tree node |
| `tree-item-expand-toggle` | expand/collapse control |
| `tree-item-add-child-button` | add child item control |
| `tree-item-delete-button` | delete item control |
| `root-add-item-button` | add root-level item button |
| `tray-menu-show` | "Show Tracksy" menu item |
| `tray-menu-quit` | "Quit" menu item |

CDP validation scripts live in `tests/cdp/`. One script per user journey. Existing scripts are
regression tests and must not be modified to accommodate new behavior — fix the behavior instead.

---

## 9. Golden Principles

These are mechanical invariants. Every line of code in this repository must satisfy them.

Validate output against all of them before surfacing results. If output violates a principle,
fix it. Do not surface violations expecting a human to catch them. If uncertain whether output
violates a principle, state the uncertainty explicitly and stop rather than proceeding silently.

**GP-1: No hard deletes.**
`deleted_at` is set. Records are never removed from the database. This is non-negotiable. There
is no exception path. If a migration or cleanup task appears to require hard deletion, stop and
surface it as a design decision before proceeding.

**GP-2: Timestamps are server-side only.**
`created_at` and `updated_at` are written by the Rust command handler using UTC wall time.
The frontend never writes these fields. Violation corrupts sync semantics.

**GP-3: IDs are UUID v4.**
No sequential integers. No auto-increment. IDs are generated in the frontend using a UUID v4
library before the Tauri command is invoked. The database never generates IDs.

**GP-4: Zod validation at the IPC boundary.**
All data returned from Tauri commands is parsed through a Zod schema in `src/types/` before
entering the Zustand store. Raw JSON is never trusted directly.

**GP-5: data-testid on all interactive elements.**
Every button, input, select, tree node title, expand toggle, and menu item carries a `data-testid`
following the `{component}-{element}` convention.

**GP-6: Frontend never imports tauri-plugin-sql.**
All database access goes through named Tauri commands. The frontend is not aware of the database.

**GP-7: Tailwind only.**
No inline styles. No CSS modules. No styled-components. No custom CSS outside Tailwind utilities
unless a specific exception is documented in `docs/design-decisions/`.

**GP-8: Fractional sort_order.**
Reordering uses midpoint fractional indexing. Sibling values are never bulk-shifted.

**GP-9: Cycle prevention.**
The Rust handler must reject any `parent_id` update that creates an ancestor loop.

**GP-10: No undocumented decisions.**
Any architectural decision, alignment, or taste preference that shapes this codebase must exist
as a versioned markdown file in `docs/design-decisions/` before it can influence agent behavior.
If it lives only in a chat thread, a comment, or a person's memory — it does not exist.

---

## 10. Repository Layout

```
axiom/
├── AGENTS.md                         # entry point — map, not manual
├── SPEC.md                           # this file
├── ARCHITECTURE.md                   # domain/layer map (grows with codebase)
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   │   └── work_items.rs         # IPC command implementations
│   │   └── db/
│   │       ├── migrations/           # .sql files, numbered sequentially
│   │       └── queries.rs            # typed query helpers
│   └── tauri.conf.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── store/
│   │   └── workItems.ts              # Zustand store
│   ├── components/
│   │   ├── Tree/
│   │   │   ├── TreeView.tsx
│   │   │   ├── TreeItem.tsx
│   │   │   └── TreeItem.test.tsx
│   │   └── Tray/
│   ├── hooks/
│   ├── types/
│   │   ├── workItem.ts               # TypeScript interfaces
│   │   └── workItem.schema.ts        # Zod schemas
│   └── lib/
│       ├── uuid.ts                   # UUID v4 generation
│       ├── fractional.ts             # midpoint sort_order utilities
│       └── tree.ts                   # flat array → tree construction
├── docs/
│   ├── design-decisions/
│   │   └── display-server.md         # REQUIRED before tray implementation
│   └── plans/
│       ├── active/
│       └── completed/
├── tests/
│   └── cdp/
│       ├── README.md                 # validation loop documentation
│       ├── 01-create-root-item.js
│       ├── 02-create-child-item.js
│       └── ...                       # one file per user journey
└── package.json
```

---

## 11. Failure Model

### 11.1 Failure Classes

1. `IPC Failures` — Tauri command returns error. Handle at the store layer. Surface to UI.
   Do not crash. Do not retry silently.

2. `Schema Validation Failures` — Zod parse fails on Tauri response. Log the raw payload.
   Surface an error state. Do not place unvalidated data in the store under any circumstances.

3. `Cycle Rejection` — Rust rejects a `parent_id` update. Surface as user-visible error.
   Do not silently discard.

4. `Tray Registration Failure` — rare display server compatibility issue. Log and continue.
   App must remain functional without tray. Do not crash.

5. `CDP Assertion Failure` — indicates a regression. Fix the behavior, not the test.

### 11.2 Failure Classification (agent guidance)

Before deciding how to respond to any failure, classify it:

- TRANSIENT: likely temporary; a retry would succeed (e.g. disk contention during write).
  Retry once. Escalate if it persists. Do not mask by proceeding without the result.
- PERMANENT: stable condition; retry will not help (constraint violation, type mismatch, cycle
  detected). Acknowledge and stop. Do not retry.
- AMBIGUOUS: cannot determine if transient or permanent. Default to PERMANENT. A transient
  failure treated as permanent wastes one attempt. A permanent failure treated as transient
  wastes all remaining attempts and delays the actual fix.

When failing, the diagnosis is part of the output. "The command failed" is less useful than
"The command failed with error X, which suggests Y."

### 11.3 Reversibility Hierarchy (agent guidance)

Before any action that modifies data, grade its reversibility:

- INSTANT REVERT: soft deletes, Zustand state updates (SQLite is the backup). Prefer these.
- RECOVERABLE: any SQLite mutation. The soft-delete pattern ensures records are never lost.
- DIFFICULT: schema migrations without a documented rollback path. Pause and document before executing.
- IRREVERSIBLE: by design, Tracksy has no irreversible operations. If an action is being considered
  that has no recovery path, stop and surface it as a design issue before proceeding.

---

## 12. Validation Matrix

v0.1 is complete when all of the following pass via automated CDP scripts without human inspection.

### 12.1 Data Layer

- Work item created at root level; appears in `get_tree` response.
- Work item created as child; `parent_id` is set correctly.
- `created_at` and `updated_at` are present and valid ISO 8601 UTC strings.
- `id` is a valid UUID v4 string.
- Soft delete sets `deleted_at`; item does not appear in subsequent `get_tree`.
- No code path in the Rust layer executes `DELETE FROM work_items`.
- `parent_id` cycle is rejected: attempting to set an item as its own ancestor returns an error.
- Reorder sets moved item's `sort_order` to the midpoint of neighbors.
- Sibling `sort_order` values are unchanged after a reorder of a different item.
- `updated_at` changes on every mutating command; `created_at` never changes after creation.

### 12.2 UI and Tray

- App launches with zero `console.error` calls and zero uncaught exceptions.
- Tree renders root items visible on load.
- Expand toggle reveals children; collapse hides them.
- Inline title edit updates the displayed title and persists to database.
- Status change updates visual state and persists to database.
- Done items are visually distinguished from active items.
- Drag-and-drop reordering persists across app restart.
- All interactive elements carry `data-testid` per convention in Section 8.3.
- Window close hides the window; tray icon remains.
- Tray icon click shows the window.
- "Quit" in tray menu exits the process with code 0.

### 12.3 Persistence

- All mutations persist across app restart (cold boot, not just state refresh).
- `get_tree` after restart returns identical items as before restart.
- Soft-deleted items do not reappear after restart.

---

## 13. Deferred Decisions

The following are intentionally unresolved. Agents must not invent answers for them.
When the time comes, each must be resolved via a documented design decision before implementation.

- **Sync transport**: remote database target (Postgres, managed service, other) not yet chosen.
- **Conflict resolution**: last-write-wins vs. CRDT not yet decided.
- **Orphan behavior on parent delete**: current implicit behavior (children become hidden) must be
  explicitly documented and validated before v0.2.
- **Display server**: X11 vs. Wayland tray specifics must be documented in
  `docs/design-decisions/display-server.md` before tray implementation begins.
- **Mobile packaging**: Tauri Mobile vs. Capacitor not yet evaluated.
- **Rebalance trigger threshold**: `1e-10` is the working default until documented otherwise.
- **Notes field rendering**: plain text vs. Markdown rendering not yet decided.
