import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { passwordRecovery } from '../services/supabasePasswordRecovery';
import { PASSWORD_MIN_LENGTH, RECOVERY_MESSAGE } from '../services/passwordRecovery';

type Phase = 'request' | 'link' | 'verifying' | 'reset' | 'invalid' | 'revocation' | 'done';

export function PasswordRecoveryPage({ mode, onBack }: { mode: 'request' | 'reset'; onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>(mode === 'reset' ? 'link' : 'request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { heading.current?.focus(); }, [phase]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function verify() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('verifying');
    const result = await passwordRecovery.verifyLink();
    if (result.success) setPhase('reset');
    else { setError(result.message); setPhase('invalid'); }
    inFlight.current = false;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || cooldown > 0) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (phase === 'request') {
        const result = await passwordRecovery.request(email);
        if (result.success) { setNotice(RECOVERY_MESSAGE); setCooldown(60); }
        else setError(result.message);
      } else if (phase === 'reset') {
        const result = await passwordRecovery.complete(password, confirmation);
        if (result.passwordUpdated) { setPassword(''); setConfirmation(''); }
        if (result.success) setPhase('done');
        else {
          setError(result.message);
          if (result.passwordUpdated) setPhase('revocation');
        }
      } else if (phase === 'revocation') {
        const result = await passwordRecovery.retrySignOut();
        if (result.success) setPhase('done');
        else setError(result.message);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function leave() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await passwordRecovery.abandon();
      window.history.replaceState(null, '', '/');
      onBack();
    } catch {
      setError('Unable to close the recovery session. Please try again.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  const title = phase === 'done' ? 'Password updated' : phase === 'request' ? 'Forgot your password?' : 'Reset your password';
  return <main className="koruna-login-page">
    <div className="koruna-login-container">
      <div className="koruna-login-sidebar-panel">
        <img src="/login_sidebar_bg.png" alt="" className="koruna-login-sidebar-img" />
      </div>
      <div className="koruna-login-form-panel">
        <span className="koruna-login-badge">ACCOUNT RECOVERY</span>
        <h1 ref={heading} tabIndex={-1} className="koruna-login-title">{title}</h1>
        {phase === 'request' && <p className="koruna-login-subtitle">Enter your account email to request a secure reset link. For company SSO, reset your password through your company’s sign-in provider.</p>}
        {phase === 'link' && <p className="koruna-login-subtitle">Continue to verify your reset link. You can then choose a new password.</p>}
        {phase === 'reset' && <p id="password-policy" className="koruna-login-subtitle">Use at least {PASSWORD_MIN_LENGTH} characters. A long, unique passphrase works well.</p>}
        {error && <p role="alert" className="koruna-recovery-message koruna-recovery-error">{error}</p>}
        {notice && <p role="status" className="koruna-recovery-message">{notice}</p>}
        {phase === 'link' && <button type="button" className="koruna-login-btn-primary" onClick={() => void verify()}>Continue to reset password</button>}
        {phase === 'verifying' && <p role="status">Verifying your reset link…</p>}
        {(phase === 'request' || phase === 'reset' || phase === 'revocation') && <form onSubmit={submit} aria-busy={busy}>
          {phase === 'request' && <>
            <div className="koruna-login-form-group">
              <label htmlFor="recovery-email" className="koruna-login-label">Email address</label>
              <input id="recovery-email" className="koruna-login-input" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
            </div>
          </>}
          {phase === 'reset' && <>
            <div className="koruna-login-form-group">
              <label htmlFor="recovery-password" className="koruna-login-label">New password</label>
              <div className="koruna-login-input-wrapper">
                <input id="recovery-password" aria-describedby="password-policy" className="koruna-login-input" style={{ paddingRight: '3.5rem' }} type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
                <button type="button" className="koruna-login-password-toggle" aria-label={showPassword ? 'Hide new password' : 'Show new password'} aria-controls="recovery-password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} disabled={busy}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="koruna-login-form-group">
              <label htmlFor="recovery-confirmation" className="koruna-login-label">Confirm new password</label>
              <div className="koruna-login-input-wrapper">
                <input id="recovery-confirmation" className="koruna-login-input" style={{ paddingRight: '3.5rem' }} type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
                <button type="button" className="koruna-login-password-toggle" aria-label={showConfirmation ? 'Hide password confirmation' : 'Show password confirmation'} aria-controls="recovery-confirmation" aria-pressed={showConfirmation} onClick={() => setShowConfirmation(value => !value)} disabled={busy}>
                  {showConfirmation ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
          </>}
          <button className="koruna-login-btn-primary" type="submit" disabled={busy || cooldown > 0}>
            {busy ? (phase === 'request' ? 'Requesting reset…' : 'Securing your account…') : cooldown > 0 ? `Request again in ${cooldown}s` : phase === 'request' ? 'Send reset instructions' : phase === 'revocation' ? 'Retry signing out sessions' : 'Update password'}
          </button>
        </form>}
        {phase === 'invalid' && <button type="button" className="koruna-login-btn-primary" onClick={() => { setError(''); setPhase('request'); }}>Request a new reset link</button>}
        {phase === 'done' && <p role="status" className="koruna-recovery-message">Your password has been updated. Sign in with your new password.</p>}
        {phase !== 'verifying' && phase !== 'revocation' && <button type="button" className="koruna-recovery-link koruna-recovery-back" disabled={busy} onClick={() => void leave()}>Back to sign in</button>}
      </div>
    </div>
  </main>;
}
