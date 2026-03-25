/**
 * § 12.1 — parent_id cycle is rejected: attempting to set an item as its own
 * ancestor returns an error.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('06 — Cycle rejection');

const idA = crypto.randomUUID();
const idB = crypto.randomUUID();
const idC = crypto.randomUUID();

try {
  // Create A (root) → B (child of A) → C (child of B)
  await client.invoke('create_work_item', {
    id: idA, title: '[CDP-TEST-06] A', sortOrder: 999.0,
  });
  await client.invoke('create_work_item', {
    id: idB, title: '[CDP-TEST-06] B', parentId: idA, sortOrder: 1.0,
  });
  await client.invoke('create_work_item', {
    id: idC, title: '[CDP-TEST-06] C', parentId: idB, sortOrder: 1.0,
  });

  // Try to set A's parent to C (creates cycle A→C→B→A)
  let cycleRejected = false;
  try {
    await client.invoke('update_work_item', {
      id: idA,
      fields: { parent_id: idC },
    });
  } catch (e) {
    cycleRejected = true;
  }

  if (cycleRejected) {
    pass('cycle A→C→B→A is rejected');
  } else {
    fail('cycle A→C→B→A is rejected', 'update succeeded when it should have failed');
  }

  // Try self-referential: set A's parent to A
  let selfRejected = false;
  try {
    await client.invoke('update_work_item', {
      id: idA,
      fields: { parent_id: idA },
    });
  } catch (e) {
    selfRejected = true;
  }

  if (selfRejected) {
    pass('self-referential parent_id is rejected');
  } else {
    fail('self-referential parent_id is rejected', 'update succeeded when it should have failed');
  }

  // Try direct cycle: set A's parent to B (creates A→B→A)
  let directCycleRejected = false;
  try {
    await client.invoke('update_work_item', {
      id: idA,
      fields: { parent_id: idB },
    });
  } catch (e) {
    directCycleRejected = true;
  }

  if (directCycleRejected) {
    pass('direct cycle A→B→A is rejected');
  } else {
    fail('direct cycle A→B→A is rejected', 'update succeeded when it should have failed');
  }
} finally {
  await client.invoke('delete_work_item', { id: idC }).catch(() => {});
  await client.invoke('delete_work_item', { id: idB }).catch(() => {});
  await client.invoke('delete_work_item', { id: idA }).catch(() => {});
  await client.close();
  summary();
}
