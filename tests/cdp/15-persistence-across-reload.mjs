/**
 * § 12.3 — All mutations persist across app restart. get_tree after restart returns
 *           identical items. Soft-deleted items do not reappear.
 *
 * Note: In the CDP context we cannot truly restart the app, so we simulate a "cold
 * reload" by reloading the page (which re-initializes the Zustand store from SQLite).
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('15 — Persistence across reload');

const liveId = crypto.randomUUID();
const deletedId = crypto.randomUUID();

try {
  // Create two items
  const liveItem = await client.invoke('create_work_item', {
    id: liveId,
    title: '[CDP-TEST-15] Persists',
    sortOrder: 999.0,
    status: 'active',
  });

  await client.invoke('create_work_item', {
    id: deletedId,
    title: '[CDP-TEST-15] Deleted',
    sortOrder: 998.0,
  });

  // Update the live item's title
  await client.invoke('update_work_item', {
    id: liveId,
    fields: { title: '[CDP-TEST-15] Persists (updated)' },
  });

  // Soft-delete the other
  await client.invoke('delete_work_item', { id: deletedId });

  // Snapshot before reload
  const treeBefore = await client.invoke('get_tree');
  const liveBefore = treeBefore.find(i => i.id === liveId);

  // "Restart" by reloading the store from the database
  await client.evaluate(`
    (async () => {
      const { useWorkItemStore } = await import('/src/store/workItems.ts');
      // Clear in-memory state
      useWorkItemStore.setState({
        items: new Map(),
        rootIds: [],
        childrenMap: new Map(),
      });
      // Reload from SQLite
      await useWorkItemStore.getState().loadTree();
    })()
  `);

  // Fetch tree after "restart"
  const treeAfter = await client.invoke('get_tree');

  // Live item should still be there with correct data
  const liveAfter = treeAfter.find(i => i.id === liveId);

  if (liveAfter) {
    pass('live item persists after reload');
  } else {
    fail('live item persists after reload');
  }

  if (liveAfter && liveAfter.title === '[CDP-TEST-15] Persists (updated)') {
    pass('updated title persists after reload');
  } else {
    fail('updated title persists after reload', `got: ${liveAfter?.title}`);
  }

  if (liveAfter && liveAfter.status === 'active') {
    pass('status persists after reload');
  } else {
    fail('status persists after reload', `got: ${liveAfter?.status}`);
  }

  if (liveAfter && liveAfter.created_at === liveBefore.created_at) {
    pass('created_at identical after reload');
  } else {
    fail('created_at identical after reload');
  }

  // Deleted item must NOT reappear
  const deletedAfter = treeAfter.find(i => i.id === deletedId);
  if (!deletedAfter) {
    pass('soft-deleted item does not reappear after reload');
  } else {
    fail('soft-deleted item does not reappear after reload');
  }
} finally {
  await client.invoke('delete_work_item', { id: liveId }).catch(() => {});
  await client.close();
  summary();
}
