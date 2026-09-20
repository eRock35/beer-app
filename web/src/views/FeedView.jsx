import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useAsync } from '../store.jsx';
import { Empty, ErrorState, LoadingList, ScorePill } from '../components/ui.jsx';
import { PageTitle } from '../components/header.jsx';
import { BubblesIcon, CheersIcon, MapPinIcon, PlusIcon } from '../components/icons.jsx';
import { relativeDate, placeLine } from '../lib/format.js';

export function FeedView({ go }) {
  const { user } = useApp();
  const { data, loading, error, setData, reload } = useAsync(() => api.feed(), []);
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

  return (
    <>
      <PageTitle
        eyebrow="Everyone"
        title="Feed"
        action={
          user && (
            <button type="button" className="btn btn-primary" onClick={() => go('journal')}>
              <PlusIcon /> Log a pour
            </button>
          )
        }
      >
        What everyone is drinking. Your own pours show up here when you mark them public.
      </PageTitle>

      {loading && <LoadingList rows={3} height={130} />}

      {error && !loading && (
        <ErrorState title="The feed did not load" onRetry={reload}>{error}</ErrorState>
      )}

      {!loading && !error && !pours.length && (
        <Empty
          icon={<BubblesIcon />}
          title="Quiet in here"
          action={
            user ? (
              <button type="button" className="btn btn-primary" onClick={() => go('journal')}>Log a pour</button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => go('journal')}>Sign in to post</button>
            )
          }
        >
          Nobody has logged a public pour yet. Be the first.
        </Empty>
      )}

      <div className="stack">
        {pours.map((pour) => (
          <article key={pour.id} className="card">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
                  {pour.author?.displayName} · {relativeDate(pour.drankAt)}
                </div>
                <h3 className="card-title" style={{ margin: '2px 0 0' }}>{pour.beerName}</h3>
                <p className="card-sub">
                  {[pour.brewery, pour.style].filter(Boolean).join(' · ')}
                  {pour.abv ? ` · ${pour.abv}%` : ''}
                </p>
                {placeLine(pour.city, pour.state) && (
                  <p className="muted meta-line" style={{ margin: '4px 0 0' }}>
                    <span><MapPinIcon />{placeLine(pour.city, pour.state)}</span>
                  </p>
                )}
              </div>
              <ScorePill score={pour.score} />
            </div>

            {pour.notes && <p className="card-text">{pour.notes}</p>}

            {pour.tags?.length > 0 && (
              <div className="chips chips-sm" style={{ marginTop: 12 }}>
                {pour.tags.slice(0, 8).map((t) => <span className="chip" key={t}>{t}</span>)}
              </div>
            )}

            <div className="card-actions">
              <button
                type="button"
                className={`btn btn-sm ${pour.cheered ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => cheer(pour)}
                disabled={!user || busyId === pour.id}
                aria-pressed={pour.cheered}
                title={user ? 'Cheers' : 'Sign in to cheer'}
                style={{ flex: '0 0 auto' }}
              >
                <CheersIcon /> {pour.cheerCount || 0}
                {pour.cheered && ' · you'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
