/**
 * § 12.2 — Tree renders root items visible on load.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('10 — Tree renders on load');

const id = crypto.randomUUID();

try {
  // Ensure at least one root item exists
  await client.invoke('create_work_item', {
    id,
    title: '[CDP-TEST-10] Visible root',
    sortOrder: 999.0,
  });

  // Reload the store so the UI picks up the new item
  await client.evaluate(`
    (async () => {
      // Trigger React re-render by dispatching a store reload
      const { useWorkItemStore } = await import('/src/store/workItems.ts');
      await useWorkItemStore.getState().loadTree();
      // Wait for React to render
      await new Promise(r => setTimeout(r, 500));
    })()
  `);

  // Check that tree items are rendered in the DOM
  const treeItemCount = await client.evaluate(`
    document.querySelectorAll('[data-testid^="tree-item-"]').length
  `);

  if (treeItemCount > 0) {
    pass('tree items are rendered in the DOM', `found ${treeItemCount} tree-item elements`);
  } else {
    fail('tree items are rendered in the DOM', 'no tree-item elements found');
  }

  // Check that the root-add-item-button is present
  const addButton = await client.evaluate(`
    document.querySelector('[data-testid="root-add-item-button"]') !== null
  `);

  if (addButton) {
    pass('root-add-item-button is present');
  } else {
    fail('root-add-item-button is present');
  }
} finally {
  await client.invoke('delete_work_item', { id }).catch(() => {});
  await client.close();
  summary();
}
