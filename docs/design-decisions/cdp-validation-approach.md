# CDP Validation Approach

## Decision

Use Node.js scripts with WebSocket connections to the WebKit Inspector HTTP Server
for all automated validation defined in SPEC.md § 12.

## Context

SPEC.md requires that v0.1 completion is verified by automated CDP scripts that run
against the live Tauri application without human inspection. On Linux, Tauri 2 uses
WebKitGTK which exposes a WebKit Inspector endpoint when the appropriate environment
variable is set.

### WebKitGTK inspector variants

WebKitGTK exposes two different inspector server modes:

- `WEBKIT_INSPECTOR_SERVER` — uses a **custom binary GVariant protocol** over TCP.
  No third-party clients exist for this protocol. Not usable.
- `WEBKIT_INSPECTOR_HTTP_SERVER` — uses **HTTP + WebSocket**. The HTTP endpoint
  serves an HTML page listing inspectable targets. Each target has a WebSocket URL
  for the inspector protocol. **This is what we use.**

## Approach

- **Connection**: Scripts fetch `http://<host>:<port>/` to discover the WebSocket
  path (parsed from the HTML), then connect via WebSocket.
- **Target routing**: WebKitGTK's inspector uses a `Target.sendMessageToTarget` /
  `Target.dispatchMessageFromTarget` multiplexing layer. All protocol commands are
  wrapped in this outer envelope.
- **Execution**: `Runtime.evaluate` executes JavaScript in the Tauri WebView context,
  giving access to both the DOM and `window.__TAURI_INTERNALS__.invoke()`.
- **Async workaround**: WebKit Inspector's `awaitPromise` parameter is non-functional
  (always returns `{}`). Async expressions are executed via a global callback slot
  and polled until the JSON-serialized result arrives.
- **Console monitoring**: `Console.enable` is activated on the target to collect
  `console.error` calls for the zero-errors assertion.
- **Reporting**: Each script outputs `PASS` / `FAIL` per assertion with evidence.
- **Runner**: `run-all.mjs` executes all numbered scripts sequentially.

## Dependencies

- `ws` (npm, devDependency) — WebSocket client for Node.js.

## Startup

```sh
WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9222 WEBKIT_DISABLE_DMABUF_RENDERER=1 cargo tauri dev
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

- **WEBKIT_INSPECTOR_SERVER** (binary protocol): Uses a custom GVariant-over-TCP
  binary protocol. No third-party clients exist. Unusable from Node.js.
- **Playwright**: Would require launching a separate browser rather than connecting to
  the Tauri WebView. Tauri IPC is not available in an external browser.
- **tauri-driver (WebDriver)**: Viable but adds a Rust binary dependency and uses a
  different protocol than what the spec describes.
- **puppeteer-core**: Chrome-specific CDP client; incompatible with WebKit's target
  multiplexing layer.
