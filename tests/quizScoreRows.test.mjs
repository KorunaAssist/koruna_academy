import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quizScoreRows } from '../src/services/quizScoreRows.ts';
import { learnerProgressFields } from '../src/services/progressPersistence.ts';
import { canAccessAdminTab } from '../src/services/authorization.ts';

const base = { userEmail: 'employee@example.com', courseId: 'course-1', quizAttempts: 2, quizScore: 90 };

test('all attempts remain visible, including a retake below the highest score', () => {
  const rows = quizScoreRows([{ ...base, quizHistory: [
    { attempt: 1, score: 90, submittedAt: '2026-11-10T01:00:00Z' },
    { attempt: 2, score: 50, submittedAt: '2026-11-10T02:00:00Z' },
  ] }]);
  assert.deepEqual(rows.map(row => [row.attempt, row.score]), [[2, 50], [1, 90]]);
});

test('legacy scores have no invented attempt number or timestamp', () => {
  const rows = quizScoreRows([base]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 90);
  assert.equal(rows[0].attempt, null);
  assert.equal(rows[0].submittedAt, null);
  assert.equal(quizScoreRows([{ ...base, quizScore: undefined }]).length, 0);
});

test('zero scores and new history after legacy attempts are retained', () => {
  const rows = quizScoreRows([{ ...base, quizAttempts: 3, quizHistory: [{ attempt: 3, score: 0, submittedAt: '2026-11-10T03:00:00Z' }] }]);
  assert.deepEqual(rows.map(row => row.score), [0, 90]);
});

test('learner progress persists attempt history without assignment fields', () => {
  const history = [{ attempt: 1, score: 50, submittedAt: '2026-11-10T03:00:00Z' }];
  assert.deepEqual(learnerProgressFields({ quiz_history: history, assigned_by: 'admin' }), { quiz_history: history });
});

test('employee scores administration is available only to admins', () => {
  assert.equal(canAccessAdminTab('admin', 'quiz_scores'), true);
  for (const role of ['employee', 'trainer', 'team_leader']) assert.equal(canAccessAdminTab(role, 'quiz_scores'), false);
});
