import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, AlertCircle, Clock, X } from 'lucide-react';
import { signInUser, getSessionExpiredFlag, setSessionExpiredFlag } from '../services/auth';
import type { UserRole, UserSessionData } from '../services/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { LoadingModal } from './LoadingModal';

interface LoginFormProps {
  onNavigateForgotPassword: () => void;
  onLoginSuccess: (userData: UserSessionData) => void;
  onNavigateSignup?: () => void;
  sessionExpiredNotice?: string | null;
  onClearExpiredNotice?: () => void;
}


const KorunaLogo: React.FC = () => {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <img 
        src="/korunalogo.png" 
        alt="Koruna Academy Logo" 
        style={{ height: '40px', width: 'auto', display: 'block' }} 
        onError={(e) => {
          const img = e.currentTarget;
          if (img.src.endsWith('/korunalogo.png')) {
            img.src = '/logo.svg';
          }
        }}
      />
    </div>
  );
};

export const LoginForm: React.FC<LoginFormProps> = ({
  onNavigateForgotPassword,
  onLoginSuccess,
  onNavigateSignup,
  sessionExpiredNotice,
  onClearExpiredNotice
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expiredNotice, setExpiredNotice] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const flagNotice = sessionExpiredNotice || getSessionExpiredFlag();
    if (flagNotice) {
      setExpiredNotice(flagNotice);
    }
  }, [sessionExpiredNotice]);

  const handleDismissExpiredNotice = () => {
    setExpiredNotice(null);
    setSessionExpiredFlag(false);
    onClearExpiredNotice?.();
  };

  const DEMO_ROLES: Record<string, { name: string; role: UserRole }> = {
    'alex.rivera@koruna.com': { name: 'Alex Rivera', role: 'employee' },
    'sarah.chen@koruna.com': { name: 'Sarah Chen', role: 'team_leader' },
    'dr.vance@koruna.com': { name: 'Dr. Marcus Vance', role: 'trainer' },
    'admin.learning@koruna.com': { name: 'Global Admin', role: 'admin' }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    handleDismissExpiredNotice();

    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid Koruna email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    const startTime = Date.now();
    const result = await signInUser(email, password);
    const elapsed = Date.now() - startTime;
    if (elapsed < 1500) {
      await new Promise((resolve) => setTimeout(resolve, 1500 - elapsed));
    }
    setIsLoading(false);

    if (!result.success || !result.data) {
      setErrorMsg(result.error || 'Authentication failed. Check your credentials.');
      return;
    }

    // Check if matched preset for richer demo role display
    const matchedRole = !isSupabaseConfigured() && import.meta.env.DEV ? DEMO_ROLES[email.toLowerCase()] : undefined;

    onLoginSuccess({
      ...result.data,
      name: matchedRole ? matchedRole.name : result.data.name,
      role: matchedRole ? matchedRole.role : result.data.role
    });
  };

  return (
    <>
      {isLoading && <LoadingModal type="login" />}
      
      <div className="koruna-login-logo-container">
        <KorunaLogo />
      </div>

      <span className="koruna-login-badge">EMPLOYEE SIGN-IN</span>
      <h2 className="koruna-login-title">Welcome back</h2>
      <p className="koruna-login-subtitle">Log in to continue your learning journey.</p>

      {expiredNotice && (
        <div style={{
          padding: '0.75rem 0.9rem',
          background: '#fffbe6',
          border: '1px solid #ffe58f',
          color: '#873800',
          fontSize: '0.85rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.5rem',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(250, 173, 20, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
            <Clock size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#d48806' }} />
            <div>
              <strong style={{ display: 'block', marginBottom: '0.15rem' }}>Session Expired</strong>
              <span>{expiredNotice}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissExpiredNotice}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#873800',
              padding: '0.1rem',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Dismiss notice"
          >
            <X size={16} />
          </button>
        </div>
      )}


      {errorMsg && (
        <div style={{ padding: '0.65rem 0.85rem', background: '#fce8e6', border: '1px solid #ea4335', color: '#c5221f', fontSize: '0.85rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderRadius: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{errorMsg}</span>
          </div>
          {errorMsg.toLowerCase().includes('email not confirmed') && (
            <div style={{ fontSize: '0.75rem', color: '#5f6368', marginTop: '0.25rem', paddingLeft: '1.5rem', lineHeight: 1.4 }}>
              <strong>How to resolve:</strong>
              <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1rem' }}>
                <li>Check your inbox (and spam folder) for the Supabase confirmation email.</li>
                <li><strong>Or:</strong> Open the Supabase Dashboard, navigate to <strong>Authentication &rarr; Users</strong>, click the <code>...</code> next to this email, and click <strong>Confirm User</strong>.</li>
                <li><strong>Or:</strong> In the Supabase Dashboard, go to <strong>Authentication &rarr; Providers &rarr; Email</strong>, and turn off <strong>Confirm Email</strong> (Double Opt-In) to disable verification.</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="koruna-login-form-group">
          <label className="koruna-login-label" htmlFor="email-input">Email address</label>
          <input
            id="email-input"
            type="email"
            className="koruna-login-input"
            placeholder="name@korunaassist.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>

        <div className="koruna-login-form-group">
          <label className="koruna-login-label" htmlFor="password-input">Password</label>
          <div className="koruna-login-input-wrapper">
            <input
              id="password-input"
              type={showPassword ? 'text' : 'password'}
              className="koruna-login-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
            <button
              type="button"
              className="koruna-login-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="koruna-login-row">
          <label className="koruna-login-checkbox-label">
            <input
              type="checkbox"
              className="koruna-login-checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>Remember me</span>
          </label>
          
          <button
            type="button"
            className="koruna-login-forgot-link koruna-recovery-link"
            onClick={onNavigateForgotPassword}
            disabled={isLoading}
          >
            Forgot password?
          </button>
        </div>

        <button type="submit" className="koruna-login-btn-primary" disabled={isLoading}>
          {isLoading ? 'Signing in...' : 'Login'}
        </button>
      </form>

      {onNavigateSignup && (
        <div style={{ textAlign: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--udemy-border)', fontSize: '0.85rem' }}>
          Don't have an account?{' '}
          <button
            type="button"
            onClick={onNavigateSignup}
            style={{ background: 'none', border: 'none', color: 'var(--koruna-primary)', textDecoration: 'underline', fontWeight: 700, cursor: 'pointer' }}
          >
            Sign up
          </button>
        </div>
      )}
    </>
  );
};
