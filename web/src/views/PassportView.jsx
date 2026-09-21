import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAsync } from '../store.jsx';
import { Banner, Empty, ErrorState, ScorePill, Stat } from '../components/ui.jsx';
import { PageTitle } from '../components/header.jsx';
import { CheckIcon, MapPinIcon, TicketIcon } from '../components/icons.jsx';
import { PalateRadar, ScoreTimeline, StyleBars } from '../components/charts.jsx';

export function PassportView({ go }) {
  const { data, loading, error, reload } = useAsync(() => api.passport(), []);
  const [showTable, setShowTable] = useState(false);
  // The worked example, loaded on request. It replaces what is drawn below
  // rather than sitting beside it, because half a real passport next to half a
  // fake one is the worst of both.
  const [sample, setSample] = useState(null);
  const [sampleError, setSampleError] = useState('');

  if (loading) {
    return (
      <>
        <PageTitle eyebrow="Your record" title="Passport" />
        <div className="grid grid-stats" aria-busy="true" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
        </div>
        <div className="stack" style={{ marginTop: 14 }}>
          {[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 220 }} />)}
        </div>
      </>
    );
  }
  if (error) {
    return (
      <>
        <PageTitle eyebrow="Your record" title="Passport" />
        <ErrorState title="Could not load your passport" onRetry={reload}>{error}</ErrorState>
      </>
    );
  }

  const shown = sample || data;
  const { badges, earnedCount, stats, palate, families, topPours, timeline } = shown;

  if (!stats.total) {
    return (
      <>
        <PageTitle eyebrow="Your record" title="Passport" />
        <Empty
          icon={<TicketIcon />}
          title="Your passport is blank"
          action={
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={() => go('journal')}>
                Log your first pour
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  setSampleError('');
                  try {
                    setSample(await api.samplePassport());
                  } catch (err) {
                    setSampleError(err.message);
                  }
                }}
              >
                Show me an example
              </button>
            </div>
          }
        >
          Log a few beers and this fills up with badges, the states you have drunk in, and the
          shape of your palate. It takes about a dozen pours before the radar and the trend say
          anything — so have a look at someone else&rsquo;s first.
          {sampleError && <span className="muted"> ({sampleError})</span>}
        </Empty>
      </>
    );
  }

  const earned = badges.filter((b) => b.earned);
  const locked = badges.filter((b) => !b.earned).sort((a, b) => b.pct - a.pct);

  return (
    <div className="stack">
      {sample && (
        <Banner kind="info">
          This is {sample.by}&rsquo;s passport, not yours — a worked example so you can see what
          fills in.{' '}
          <button type="button" className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => setSample(null)}>
            Back to mine
          </button>
        </Banner>
      )}

      <PageTitle eyebrow={sample ? 'An example' : 'Your record'} title="Passport" className="page-head-flush">
        {stats.total} beers, {stats.breweries} breweries, {stats.states.length}{' '}
        {stats.states.length === 1 ? 'state' : 'states'}. {earnedCount} of {badges.length} badges earned.
      </PageTitle>

      <div className="grid grid-stats">
        <Stat value={stats.total} label="Beers logged" note={`${stats.uniqueStyles} distinct styles`} />
        <Stat value={stats.averageScore ?? '—'} label="Average score" note="Weighted across five axes" />
        <Stat
          value={stats.states.length}
          label="States"
          note={
            stats.states.length
              ? stats.states.slice(0, 6).join(' · ') +
                (stats.states.length > 6 ? ` +${stats.states.length - 6} more` : '')
              : 'None yet'
          }
        />
        <Stat
          value={stats.longestStreak}
          label="Longest streak"
          // "1 / Longest streak / days in a row" reads as "1 days". The one-day
          // case is not a streak yet, and saying so is more useful than a
          // plural that does not agree.
          note={
            stats.longestStreak > 1
              ? 'consecutive days logging'
              : stats.longestStreak === 1
                ? 'day — two running starts a streak'
                : 'nothing logged yet'
          }
        />
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="chart-title">Your palate</div>
          <div className="chart-sub">Average score per axis, out of ten. Tap a point for the count.</div>
          <PalateRadar palate={palate} />
        </section>

        <section className="card">
          <div className="chart-title">What you actually drink</div>
          <div className="chart-sub">Beers logged per style family.</div>
          <StyleBars families={families} />
        </section>
      </div>

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="chart-title">Score over time</div>
            <div className="chart-sub">Monthly average. A rising line usually means a pickier month, not a better one.</div>
          </div>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowTable((s) => !s)} style={{ flex: '0 0 auto' }}>
            {showTable ? 'Chart' : 'Table'}
          </button>
        </div>

        {showTable ? (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className="num">Beers</th>
                <th scope="col" className="num">Average</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((t) => (
                <tr key={t.month}>
                  <td>{t.month}</td>
                  <td className="num">{t.count}</td>
                  <td className="num">{t.averageScore ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ScoreTimeline timeline={timeline} />
        )}
      </section>

      {topPours.length > 0 && (
        <section className="card">
          <h3 className="card-title" style={{ marginBottom: 10 }}>Your top ten</h3>
          <ol className="list-reset" style={{ display: 'grid', gap: 0 }}>
            {topPours.map((p, i) => (
              <li key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 0', borderTop: i ? '1px solid var(--sep)' : 0 }}>
                <span className="muted tabular" style={{ width: 22, fontWeight: 700, fontSize: 15 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, display: 'block', fontSize: 16 }} className="truncate">{p.beerName}</span>
                  <span className="secondary" style={{ fontSize: 13 }}>
                    {[p.brewery, p.style].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <ScorePill score={p.score} showLabel={false} />
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h2 className="section-title">Badges</h2>
        <p className="section-sub">Earned from what is in your journal, recalculated every time you open this page.</p>

        <div className="grid grid-3">
          {[...earned, ...locked].map((badge) => (
            <div key={badge.id} className={`badge-card${badge.earned ? '' : ' is-locked'}`}>
              <span className="badge-icon" aria-hidden="true">{badge.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="badge-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {badge.name}
                  {badge.earned && (
                    <span aria-label="earned" title="Earned" style={{ color: 'var(--green)', display: 'inline-flex' }}>
                      <CheckIcon size={16} />
                    </span>
                  )}
                </div>
                <div className="badge-blurb">{badge.blurb}</div>
                {!badge.earned && (
                  <>
                    <div className="progress">
                      <div className="progress-fill" style={{ width: `${badge.pct}%` }} />
                    </div>
                    <div className="muted tabular" style={{ fontSize: 12, marginTop: 4 }}>
                      {badge.progress} / {badge.goal}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {stats.cities.length > 0 && (
        <section className="card">
          <h3 className="card-title" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPinIcon size={18} /> Where you have been drinking
          </h3>
          <div className="chips chips-sm">
            {stats.cities.map((c) => (
              <span className="chip" key={c}>{c.replace(/,\s*$/, '')}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
