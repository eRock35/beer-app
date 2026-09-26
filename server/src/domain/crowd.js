import { FAMILY_NOUNS, STYLE_FAMILIES, familyOf } from './styles.js';

/**
 * You vs the crowd: how everyone else rated the beer in your hand, the
 * brewery you are standing in, and the styles you drink.
 *
 * Two rules hold every number here, and both are enforced in this file rather
 * than trusted to a caller:
 *
 * - **Public pours only.** A pour marked private never reaches the feed, so it
 *   must not reach an average either - an average is a way of publishing a
 *   score. `aggregate()` drops anything not explicitly public even if the
 *   query that fed it did not.
 * - **Five drinkers or it does not exist.** An aggregate is only answered when
 *   at least `MIN_DRINKERS` distinct people are behind it. Below that the
 *   answer is `null` - not a smaller number, not a count - because "3 people
 *   average 71" next to a feed showing who drank it points at people.
 *
 * The viewer is always taken OUT of the crowd they are compared with, and
 * five OTHER drinkers are required. Otherwise, with exactly five, you could
 * subtract your own score and read the other four's average - and the crowd
 * is more honest as "everyone but you" anyway.
 *
 * Averages are per drinker, not per pour: someone who logs the same beer six
 * times gets one voice, the mean of their own six, so a regular cannot drag
 * a beer's number wherever they like.
 *
 * Pure: no I/O. The route feeds it the public pours and caches the result.
 */
export const MIN_DRINKERS = 5;

/** How many of your own scored pours in a family before you get a percentile. */
export const MIN_OWN_IN_FAMILY = 2;

/** Folds case, accents, punctuation and "&", so the same beer typed twice meets. */
export function normalise(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// "Side Project" typed by hand and "Side Project Brewing" from the directory
// are the same place. Only the corporate words go - never "beer" or "ale",
// which are sometimes the name.
const BREWERY_NOISE = /\b(the|brewing|brewery|breweries|brewers|company|co|llc|inc)\b/g;

export function breweryKey(name) {
  const plain = normalise(name);
  return plain.replace(BREWERY_NOISE, ' ').replace(/\s+/g, ' ').trim() || plain;
}

export function beerKey(brewery, beerName) {
  const beer = normalise(beerName);
  return beer ? `${breweryKey(brewery)}|${beer}` : '';
}

/** The spelling most people used, for display. */
function commonest(counts) {
  let best = '';
  let n = -1;
  for (const [name, c] of counts) if (c > n) [best, n] = [name, c];
  return best;
}

function tally(map, key, userId, score, name) {
  if (!map.has(key)) map.set(key, { byUser: new Map(), names: new Map() });
  const entry = map.get(key);
  if (!entry.byUser.has(userId)) entry.byUser.set(userId, { sum: 0, n: 0, pours: 0 });
  const u = entry.byUser.get(userId);
  u.pours += 1;
  if (Number.isFinite(score)) {
    u.sum += score;
    u.n += 1;
  }
  if (name) entry.names.set(name, (entry.names.get(name) || 0) + 1);
  return entry;
}

/**
 * One pass over the public pours. Everything is kept per user so a reader can
 * later leave one person (the viewer) out without another pass.
 */
export function aggregate(pours) {
  const beers = new Map();
  const breweries = new Map();
  const families = new Map();

  for (const p of pours) {
    if (p?.visibility !== 'public' || !p.userId) continue;
    const score = p.score == null ? NaN : Number(p.score);

    const bKey = breweryKey(p.brewery);
    if (bKey) {
      const brewery = tally(breweries, bKey, p.userId, score, String(p.brewery).trim());
      const key = beerKey(p.brewery, p.beerName);
      if (key) {
        if (!brewery.beers) brewery.beers = new Set();
        brewery.beers.add(key);
      }
    }

    const key = beerKey(p.brewery, p.beerName);
    if (key) tally(beers, key, p.userId, score, String(p.beerName).trim());

    const fam = p.family || familyOf(p.style);
    if (Number.isFinite(score)) tally(families, fam, p.userId, score);
  }

  return { beers, breweries, families, pours: pours.length };
}

/** The crowd behind one entry, leaving out `excludeUserId`. */
function crowdOf(entry, excludeUserId) {
  if (!entry) return { drinkers: 0, scored: 0, average: null, pours: 0 };
  let drinkers = 0;
  let scored = 0;
  let sum = 0;
  let pours = 0;
  for (const [uid, u] of entry.byUser) {
    if (uid === excludeUserId) continue;
    drinkers += 1;
    pours += u.pours;
    if (u.n) {
      scored += 1;
      sum += u.sum / u.n;
    }
  }
  return { drinkers, scored, pours, average: scored ? sum / scored : null };
}

/** What may be said about a crowd: the average, or nothing at all. */
function publishable(c) {
  if (c.scored < MIN_DRINKERS) return null;
  return { drinkers: c.scored, average: Math.round(c.average) };
}

/** The viewer's own mean over their pours matching `match` - their own data, any visibility. */
function yours(viewerPours, match) {
  const scores = (viewerPours || []).filter(match).map((p) => p.score).filter((s) => Number.isFinite(s));
  if (!scores.length) return null;
  return { average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), pours: scores.length };
}

/** `delta` is worked from the rounded numbers, so "82 · you 91" never reads (+8). */
function withDelta(crowd, you) {
  if (!you) return null;
  return { ...you, delta: crowd ? you.average - crowd.average : null };
}

export function beerCrowd(agg, { brewery, beerName }, { viewerId = null, viewerPours = [] } = {}) {
  const key = beerKey(brewery, beerName);
  const crowd = key ? publishable(crowdOf(agg.beers.get(key), viewerId)) : null;
  const you = key ? yours(viewerPours, (p) => beerKey(p.brewery, p.beerName) === key) : null;
  return { brewery, beerName, crowd, you: withDelta(crowd, you) };
}

/**
 * A brewery: its average (every public score there, per drinker), and the
 * beer the most distinct drinkers have logged there - which itself has to
 * clear the five-drinker bar, or naming it would say who was in.
 */
export function breweryCrowd(agg, name, { viewerId = null, viewerPours = [] } = {}) {
  const key = breweryKey(name);
  const entry = key ? agg.breweries.get(key) : null;
  const crowd = publishable(crowdOf(entry, viewerId));

  let mostPoured = null;
  for (const bk of entry?.beers || []) {
    const beer = agg.beers.get(bk);
    const c = crowdOf(beer, viewerId);
    if (c.drinkers < MIN_DRINKERS) continue;
    const name = commonest(beer.names);
    if (
      !mostPoured ||
      c.drinkers > mostPoured.drinkers ||
      (c.drinkers === mostPoured.drinkers && c.pours > mostPoured.pours) ||
      (c.drinkers === mostPoured.drinkers && c.pours === mostPoured.pours && name < mostPoured.beerName)
    ) {
      mostPoured = { beerName: name, drinkers: c.drinkers, pours: c.pours };
    }
  }

  const you = key ? yours(viewerPours, (p) => breweryKey(p.brewery) === key) : null;
  return {
    brewery: entry ? commonest(entry.names) : String(name || ''),
    crowd,
    mostPoured: mostPoured && { beerName: mostPoured.beerName, drinkers: mostPoured.drinkers },
    you: withDelta(crowd, you),
  };
}

/**
 * Where the viewer sits per style family: the share of other drinkers whose
 * own average for that family is below theirs (ties count half). Only for a
 * family the viewer has scored at least twice, against at least five others.
 */
export function familyStanding(agg, { viewerId, viewerPours = [] }) {
  const mine = new Map();
  for (const p of viewerPours) {
    if (!Number.isFinite(p.score)) continue;
    const fam = p.family || familyOf(p.style);
    if (!mine.has(fam)) mine.set(fam, []);
    mine.get(fam).push(p.score);
  }

  const out = [];
  for (const [fam, scores] of mine) {
    if (scores.length < MIN_OWN_IN_FAMILY) continue;
    const others = [];
    for (const [uid, u] of agg.families.get(fam)?.byUser || []) {
      if (uid !== viewerId && u.n) others.push(u.sum / u.n);
    }
    if (others.length < MIN_DRINKERS) continue;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const below = others.filter((o) => o < avg).length;
    const equal = others.filter((o) => o === avg).length;
    out.push({
      family: fam,
      label: STYLE_FAMILIES[fam] || fam,
      noun: FAMILY_NOUNS[fam] || 'beers',
      yourAverage: Math.round(avg),
      yourPours: scores.length,
      drinkers: others.length,
      percentile: Math.round(((below + equal / 2) / others.length) * 100),
    });
  }
  // Most distinctive first: furthest from the middle of the pack.
  return out.sort((a, b) => Math.abs(b.percentile - 50) - Math.abs(a.percentile - 50));
}
