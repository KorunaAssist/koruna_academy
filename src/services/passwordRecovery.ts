// Application rules depend on a small provider contract, not on a specific SDK.
export interface RecoveryError { status?: number; code?: string }
export interface RecoveryProvider {
  request(email: string, redirectTo: string): Promise<RecoveryError | null>;
  verifyLink(): Promise<boolean>;
  hasVerifiedUser(): Promise<boolean>;
  updatePassword(password: string): Promise<RecoveryError | null>;
  revokeSessions(): Promise<boolean>;
  clearSession(): Promise<void>;
}

export const RECOVERY_MESSAGE = 'If an account exists for that email, you will receive password reset instructions. Check your spam folder too.';
export const INVALID_LINK_MESSAGE = 'This reset link is invalid or has expired. Please request a new link.';
export const PASSWORD_MIN_LENGTH = 8;

export type RecoveryResult = { success: true } | { success: false; message: string };
export type PasswordUpdateResult = RecoveryResult & { passwordUpdated?: boolean };

export function isRecoveryLocation(url: URL): boolean {
  return url.pathname.replace(/\/$/, '') === '/reset-password'
    || new URLSearchParams(url.hash.slice(1)).get('type') === 'recovery';
}

export function recoveryRedirect(origin: string): string {
  const url = new URL(origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('Password recovery requires HTTPS.');
  }
  // Never accept an arbitrary redirect from a form or a query parameter.
  return new URL('/reset-password', url.origin).href;
}

export function validateNewPassword(password: string, confirmation: string): string | null {
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password !== confirmation) return 'The passwords do not match.';
  return null;
}

export function createPasswordRecoveryService(
  provider: RecoveryProvider,
  options: {
    configured: () => boolean;
    origin: () => string;
    minimumResponseMs?: number;
  },
) {
  return {
    async request(email: string): Promise<RecoveryResult> {
      const normalized = email.trim().toLowerCase();
      if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { success: false, message: 'Enter a valid email address.' };
      }
      if (!options.configured()) {
        return { success: false, message: 'Password recovery is unavailable. Please contact your administrator.' };
      }
      const started = Date.now();
      try {
        const error = await provider.request(normalized, recoveryRedirect(options.origin()));
        if (error?.status === 429 || error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit') {
          return { success: false, message: 'Too many requests. Please wait a few minutes before trying again.' };
        }
        if (error && !(error.status && error.status >= 400 && error.status < 500)) {
          return { success: false, message: 'Unable to request a reset right now. Please try again later.' };
        }
        // Account-specific failures must have the same result as an accepted request.
        return { success: true };
      } catch {
        return { success: false, message: 'Unable to request a reset right now. Please try again later.' };
      } finally {
        // Reduces simple timing differences; provider-side controls remain essential.
        const remaining = (options.minimumResponseMs ?? 800) - (Date.now() - started);
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
      }
    },
    async verifyLink(): Promise<RecoveryResult> {
      if (!options.configured()) return { success: false, message: 'Password recovery is unavailable. Please contact your administrator.' };
      try {
        return await provider.verifyLink()
          ? { success: true }
          : { success: false, message: INVALID_LINK_MESSAGE };
      } catch {
        return { success: false, message: INVALID_LINK_MESSAGE };
      }
    },
    async complete(password: string, confirmation: string): Promise<PasswordUpdateResult> {
      const message = validateNewPassword(password, confirmation);
      if (message) return { success: false, message };
      if (!options.configured()) return { success: false, message: INVALID_LINK_MESSAGE };
      try {
        if (!await provider.hasVerifiedUser()) return { success: false, message: INVALID_LINK_MESSAGE };
        const error = await provider.updatePassword(password);
        if (error) {
          const message = error.code === 'same_password'
            ? 'Choose a password different from your current password.'
            : error.code === 'weak_password'
              ? 'Choose a stronger password that meets your organization’s password policy.'
              : 'Unable to update the password. Please try again or request a new link.';
          return { success: false, message };
        }
      } catch {
        return { success: false, message: 'Unable to confirm the update. Try signing in with your new password before requesting another reset.' };
      }
      // A revocation failure must never be reported as a failed password change.
      let revoked = false;
      try { revoked = await provider.revokeSessions(); } catch { /* handled below */ }
      if (!revoked) return { success: false, passwordUpdated: true, message: 'Your password was updated, but we could not sign out all sessions. Retry signing out before continuing.' };
      return { success: true, passwordUpdated: true };
    },
    async retrySignOut(): Promise<RecoveryResult> {
      try {
        if (await provider.revokeSessions()) return { success: true };
      } catch { /* Return a safe message without provider details. */ }
      return { success: false, message: 'Unable to sign out all sessions. Please try again or contact your administrator.' };
    },
    async abandon(): Promise<void> { await provider.clearSession(); },
  };
}
