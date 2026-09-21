import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Banner, Spinner } from '../components/ui.jsx';
import { CalendarIcon, MapPinIcon, SignpostIcon } from '../components/icons.jsx';
import { placeLine } from '../lib/format.js';

/**
 * A crawl someone sent you.
 *
 * Deliberately outside the tabbed shell: whoever opens this link has no
 * account and did not come here to browse. They came to see where everyone is
 * walking tonight, in order, and the page should be that and then an invitation
 * — not a signed-out app with one readable screen.
 */
export function SharedCrawlView({ shareId }) {
  const [crawl, setCrawl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .sharedCrawl(shareId)
      .then((data) => {
        if (!cancelled) setCrawl(data.crawl);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  useEffect(() => {
    if (crawl) document.title = `${crawl.title} · Hopscotch`;
  }, [crawl]);

  if (error) {
    return (
      <main className="main">
        <div className="page-head">
          <div className="page-head-text">
            <p className="eyebrow">Shared crawl</p>
            <h1 className="large-title">Not here</h1>
            <p className="page-lede">{error}</p>
          </div>
        </div>
        <a className="btn btn-primary btn-lg" href="/">
          Open Hopscotch
        </a>
      </main>
    );
  }

  if (!crawl) {
    return (
      <main className="main">
        <Spinner label="Loading the crawl" />
      </main>
    );
  }

  const stops = crawl.stops || [];
  const verdict = walkVerdict(crawl);

  return (
    <main className="main">
      <div className="page-head">
        <div className="page-head-text">
          <p className="eyebrow">{crawl.by} shared a crawl</p>
          <h1 className="large-title">{crawl.title}</h1>
          <p className="card-sub meta-line" style={{ marginTop: 8 }}>
            {placeLine(crawl.city, crawl.state) && (
              <span>
                <MapPinIcon />
                {placeLine(crawl.city, crawl.state)}
              </span>
            )}
            {crawl.startDate && (
              <span>
                <CalendarIcon />
                {crawl.startDate}
                {crawl.endDate ? ` → ${crawl.endDate}` : ''}
              </span>
            )}
            <span>
              <SignpostIcon />
              {stops.length} {stops.length === 1 ? 'stop' : 'stops'}
            </span>
          </p>
        </div>
      </div>

      {verdict && (
        <div style={{ marginBottom: 14 }}>
          <Banner kind="info">{verdict}</Banner>
        </div>
      )}

      <article className="card">
        <ol className="list-reset" style={{ margin: 0, display: 'grid' }}>
          {stops.map((stop, i) => (
            <li
              key={`${stop.name}-${i}`}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'baseline',
                padding: '10px 0',
                borderTop: i ? '1px solid var(--sep)' : 0,
              }}
            >
              <span
                className="muted tabular"
                style={{ width: 20, fontWeight: 700, fontSize: 14, flex: '0 0 auto' }}
              >
                {i + 1}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 16, display: 'block' }}>{stop.name}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {[placeLine(stop.city, stop.state), stop.walkMinutes != null && i > 0 ? `${stop.walkMinutes} min walk` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {crawl.itinerary && (
          <>
            <hr className="divider" />
            <div
              className="secondary"
              style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.55, userSelect: 'text', WebkitUserSelect: 'text' }}
            >
              {crawl.itinerary}
            </div>
          </>
        )}
      </article>

      <div style={{ marginTop: 22 }}>
        <a className="btn btn-primary btn-lg" href="/" style={{ width: '100%', justifyContent: 'center' }}>
          Plan your own crawl
        </a>
        <p className="muted" style={{ fontSize: 13, marginTop: 10, textAlign: 'center' }}>
          This is a snapshot of {crawl.by}’s plan, not a live view — the route you see is the one
          they sent. Planning your own needs no account.
        </p>
      </div>
    </main>
  );
}

/** The whole reason anyone plans a crawl: can we walk this, or is it a car night? */
function walkVerdict(crawl) {
  if (crawl.walkable == null && crawl.totalMiles == null) return '';
  const distance = crawl.totalMiles != null ? `${crawl.totalMiles} miles` : '';
  const time = crawl.totalWalkMinutes != null ? `about ${crawl.totalWalkMinutes} minutes on foot` : '';
  const measured = [distance, time].filter(Boolean).join(', ');
  if (crawl.walkable === false) {
    return `Not a walking night — ${measured || 'the stops are spread out'}. Line up a ride between stops.`;
  }
  return `Walkable — ${measured || 'the stops are close together'} across the whole route.`;
}

/**
 * A shared crawl lives at /c/<id>. Returns the id when that is the current
 * path, so App can render this instead of the tabbed shell. Hash routing
 * handles everything else, so this is the only path the SPA inspects.
 */
export function sharedCrawlId() {
  const match = window.location.pathname.match(/^\/c\/([A-Za-z0-9_-]{1,60})\/?$/);
  return match ? match[1] : '';
}
