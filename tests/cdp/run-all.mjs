/**
 * Sequential test runner for all CDP validation scripts.
 *
 * Usage:
 *   # Start the app first:
 *   WEBKIT_INSPECTOR_SERVER=127.0.0.1:9222 cargo tauri dev
 *
 *   # Then run all tests:
 *   node tests/cdp/run-all.mjs
 *
 *   # Or run a single test:
 *   node tests/cdp/01-create-root-item.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const scripts = readdirSync(__dirname)
  .filter(f => /^\d{2}-.*\.mjs$/.test(f))
  .sort();

console.log(`\n=== Tracksy CDP Validation Suite ===`);
console.log(`Found ${scripts.length} test scripts\n`);

let passed = 0;
let failed = 0;
const results = [];

for (const script of scripts) {
  const path = join(__dirname, script);
  try {
    execFileSync('node', [path], { stdio: 'inherit', timeout: 60_000 });
    passed++;
    results.push({ script, status: 'PASS' });
  } catch (e) {
    failed++;
    results.push({ script, status: 'FAIL' });
  }
}

// Summary
console.log('\n=== Summary ===\n');
for (const { script, status } of results) {
  const marker = status === 'PASS' ? 'ok' : 'FAIL';
  console.log(`  [${marker}] ${script}`);
}
console.log(`\n  ${passed} passed, ${failed} failed out of ${scripts.length} scripts`);

process.exitCode = failed > 0 ? 1 : 0;
