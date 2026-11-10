import { useEffect } from 'react';
import type { UserSessionData } from '../services/auth';
import { safeTab } from '../services/authorization';
import { historyPage, writePageHistory } from '../services/pageHistory';

export function usePageHistory(user: UserSessionData | null, active: boolean, tab: string, onRestore: (tab: string) => void) {
  const account = user?.id || user?.email;
  useEffect(() => {
    if (!active || !user) return;
    writePageHistory(window.history, window.location.href, account!, tab);
  }, [active, account, tab, user]);

  useEffect(() => {
    if (!active || !user) return;
    function restore(event: PopStateEvent) {
      const requested = historyPage(event.state, account!);
      const restored = safeTab(user!.role, requested);
      if (requested !== restored) {
        const url = new URL(window.location.href);
        url.searchParams.set('page', restored);
        window.history.replaceState({ ...event.state, korunaPage: { account, tab: restored } }, '', url);
      }
      onRestore(restored);
    }
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [active, account, user, onRestore]);
}
