import { useState } from 'react';
import { useApp } from '../store.jsx';
import { Banner, Field, Spinner } from '../components/ui.jsx';

export function AccountView({ onLogout, go }) {
  const { user, saveProfile, aiEnabled, theme, setTheme } = useApp();
  const [form, setForm] = useState({
    displayName: user.displayName || '',
    homeCity: user.homeCity || '',
    homeState: user.homeState || '',
    homeBreweryName: user.homeBreweryName || '',
    whiteWhaleBrewery: user.whiteWhaleBrewery || '',
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await saveProfile(form);
      setStatus('Saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <h1>Your setup</h1>
          <p>
            Home base drives the “near me” default and the Regular badge. The white whale is what
            the sommelier assumes you are chasing.
          </p>
        </div>
      </div>

      <form className="card" onSubmit={submit}>
        <Field label="Display name" id="acc-name">
          <input id="acc-name" className="input" value={form.displayName} onChange={set('displayName')} />
        </Field>

        <div className="row">
          <Field label="Home city" id="acc-city">
            <input id="acc-city" className="input" value={form.homeCity} onChange={set('homeCity')} placeholder="St. Louis" />
          </Field>
          <Field label="State" id="acc-state">
            <input id="acc-state" className="input" value={form.homeState} onChange={set('homeState')} placeholder="MO" />
          </Field>
        </div>

        <Field label="Your regular" id="acc-home-brewery" hint="The bar you end up at without deciding to.">
          <input
            id="acc-home-brewery"
            className="input"
            value={form.homeBreweryName}
            onChange={set('homeBreweryName')}
            placeholder="Stout Brothers"
          />
        </Field>

        <Field label="White whale" id="acc-whale" hint="The brewery you would reroute a trip for.">
          <input
            id="acc-whale"
            className="input"
            value={form.whiteWhaleBrewery}
            onChange={set('whiteWhaleBrewery')}
            placeholder="Side Project Brewing"
          />
        </Field>

        {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}
        {status && <div style={{ marginBottom: 12 }}><Banner>{status}</Banner></div>}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Spinner /> : 'Save'}
        </button>
      </form>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Appearance</h3>
        <div className="chips" style={{ marginTop: 10 }}>
          {['system', 'light', 'dark'].map((t) => (
            <button
              key={t}
              type="button"
              className="chip chip-toggle"
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Sommelier</h3>
        <p className="secondary" style={{ fontSize: '0.88rem', marginTop: 8 }}>
          {aiEnabled
            ? 'Switched on. The API key lives on the server only — it is never sent to your browser.'
            : 'Switched off. Set ANTHROPIC_API_KEY on the server to enable it.'}
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Session</h3>
        <p className="secondary" style={{ fontSize: '0.88rem', marginTop: 8 }}>
          Signed in as {user.email}.
        </p>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await onLogout();
            go('map');
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
