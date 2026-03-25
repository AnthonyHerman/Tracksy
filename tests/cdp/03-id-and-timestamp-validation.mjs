/**
 * § 12.1 — id is valid UUID v4; created_at and updated_at are valid ISO 8601 UTC.
 */
import { CDPClient, describe, pass, fail, summary } from './lib/cdp.mjs';

const client = new CDPClient();
await client.connect();

describe('03 — ID and timestamp validation');

const id = crypto.randomUUID();

try {
  const item = await client.invoke('create_work_item', {
    id,
    title: '[CDP-TEST-03] Validation',
    sortOrder: 999.0,
  });

  // UUID v4 format check
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (uuidV4Regex.test(item.id)) {
    pass('id is valid UUID v4', item.id);
  } else {
    fail('id is valid UUID v4', `got: ${item.id}`);
  }

  // ISO 8601 timestamp check
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

  if (item.created_at && isoRegex.test(item.created_at)) {
    const d = new Date(item.created_at);
    if (!isNaN(d.getTime())) {
      pass('created_at is valid ISO 8601', item.created_at);
    } else {
      fail('created_at is valid ISO 8601', `parses as invalid date: ${item.created_at}`);
    }
  } else {
    fail('created_at is valid ISO 8601', `got: ${item.created_at}`);
  }

  if (item.updated_at && isoRegex.test(item.updated_at)) {
    const d = new Date(item.updated_at);
    if (!isNaN(d.getTime())) {
      pass('updated_at is valid ISO 8601', item.updated_at);
    } else {
      fail('updated_at is valid ISO 8601', `parses as invalid date: ${item.updated_at}`);
    }
  } else {
    fail('updated_at is valid ISO 8601', `got: ${item.updated_at}`);
  }

  // Both timestamps must be present (not null)
  if (item.created_at != null && item.updated_at != null) {
    pass('timestamps are non-null');
  } else {
    fail('timestamps are non-null', `created_at: ${item.created_at}, updated_at: ${item.updated_at}`);
  }
} finally {
  await client.invoke('delete_work_item', { id }).catch(() => {});
  await client.close();
  summary();
}
