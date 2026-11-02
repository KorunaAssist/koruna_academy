import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCourseAssigned } from '../src/services/courseAccess.ts';

test('assignment requires an exact current-user identity, never a global flag or partial email', () => {
  const course = { id: 'course', isAssigned: true, assignedUsers: [{ userId: 'ann' }] };
  assert.equal(isCourseAssigned(course, ['joann@example.com'], []), false);
  assert.equal(isCourseAssigned(course, ['ANN'], []), true);
});

test('self-enrolled and other-user progress do not grant assignment access', () => {
  const course = { id: 'course' };
  const progress = { courseId: 'course', userEmail: 'learner@example.com', progressPercent: 100 };
  assert.equal(isCourseAssigned(course, ['learner@example.com'], [progress]), false);
  assert.equal(isCourseAssigned(course, ['other@example.com'], [{ ...progress, dueDate: '2026-12-01' }]), false);
  assert.equal(isCourseAssigned(course, ['learner@example.com'], [{ ...progress, applicationId: 1234 }]), true);
  assert.equal(isCourseAssigned(course, ['learner@example.com'], [{ ...progress, assignedBy: 'admin' }]), true);
});
