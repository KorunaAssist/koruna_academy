import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyPage, writePageHistory } from '../src/services/pageHistory.ts';

function browser() {
  const entries = [{ state: null, url: 'https://academy.example/?campaign=welcome' }];
  let index = 0;
  return {
    get state() { return entries[index].state; },
    get href() { return entries[index].url; },
    get length() { return entries.length; },
    replaceState(state, _, url) { entries[index] = { state, url: String(url) }; },
    pushState(state, _, url) { entries.splice(++index); entries.push({ state, url: String(url) }); },
    back() { if (index) index--; },
    forward() { if (index < entries.length - 1) index++; },
  };
}

test('Back and Forward restore consecutive app pages without creating new entries', () => {
  const history = browser();
  for (const tab of ['dashboard', 'profile', 'career_path']) writePageHistory(history, history.href, 'user-1', tab);
  assert.equal(history.length, 3);
  history.back();
  assert.equal(historyPage(history.state, 'user-1'), 'profile');
  writePageHistory(history, history.href, 'user-1', 'profile');
  assert.equal(history.length, 3);
  history.back();
  assert.equal(historyPage(history.state, 'user-1'), 'dashboard');
  history.forward();
  assert.equal(historyPage(history.state, 'user-1'), 'profile');
  assert.equal(new URL(history.href).searchParams.get('campaign'), 'welcome');
  assert.equal(new URL(history.href).searchParams.get('page'), 'profile');
});

test('duplicate navigation and refresh do not add entries; new navigation replaces the forward branch', () => {
  const history = browser();
  for (const tab of ['dashboard', 'profile', 'profile', 'progress']) writePageHistory(history, history.href, 'user-1', tab);
  assert.equal(history.length, 3);
  history.back();
  writePageHistory(history, history.href, 'user-1', 'skills');
  history.forward();
  assert.equal(history.length, 3);
  assert.equal(historyPage(history.state, 'user-1'), 'skills');
});

test('history from another account or malformed state is not restored', () => {
  const history = browser();
  writePageHistory(history, history.href, 'user-1', 'admin_suite');
  assert.equal(historyPage(history.state, 'user-2'), null);
  writePageHistory(history, history.href, 'user-2', 'dashboard');
  assert.equal(history.length, 1);
  for (const state of [null, {}, {korunaPage: 'profile'}, {korunaPage: {account: 'user-2', tab: 1}}]) {
    assert.equal(historyPage(state, 'user-2'), null);
  }
});
