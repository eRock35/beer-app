import { useState } from 'react';
import { useApp } from '../store.jsx';
import { Banner, Field, FormGroup, Spinner } from '../components/ui.jsx';
import { GlassIcon } from '../components/icons.jsx';

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
    <div style={{ maxWidth: 420, margin: '4vh auto 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <span className="empty-icon" aria-hidden="true" style={{ marginBottom: 12 }}>
          <GlassIcon />
        </span>
        <h1 className="large-title" style={{ fontSize: 28 }}>{mode === 'login' ? 'Welcome back' : 'Start your passport'}</h1>
        <p className="secondary" style={{ fontSize: 15, margin: '8px auto 0', maxWidth: '36ch' }}>
          {feature} is yours alone, so it needs an account. Nothing you log is public unless you
          mark a pour public.
        </p>
      </div>

      <form onSubmit={submit}>
        <FormGroup>
          {mode === 'register' && (
            <Field label="Name" id="displayName">
              <input
                id="displayName"
                className="input"
                value={form.displayName}
                onChange={set('displayName')}
                placeholder="What the feed should call you"
                autoComplete="nickname"
                autoCapitalize="words"
                enterKeyHint="next"
              />
            </Field>
          )}

          <Field label="Email" id="email">
            <input
              id="email"
              className="input"
              type="email"
              inputMode="email"
              required
              value={form.email}
              onChange={set('email')}
              autoComplete={mode === 'login' ? 'username' : 'email'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
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
              enterKeyHint="done"
            />
          </Field>
        </FormGroup>

        {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? <Spinner /> : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        className="btn btn-ghost btn-block"
        style={{ marginTop: 10 }}
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError('');
        }}
      >
        {mode === 'login' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
