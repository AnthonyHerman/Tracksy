/**
 * § 12.2 — Status change updates visual state and persists to database.
 *          Done items are visually distinguished from active items.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('13 — Status change and done visual distinction');

const id = crypto.randomUUID();

try {
  await client.invoke('create_work_item', {
    id,
    title: '[CDP-TEST-13] Status test',
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

  // Change status to 'done' via the select element
  const statusChanged = await client.evaluate(`
    (async () => {
      const el = document.querySelector('[data-testid="tree-item-${id}"]');
      if (!el) return null;
      const select = el.querySelector('[data-testid="tree-item-status-select"]');
      if (!select) return null;

      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'done');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));

      return select.value;
    })()
  `);

  if (statusChanged === 'done') {
    pass('status select updated to done in the DOM');
  } else {
    fail('status select updated to done in the DOM', `got: ${statusChanged}`);
  }

  // Verify persisted
  const tree = await client.invoke('get_tree');
  const dbItem = Array.isArray(tree) && tree.find(i => i.id === id);

  if (dbItem && dbItem.status === 'done') {
    pass('status persisted to database as done');
  } else {
    fail('status persisted to database as done', `got: ${dbItem?.status}`);
  }

  // Check visual distinction: done items should have line-through on the title
  // Per SPEC § 8.2, we assert on DOM structure rather than CSS class names.
  // We check the computed style of the title element for text-decoration.
  const hasLineThrough = await client.evaluate(`
    (async () => {
      const el = document.querySelector('[data-testid="tree-item-${id}"]');
      if (!el) return false;
      const title = el.querySelector('[data-testid="tree-item-title"]');
      if (!title) return false;
      const style = window.getComputedStyle(title);
      // text-decoration-line is the standard property
      return style.textDecorationLine.includes('line-through')
        || style.textDecoration.includes('line-through');
    })()
  `);

  if (hasLineThrough) {
    pass('done item title has line-through visual distinction');
  } else {
    fail('done item title has line-through visual distinction');
  }
} finally {
  await client.invoke('delete_work_item', { id }).catch(() => {});
  await client.close();
  summary();
}
