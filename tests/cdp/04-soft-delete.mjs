/**
 * § 12.1 — Soft delete sets deleted_at; item does not appear in subsequent get_tree.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('04 — Soft delete');

const id = crypto.randomUUID();

try {
  // Create an item
  await client.invoke('create_work_item', {
    id,
    title: '[CDP-TEST-04] To be deleted',
    sortOrder: 999.0,
  });

  // Verify it exists
  let tree = await client.invoke('get_tree');
  const existsBefore = Array.isArray(tree) && tree.some(i => i.id === id);
  if (existsBefore) {
    pass('item exists in get_tree before deletion');
  } else {
    fail('item exists in get_tree before deletion');
  }

  // Soft-delete
  await client.invoke('delete_work_item', { id });

  // Verify it no longer appears
  tree = await client.invoke('get_tree');
  const existsAfter = Array.isArray(tree) && tree.some(i => i.id === id);
  if (!existsAfter) {
    pass('item does not appear in get_tree after soft delete');
  } else {
    fail('item does not appear in get_tree after soft delete');
  }
} finally {
  await client.close();
  summary();
}
