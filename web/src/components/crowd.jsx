import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { PeopleIcon } from './icons.jsx';

/**
 * You vs the crowd, on the page.
 *
 * The server decides what may be said - public pours only, five other
 * drinkers or nothing - so this only draws what came back. A beer the crowd
 * has not reached yet draws nothing rather than "not enough data" on every
 * card; the one place that explains the bar is the Passport.
 */

const keyOf = (brewery, beerName) => `${String(brewery || '').trim()}\u0000${String(beerName || '').trim()}`;

/**
 * Crowd numbers for a list of beers, fetched in one request.
 * Returns a lookup: `get(brewery, beerName)` -> the server's entry or null.
 */
export function useBeerCrowd(items) {
  const wanted = useMemo(() => {
    const seen = new Map();
    for (const it of items || []) {
      if (!it?.beerName) continue;
      const k = keyOf(it.brewery, it.beerName);
      if (!seen.has(k)) seen.set(k, { brewery: String(it.brewery || '').trim(), beerName: String(it.beerName).trim() });
    }
    return [...seen.values()].slice(0, 200);
  }, [items]);
  const signature = wanted.map((w) => keyOf(w.brewery, w.beerName)).join('\u0001');
  const [byKey, setByKey] = useState(() => new Map());

  useEffect(() => {
    if (!wanted.length) return undefined;
    let cancelled = false;
    api
      .crowdBeers(wanted)
      .then(({ beers }) => {
        if (cancelled) return;
        setByKey(new Map(beers.map((b, i) => [keyOf(wanted[i].brewery, wanted[i].beerName), b])));
      })
      // The crowd is a garnish; a card without it is still a card.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return useMemo(() => ({ get: (brewery, beerName) => byKey.get(keyOf(brewery, beerName)) || null }), [byKey]);
}

/** "+9", "−4", "level" - a real minus sign, and no "+0". */
export function signed(n) {
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'level';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/**
 * One line under a beer: "Hopscotch drinkers average 82 · you gave 91 (+9)".
 * `yourScore` is the score on the pour being shown (the journal), which beats
 * the server's average of all your pours of it (the feed, the map).
 */
export function CrowdLine({ entry, yourScore, youLabel = 'you gave' }) {
  const crowd = entry?.crowd;
  if (!crowd) return null;
  const mine = Number.isFinite(yourScore) ? yourScore : entry.you?.average;
  const delta = Number.isFinite(mine) ? mine - crowd.average : null;
  return (
    <p className="crowd-line">
      <PeopleIcon size={16} />
      <span>
        Hopscotch drinkers average <strong className="tabular">{crowd.average}</strong>
        {Number.isFinite(mine) && (
          <>
            {' · '}
            {Number.isFinite(yourScore) ? youLabel : 'you'} <strong className="tabular">{mine}</strong>
            {' '}
            <span className={`crowd-delta${delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : ''}`}>({signed(delta)})</span>
          </>
        )}
      </span>
    </p>
  );
}

/** A brewery's crowd for the map sheet: its average, and what most people order. */
export function BreweryCrowd({ name }) {
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null });
    api
      .crowdBrewery(name)
      .then((data) => !cancelled && setState({ loading: false, data }))
      .catch(() => !cancelled && setState({ loading: false, data: null }));
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (state.loading) return <div className="skeleton" style={{ height: 64 }} aria-busy="true" aria-label="Loading the crowd" />;
  const d = state.data;
  if (!d) return null;

  return (
    <section className="crowd-card" aria-label="The crowd here">
      <div className="crowd-card-head">
        <PeopleIcon size={18} />
        The crowd here
      </div>
      {d.crowd ? (
        <>
          <p className="crowd-card-line">
            Hopscotch drinkers average <strong className="tabular">{d.crowd.average}</strong> here
            {d.you && (
              <>
                {' · '}you <strong className="tabular">{d.you.average}</strong>{' '}
                <span className="crowd-delta">({signed(d.you.delta)})</span>
              </>
            )}
          </p>
          {d.mostPoured && (
            <p className="crowd-card-line">
              Most-poured here: <strong>{d.mostPoured.beerName}</strong>
            </p>
          )}
        </>
      ) : (
        <p className="crowd-card-line secondary">
          {d.you
            ? `You average ${d.you.average} here. `
            : ''}
          The crowd shows up once {d.minDrinkers || 5} other drinkers have logged a public pour here.
        </p>
      )}
    </section>
  );
}

/**
 * "You rate stouts and porters higher than 88% of drinkers." At either end
 * a percentage reads oddly ("higher than 100%"), so it is said in words.
 */
export function standingSentence(s) {
  if (s.percentile >= 100) return `You rate ${s.noun} higher than every other drinker`;
  if (s.percentile <= 0) return `You’re tougher on ${s.noun} than every other drinker`;
  if (s.percentile >= 50) return `You rate ${s.noun} higher than ${s.percentile}% of drinkers`;
  return `You’re tougher on ${s.noun} than ${100 - s.percentile}% of drinkers`;
}
