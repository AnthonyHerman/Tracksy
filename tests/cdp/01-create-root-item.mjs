/**
 * § 12.1 — Work item created at root level; appears in get_tree response.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('01 — Create root item');

try {
  const id = crypto.randomUUID();
  const item = await client.invoke('create_work_item', {
    id,
    title: '[CDP-TEST-01] Root item',
    sortOrder: 999.0,
  });

  // Verify returned item
  if (item && item.id === id) {
    pass('create_work_item returns item with correct id');
  } else {
    fail('create_work_item returns item with correct id', `got: ${JSON.stringify(item)}`);
  }

  if (item && item.parent_id === null) {
    pass('parent_id is null for root item');
  } else {
    fail('parent_id is null for root item', `got parent_id: ${item?.parent_id}`);
  }

  if (item && item.title === '[CDP-TEST-01] Root item') {
    pass('title matches');
  } else {
    fail('title matches', `got: ${item?.title}`);
  }

  if (item && item.status === 'todo') {
    pass('status defaults to todo');
  } else {
    fail('status defaults to todo', `got: ${item?.status}`);
  }

  // Verify item appears in get_tree
  const tree = await client.invoke('get_tree');
  const found = Array.isArray(tree) && tree.some(i => i.id === id);
  if (found) {
    pass('item appears in get_tree response');
  } else {
    fail('item appears in get_tree response');
  }

  // Cleanup
  await client.invoke('delete_work_item', { id });
} finally {
  await client.close();
  summary();
}
