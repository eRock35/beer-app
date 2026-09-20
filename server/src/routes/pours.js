import { Router } from 'express';
import { z } from 'zod';
import { getStore } from '../store/index.js';
import { newId } from '../lib/ids.js';
import { forbidden, notFound, parse, wrap } from '../lib/http.js';
import { requireUser } from '../auth.js';
import { AXIS_KEYS, snobScore, verdict } from '../domain/scoring.js';
import { familyOf } from '../domain/styles.js';

const scoreShape = z.object(
  Object.fromEntries(AXIS_KEYS.map((k) => [k, z.number().min(0).max(10).optional()]))
);

const pourInput = z.object({
  beerName: z.string().trim().min(1, 'The beer needs a name.').max(160),
  brewery: z.string().trim().max(160).default(''),
  breweryId: z.string().trim().max(120).default(''),
  style: z.string().trim().max(120).default('Other'),
  abv: z.number().min(0).max(80).nullable().optional(),
  ibu: z.number().min(0).max(200).nullable().optional(),
  servingFormat: z.enum(['draft', 'can', 'bottle', 'crowler', 'cask', 'taster']).default('draft'),
  scores: scoreShape.default({}),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  notes: z.string().trim().max(4000).default(''),
  photoUrl: z.string().trim().url().max(500).or(z.literal('')).default(''),
  city: z.string().trim().max(80).default(''),
  state: z.string().trim().max(60).default(''),
  country: z.string().trim().max(60).default(''),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  drankAt: z.string().datetime().optional(),
});

/** Everything derived from the raw entry lives here, computed on write. */
function decorate(input, userId, existing = {}) {
  const score = snobScore(input.scores);
  return {
    ...existing,
    ...input,
    userId,
    score,
    verdict: verdict(score).label,
    family: familyOf(input.style),
    drankAt: input.drankAt || existing.drankAt || new Date().toISOString(),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Attaches author, cheer count and whether the viewer has cheered. */
async function hydrate(pours, viewerId) {
  if (!pours.length) return [];
  const store = getStore();
  const userIds = [...new Set(pours.map((p) => p.userId))];
  const users = await Promise.all(userIds.map((id) => store.get('users', id)));
  const nameById = new Map(
    users.filter(Boolean).map((u) => [u.id, { displayName: u.displayName, id: u.id }])
  );

  return Promise.all(
    pours.map(async (p) => {
      const cheers = await store.query('cheers', { where: [['pourId', '==', p.id]] });
      const comments = await store.count('comments', { where: [['pourId', '==', p.id]] });
      return {
        ...p,
        author: nameById.get(p.userId) || { displayName: 'Someone', id: p.userId },
        cheerCount: cheers.length,
        cheered: viewerId ? cheers.some((c) => c.userId === viewerId) : false,
        commentCount: comments,
      };
    })
  );
}

export const pourRouter = Router();

/** The drinker's own journal. */
pourRouter.get(
  '/',
  requireUser,
  wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    let pours = await getStore().query('pours', {
      where: [['userId', '==', req.user.id]],
      orderBy: 'drankAt',
      direction: 'desc',
      limit,
    });

    const { family, style, minScore, q } = req.query;
    if (family) pours = pours.filter((p) => p.family === family);
    if (style) pours = pours.filter((p) => p.style === style);
    if (minScore) pours = pours.filter((p) => (p.score ?? -1) >= Number(minScore));
    if (q) {
      const needle = String(q).toLowerCase();
      pours = pours.filter((p) =>
        `${p.beerName} ${p.brewery} ${p.style} ${p.notes} ${(p.tags || []).join(' ')}`
          .toLowerCase()
          .includes(needle)
      );
    }

    res.json({ pours: await hydrate(pours, req.user.id) });
  })
);

/** The shared feed. Private pours never appear here. */
pourRouter.get(
  '/feed',
  wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const pours = await getStore().query('pours', {
      where: [['visibility', '==', 'public']],
      orderBy: 'drankAt',
      direction: 'desc',
      limit,
    });
    res.json({ pours: await hydrate(pours, req.user?.id) });
  })
);

pourRouter.post(
  '/',
  requireUser,
  wrap(async (req, res) => {
    const input = parse(pourInput, req.body);
    const pour = await getStore().put('pours', newId('p_'), decorate(input, req.user.id));
    res.status(201).json({ pour: (await hydrate([pour], req.user.id))[0] });
  })
);

pourRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const store = getStore();
    const pour = await store.get('pours', req.params.id);
    if (!pour) throw notFound('No such pour.');
    if (pour.visibility === 'private' && pour.userId !== req.user?.id) throw notFound('No such pour.');
    const comments = await store.query('comments', {
      where: [['pourId', '==', pour.id]],
      orderBy: 'createdAt',
      direction: 'asc',
    });
    res.json({ pour: (await hydrate([pour], req.user?.id))[0], comments });
  })
);

pourRouter.patch(
  '/:id',
  requireUser,
  wrap(async (req, res) => {
    const store = getStore();
    const existing = await store.get('pours', req.params.id);
    if (!existing) throw notFound('No such pour.');
    if (existing.userId !== req.user.id) throw forbidden('That is someone else’s pour.');
    const input = parse(pourInput, { ...existing, ...req.body });
    const pour = await store.put('pours', existing.id, decorate(input, req.user.id, existing));
    res.json({ pour: (await hydrate([pour], req.user.id))[0] });
  })
);

pourRouter.delete(
  '/:id',
  requireUser,
  wrap(async (req, res) => {
    const store = getStore();
    const existing = await store.get('pours', req.params.id);
    if (!existing) throw notFound('No such pour.');
    if (existing.userId !== req.user.id) throw forbidden('That is someone else’s pour.');
    await store.delete('pours', existing.id);
    // Leaving orphaned cheers and comments behind would inflate counts forever.
    for (const c of await store.query('cheers', { where: [['pourId', '==', existing.id]] })) {
      await store.delete('cheers', c.id);
    }
    for (const c of await store.query('comments', { where: [['pourId', '==', existing.id]] })) {
      await store.delete('comments', c.id);
    }
    res.json({ ok: true });
  })
);

/** Cheers toggle — one per person per pour. */
pourRouter.post(
  '/:id/cheers',
  requireUser,
  wrap(async (req, res) => {
    const store = getStore();
    const pour = await store.get('pours', req.params.id);
    if (!pour) throw notFound('No such pour.');
    const existing = await store.query('cheers', {
      where: [['pourId', '==', pour.id], ['userId', '==', req.user.id]],
      limit: 1,
    });
    if (existing.length) {
      await store.delete('cheers', existing[0].id);
    } else {
      await store.put('cheers', newId('ch_'), {
        pourId: pour.id,
        userId: req.user.id,
        createdAt: new Date().toISOString(),
      });
    }
    const cheers = await store.query('cheers', { where: [['pourId', '==', pour.id]] });
    res.json({ cheerCount: cheers.length, cheered: !existing.length });
  })
);

pourRouter.post(
  '/:id/comments',
  requireUser,
  wrap(async (req, res) => {
    const body = parse(z.object({ body: z.string().trim().min(1).max(1000) }), req.body);
    const store = getStore();
    const pour = await store.get('pours', req.params.id);
    if (!pour) throw notFound('No such pour.');
    const comment = await store.put('comments', newId('c_'), {
      pourId: pour.id,
      userId: req.user.id,
      authorName: req.user.displayName,
      body: body.body,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ comment });
  })
);
