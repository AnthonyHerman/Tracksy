/**
 * CDP/WebKit Inspector connection library for Tracksy validation scripts.
 *
 * Connects to the WebKit Inspector HTTP endpoint exposed by Tauri when the
 * app is started with WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9222.
 *
 * Usage:
 *   import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';
 *   const client = new CDPClient();
 *   await client.connect();
 *   // ... run assertions ...
 *   await client.close();
 */

import WebSocket from 'ws';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9222;
const COMMAND_TIMEOUT_MS = 10_000;

export class CDPClient {
  /** @type {WebSocket|null} */
  #ws = null;
  #outerNextId = 0;
  #innerNextId = 0;
  /** @type {string|null} */
  #targetId = null;
  /** @type {Map<number, {resolve: Function, reject: Function}>} */
  #outerPending = new Map();
  /** @type {Map<number, {resolve: Function, reject: Function}>} */
  #innerPending = new Map();
  /** @type {string[]} */
  #consoleErrors = [];

  /**
   * Connect to the WebKit Inspector HTTP endpoint.
   * @param {{host?: string, port?: number}} opts
   */
  async connect(opts = {}) {
    const host = opts.host || process.env.CDP_HOST || DEFAULT_HOST;
    const port = opts.port || Number(process.env.CDP_PORT) || DEFAULT_PORT;

    // Discover inspectable targets from WebKitGTK's HTTP inspector page
    let wsUrl;
    try {
      const res = await fetch(`http://${host}:${port}/`);
      const html = await res.text();
      // Parse WebSocket path from the HTML onclick handler:
      //   window.open('Main.html?ws=' + window.location.host + '/socket/1/1/WebPage', ...)
      const match = html.match(/\/socket\/\d+\/\d+\/\w+/);
      if (!match) throw new Error('No inspectable targets found in inspector page');
      wsUrl = `ws://${host}:${port}${match[0]}`;
    } catch (e) {
      throw new Error(
        `Cannot reach inspector at ${host}:${port}.\n` +
        `Start the app with: WEBKIT_INSPECTOR_HTTP_SERVER=${host}:${port} cargo tauri dev\n` +
        `Original error: ${e.message}`
      );
    }

    // Establish WebSocket connection and wait for target
    await new Promise((resolve, reject) => {
      this.#ws = new WebSocket(wsUrl);
      this.#ws.on('error', reject);
      this.#ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        this.#handleMessage(msg);
      });
      this.#ws.on('open', () => {
        // Wait for the Target.targetCreated event to get the targetId
        const check = setInterval(() => {
          if (this.#targetId) { clearInterval(check); resolve(); }
        }, 50);
        setTimeout(() => { clearInterval(check); reject(new Error('Timeout waiting for target')); }, COMMAND_TIMEOUT_MS);
      });
    });

    // Enable console monitoring on the target
    await this.#sendToTarget('Console.enable');
  }

  /**
   * Handle incoming WebSocket messages. Routes outer-level responses and
   * target-dispatched messages to their respective pending maps.
   */
  #handleMessage(msg) {
    // Outer-level response (e.g. Target.sendMessageToTarget ack)
    if (msg.id != null && this.#outerPending.has(msg.id)) {
      const { resolve } = this.#outerPending.get(msg.id);
      this.#outerPending.delete(msg.id);
      resolve(msg);
    }
    // Target created — capture the targetId
    if (msg.method === 'Target.targetCreated') {
      this.#targetId = msg.params?.targetInfo?.targetId;
    }
    // Messages dispatched from the target (inner protocol)
    if (msg.method === 'Target.dispatchMessageFromTarget') {
      const inner = JSON.parse(msg.params.message);
      // Resolve pending inner commands
      if (inner.id != null && this.#innerPending.has(inner.id)) {
        const { resolve } = this.#innerPending.get(inner.id);
        this.#innerPending.delete(inner.id);
        resolve(inner);
      }
      // Collect console errors from inner events
      if (inner.method === 'Console.messageAdded') {
        const m = inner.params?.message;
        if (m?.level === 'error') this.#consoleErrors.push(m.text || m.messageText);
      }
    }
  }

  /**
   * Send a command at the outer (Target) level.
   * @param {string} method
   * @param {object} params
   * @returns {Promise<object>}
   */
  #sendOuter(method, params = {}) {
    const id = ++this.#outerNextId;
    return new Promise((resolve, reject) => {
      this.#outerPending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.#outerPending.has(id)) {
          this.#outerPending.delete(id);
          reject(new Error(`Timeout (${COMMAND_TIMEOUT_MS}ms) waiting for ${method} id:${id}`));
        }
      }, COMMAND_TIMEOUT_MS);
    });
  }

  /**
   * Send a command to the inspected target via Target.sendMessageToTarget.
   * @param {string} method
   * @param {object} params
   * @returns {Promise<object>}
   */
  #sendToTarget(method, params = {}) {
    const innerId = ++this.#innerNextId;
    const innerMsg = JSON.stringify({ id: innerId, method, params });
    return new Promise((resolve, reject) => {
      this.#innerPending.set(innerId, { resolve, reject });
      this.#sendOuter('Target.sendMessageToTarget', {
        targetId: this.#targetId,
        message: innerMsg,
      }).catch(reject);
      setTimeout(() => {
        if (this.#innerPending.has(innerId)) {
          this.#innerPending.delete(innerId);
          reject(new Error(`Timeout (${COMMAND_TIMEOUT_MS}ms) waiting for target ${method} id:${innerId}`));
        }
      }, COMMAND_TIMEOUT_MS);
    });
  }

  /**
   * Low-level evaluate: sends Runtime.evaluate synchronously (no awaitPromise,
   * which is broken in WebKit Inspector). Returns the raw protocol result.
   * @param {string} expression
   * @returns {Promise<object>} Raw result object from the protocol
   */
  async #evalRaw(expression) {
    const response = await this.#sendToTarget('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });
    const { result } = response;
    if (result?.wasThrown) {
      const desc = result.result?.description || 'Unknown evaluation error';
      throw new Error(`evaluate() failed: ${desc}`);
    }
    return result?.result?.value;
  }

  /**
   * Evaluate JavaScript in the page context.
   *
   * WebKit Inspector's `awaitPromise` parameter is non-functional — awaited
   * promises always return `{}`. To work around this, async expressions are
   * executed via a global callback slot and polled until the result arrives.
   *
   * @param {string} expression
   * @returns {Promise<*>} The evaluated value
   */
  async evaluate(expression) {
    const ticket = `__cdp_${++this.#innerNextId}`;
    // Kick off the async expression; store JSON-serialized result in a global.
    await this.#evalRaw(`
      (async () => {
        try {
          const __r = await (${expression});
          window.${ticket} = JSON.stringify(__r ?? null);
        } catch (__e) {
          window.${ticket} = JSON.stringify({__cdp_error: __e.message || String(__e)});
        }
      })()
    `);
    // Poll until the result is available (sync expressions resolve immediately).
    const start = Date.now();
    while (Date.now() - start < COMMAND_TIMEOUT_MS) {
      const raw = await this.#evalRaw(`window.${ticket}`);
      if (raw !== undefined && raw !== null) {
        // Clean up the global
        await this.#evalRaw(`delete window.${ticket}`);
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.__cdp_error) {
          throw new Error(`evaluate() failed: ${parsed.__cdp_error}`);
        }
        return parsed;
      }
      await this.sleep(50);
    }
    throw new Error(`evaluate() timed out after ${COMMAND_TIMEOUT_MS}ms`);
  }

  /**
   * Call a Tauri command via the IPC bridge.
   * @param {string} command - Tauri command name
   * @param {object} args - Command arguments
   * @returns {Promise<*>} Command result
   */
  async invoke(command, args = {}) {
    return this.evaluate(
      `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`
    );
  }

  /**
   * Poll until an expression evaluates truthy, or timeout.
   * @param {string} expression
   * @param {number} timeoutMs
   * @returns {Promise<*>}
   */
  async waitFor(expression, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.evaluate(expression);
      if (result) return result;
      await this.sleep(100);
    }
    throw new Error(`waitFor() timeout after ${timeoutMs}ms: ${expression}`);
  }

  /**
   * Sleep for the given duration.
   * @param {number} ms
   */
  async sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  /** @returns {string[]} Collected console.error messages */
  get consoleErrors() {
    return [...this.#consoleErrors];
  }

  /** Clear collected console errors. */
  clearConsoleErrors() {
    this.#consoleErrors.length = 0;
  }

  /** Close the WebSocket connection. */
  async close() {
    if (this.#ws) {
      this.#ws.close();
      this.#ws = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Test reporting helpers
// ---------------------------------------------------------------------------

let _testName = '';
let _passed = 0;
let _failed = 0;

/**
 * Name the current test script.
 * @param {string} name
 */
export function describe(name) {
  _testName = name;
  _passed = 0;
  _failed = 0;
  console.log(`\n--- ${name} ---`);
}

/**
 * Record a passing assertion.
 * @param {string} assertion
 * @param {string} [evidence]
 */
export function pass(assertion, evidence = '') {
  _passed++;
  console.log(`  PASS: ${assertion}${evidence ? ` -- ${evidence}` : ''}`);
}

/**
 * Record a failing assertion.
 * @param {string} assertion
 * @param {string} [evidence]
 */
export function fail(assertion, evidence = '') {
  _failed++;
  console.error(`  FAIL: ${assertion}${evidence ? ` -- ${evidence}` : ''}`);
  process.exitCode = 1;
}

/**
 * Record a skipped assertion.
 * @param {string} assertion
 * @param {string} [reason]
 */
export function skip(assertion, reason = '') {
  console.log(`  SKIP: ${assertion}${reason ? ` -- ${reason}` : ''}`);
}

/**
 * Print the summary for the current test script.
 * @returns {{passed: number, failed: number}}
 */
export function summary() {
  console.log(`  Result: ${_passed} passed, ${_failed} failed\n`);
  return { passed: _passed, failed: _failed };
}
