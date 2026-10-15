import { createClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase';
import { createPasswordRecoveryService, isRecoveryLocation } from './passwordRecovery';
import { createRecoveryProvider } from './recoveryProvider';

// Separate storage prevents a recovery link from signing into the dashboard.
// sessionStorage permits refresh in this tab without persisting recovery across browser restarts.
const recoveryClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  { auth: { storageKey: 'koruna-password-recovery', storage: window.sessionStorage, persistSession: true, detectSessionInUrl: false, autoRefreshToken: false } },
);

let pendingLink: URL | null = null;

// Capture once before React mounts. Never render, log, or leave credentials in the URL.
export function prepareRecoveryLocation(): void {
  const url = new URL(window.location.href);
  if (!isRecoveryLocation(url)) return;
  pendingLink = url;
  window.history.replaceState(null, '', '/reset-password');
}

const provider = createRecoveryProvider(supabase.auth, recoveryClient.auth, () => {
  const link = pendingLink;
  pendingLink = null;
  return link;
});

export const passwordRecovery = createPasswordRecoveryService(provider, {
  configured: isSupabaseConfigured,
  origin: () => window.location.origin,
});
