/**
 * § 12.1 — No code path in the Rust layer executes DELETE FROM work_items.
 *
 * This is a static source code audit, not a CDP test.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, pass, fail, summary } from './lib/cdp.mjs';

describe('05 — No hard delete audit (static)');

const RUST_SRC = join(import.meta.dirname, '..', '..', 'src-tauri', 'src');

async function collectRustFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectRustFiles(full));
    } else if (entry.name.endsWith('.rs')) {
      files.push(full);
    }
  }
  return files;
}

try {
  const files = await collectRustFiles(RUST_SRC);
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/DELETE\s+FROM\s+work_items/i.test(lines[i])) {
        const relative = file.replace(RUST_SRC + '/', '');
        violations.push(`${relative}:${i + 1}: ${lines[i].trim()}`);
      }
    }
  }

  if (violations.length === 0) {
    pass(`no DELETE FROM work_items found in ${files.length} Rust source files`);
  } else {
    fail('no DELETE FROM work_items in Rust sources', `violations:\n    ${violations.join('\n    ')}`);
  }
} catch (e) {
  fail('static audit completed', e.message);
}

summary();
