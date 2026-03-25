/**
 * § 12.1 — Reorder sets moved item's sort_order to the midpoint of neighbors.
 *          Sibling sort_order values are unchanged after a reorder of a different item.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('07 — Reorder midpoint and sibling stability');

const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

try {
  // Create 3 root items with sort_orders 1.0, 2.0, 3.0
  for (let i = 0; i < 3; i++) {
    await client.invoke('create_work_item', {
      id: ids[i],
      title: `[CDP-TEST-07] Item ${i}`,
      sortOrder: (i + 1) * 1.0,
    });
  }

  // Record original sort_orders
  let tree = await client.invoke('get_tree');
  const before = {};
  for (const item of tree.filter(i => ids.includes(i.id))) {
    before[item.id] = item.sort_order;
  }

  // Move item[2] (sort_order 3.0) between item[0] (1.0) and item[1] (2.0)
  // Expected new sort_order: midpoint of 1.0 and 2.0 = 1.5
  const newSortOrder = (before[ids[0]] + before[ids[1]]) / 2;

  await client.invoke('update_work_item', {
    id: ids[2],
    fields: { sort_order: newSortOrder },
  });

  // Fetch updated tree
  tree = await client.invoke('get_tree');
  const after = {};
  for (const item of tree.filter(i => ids.includes(i.id))) {
    after[item.id] = item.sort_order;
  }

  // Verify moved item has midpoint sort_order
  if (after[ids[2]] === 1.5) {
    pass('moved item sort_order is midpoint (1.5)', `got: ${after[ids[2]]}`);
  } else {
    fail('moved item sort_order is midpoint (1.5)', `got: ${after[ids[2]]}`);
  }

  // Verify siblings are unchanged
  if (after[ids[0]] === before[ids[0]]) {
    pass('sibling 0 sort_order unchanged', `${before[ids[0]]} → ${after[ids[0]]}`);
  } else {
    fail('sibling 0 sort_order unchanged', `${before[ids[0]]} → ${after[ids[0]]}`);
  }

  if (after[ids[1]] === before[ids[1]]) {
    pass('sibling 1 sort_order unchanged', `${before[ids[1]]} → ${after[ids[1]]}`);
  } else {
    fail('sibling 1 sort_order unchanged', `${before[ids[1]]} → ${after[ids[1]]}`);
  }
} finally {
  for (const id of ids) {
    await client.invoke('delete_work_item', { id }).catch(() => {});
  }
  await client.close();
  summary();
}
