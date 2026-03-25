/**
 * § 12.1 — Work item created as child; parent_id is set correctly.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('02 — Create child item');

const parentId = crypto.randomUUID();
const childId = crypto.randomUUID();

try {
  // Create parent
  await client.invoke('create_work_item', {
    id: parentId,
    title: '[CDP-TEST-02] Parent',
    sortOrder: 999.0,
  });

  // Create child
  const child = await client.invoke('create_work_item', {
    id: childId,
    title: '[CDP-TEST-02] Child',
    parentId,
    sortOrder: 1.0,
  });

  if (child && child.parent_id === parentId) {
    pass('child parent_id matches parent id');
  } else {
    fail('child parent_id matches parent id', `got: ${child?.parent_id}`);
  }

  // Verify both appear in get_tree
  const tree = await client.invoke('get_tree');
  const parentFound = Array.isArray(tree) && tree.some(i => i.id === parentId);
  const childFound = Array.isArray(tree) && tree.some(i => i.id === childId);

  if (parentFound && childFound) {
    pass('both parent and child appear in get_tree');
  } else {
    fail('both parent and child appear in get_tree', `parent: ${parentFound}, child: ${childFound}`);
  }

  // Verify child's parent_id in the tree response
  const childInTree = tree.find(i => i.id === childId);
  if (childInTree && childInTree.parent_id === parentId) {
    pass('child parent_id is correct in get_tree response');
  } else {
    fail('child parent_id is correct in get_tree response');
  }
} finally {
  // Cleanup
  await client.invoke('delete_work_item', { id: childId }).catch(() => {});
  await client.invoke('delete_work_item', { id: parentId }).catch(() => {});
  await client.close();
  summary();
}
