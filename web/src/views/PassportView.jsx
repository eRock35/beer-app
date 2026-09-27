import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAsync } from '../store.jsx';
import { Banner, Empty, ErrorState, ScorePill, Stat } from '../components/ui.jsx';
import { PageTitle } from '../components/header.jsx';
import { CheckIcon, FlameIcon, MapPinIcon, PeopleIcon, ShareIcon, TicketIcon } from '../components/icons.jsx';
import { PalateRadar, ScoreTimeline, StyleBars } from '../components/charts.jsx';
import { standingSentence } from '../components/crowd.jsx';
import { ShareSheet } from '../components/ShareSheet.jsx';
import { SharedLinks } from '../components/SharedLinks.jsx';

export function PassportView({ go }) {
  const { data, loading, error, reload } = useAsync(() => api.passport(), []);
  const [showTable, setShowTable] = useState(false);
  // The worked example, loaded on request. It replaces what is drawn below
  // rather than sitting beside it, because half a real passport next to half a
  // fake one is the worst of both.
  const [sample, setSample] = useState(null);
  const [sampleError, setSampleError] = useState('');
  const [sharing, setSharing] = useState(false);
  // Where you sit against other drinkers, per style. Your own passport only -
  // the worked example has no drinker to compare.
  const palate = useAsync(() => api.crowdPalate(), [], { enabled: Boolean(data?.stats?.total) });
  const shares = useAsync(() => api.shares(), [], { enabled: Boolean(data) });

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
  const { badges, earnedCount, stats, palate: axes, families, topPours, timeline, next } = shown;

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

      <PageTitle
        eyebrow={sample ? 'An example' : 'Your record'}
        title="Passport"
        className="page-head-flush"
        action={
          !sample && (
            <button type="button" className="btn btn-secondary" onClick={() => setSharing(true)}>
              <ShareIcon /> Share passport
            </button>
          )
        }
      >
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
        <Stat value={stats.breweries} label="Breweries" note={`${stats.cities.length} ${stats.cities.length === 1 ? 'city' : 'cities'}`} />
      </div>

      <div className="grid grid-2">
        <StreakCard stats={stats} sample={Boolean(sample)} />
        {next && <NextBadgeCard next={next} />}
      </div>

      {!sample && <CrowdStanding state={palate} />}

      <div className="grid grid-2">
        <section className="card">
          <div className="chart-title">Your palate</div>
          <div className="chart-sub">Average score per axis, out of ten. Tap a point for the count.</div>
          <PalateRadar palate={axes} />
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

      {!sample && <SharedLinks state={shares} />}

      {!sample && (
        <ShareSheet
          open={sharing}
          onClose={() => {
            setSharing(false);
            // A new link was just made: show it in the list.
            shares.reload();
          }}
          create={api.sharePassport}
        />
      )}
    </div>
  );
}

/**
 * The run you are on and the best you have had. Informational, never a
 * countdown: a streak is still alive through the whole of the next day, and
 * a non-alcoholic pour counts as much as anything else.
 */
function StreakCard({ stats, sample }) {
  const { currentStreak: current = 0, longestStreak: longest = 0, loggedToday } = stats;
  let line;
  if (!current) line = longest ? 'No run going right now.' : 'Log on consecutive days to start one.';
  else if (loggedToday) line = 'Logged today.';
  else line = 'Still alive — a pour logged today extends it.';
  return (
    <section className="card streak-card" aria-label="Streak">
      <div className="streak-icon" aria-hidden="true"><FlameIcon size={26} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="card-kicker">{sample ? 'Their streak' : 'Current streak'}</div>
        <div className="streak-value tabular">
          {current} <span className="streak-unit">{current === 1 ? 'day' : 'days'}</span>
        </div>
        <div className="secondary" style={{ fontSize: 14 }}>
          {line} Best: {longest} {longest === 1 ? 'day' : 'days'}.
        </div>
        <div className="secondary" style={{ fontSize: 13, marginTop: 4 }}>Counted by the day you drank it. Non-alcoholic pours count too.</div>
      </div>
    </section>
  );
}

function NextBadgeCard({ next }) {
  return (
    <section className="card next-badge" aria-label="Next badge">
      <span className="badge-icon next-badge-icon" aria-hidden="true">{next.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="card-kicker">Next badge</div>
        <div className="badge-name">{next.name}</div>
        <div className="secondary" style={{ fontSize: 14 }}>{next.text}</div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={next.pct} aria-label={`${next.name} progress`}>
          <div className="progress-fill" style={{ width: `${next.pct}%` }} />
        </div>
      </div>
    </section>
  );
}

/** "You rate stouts and porters higher than 88% of drinkers", per family. */
function CrowdStanding({ state }) {
  if (state.loading || state.error || !state.data) return null;
  const { families, minDrinkers } = state.data;
  return (
    <section className="card">
      <h3 className="card-title" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <PeopleIcon size={18} /> You vs the crowd
      </h3>
      {families.length ? (
        <ul className="list-reset crowd-standing">
          {families.map((f) => (
            <li key={f.family}>
              <span className="crowd-standing-text">{standingSentence(f)}</span>
              <span className="secondary tabular crowd-standing-meta">
                your {f.yourAverage} avg · {f.drinkers} drinkers
              </span>
              <span className="crowd-meter" aria-hidden="true">
                <span className="crowd-meter-dot" style={{ left: `${f.percentile}%` }} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="secondary" style={{ margin: 0, fontSize: 14 }}>
          Score a style at least twice and, once {minDrinkers} other drinkers have rated it in public,
          this shows where your palate sits against theirs.
        </p>
      )}
      <p className="secondary" style={{ fontSize: 13, margin: '10px 0 0' }}>
        From public pours only, and only where at least {minDrinkers} other drinkers are behind the number.
      </p>
    </section>
  );
}
