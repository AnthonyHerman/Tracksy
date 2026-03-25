/**
 * CDP/WebKit Inspector connection library for Tracksy validation scripts.
 *
 * Connects to the WebKit Inspector endpoint exposed by Tauri when the app
 * is started with WEBKIT_INSPECTOR_SERVER=127.0.0.1:9222.
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
  #nextId = 0;
  /** @type {Map<number, {resolve: Function, reject: Function}>} */
  #pending = new Map();
  /** @type {string[]} */
  #consoleErrors = [];

  /**
   * Connect to the WebKit Inspector endpoint.
   * @param {{host?: string, port?: number}} opts
   */
  async connect(opts = {}) {
    const host = opts.host || process.env.CDP_HOST || DEFAULT_HOST;
    const port = opts.port || Number(process.env.CDP_PORT) || DEFAULT_PORT;

    // Discover inspectable targets
    let wsUrl;
    try {
      const res = await fetch(`http://${host}:${port}/json/list`);
      const targets = await res.json();
      if (!targets.length) throw new Error('No inspectable targets found');
      wsUrl = targets[0].webSocketDebuggerUrl;
    } catch (e) {
      throw new Error(
        `Cannot reach inspector at ${host}:${port}.\n` +
        `Start the app with: WEBKIT_INSPECTOR_SERVER=${host}:${port} cargo tauri dev\n` +
        `Original error: ${e.message}`
      );
    }

    // Establish WebSocket connection
    await new Promise((resolve, reject) => {
      this.#ws = new WebSocket(wsUrl);
      this.#ws.on('open', resolve);
      this.#ws.on('error', reject);
      this.#ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        // Resolve pending commands
        if (msg.id != null && this.#pending.has(msg.id)) {
          const { resolve } = this.#pending.get(msg.id);
          this.#pending.delete(msg.id);
          resolve(msg);
        }
        // Collect console errors (WebKit Inspector)
        if (msg.method === 'Console.messageAdded') {
          const m = msg.params?.message;
          if (m?.level === 'error') this.#consoleErrors.push(m.text);
        }
        // Collect console errors (CDP-style)
        if (msg.method === 'Runtime.consoleAPICalled') {
          if (msg.params?.type === 'error') {
            const text = msg.params.args?.map(a => a.value ?? a.description).join(' ');
            this.#consoleErrors.push(text);
          }
        }
      });
    });

    // Enable domains for console monitoring
    await this.#send('Console.enable');
    await this.#send('Runtime.enable');
  }

  /**
   * Send a protocol command and wait for its response.
   * @param {string} method
   * @param {object} params
   * @returns {Promise<object>}
   */
  #send(method, params = {}) {
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.#pending.has(id)) {
          this.#pending.delete(id);
          reject(new Error(`Timeout (${COMMAND_TIMEOUT_MS}ms) waiting for ${method} id:${id}`));
        }
      }, COMMAND_TIMEOUT_MS);
    });
  }

  /**
   * Evaluate JavaScript in the page context.
   * @param {string} expression
   * @returns {Promise<*>} The evaluated value
   */
  async evaluate(expression) {
    const response = await this.#send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    const { result } = response;
    if (result?.exceptionDetails) {
      const desc =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        'Unknown evaluation error';
      throw new Error(`evaluate() failed: ${desc}`);
    }
    return result?.result?.value;
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
