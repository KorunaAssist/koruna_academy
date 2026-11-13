import { test } from 'node:test';
import assert from 'node:assert/strict';
import { persistProgress, learnerProgressFields, writeCompatibleProgress } from '../src/services/progressPersistence.ts';

test('missing quiz history retries without losing the finish date or learning hours', async () => {
  const requests = [];
  await writeCompatibleProgress({ quiz_history: [], last_viewed_at: '2026-11-13T00:00:00Z', learning_hours: 1 }, async values => {
    requests.push({ ...values });
    return { error: requests.length === 1 ? { code: 'PGRST204', message: "Could not find the 'quiz_history' column of 'user_progress' in the schema cache" } : null };
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], { last_viewed_at: '2026-11-13T00:00:00Z', learning_hours: 1 });
});

test('compatibility retries each missing field separately and stops on permission failures', async () => {
  let calls = 0;
  const result = await writeCompatibleProgress({ quiz_history: [], learning_hours: 1, last_viewed_at: 'date' }, async () => {
    calls++;
    return { error: calls === 1 ? { code: '42703', message: 'column "learning_hours" does not exist' }
      : { code: '42501', message: 'permission denied' } };
  });
  assert.equal(calls, 2);
  assert.equal(result.error.code, '42501');
});

test('learner writes exclude assignment, identity and approval fields', () => {
  assert.deepEqual(learnerProgressFields({ progress_percent: 50, completed_lessons: ['lesson'],
    practical_status: 'approved', due_date: '2099-01-01', assigned_by: 'admin',
    overdue: false, user_email: 'other@example.com', course_id: 'other', application_id: 3 }),
  { progress_percent: 50, completed_lessons: ['lesson'] });
});

test('existing progress uses UPDATE without invoking INSERT triggers', async () => {
  await persistProgress({ update: async () => ({ count: 1 }), insert: async () => assert.fail('must not insert') });
});

test('new enrollment inserts after an empty update', async () => {
  let inserted = false;
  await persistProgress({ update: async () => ({ count: 0 }), insert: async () => { inserted = true; return { count: 1 }; } });
  assert.equal(inserted, true);
});

test('concurrent enrollment retries UPDATE after a duplicate key', async () => {
  let updates = 0;
  await persistProgress({ update: async () => ({ count: updates++ }),
    insert: async () => ({ count: 0, error: { code: '23505', message: 'duplicate' } }) });
  assert.equal(updates, 2);
});

test('permission and network failures reject instead of reporting success', async () => {
  await assert.rejects(persistProgress({ update: async () => ({ count: 0, error: { message: 'permission denied' } }),
    insert: async () => assert.fail('must not insert') }), /permission denied/);
  await assert.rejects(persistProgress({ update: async () => { throw new Error('network failure'); },
    insert: async () => assert.fail('must not insert') }), /network failure/);
  await assert.rejects(persistProgress({ update: async () => ({ count: 0 }),
    insert: async () => ({ count: 0, error: { message: 'row-level security' } }) }), /row-level security/);
});
