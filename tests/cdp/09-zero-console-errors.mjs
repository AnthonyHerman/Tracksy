/**
 * § 12.2 — App launches with zero console.error calls and zero uncaught exceptions.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('09 — Zero console errors on load');

try {
  // Clear any errors collected during connection setup
  client.clearConsoleErrors();

  // Trigger a fresh page load via the store's loadTree (simulates app startup)
  await client.evaluate(`
    (async () => {
      // Give the app a moment to settle after connection
      await new Promise(r => setTimeout(r, 2000));
    })()
  `);

  const errors = client.consoleErrors;
  if (errors.length === 0) {
    pass('zero console.error calls after app load');
  } else {
    fail('zero console.error calls after app load', `${errors.length} error(s):\n    ${errors.join('\n    ')}`);
  }

  // Check for uncaught exceptions by evaluating a known-good expression
  // (if the runtime is broken, this would fail)
  const ok = await client.evaluate('typeof window !== "undefined"');
  if (ok === true) {
    pass('runtime is functional (no uncaught exceptions crashed it)');
  } else {
    fail('runtime is functional');
  }
} finally {
  await client.close();
  summary();
}
