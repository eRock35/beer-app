import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../store.jsx';
import { Banner, Confirm, Empty, ScorePill, Sheet, Spinner } from '../components/ui.jsx';
import { AxisBars } from '../components/charts.jsx';
import { PourForm } from './PourForm.jsx';
import { relativeDate, placeLine } from '../lib/format.js';

export function JournalView() {
  const { reference } = useApp();
  const [filters, setFilters] = useState({ q: '', family: '', minScore: '' });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const { data, loading, reload } = useAsync(() => api.pours({ limit: 500 }), []);
  const pours = data?.pours || [];

  const filtered = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    return pours.filter((p) => {
      if (filters.family && p.family !== filters.family) return false;
      if (filters.minScore && (p.score ?? -1) < Number(filters.minScore)) return false;
      if (!needle) return true;
      return `${p.beerName} ${p.brewery} ${p.style} ${p.notes} ${(p.tags || []).join(' ')}`
        .toLowerCase()
        .includes(needle);
    });
  }, [pours, filters]);

  const remove = async (pour) => {
    try {
      await api.deletePour(pour.id);
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your journal</h1>
          <p>
            {pours.length ? `${pours.length} beers logged.` : 'Nothing logged yet.'} Everything here
            is yours; only pours you mark public reach the feed.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          🍺 Log a pour
        </button>
      </div>

      {error && <div style={{ marginBottom: 16 }}><Banner kind="error">{error}</Banner></div>}

      <div className="card card-tight" style={{ marginBottom: 16 }}>
        <div className="row">
          <input
            className="input"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search beers, breweries, notes, flavours…"
            aria-label="Search your journal"
          />
          <select
            className="select"
            value={filters.family}
            onChange={(e) => setFilters((f) => ({ ...f, family: e.target.value }))}
            aria-label="Filter by style family"
          >
            <option value="">All styles</option>
            {Object.entries(reference?.styleFamilies || {}).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            className="select"
            value={filters.minScore}
            onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.value }))}
            aria-label="Minimum score"
          >
            <option value="">Any score</option>
            <option value="90">90+ only</option>
            <option value="80">80+ only</option>
            <option value="70">70+ only</option>
          </select>
        </div>
      </div>

      {loading && <div style={{ display: 'grid', gap: 12 }}>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div>}

      {!loading && !filtered.length && (
        <Empty
          icon="📓"
          title={pours.length ? 'Nothing matches that' : 'The book is empty'}
          action={
            pours.length ? (
              <button type="button" className="btn" onClick={() => setFilters({ q: '', family: '', minScore: '' })}>
                Clear filters
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                Log your first pour
              </button>
            )
          }
        >
          {pours.length
            ? 'Loosen the filters and try again.'
            : 'Score a beer across five axes and Hopscotch starts building your palate profile and your passport.'}
        </Empty>
      )}

      <div className="stack">
        {filtered.map((pour) => (
          <article key={pour.id} className="card">
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <h3 style={{ marginBottom: 2 }}>{pour.beerName}</h3>
                <p className="secondary" style={{ margin: 0, fontSize: '0.9rem' }}>
                  {[pour.brewery, pour.style].filter(Boolean).join(' · ')}
                  {pour.abv ? ` · ${pour.abv}%` : ''}
                </p>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                  {[placeLine(pour.city, pour.state), pour.servingFormat, relativeDate(pour.drankAt)]
                    .filter(Boolean)
                    .join(' · ')}
                  {pour.visibility === 'private' && ' · 🔒 private'}
                </p>
              </div>
              <ScorePill score={pour.score} />
            </div>

            {Object.keys(pour.scores || {}).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <AxisBars scores={pour.scores} axes={reference?.axes || []} />
              </div>
            )}

            {pour.notes && (
              <p className="secondary" style={{ marginTop: 14, marginBottom: 0, fontSize: '0.92rem', lineHeight: 1.6 }}>
                {pour.notes}
              </p>
            )}

            {pour.tags?.length > 0 && (
              <div className="chips" style={{ marginTop: 12 }}>
                {pour.tags.map((t) => (
                  <span className="chip" key={t}>{t}</span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
              <button type="button" className="btn btn-sm" onClick={() => setEditing(pour)}>
                Edit
              </button>
              <Confirm onConfirm={() => remove(pour)}>Delete</Confirm>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.82rem' }}>
                🍻 {pour.cheerCount || 0}
              </span>
            </div>
          </article>
        ))}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Log a pour">
        <PourForm
          onSaved={() => {
            setAdding(false);
            reload();
          }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit pour" subtitle={editing?.beerName}>
        {editing && (
          <PourForm
            existing={editing}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  );
}
