import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCertificateIssueDate, completionActivityDate } from '../src/services/certificateDate.ts';

test('legacy storage records the finish instant and preserves it on reopening and retakes', () => {
  const finished = completionActivityDate({ progressPercent: 70, lastViewedAt: '2026-01-01T00:00:00Z' },
    100, '2026-01-05T00:00:00Z');
  assert.equal(finished, '2026-01-05T00:00:00Z');
  assert.equal(completionActivityDate({ progressPercent: 100, lastViewedAt: finished },
    100, '2026-11-13T00:00:00Z'), finished);
  assert.equal(completionActivityDate({ progressPercent: 20 }, 70, '2026-11-13T00:00:00Z'), undefined);
});

test('certificate uses the saved finish date instead of later activity', () => {
  assert.equal(formatCertificateIssueDate({ completedAt: '2026-01-05T16:30:00Z',
    progressPercent: 100, lastViewedAt: '2026-11-13T00:00:00Z' }), 'Jan 6, 2026');
});

test('legacy completed certificates use their recorded activity date', () => {
  assert.equal(formatCertificateIssueDate({ progressPercent: 100,
    lastViewedAt: '2026-01-05T00:00:00Z' }), 'Jan 5, 2026');
});

test('missing dates and incomplete courses do not invent a finish date', () => {
  assert.equal(formatCertificateIssueDate(), 'Date unavailable');
  assert.equal(formatCertificateIssueDate({ progressPercent: 50,
    lastViewedAt: '2026-01-05T00:00:00Z' }), 'Date unavailable');
  assert.equal(formatCertificateIssueDate({ completedAt: 'invalid' }), 'Date unavailable');
});
