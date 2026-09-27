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
 *   average 71" next to a feed showing who drank it points at people. With
 *   the even-prefix rule below, a signed-out reader in practice needs six.
 *
 * - **Numbers move two drinkers at a time.** Every aggregate is taken over
 *   the largest EVEN-sized prefix of its drinkers, ordered by when each first
 *   logged a public pour of it (`settled()`). One new drinker never changes a
 *   published number; the second one does. So nobody can read a beer's
 *   average, wait for one person to log it, read it again, and subtract.
 *   See "the differencing rule" below for why this ordering, and what the
 *   rule does not cover.
 *
 * The viewer is taken OUT of the crowd they are compared with - but out of
 * the same even prefix everyone else sees, not out of the full list, and five
 * OTHER drinkers must remain. Removing the viewer before taking the prefix
 * would let them compare their view with a signed-out one: the two sets would
 * differ by the viewer (whose score they know) and one other person.
 *
 * Pure: no I/O. The route feeds it the public pours and caches the result.
 */
export const MIN_DRINKERS = 5;

/** How many of your own scored pours in a family before you get a percentile. */
export const MIN_OWN_IN_FAMILY = 2;

/**
 * The differencing rule.
 *
 * An average over n people read before and after person n+1 logs gives
 * away that person's score: (n+1)*after - n*before. A threshold does not
 * help - it only decides when the first number appears. What helps is that
 * the set of people behind a published number never changes by exactly one.
 *
 * `settled()` orders an entry's drinkers by `createdAt` of their first public
 * pour of it (ties by user id) and keeps the largest even-sized prefix.
 * `createdAt` is stamped by the server and never edited, so a new drinker
 * always sorts last, and a back-dated `drankAt` cannot jump the queue. Any
 * single drinker arriving or leaving changes that prefix by zero or two
 * people:
 *
 * - n even -> n+1: the newcomer is outside the prefix. Nothing moves.
 * - n odd -> n+1: the prefix grows by two - the one who was waiting outside
 *   it and the newcomer. Two unknowns, one equation.
 * - Someone inside the prefix leaves (deleted pour, public -> private): the
 *   prefix loses them and either shrinks by two or takes in the next in line.
 *   Also two people; also one equation.
 * - Someone makes an old pour public again: they re-enter at their old place,
 *   pushing the last member out, or join with the waiting one. Two people.
 *
 * It is deterministic - the same pours give the same prefix on every
 * instance and every recompute - so two readers, or two servers, never see
 * sets that differ by one.
 *
 * What it does NOT stop, said plainly:
 *
 * - **An edit.** A drinker inside the prefix changing their score (or making
 *   one of several pours of the same beer private, which changes their own
 *   mean) moves the average with the set unchanged. A watcher learns that
 *   SOMEONE's mean moved by n times the change - not who. The editor knows,
 *   and nobody else is told.
 * - **A long history.** Every published value is one linear equation over
 *   the people behind it; someone recording values for months could, in
 *   principle, solve a system of them. Whole-number rounding and the route's
 *   five-minute cache make that impractical, not impossible.
 * - **The feed.** Public pours are public: the feed and GET /api/pours/:id
 *   show each one with its author and score. This rule stops the crowd
 *   numbers being a SECOND way to learn a score - including a drinker's mean
 *   across repeat pours, and pours old enough to have left the feed - not the
 *   first.
 */
function settled(entry, { scoredOnly = false } = {}) {
  if (!entry) return [];
  const key = (u) => (scoredOnly ? u.firstScored : u.first) || '';
  const members = [...entry.byUser]
    .filter(([, u]) => !scoredOnly || u.n)
    .sort(([ua, a], [ub, b]) => key(a).localeCompare(key(b)) || (ua < ub ? -1 : ua > ub ? 1 : 0));
  return members.slice(0, members.length - (members.length % 2));
}

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

/** `at` is the pour's server-stamped createdAt: the order of arrival. */
function tally(map, key, userId, score, name, at) {
  if (!map.has(key)) map.set(key, { byUser: new Map(), names: new Map() });
  const entry = map.get(key);
  if (!entry.byUser.has(userId)) entry.byUser.set(userId, { sum: 0, n: 0, pours: 0, first: '', firstScored: '' });
  const u = entry.byUser.get(userId);
  u.pours += 1;
  if (!u.first || (at && at < u.first)) u.first = at;
  if (Number.isFinite(score)) {
    u.sum += score;
    u.n += 1;
    if (!u.firstScored || (at && at < u.firstScored)) u.firstScored = at;
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
    const at = String(p.createdAt || p.drankAt || '');

    const bKey = breweryKey(p.brewery);
    if (bKey) {
      const brewery = tally(breweries, bKey, p.userId, score, String(p.brewery).trim(), at);
      const key = beerKey(p.brewery, p.beerName);
      if (key) {
        if (!brewery.beers) brewery.beers = new Set();
        brewery.beers.add(key);
      }
    }

    const key = beerKey(p.brewery, p.beerName);
    if (key) tally(beers, key, p.userId, score, String(p.beerName).trim(), at);

    const fam = p.family || familyOf(p.style);
    if (Number.isFinite(score)) tally(families, fam, p.userId, score, '', at);
  }

  return { beers, breweries, families, pours: pours.length };
}

/**
 * The crowd behind one entry: the settled prefix of its scored drinkers
 * (for the average) and of all its drinkers (for counts), each with
 * `excludeUserId` then taken out.
 */
function crowdOf(entry, excludeUserId) {
  const scoredSet = settled(entry, { scoredOnly: true }).filter(([uid]) => uid !== excludeUserId);
  const drinkerSet = settled(entry).filter(([uid]) => uid !== excludeUserId);
  let sum = 0;
  for (const [, u] of scoredSet) sum += u.sum / u.n;
  return {
    drinkers: drinkerSet.length,
    scored: scoredSet.length,
    average: scoredSet.length ? sum / scoredSet.length : null,
  };
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
    // Ties go to the name, never to a pour count: one person logging the
    // same beer again must not be able to change which beer is named.
    if (!mostPoured || c.drinkers > mostPoured.drinkers || (c.drinkers === mostPoured.drinkers && name < mostPoured.beerName)) {
      mostPoured = { beerName: name, drinkers: c.drinkers };
    }
  }

  const you = key ? yours(viewerPours, (p) => breweryKey(p.brewery) === key) : null;
  return {
    brewery: entry ? commonest(entry.names) : String(name || ''),
    crowd,
    mostPoured,
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
    // The same even prefix everyone sees, then without the viewer.
    const others = settled(agg.families.get(fam), { scoredOnly: true })
      .filter(([uid]) => uid !== viewerId)
      .map(([, u]) => u.sum / u.n);
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
