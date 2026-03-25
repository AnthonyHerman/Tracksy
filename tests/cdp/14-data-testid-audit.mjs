/**
 * § 12.2 — All interactive elements carry data-testid per convention in § 8.3.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('14 — data-testid audit');

const parentId = crypto.randomUUID();
const childId = crypto.randomUUID();

try {
  // Create parent and child so all UI elements are exercisable
  await client.invoke('create_work_item', {
    id: parentId, title: '[CDP-TEST-14] Parent', sortOrder: 999.0,
  });
  await client.invoke('create_work_item', {
    id: childId, title: '[CDP-TEST-14] Child', parentId, sortOrder: 1.0,
  });

  // Reload store and expand parent
  await client.evaluate(`
    (async () => {
      const { useWorkItemStore } = await import('/src/store/workItems.ts');
      await useWorkItemStore.getState().loadTree();
      await new Promise(r => setTimeout(r, 500));

      // Expand the parent by clicking its toggle
      const parent = document.querySelector('[data-testid="tree-item-${parentId}"]');
      if (parent) {
        const toggle = parent.querySelector('[data-testid="tree-item-expand-toggle"]');
        if (toggle) toggle.click();
      }
      await new Promise(r => setTimeout(r, 500));
    })()
  `);

  // Required testids from § 8.3
  const required = [
    { testid: 'tree-item-title', context: 'tree item title' },
    { testid: 'tree-item-status-select', context: 'status dropdown' },
    { testid: 'tree-item-expand-toggle', context: 'expand/collapse toggle' },
    { testid: 'tree-item-add-child-button', context: 'add child button' },
    { testid: 'tree-item-delete-button', context: 'delete button' },
    { testid: 'root-add-item-button', context: 'add root item button' },
  ];

  for (const { testid, context } of required) {
    const count = await client.evaluate(
      `document.querySelectorAll('[data-testid="${testid}"]').length`
    );
    if (count > 0) {
      pass(`${testid} present (${context})`, `found ${count}`);
    } else {
      fail(`${testid} present (${context})`, 'not found in DOM');
    }
  }

  // Also verify the dynamic tree-item-{id} testids
  const parentTestid = await client.evaluate(
    `document.querySelector('[data-testid="tree-item-${parentId}"]') !== null`
  );
  if (parentTestid) {
    pass('tree-item-{id} testid present for parent');
  } else {
    fail('tree-item-{id} testid present for parent');
  }

  const childTestid = await client.evaluate(
    `document.querySelector('[data-testid="tree-item-${childId}"]') !== null`
  );
  if (childTestid) {
    pass('tree-item-{id} testid present for child');
  } else {
    fail('tree-item-{id} testid present for child');
  }
} finally {
  await client.invoke('delete_work_item', { id: childId }).catch(() => {});
  await client.invoke('delete_work_item', { id: parentId }).catch(() => {});
  await client.close();
  summary();
}
