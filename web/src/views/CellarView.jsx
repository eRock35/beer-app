import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../store.jsx';
import { Banner, Confirm, Empty, ErrorState, Field, FormGroup, LoadingList, Sheet, Spinner, Stat, useToast } from '../components/ui.jsx';
import { PageTitle } from '../components/header.jsx';
import { AlertIcon, BarrelIcon, ClockIcon, GlassIcon, PlusIcon } from '../components/icons.jsx';
import { drinkWindowState } from '../lib/format.js';

const EMPTY = {
  beerName: '', brewery: '', style: 'Barrel-Aged Imperial Stout', abv: '',
  vintage: new Date().getFullYear(), quantity: 1, drinkFrom: '', drinkBy: '', notes: '',
};

export function CellarView() {
  const { reference } = useApp();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api.list('cellar'), []);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const bottles = data?.items || [];

  const sorted = useMemo(() => {
    const rank = { 'drink-now': 0, past: 1, ready: 2, resting: 3, unknown: 4 };
    return [...bottles].sort((a, b) => {
      const sa = rank[drinkWindowState(a).key];
      const sb = rank[drinkWindowState(b).key];
      return sa - sb || (a.beerName || '').localeCompare(b.beerName || '');
    });
  }, [bottles]);

  const totals = useMemo(() => {
    const count = bottles.reduce((n, b) => n + (Number(b.quantity) || 0), 0);
    const drinkNow = bottles.filter((b) => drinkWindowState(b).key === 'drink-now').length;
    const past = bottles.filter((b) => drinkWindowState(b).key === 'past').length;
    return { count, drinkNow, past };
  }, [bottles]);

  const drink = async (bottle) => {
    try {
      const remaining = Math.max(0, (Number(bottle.quantity) || 1) - 1);
      if (remaining === 0) await api.remove('cellar', bottle.id);
      else await api.update('cellar', bottle.id, { ...bottle, quantity: remaining });
      toast(remaining === 0 ? `Last ${bottle.beerName} opened — enjoy it` : `${remaining} left`, { kind: 'success' });
      reload();
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="What is put down"
        title="Cellar"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <PlusIcon /> Put one down
          </button>
        }
      >
        What is put down, and — more usefully — what is about to go past its window.
      </PageTitle>

      {bottles.length > 0 && (
        <div className="grid grid-stats" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Stat value={totals.count} label="Bottles" note={`${bottles.length} distinct`} />
          <Stat value={totals.drinkNow} label="Drink soon" note="Window closing" />
          <Stat value={totals.past} label="Past window" note={totals.past ? 'Open or accept' : 'Nothing overdue'} />
        </div>
      )}

      {loading && <LoadingList rows={2} height={140} />}

      {error && !loading && (
        <ErrorState title="Could not load the cellar" onRetry={reload}>{error}</ErrorState>
      )}

      {!loading && !error && !bottles.length && (
        <Empty
          icon={<BarrelIcon />}
          title="Nothing ageing"
          action={<button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>Add a bottle</button>}
        >
          Track vintages and drink windows so a barrel-aged stout does not quietly oxidise in the
          back of a closet.
        </Empty>
      )}

      <div className="stack">
        {sorted.map((bottle) => {
          const window = drinkWindowState(bottle);
          return (
            <article key={bottle.id} className="card">
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <h3 className="card-title">
                    {bottle.beerName}
                    {bottle.vintage ? <span className="muted"> · {bottle.vintage}</span> : null}
                  </h3>
                  <p className="card-sub">
                    {[bottle.brewery, bottle.style].filter(Boolean).join(' · ')}
                    {bottle.abv ? ` · ${bottle.abv}%` : ''}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 600, color: window.tone, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {window.key === 'drink-now' && <ClockIcon size={16} />}
                    {window.key === 'past' && <AlertIcon size={16} />}
                    {window.label}
                  </p>
                </div>
                <div className="num-badge" style={{ flex: '0 0 auto' }}>×{bottle.quantity}</div>
              </div>

              {bottle.notes && <p className="card-text">{bottle.notes}</p>}

              <div className="card-actions">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => drink(bottle)}>
                  <GlassIcon /> Open one
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditing(bottle)}>Edit</button>
                <Confirm
                  title={`Remove ${bottle.beerName}?`}
                  message="It comes out of the cellar without being logged as drunk."
                  onConfirm={async () => {
                    try {
                      await api.remove('cellar', bottle.id);
                      toast('Removed from the cellar', { kind: 'success' });
                      reload();
                    } catch (err) {
                      toast(err.message, { kind: 'error' });
                    }
                  }}
                >
                  Remove
                </Confirm>
              </div>
            </article>
          );
        })}
      </div>

      <Sheet open={adding || Boolean(editing)} onClose={() => { setAdding(false); setEditing(null); }} title={editing ? 'Edit bottle' : 'Put a bottle down'} full>
        <BottleForm
          styles={reference?.styles || []}
          existing={editing}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            toast(editing ? 'Saved' : 'Added to the cellar', { kind: 'success' });
            reload();
          }}
          onCancel={() => { setAdding(false); setEditing(null); }}
        />
      </Sheet>
    </>
  );
}

function BottleForm({ styles, existing, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(existing || {}), abv: existing?.abv ?? '' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        beerName: form.beerName,
        brewery: form.brewery,
        style: form.style,
        abv: form.abv === '' ? null : Number(form.abv),
        vintage: form.vintage === '' ? null : Number(form.vintage),
        quantity: Number(form.quantity) || 0,
        drinkFrom: form.drinkFrom || '',
        drinkBy: form.drinkBy || '',
        notes: form.notes || '',
      };
      if (existing) await api.update('cellar', existing.id, payload);
      else await api.add('cellar', payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <FormGroup>
        <Field label="Beer" id="cf-name">
          <input id="cf-name" className="input" required value={form.beerName} onChange={set('beerName')} autoCapitalize="words" autoComplete="off" enterKeyHint="next" />
        </Field>
        <Field label="Brewery" id="cf-brewery">
          <input id="cf-brewery" className="input" value={form.brewery} onChange={set('brewery')} autoCapitalize="words" autoComplete="off" enterKeyHint="next" />
        </Field>
        <Field label="Style" id="cf-style">
          <select id="cf-style" className="select" value={form.style} onChange={set('style')}>
            {styles.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </Field>
      </FormGroup>

      <FormGroup>
        <div className="row row-keep">
          <Field label="ABV %" id="cf-abv">
            <input id="cf-abv" className="input" type="number" inputMode="decimal" step="0.1" min="0" value={form.abv} onChange={set('abv')} enterKeyHint="next" />
          </Field>
          <Field label="Vintage" id="cf-vintage">
            <input id="cf-vintage" className="input" type="number" inputMode="numeric" min="1900" max="2100" value={form.vintage} onChange={set('vintage')} enterKeyHint="next" />
          </Field>
          <Field label="How many" id="cf-qty">
            <input id="cf-qty" className="input" type="number" inputMode="numeric" min="0" max="999" value={form.quantity} onChange={set('quantity')} enterKeyHint="next" />
          </Field>
        </div>
      </FormGroup>

      <FormGroup>
        <div className="row row-keep">
          <Field label="Ready from" id="cf-from" hint="When it stops being too young.">
            <input id="cf-from" className="input" type="date" value={form.drinkFrom} onChange={set('drinkFrom')} />
          </Field>
          <Field label="Drink by" id="cf-by" hint="When you would regret waiting longer.">
            <input id="cf-by" className="input" type="date" value={form.drinkBy} onChange={set('drinkBy')} />
          </Field>
        </div>
      </FormGroup>

      <FormGroup>
        <Field label="Notes" id="cf-notes">
          <textarea id="cf-notes" className="textarea" value={form.notes} onChange={set('notes')} style={{ minHeight: 72 }} autoCapitalize="sentences" />
        </Field>
      </FormGroup>

      {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? <Spinner /> : existing ? 'Save' : 'Add to cellar'}
        </button>
        <button type="button" className="btn btn-secondary btn-lg" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
