# CDP Validation Approach

## Decision

Use Node.js scripts with raw WebSocket connections to the WebKit Inspector Protocol
for all automated validation defined in SPEC.md § 12.

## Context

SPEC.md requires that v0.1 completion is verified by automated CDP scripts that run
against the live Tauri application without human inspection. On Linux, Tauri 2 uses
WebKitGTK which exposes a WebKit Inspector endpoint (protocol-compatible with CDP for
the operations we need) when `WEBKIT_INSPECTOR_SERVER` is set.

## Approach

- **Connection**: Scripts connect to the WebKit Inspector Server via WebSocket. The
  endpoint is discovered by querying `http://<host>:<port>/json/list`.
- **Execution**: All test logic runs through `Runtime.evaluate`, executing JavaScript
  in the Tauri WebView context. This gives access to both the DOM (for UI assertions)
  and `window.__TAURI_INTERNALS__.invoke()` (for data layer assertions).
- **Console monitoring**: `Console.enable` + `Runtime.enable` domains are activated on
  connect to collect `console.error` calls for the zero-errors assertion.
- **Reporting**: Each script outputs `PASS` / `FAIL` per assertion with evidence, and
  exits with code 0 (all pass) or 1 (any failure).
- **Runner**: `run-all.mjs` executes all numbered scripts sequentially and reports a
  summary.

## Dependencies

- `ws` (npm, devDependency) — WebSocket client for Node.js.

## Startup

```sh
WEBKIT_INSPECTOR_SERVER=127.0.0.1:9222 cargo tauri dev
# In a separate terminal:
node tests/cdp/run-all.mjs
```

## Limitations

The following § 12.2 items require OS-level interaction that cannot be driven through
the WebView inspector:

| Item | Reason | Mitigation |
|---|---|---|
| Window close hides (not quits) | Requires OS window-manager close event | Verified manually; Rust handler logic is unit-testable |
| Tray icon click shows window | Requires system tray interaction | Verified manually; Rust handler logic is unit-testable |
| Quit exits with code 0 | Calling `quit_app` terminates the process and our connection | Verified manually |

These are documented as `SKIP` in `16-tray-and-window.mjs` with instructions for
manual verification.

## Static analysis

`05-no-hard-delete-audit.mjs` is not a CDP test — it reads Rust source files and greps
for `DELETE FROM work_items`. This validates § 12.1 item 6 at the source level since
the absence of hard deletes cannot be proven by runtime observation alone.

## Alternatives considered

- **Playwright**: Would require launching a separate browser rather than connecting to
  the Tauri WebView. Tauri IPC (`window.__TAURI_INTERNALS__`) is not available in an
  external browser, so data layer tests would not work.
- **tauri-driver (WebDriver)**: Viable but adds a Rust binary dependency and uses a
  different protocol than what the spec describes.
- **puppeteer-core**: Chrome-specific CDP client; WebKitGTK uses the WebKit Inspector
  Protocol which is similar but not identical.
