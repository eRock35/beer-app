import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../store.jsx';
import { Banner, Empty, ScorePill } from '../components/ui.jsx';
import { relativeDate, placeLine } from '../lib/format.js';

export function FeedView({ go }) {
  const { user } = useApp();
  const { data, loading, error, setData } = useAsync(() => api.feed(), []);
  const [busyId, setBusyId] = useState(null);
  const pours = data?.pours || [];

  const cheer = async (pour) => {
    if (!user) return;
    setBusyId(pour.id);
    try {
      const result = await api.cheer(pour.id);
      setData({
        pours: pours.map((p) =>
          p.id === pour.id ? { ...p, cheerCount: result.cheerCount, cheered: result.cheered } : p
        ),
      });
    } catch {
      // A failed cheer is not worth interrupting the feed for.
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="stack">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 130 }} />)}</div>;
  }
  if (error) return <Banner kind="error">{error}</Banner>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>The feed</h1>
          <p>What everyone is drinking. Your own pours show up here when you mark them public.</p>
        </div>
        {user && (
          <button type="button" className="btn btn-primary" onClick={() => go('journal')}>
            🍺 Log a pour
          </button>
        )}
      </div>

      {!pours.length && (
        <Empty icon="🍻" title="Quiet in here">
          Nobody has logged a public pour yet. Be the first.
        </Empty>
      )}

      <div className="stack">
        {pours.map((pour) => (
          <article key={pour.id} className="card">
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  {pour.author?.displayName} · {relativeDate(pour.drankAt)}
                </div>
                <h3 style={{ margin: '3px 0 2px' }}>{pour.beerName}</h3>
                <p className="secondary" style={{ margin: 0, fontSize: '0.9rem' }}>
                  {[pour.brewery, pour.style].filter(Boolean).join(' · ')}
                  {pour.abv ? ` · ${pour.abv}%` : ''}
                </p>
                {placeLine(pour.city, pour.state) && (
                  <p className="muted" style={{ margin: '3px 0 0', fontSize: '0.82rem' }}>
                    📍 {placeLine(pour.city, pour.state)}
                  </p>
                )}
              </div>
              <ScorePill score={pour.score} />
            </div>

            {pour.notes && (
              <p className="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: '0.92rem', lineHeight: 1.6 }}>
                {pour.notes}
              </p>
            )}

            {pour.tags?.length > 0 && (
              <div className="chips" style={{ marginTop: 12 }}>
                {pour.tags.slice(0, 8).map((t) => <span className="chip" key={t}>{t}</span>)}
              </div>
            )}

            <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => cheer(pour)}
                disabled={!user || busyId === pour.id}
                aria-pressed={pour.cheered}
                title={user ? 'Cheers' : 'Sign in to cheer'}
              >
                🍻 {pour.cheerCount || 0}
                {pour.cheered && ' · you'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
