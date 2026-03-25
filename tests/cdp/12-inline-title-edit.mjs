/**
 * § 12.2 — Inline title edit updates the displayed title and persists to database.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('12 — Inline title edit');

const id = crypto.randomUUID();

try {
  await client.invoke('create_work_item', {
    id,
    title: '[CDP-TEST-12] Before edit',
    sortOrder: 999.0,
  });

  // Reload store
  await client.evaluate(`
    (async () => {
      const { useWorkItemStore } = await import('/src/store/workItems.ts');
      await useWorkItemStore.getState().loadTree();
      await new Promise(r => setTimeout(r, 500));
    })()
  `);

  // Double-click the title to enter edit mode
  const editModeEntered = await client.evaluate(`
    (async () => {
      const el = document.querySelector('[data-testid="tree-item-${id}"]');
      if (!el) return false;
      const title = el.querySelector('[data-testid="tree-item-title"]');
      if (!title) return false;
      // Dispatch dblclick to enter edit mode
      title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      // Check if an input appeared
      const input = el.querySelector('input[data-testid="tree-item-title"]');
      return input !== null;
    })()
  `);

  if (editModeEntered) {
    pass('double-click enters edit mode (input appears)');
  } else {
    fail('double-click enters edit mode (input appears)');
  }

  // Type a new value and commit with Enter
  const editCommitted = await client.evaluate(`
    (async () => {
      const el = document.querySelector('[data-testid="tree-item-${id}"]');
      if (!el) return false;
      const input = el.querySelector('input[data-testid="tree-item-title"]');
      if (!input) return false;

      // Set value using native setter to work with React controlled input
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '[CDP-TEST-12] After edit');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // Press Enter to commit
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(r => setTimeout(r, 500));

      // Check displayed title
      const span = el.querySelector('span[data-testid="tree-item-title"]');
      return span ? span.textContent : null;
    })()
  `);

  if (editCommitted === '[CDP-TEST-12] After edit') {
    pass('title updated in the DOM after edit', editCommitted);
  } else {
    fail('title updated in the DOM after edit', `got: ${editCommitted}`);
  }

  // Verify persisted to database
  const tree = await client.invoke('get_tree');
  const dbItem = Array.isArray(tree) && tree.find(i => i.id === id);

  if (dbItem && dbItem.title === '[CDP-TEST-12] After edit') {
    pass('title persisted to database');
  } else {
    fail('title persisted to database', `got: ${dbItem?.title}`);
  }
} finally {
  await client.invoke('delete_work_item', { id }).catch(() => {});
  await client.close();
  summary();
}
