import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../store.jsx';
import { Confirm, Empty, ErrorState, LoadingList, ScorePill, Sheet, useToast } from '../components/ui.jsx';
import { PageTitle } from '../components/header.jsx';
import { BookIcon, CheersIcon, LockIcon, PlusIcon, SearchIcon } from '../components/icons.jsx';
import { AxisBars } from '../components/charts.jsx';
import { PourForm } from './PourForm.jsx';
import { relativeDate, placeLine } from '../lib/format.js';

export function JournalView() {
  const { reference } = useApp();
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', family: '', minScore: '' });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data, loading, error, reload } = useAsync(() => api.pours({ limit: 500 }), []);
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
      toast(`${pour.beerName} removed`, { kind: 'success' });
      reload();
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="Tasting journal"
        title="Journal"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <PlusIcon /> Log a pour
          </button>
        }
      >
        {pours.length ? `${pours.length} beers logged.` : 'Nothing logged yet.'} Everything here is
        yours; only pours you mark public reach the feed.
      </PageTitle>

      <div className="card card-tight" style={{ marginBottom: 14 }}>
        <div className="row">
          <div style={{ position: 'relative', flex: '1 1 100%' }}>
            <SearchIcon size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--label-3)', pointerEvents: 'none' }} />
            <input
              className="input"
              type="search"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Search beers, breweries, notes…"
              aria-label="Search your journal"
              enterKeyHint="search"
              inputMode="search"
              autoComplete="off"
              style={{ paddingLeft: 40 }}
            />
          </div>
          <div className="row row-keep" style={{ flex: '1 1 100%' }}>
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
      </div>

      {loading && <LoadingList rows={3} height={140} />}

      {error && !loading && (
        <ErrorState title="Could not load your journal" onRetry={reload}>
          {error}
        </ErrorState>
      )}

      {!loading && !error && !filtered.length && (
        <Empty
          icon={<BookIcon />}
          title={pours.length ? 'Nothing matches that' : 'The book is empty'}
          action={
            pours.length ? (
              <button type="button" className="btn btn-secondary" onClick={() => setFilters({ q: '', family: '', minScore: '' })}>
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
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <h3 className="card-title">{pour.beerName}</h3>
                <p className="card-sub">
                  {[pour.brewery, pour.style].filter(Boolean).join(' · ')}
                  {pour.abv ? ` · ${pour.abv}%` : ''}
                </p>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '0 6px', alignItems: 'center' }}>
                  {[placeLine(pour.city, pour.state), pour.servingFormat, relativeDate(pour.drankAt)]
                    .filter(Boolean)
                    .join(' · ')}
                  {pour.visibility === 'private' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      · <LockIcon size={13} /> private
                    </span>
                  )}
                </p>
              </div>
              <ScorePill score={pour.score} />
            </div>

            {Object.keys(pour.scores || {}).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <AxisBars scores={pour.scores} axes={reference?.axes || []} />
              </div>
            )}

            {pour.notes && <p className="card-text">{pour.notes}</p>}

            {pour.tags?.length > 0 && (
              <div className="chips chips-sm" style={{ marginTop: 12 }}>
                {pour.tags.map((t) => (
                  <span className="chip" key={t}>{t}</span>
                ))}
              </div>
            )}

            <div className="card-actions">
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditing(pour)}>
                Edit
              </button>
              <Confirm onConfirm={() => remove(pour)} title={`Delete ${pour.beerName}?`} message="It leaves your journal, your passport and the feed.">
                Delete
              </Confirm>
              <span className="muted tabular" style={{ marginLeft: 'auto', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CheersIcon size={16} /> {pour.cheerCount || 0}
              </span>
            </div>
          </article>
        ))}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Log a pour" full>
        <PourForm
          onSaved={() => {
            setAdding(false);
            toast('Added to your journal', { kind: 'success' });
            reload();
          }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit pour" subtitle={editing?.beerName} full>
        {editing && (
          <PourForm
            existing={editing}
            onSaved={() => {
              setEditing(null);
              toast('Saved', { kind: 'success' });
              reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  );
}
