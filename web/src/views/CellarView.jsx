import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../store.jsx';
import { Banner, Confirm, Empty, Field, Sheet, Spinner, Stat } from '../components/ui.jsx';
import { drinkWindowState } from '../lib/format.js';

const EMPTY = {
  beerName: '', brewery: '', style: 'Barrel-Aged Imperial Stout', abv: '',
  vintage: new Date().getFullYear(), quantity: 1, drinkFrom: '', drinkBy: '', notes: '',
};

export function CellarView() {
  const { reference } = useApp();
  const { data, loading, reload } = useAsync(() => api.list('cellar'), []);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
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
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cellar</h1>
          <p>What is put down, and — more usefully — what is about to go past its window.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          🛢️ Put one down
        </button>
      </div>

      {error && <div style={{ marginBottom: 16 }}><Banner kind="error">{error}</Banner></div>}

      {bottles.length > 0 && (
        <div className="grid grid-3" style={{ marginBottom: 20 }}>
          <Stat value={totals.count} label="Bottles down" note={`${bottles.length} distinct beers`} />
          <Stat value={totals.drinkNow} label="Drink soon" note="Inside four months of the window closing" />
          <Stat value={totals.past} label="Past window" note={totals.past ? 'Open them or accept the loss' : 'Nothing overdue'} />
        </div>
      )}

      {loading && <div className="skeleton" style={{ height: 160 }} />}

      {!loading && !bottles.length && (
        <Empty
          icon="🛢️"
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
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <h3 style={{ marginBottom: 2 }}>
                    {bottle.beerName}
                    {bottle.vintage ? <span className="muted"> · {bottle.vintage}</span> : null}
                  </h3>
                  <p className="secondary" style={{ margin: 0, fontSize: '0.9rem' }}>
                    {[bottle.brewery, bottle.style].filter(Boolean).join(' · ')}
                    {bottle.abv ? ` · ${bottle.abv}%` : ''}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: '0.85rem', fontWeight: 600, color: window.tone }}>
                    {window.key === 'drink-now' && '⏰ '}
                    {window.key === 'past' && '⚠ '}
                    {window.label}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="stat-value" style={{ fontSize: '1.4rem' }}>×{bottle.quantity}</div>
                </div>
              </div>

              {bottle.notes && (
                <p className="secondary" style={{ marginTop: 10, marginBottom: 0, fontSize: '0.9rem' }}>{bottle.notes}</p>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => drink(bottle)}>
                  🍺 Open one
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setEditing(bottle)}>Edit</button>
                <Confirm
                  onConfirm={async () => {
                    await api.remove('cellar', bottle.id);
                    reload();
                  }}
                >
                  Remove
                </Confirm>
              </div>
            </article>
          );
        })}
      </div>

      <Sheet open={adding || Boolean(editing)} onClose={() => { setAdding(false); setEditing(null); }} title={editing ? 'Edit bottle' : 'Put a bottle down'}>
        <BottleForm
          styles={reference?.styles || []}
          existing={editing}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
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
      <div className="row">
        <Field label="Beer" id="cf-name">
          <input id="cf-name" className="input" required value={form.beerName} onChange={set('beerName')} />
        </Field>
        <Field label="Brewery" id="cf-brewery">
          <input id="cf-brewery" className="input" value={form.brewery} onChange={set('brewery')} />
        </Field>
      </div>

      <div className="row">
        <Field label="Style" id="cf-style">
          <select id="cf-style" className="select" value={form.style} onChange={set('style')}>
            {styles.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="ABV %" id="cf-abv">
          <input id="cf-abv" className="input" type="number" step="0.1" min="0" value={form.abv} onChange={set('abv')} />
        </Field>
      </div>

      <div className="row">
        <Field label="Vintage" id="cf-vintage">
          <input id="cf-vintage" className="input" type="number" min="1900" max="2100" value={form.vintage} onChange={set('vintage')} />
        </Field>
        <Field label="How many" id="cf-qty">
          <input id="cf-qty" className="input" type="number" min="0" max="999" value={form.quantity} onChange={set('quantity')} />
        </Field>
      </div>

      <div className="row">
        <Field label="Ready from" id="cf-from" hint="When it stops being too young.">
          <input id="cf-from" className="input" type="date" value={form.drinkFrom} onChange={set('drinkFrom')} />
        </Field>
        <Field label="Drink by" id="cf-by" hint="When you would regret waiting longer.">
          <input id="cf-by" className="input" type="date" value={form.drinkBy} onChange={set('drinkBy')} />
        </Field>
      </div>

      <Field label="Notes" id="cf-notes">
        <textarea id="cf-notes" className="textarea" value={form.notes} onChange={set('notes')} style={{ minHeight: 64 }} />
      </Field>

      {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? <Spinner /> : existing ? 'Save' : 'Add to cellar'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
