import { useState } from 'react';
import { useApp } from '../store.jsx';
import { Banner, Field, FormGroup, Group, Row, Segmented, Spinner, useFeedback } from '../components/ui.jsx';
import { PageTitle } from '../components/header.jsx';
import { CircleHalfIcon, MoonIcon, SignOutIcon, SparkleIcon, SunIcon } from '../components/icons.jsx';

const THEME_OPTIONS = [
  { value: 'system', label: 'Auto', icon: <CircleHalfIcon /> },
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
];

export function AccountView({ onLogout, go }) {
  const { user, saveProfile, aiEnabled, theme, setTheme } = useApp();
  const { toast, confirm } = useFeedback();
  const [form, setForm] = useState({
    displayName: user.displayName || '',
    homeCity: user.homeCity || '',
    homeState: user.homeState || '',
    homeBreweryName: user.homeBreweryName || '',
    whiteWhaleBrewery: user.whiteWhaleBrewery || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveProfile(form);
      toast('Saved', { kind: 'success' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <PageTitle eyebrow="Your setup" title="Account">
        Home base drives the “near me” default and the Regular badge. The white whale is what
        the sommelier assumes you are chasing.
      </PageTitle>

      <form onSubmit={submit}>
        <FormGroup>
          <Field label="Display name" id="acc-name">
            <input id="acc-name" className="input" value={form.displayName} onChange={set('displayName')} autoComplete="nickname" autoCapitalize="words" enterKeyHint="next" />
          </Field>
          <div className="row row-keep">
            <Field label="Home city" id="acc-city">
              <input id="acc-city" className="input" value={form.homeCity} onChange={set('homeCity')} placeholder="St. Louis" autoComplete="address-level2" autoCapitalize="words" enterKeyHint="next" />
            </Field>
            <Field label="State" id="acc-state">
              <input id="acc-state" className="input" value={form.homeState} onChange={set('homeState')} placeholder="MO" autoComplete="address-level1" autoCapitalize="characters" enterKeyHint="next" />
            </Field>
          </div>
        </FormGroup>

        <FormGroup>
          <Field label="Your regular" id="acc-home-brewery" hint="The bar you end up at without deciding to.">
            <input
              id="acc-home-brewery"
              className="input"
              value={form.homeBreweryName}
              onChange={set('homeBreweryName')}
              placeholder="Stout Brothers"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="next"
            />
          </Field>

          <Field label="White whale" id="acc-whale" hint="The brewery you would reroute a trip for.">
            <input
              id="acc-whale"
              className="input"
              value={form.whiteWhaleBrewery}
              onChange={set('whiteWhaleBrewery')}
              placeholder="Side Project Brewing"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
            />
          </Field>
        </FormGroup>

        {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy} style={{ marginBottom: 24 }}>
          {busy ? <Spinner /> : 'Save'}
        </button>
      </form>

      <Group title="Appearance">
        <Row
          icon={theme === 'dark' ? <MoonIcon /> : theme === 'light' ? <SunIcon /> : <CircleHalfIcon />}
          title="Theme"
          trailing={<Segmented value={theme} onChange={setTheme} options={THEME_OPTIONS} label="Theme" />}
        />
      </Group>

      <Group
        title="Sommelier"
        footer={
          aiEnabled
            ? 'The API key lives on the server only — it is never sent to your browser.'
            : 'Set ANTHROPIC_API_KEY on the server to enable it.'
        }
      >
        <Row icon={<SparkleIcon />} title="Claude sommelier" trailing={aiEnabled ? 'On' : 'Off'} />
      </Group>

      <Group title="Session" footer={`Signed in as ${user.email}.`}>
        <Row
          icon={<SignOutIcon />}
          title="Sign out"
          destructive
          chevron={false}
          onClick={async () => {
            const ok = await confirm({ title: 'Sign out?', message: 'Your journal stays on the server; you just sign back in.', action: 'Sign out', destructive: true });
            if (!ok) return;
            await onLogout();
            go('map');
          }}
        />
      </Group>
    </div>
  );
}
