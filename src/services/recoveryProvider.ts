import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecoveryProvider } from './passwordRecovery';

type Auth = SupabaseClient['auth'];
type NormalAuth = Pick<Auth, 'resetPasswordForEmail' | 'signOut'>;
type RecoveryAuth = Pick<Auth, 'verifyOtp' | 'setSession' | 'getUser' | 'getSession' | 'updateUser' | 'signOut' | 'admin'>;

// Isolated SDK adapter. Both clients are injected so session boundaries can be tested.
export function createRecoveryProvider(normal: NormalAuth, recovery: RecoveryAuth, takeLink: () => URL | null): RecoveryProvider {
  let verification: Promise<boolean> | null = null;
  let globallyRevoked = false;
  return {
    async request(email, redirectTo) {
      const { error } = await normal.resetPasswordForEmail(email, { redirectTo });
      return error;
    },
    verifyLink() {
      // Double clicks must not consume the same single-use token twice.
      verification ??= (async () => {
        const link = takeLink();
        const fragment = new URLSearchParams(link?.hash.slice(1));
        const query = link?.searchParams;
        const hasCredentials = Boolean(query?.get('token_hash') || fragment.get('access_token') || query?.get('code'));
        if (query?.has('error') || query?.has('error_code') || fragment.has('error') || fragment.has('error_code')) {
          await recovery.signOut({ scope: 'local' });
          return false;
        }
        if (hasCredentials) {
          const { error: signOutError } = await recovery.signOut({ scope: 'local' });
          if (signOutError) return false;
          if (query?.get('token_hash') && query.get('type') === 'recovery') {
            const { error } = await recovery.verifyOtp({ token_hash: query.get('token_hash')!, type: 'recovery' });
            if (error) return false;
          } else if (fragment.get('type') === 'recovery' && fragment.get('access_token') && fragment.get('refresh_token')) {
            const { error } = await recovery.setSession({ access_token: fragment.get('access_token')!, refresh_token: fragment.get('refresh_token')! });
            if (error) return false;
          } else return false;
        }
        // Validate with the backend, rather than trusting decoded JWT claims/local storage.
        const { data, error } = await recovery.getUser();
        return !error && Boolean(data.user);
      })();
      return verification;
    },
    async hasVerifiedUser() {
      const { data, error } = await recovery.getUser();
      return !error && Boolean(data.user);
    },
    async updatePassword(password) {
      const { error } = await recovery.updateUser({ password });
      return error;
    },
    async revokeSessions() {
      if (!globallyRevoked) {
        const { data, error: sessionError } = await recovery.getSession();
        if (sessionError || !data.session) return false;
        // Despite the SDK namespace, this endpoint accepts the user's own JWT;
        // no privileged key is used. Unlike client.signOut(), it preserves local
        // credentials on network failure so revocation can actually be retried.
        const { error } = await recovery.admin.signOut(data.session.access_token, 'global');
        if (error) return false;
        globallyRevoked = true;
      }
      const { error: recoveryError } = await recovery.signOut({ scope: 'local' });
      if (recoveryError) return false;
      // Clear this browser's normal login too. Do not revoke another user's sessions.
      const { error } = await normal.signOut({ scope: 'local' });
      return !error;
    },
    async clearSession() {
      verification = null;
      globallyRevoked = false;
      takeLink();
      const { error } = await recovery.signOut({ scope: 'local' });
      if (error) throw new Error('Unable to clear recovery session');
    },
  };
}
