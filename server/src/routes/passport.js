import { Router } from 'express';
import { getStore } from '../store/index.js';
import { wrap } from '../lib/http.js';
import { requireUser } from '../auth.js';
import { computeBadges } from '../domain/badges.js';
import { STYLE_FAMILIES } from '../domain/styles.js';
import { AXES } from '../domain/scoring.js';
import { SAMPLE_PROFILE, sampleCellar, samplePours } from '../domain/sample-journal.js';

export const passportRouter = Router();

/**
 * Everything the Passport view needs in one round trip: badges, the state map,
 * the style breakdown and the five-axis palate average.
 */
function buildPassport(pours, { cellarCount, homeBreweryId, homeBreweryName }) {
  const { badges, earnedCount, stats } = computeBadges(pours, {
    cellarCount,
    homeBreweryId,
    homeBreweryName,
  });

  // Average per axis — this is the shape of a palate, not a ranking.
  const palate = AXES.map((axis) => {
    const values = pours.map((p) => p.scores?.[axis.key]).filter((v) => Number.isFinite(v));
    return {
      axis: axis.key,
      label: axis.label,
      average: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null,
      n: values.length,
    };
  });

  const families = Object.entries(STYLE_FAMILIES).map(([key, label]) => ({
    key,
    label,
    count: stats.families[key] || 0,
  }));

  const scored = pours.filter((p) => p.score != null);
  const topPours = [...scored].sort((a, b) => b.score - a.score).slice(0, 10);

  // A month-by-month series for the trend line, oldest first.
  const byMonth = new Map();
  for (const p of pours) {
    const month = String(p.drankAt || p.createdAt || '').slice(0, 7);
    if (!month) continue;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(p.score);
  }
  const timeline = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, scores]) => {
      const valid = scores.filter((s) => s != null);
      return {
        month,
        count: scores.length,
        averageScore: valid.length
          ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
          : null,
      };
    });

  return {
    badges,
    earnedCount,
    stats: {
      ...stats,
      cellarCount,
      averageScore: scored.length
        ? Math.round(scored.reduce((a, p) => a + p.score, 0) / scored.length)
        : null,
      uniqueStyles: new Set(pours.map((p) => p.style)).size,
    },
    palate,
    families,
    topPours,
    timeline,
  };
}

/**
 * The same screen, computed from the worked-example journal.
 *
 * The Passport is the best thing in this app and the one screen a new account
 * cannot see: it needs a dozen scored pours before the radar, the badges and
 * the trend mean anything, and nobody logs a dozen beers to find out whether
 * an app is worth using. This writes nothing and reads nothing - it is the
 * seed data run through the same function the real passport uses, so it can
 * never show a layout the app does not actually produce.
 *
 * Registered above requireUser deliberately: there is no user in it.
 */
passportRouter.get(
  '/sample',
  wrap(async (_req, res) => {
    const pours = samplePours();
    const cellarCount = sampleCellar().reduce((n, b) => n + (Number(b.quantity) || 0), 0);
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      sample: true,
      by: SAMPLE_PROFILE.displayName,
      ...buildPassport(pours, {
        cellarCount,
        homeBreweryId: SAMPLE_PROFILE.homeBreweryId,
        homeBreweryName: SAMPLE_PROFILE.homeBreweryName,
      }),
    });
  })
);

passportRouter.use(requireUser);

passportRouter.get(
  '/',
  wrap(async (req, res) => {
    const store = getStore();
    const pours = await store.query('pours', {
      where: [['userId', '==', req.user.id]],
      orderBy: 'drankAt',
      direction: 'desc',
      limit: 2000,
    });
    const cellar = await store.query('cellar', { where: [['userId', '==', req.user.id]] });
    const cellarCount = cellar.reduce((n, b) => n + (Number(b.quantity) || 0), 0);

    res.json(
      buildPassport(pours, {
        cellarCount,
        homeBreweryId: req.user.homeBreweryId,
        homeBreweryName: req.user.homeBreweryName,
      })
    );
  })
);
