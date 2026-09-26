import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import { TtlCache } from '../lib/cache.js';
import { parse, wrap } from '../lib/http.js';
import { requireUser } from '../auth.js';
import { MIN_DRINKERS, aggregate, beerCrowd, breweryCrowd, familyStanding } from '../domain/crowd.js';

/**
 * You vs the crowd, over HTTP. The rules (public only, five drinkers, the
 * viewer left out) live in domain/crowd.js; this file only feeds it.
 *
 * Computed on read from every public pour, then held in memory for
 * `CROWD_CACHE_SECONDS` (five minutes). Not counter documents: an edit that
 * changes a score, a style or public -> private would have to move three
 * counters exactly once each, and a missed decrement is a number that is wrong
 * forever. A recompute cannot drift. The cost is one read of the public pours
 * per instance per five minutes, which is nothing at this size; past a few
 * tens of thousands of public pours, counters become worth their bookkeeping.
 *
 * No timer refreshes it - the service is billed per request, so the cache is
 * filled by whichever request finds it stale, inside that request.
 *
 * The query is one equality filter with no order, so it needs no composite
 * index on Firestore.
 */
export const crowdRouter = Router();

const MAX_PUBLIC_POURS = 50000;
const cache = new TtlCache({ max: 1, ttlMs: config.crowdCacheSeconds * 1000 });

async function crowdAggregate() {
  const load = async () =>
    aggregate(
      await getStore().query('pours', {
        where: [['visibility', '==', 'public']],
        limit: MAX_PUBLIC_POURS,
      })
    );
  if (config.crowdCacheSeconds <= 0) return load();
  return cache.wrap('public', load);
}

/** The viewer's own journal, for "you gave 91". Nothing when signed out. */
async function viewerPours(req) {
  if (!req.user) return [];
  return getStore().query('pours', { where: [['userId', '==', req.user.id]], limit: 2000 });
}

const beersInput = z.object({
  beers: z
    .array(
      z.object({
        brewery: z.string().trim().max(160).default(''),
        beerName: z.string().trim().min(1).max(160),
      })
    )
    .max(200),
});

/**
 * Many beers in one round trip - a journal or a feed page asks for all of its
 * cards at once rather than one request per card. A POST only because the
 * list does not fit in a query string; nothing is written.
 */
crowdRouter.post(
  '/beers',
  wrap(async (req, res) => {
    const { beers } = parse(beersInput, req.body);
    const [agg, mine] = await Promise.all([crowdAggregate(), viewerPours(req)]);
    const opts = { viewerId: req.user?.id || null, viewerPours: mine };
    res.set('Cache-Control', 'private, max-age=60');
    res.json({ minDrinkers: MIN_DRINKERS, beers: beers.map((b) => beerCrowd(agg, b, opts)) });
  })
);

crowdRouter.get(
  '/brewery',
  wrap(async (req, res) => {
    const name = String(req.query.name || '').trim().slice(0, 160);
    const [agg, mine] = await Promise.all([crowdAggregate(), viewerPours(req)]);
    res.set('Cache-Control', 'private, max-age=60');
    res.json({
      minDrinkers: MIN_DRINKERS,
      ...breweryCrowd(agg, name, { viewerId: req.user?.id || null, viewerPours: mine }),
    });
  })
);

/** "You rate stouts higher than 88% of drinkers", per style family. */
crowdRouter.get(
  '/palate',
  requireUser,
  wrap(async (req, res) => {
    const [agg, mine] = await Promise.all([crowdAggregate(), viewerPours(req)]);
    res.set('Cache-Control', 'private, max-age=60');
    res.json({ minDrinkers: MIN_DRINKERS, families: familyStanding(agg, { viewerId: req.user.id, viewerPours: mine }) });
  })
);
