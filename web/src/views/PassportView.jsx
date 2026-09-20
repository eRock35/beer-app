import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAsync } from '../store.jsx';
import { Banner, Empty, ScorePill, Stat } from '../components/ui.jsx';
import { PalateRadar, ScoreTimeline, StyleBars } from '../components/charts.jsx';

export function PassportView({ go }) {
  const { data, loading, error } = useAsync(() => api.passport(), []);
  const [showTable, setShowTable] = useState(false);

  if (loading) {
    return (
      <div className="grid grid-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 180 }} />)}
      </div>
    );
  }
  if (error) return <Banner kind="error">{error}</Banner>;

  const { badges, earnedCount, stats, palate, families, topPours, timeline } = data;

  if (!stats.total) {
    return (
      <Empty
        icon="🛂"
        title="Your passport is blank"
        action={
          <button type="button" className="btn btn-primary" onClick={() => go('journal')}>
            Log your first pour
          </button>
        }
      >
        Log a few beers and this fills up with badges, the states you have drunk in, and the
        shape of your palate.
      </Empty>
    );
  }

  const earned = badges.filter((b) => b.earned);
  const locked = badges.filter((b) => !b.earned).sort((a, b) => b.pct - a.pct);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Passport</h1>
          <p>
            {stats.total} beers, {stats.breweries} breweries, {stats.states.length}{' '}
            {stats.states.length === 1 ? 'state' : 'states'}. {earnedCount} of {badges.length} badges earned.
          </p>
        </div>
      </div>

      <div className="grid grid-4">
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
          note={stats.longestStreak > 1 ? 'consecutive days logging' : 'days in a row'}
        />
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="chart-title">Your palate</div>
          <div className="chart-sub">Average score per axis, out of ten.</div>
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
          <div>
            <div className="chart-title">Score over time</div>
            <div className="chart-sub">Monthly average. A rising line usually means a pickier month, not a better one.</div>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setShowTable((s) => !s)}>
            {showTable ? 'Show chart' : 'Show table'}
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
          <h3 style={{ marginBottom: 12 }}>Your top ten</h3>
          <ol className="list-reset" style={{ display: 'grid', gap: 10 }}>
            {topPours.map((p, i) => (
              <li key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="muted tabular" style={{ width: 22, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, display: 'block' }} className="truncate">{p.beerName}</span>
                  <span className="secondary" style={{ fontSize: '0.84rem' }}>
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
        <h2 style={{ marginBottom: 4 }}>Badges</h2>
        <p className="secondary" style={{ marginBottom: 14 }}>
          Earned from what is in your journal, recalculated every time you open this page.
        </p>

        <div className="grid grid-3">
          {[...earned, ...locked].map((badge) => (
            <div key={badge.id} className={`badge-card${badge.earned ? '' : ' is-locked'}`}>
              <span className="badge-icon" aria-hidden="true">{badge.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="badge-name">
                  {badge.name}
                  {badge.earned && <span aria-label="earned" title="Earned"> ✓</span>}
                </div>
                <div className="badge-blurb">{badge.blurb}</div>
                {!badge.earned && (
                  <>
                    <div className="progress">
                      <div className="progress-fill" style={{ width: `${badge.pct}%` }} />
                    </div>
                    <div className="muted tabular" style={{ fontSize: '0.76rem', marginTop: 4 }}>
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
          <h3 style={{ marginBottom: 10 }}>Where you have been drinking</h3>
          <div className="chips">
            {stats.cities.map((c) => (
              <span className="chip" key={c}>{c.replace(/,\s*$/, '')}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
