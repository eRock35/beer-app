import { useState } from 'react';
import { useApp } from '../store.jsx';
import { Banner, Field, Spinner } from '../components/ui.jsx';

export function AuthGate({ feature = 'this' }) {
  const { login, register } = useApp();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login({ email: form.email, password: form.password });
      else await register(form);
    } catch (err) {
      setError(err.details?.length ? `${err.message} ${err.details.map((d) => d.message).join(' ')}` : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '6vh auto' }}>
      <div className="card">
        <h1 style={{ marginBottom: 6 }}>{mode === 'login' ? 'Welcome back' : 'Start your passport'}</h1>
        <p className="secondary" style={{ fontSize: '0.9rem' }}>
          {feature} is yours alone, so it needs an account. Nothing you log is public unless you
          mark a pour public.
        </p>

        <form onSubmit={submit} style={{ marginTop: 18 }}>
          {mode === 'register' && (
            <Field label="Name" id="displayName">
              <input
                id="displayName"
                className="input"
                value={form.displayName}
                onChange={set('displayName')}
                placeholder="What the feed should call you"
                autoComplete="nickname"
              />
            </Field>
          )}

          <Field label="Email" id="email">
            <input
              id="email"
              className="input"
              type="email"
              required
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
            />
          </Field>

          <Field label="Password" id="password" hint={mode === 'register' ? 'At least 8 characters.' : undefined}>
            <input
              id="password"
              className="input"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </Field>

          {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <Spinner /> : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <hr className="divider" />

        <button
          type="button"
          className="btn btn-ghost btn-block btn-sm"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
