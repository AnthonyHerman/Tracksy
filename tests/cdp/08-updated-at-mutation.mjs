/**
 * § 12.1 — updated_at changes on every mutating command; created_at never changes.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('08 — updated_at mutation tracking');

const id = crypto.randomUUID();

try {
  const item = await client.invoke('create_work_item', {
    id,
    title: '[CDP-TEST-08] Mutation tracking',
    sortOrder: 999.0,
  });

  const originalCreatedAt = item.created_at;
  const originalUpdatedAt = item.updated_at;

  // Wait to ensure timestamp difference
  await client.sleep(1100);

  // Mutate the title
  const updated = await client.invoke('update_work_item', {
    id,
    fields: { title: '[CDP-TEST-08] Mutation tracking (edited)' },
  });

  // created_at must NOT change
  if (updated.created_at === originalCreatedAt) {
    pass('created_at unchanged after update', updated.created_at);
  } else {
    fail('created_at unchanged after update', `${originalCreatedAt} → ${updated.created_at}`);
  }

  // updated_at MUST change
  if (updated.updated_at !== originalUpdatedAt) {
    pass('updated_at changed after update', `${originalUpdatedAt} → ${updated.updated_at}`);
  } else {
    fail('updated_at changed after update', `still: ${updated.updated_at}`);
  }

  // Wait and mutate again (status change)
  await client.sleep(1100);

  const updated2 = await client.invoke('update_work_item', {
    id,
    fields: { status: 'active' },
  });

  if (updated2.updated_at !== updated.updated_at) {
    pass('updated_at changes on status mutation', `${updated.updated_at} → ${updated2.updated_at}`);
  } else {
    fail('updated_at changes on status mutation', `still: ${updated2.updated_at}`);
  }

  if (updated2.created_at === originalCreatedAt) {
    pass('created_at still unchanged after second mutation');
  } else {
    fail('created_at still unchanged after second mutation');
  }
} finally {
  await client.invoke('delete_work_item', { id }).catch(() => {});
  await client.close();
  summary();
}
