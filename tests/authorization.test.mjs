import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USER_ROLES, can, canAccessTab, safeTab, canAccessAdminTab, canManageCourse, profileRole, rolePermissions } from '../src/services/authorization.ts';

test('employee cannot restore privileged tabs, including tampered local storage values', () => {
  for (const tab of ['admin_suite', 'team_reports', 'users', 'permissions', '__proto__', 'unknown']) {
    assert.equal(canAccessTab('employee', tab), false);
    assert.equal(safeTab('employee', tab), 'dashboard');
  }
  assert.equal(safeTab('employee', 'catalog_courses'), 'catalog_courses');
  assert.equal(canAccessTab('unexpected', 'catalog'), false);
});

test('trainer and team leader cannot access account or settings administration', () => {
  for (const role of ['employee', 'team_leader', 'trainer']) {
    assert.equal(can(role, 'manageUsers'), false);
    assert.equal(can(role, 'systemSettings'), false);
    assert.equal(canAccessAdminTab(role, 'users'), false);
    assert.equal(canAccessAdminTab(role, 'permissions'), false);
  }
  assert.equal(canAccessAdminTab('trainer', 'creator'), true);
  assert.equal(canAccessAdminTab('trainer', 'learning_paths'), true);
  assert.equal(canAccessAdminTab('admin', 'learning_paths'), true);
  assert.equal(canAccessAdminTab('employee', 'learning_paths'), false);
  assert.equal(canAccessAdminTab('team_leader', 'learning_paths'), false);
  assert.equal(canAccessAdminTab('team_leader', 'creator'), false);
  assert.equal(canAccessTab('team_leader', 'team_reports'), true);
});

test('trainers manage only their own courses; legacy unowned courses require admin', () => {
  assert.equal(canManageCourse('trainer', 'trainer-a', 'trainer-a'), true);
  assert.equal(canManageCourse('trainer', 'trainer-a', 'trainer-b'), false);
  assert.equal(canManageCourse('trainer', 'trainer-a', undefined), false);
  assert.equal(canManageCourse('employee', 'employee', 'employee'), false);
  assert.equal(canManageCourse('admin', 'admin', undefined), true);
});

test('permissions are independent values and invalid profile roles fail to employee', () => {
  const permissions = rolePermissions('employee');
  permissions.manageUsers = true;
  assert.equal(rolePermissions('employee').manageUsers, false);
  for (const role of [null, undefined, {}, 'owner', 'ADMIN']) assert.equal(profileRole(role), 'employee');
  for (const role of USER_ROLES) assert.equal(profileRole(role), role);
});


test('My Courses stays in the learner view for every role', () => {
  for (const role of USER_ROLES) {
    assert.equal(canAccessTab(role, 'my_courses'), true);
    assert.equal(safeTab(role, 'my_courses'), 'my_courses');
    assert.equal(canAccessAdminTab(role, 'my_courses'), false);
  }
});
