import { KeyRound, ShieldCheck, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { apiPost } from '../lib/api';
import type { User } from '../types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: User) => void;
}

type AuthMode = 'login' | 'register' | 'reset';

export function AuthModal({ open, onClose, onAuthenticated }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'citizen' | 'organizer'>('citizen');
  const [city, setCity] = useState('Pune');
  const [phone, setPhone] = useState('');
  const [orgName, setOrgName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStage, setResetStage] = useState<'request' | 'confirm'>('request');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await apiPost<{ user: User }>('/api/auth/login', { email, password });
      onAuthenticated(data.user);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await apiPost<{ user: User }>('/api/auth/register', {
        full_name: fullName,
        email,
        password,
        role,
        city,
        phone,
        organization_name: role === 'organizer' ? orgName : undefined,
      });
      onAuthenticated(data.user);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const data = await apiPost<{ message: string; reset_token_preview?: string }>(
        '/api/auth/password-reset/request',
        { email }
      );
      setNotice(
        data.reset_token_preview
          ? `${data.message} Verification token: ${data.reset_token_preview}`
          : data.message
      );
      if (data.reset_token_preview) {
        setResetToken(data.reset_token_preview);
      }
      setResetStage('confirm');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const data = await apiPost<{ message: string }>('/api/auth/password-reset/confirm', {
        token: resetToken,
        new_password: newPassword,
      });
      setNotice(data.message);
      setMode('login');
      setResetStage('request');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(demoEmail: string, demoPass: string) {
    setMode('login');
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-[#1E2D4A] bg-[#0D1629] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1E2D4A] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            <h2 id="auth-modal-title" className="font-display text-lg font-semibold text-white">
              {mode === 'login' && 'Sign In to PCM'}
              {mode === 'register' && 'Create Civic Account'}
              {mode === 'reset' && 'Reset Account Password'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#131F38] hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-5 flex gap-1 rounded-lg bg-[#070D1A] p-1 border border-[#1E2D4A]">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors cursor-pointer ${
                mode === 'login' ? 'bg-[#131F38] text-cyan-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors cursor-pointer ${
                mode === 'register' ? 'bg-[#131F38] text-cyan-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('reset');
                setError(null);
              }}
              className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors cursor-pointer ${
                mode === 'reset' ? 'bg-[#131F38] text-cyan-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              Reset Password
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-xs text-cyan-200 break-all">
              {notice}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.org"
                  className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>

              <div className="mt-4 border-t border-[#1E2D4A] pt-4">
                <p className="mb-2 text-xs text-slate-400">
                  Demo role presets (seeded in database for verification):
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemo('citizen@pcm-civic.org', 'Citizen@PCM2026!')}
                    className="rounded-md border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 cursor-pointer"
                  >
                    Citizen
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemo('organizer@pcm-civic.org', 'Organizer@PCM2026!')}
                    className="rounded-md border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 cursor-pointer"
                  >
                    Organizer
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemo('admin@pcm-civic.org', 'Admin@PCM2026!')}
                    className="rounded-md border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 cursor-pointer"
                  >
                    Administrator
                  </button>
                </div>
              </div>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full legal or civic name"
                    className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Account Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'citizen' | 'organizer')}
                    className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="citizen">Citizen</option>
                    <option value="organizer">Event Organizer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.org"
                  className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Phone (Optional)</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91-..."
                    className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              {role === 'organizer' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Civic Organization / Collective Name
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g., Pune Citizens Accountability Forum"
                    className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Password (min. 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {submitting ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}

          {mode === 'reset' && (
            <div className="space-y-4">
              {resetStage === 'request' ? (
                <form onSubmit={handleResetRequest} className="space-y-4">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Enter your registered email to generate a single-use cryptographic reset token.
                  </p>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
                  >
                    <KeyRound className="h-4 w-4" />
                    Generate Reset Token
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetConfirm} className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">Reset Token</label>
                    <input
                      type="text"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">
                      New Password (min. 8 chars)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
                  >
                    Confirm Password Reset
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
