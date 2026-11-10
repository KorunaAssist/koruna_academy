const KEY = 'korunaPage';

export function historyPage(state: unknown, account: string): string | null {
  if (!state || typeof state !== 'object') return null;
  const page = (state as Record<string, unknown>)[KEY];
  if (!page || typeof page !== 'object') return null;
  const value = page as Record<string, unknown>;
  return value.account === account && typeof value.tab === 'string' ? value.tab : null;
}

export function writePageHistory(history: Pick<History, 'state' | 'pushState' | 'replaceState'>, href: string, account: string, tab: string) {
  const current = historyPage(history.state, account);
  if (current === tab) return;
  const url = new URL(href);
  url.searchParams.set('page', tab);
  const state = { ...history.state, [KEY]: { account, tab } };
  if (current === null) history.replaceState(state, '', url);
  else history.pushState(state, '', url);
}
