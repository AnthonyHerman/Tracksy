# CDP Validation Scripts

Automated validation for SPEC.md § 12 (Validation Matrix). These scripts connect
to the Tauri app's WebView via the WebKit Inspector Protocol and verify each
requirement without human inspection.

## Prerequisites

- Node.js 18+
- `npm install` (the `ws` package must be installed)
- The Tauri app running with the inspector server enabled

## Running

```sh
# Terminal 1: Start the app with inspector enabled
WEBKIT_INSPECTOR_SERVER=127.0.0.1:9222 cargo tauri dev

# Terminal 2: Run all validation scripts
node tests/cdp/run-all.mjs

# Or run a single script
node tests/cdp/01-create-root-item.mjs
```

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `CDP_HOST` | `127.0.0.1` | Inspector server host |
| `CDP_PORT` | `9222` | Inspector server port |

## Scripts

| Script | Spec ref | What it validates |
|---|---|---|
| 01 | § 12.1 | Root item creation, appears in get_tree |
| 02 | § 12.1 | Child item creation, parent_id set correctly |
| 03 | § 12.1 | ID is UUID v4, timestamps are ISO 8601 UTC |
| 04 | § 12.1 | Soft delete: deleted_at set, item hidden from get_tree |
| 05 | § 12.1 | No `DELETE FROM work_items` in Rust source (static audit) |
| 06 | § 12.1 | Cycle rejection: ancestor loops and self-reference blocked |
| 07 | § 12.1 | Reorder uses midpoint; sibling sort_orders unchanged |
| 08 | § 12.1 | updated_at changes on mutation; created_at never changes |
| 09 | § 12.2 | Zero console.error on app load |
| 10 | § 12.2 | Tree renders root items on load |
| 11 | § 12.2 | Expand/collapse reveals and hides children |
| 12 | § 12.2 | Inline title edit updates DOM and persists |
| 13 | § 12.2 | Status change persists; done items visually distinct |
| 14 | § 12.2 | All required data-testid attributes present |
| 15 | § 12.3 | Mutations persist across store reload; soft deletes stick |
| 16 | § 12.2 | Tray/window behavior (source audit + manual steps) |

## Architecture

See `docs/design-decisions/cdp-validation-approach.md` for the rationale behind
this approach and its known limitations.

### What can't be tested via CDP

- Window close hides (not quits) — requires OS window-manager event
- Tray icon click shows window — requires system tray interaction
- Quit exits with code 0 — calling quit terminates the test session

Script 16 documents manual verification steps for these.
