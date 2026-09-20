import { Router } from 'express';
import { z } from 'zod';
import { getStore } from '../store/index.js';
import { newId } from '../lib/ids.js';
import { forbidden, notFound, parse, wrap } from '../lib/http.js';
import { requireUser } from '../auth.js';

/**
 * Three small owned-list resources — wishlist, cellar, trips — share the same
 * CRUD shape, so they share one factory instead of three near-identical files.
 */
function ownedResource({ collection, prefix, schema, orderBy = 'createdAt' }) {
  const router = Router();
  router.use(requireUser);

  router.get(
    '/',
    wrap(async (req, res) => {
      const items = await getStore().query(collection, {
        where: [['userId', '==', req.user.id]],
        orderBy,
        direction: 'desc',
        limit: 500,
      });
      res.json({ items });
    })
  );

  router.post(
    '/',
    wrap(async (req, res) => {
      const input = parse(schema, req.body);
      const item = await getStore().put(collection, newId(prefix), {
        ...input,
        userId: req.user.id,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json({ item });
    })
  );

  router.patch(
    '/:id',
    wrap(async (req, res) => {
      const store = getStore();
      const existing = await store.get(collection, req.params.id);
      if (!existing) throw notFound();
      if (existing.userId !== req.user.id) throw forbidden();
      const input = parse(schema, { ...existing, ...req.body });
      const item = await store.put(collection, existing.id, {
        ...existing,
        ...input,
        updatedAt: new Date().toISOString(),
      });
      res.json({ item });
    })
  );

  router.delete(
    '/:id',
    wrap(async (req, res) => {
      const store = getStore();
      const existing = await store.get(collection, req.params.id);
      if (!existing) throw notFound();
      if (existing.userId !== req.user.id) throw forbidden();
      await store.delete(collection, existing.id);
      res.json({ ok: true });
    })
  );

  return router;
}

const wishlistSchema = z.object({
  breweryId: z.string().trim().max(120).default(''),
  breweryName: z.string().trim().min(1).max(160),
  city: z.string().trim().max(80).default(''),
  state: z.string().trim().max(60).default(''),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  note: z.string().trim().max(500).default(''),
  priority: z.enum(['someday', 'next-trip', 'white-whale']).default('someday'),
});

const cellarSchema = z.object({
  beerName: z.string().trim().min(1).max(160),
  brewery: z.string().trim().max(160).default(''),
  style: z.string().trim().max(120).default('Other'),
  abv: z.number().min(0).max(80).nullable().optional(),
  vintage: z.number().int().min(1900).max(2100).nullable().optional(),
  quantity: z.number().int().min(0).max(999).default(1),
  // A drink window is the whole point of a cellar — when is it ready, when is it over.
  drinkFrom: z.string().max(10).default(''),
  drinkBy: z.string().max(10).default(''),
  notes: z.string().trim().max(1000).default(''),
});

const tripSchema = z.object({
  title: z.string().trim().min(1).max(120),
  city: z.string().trim().max(80).default(''),
  state: z.string().trim().max(60).default(''),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  startDate: z.string().max(10).default(''),
  endDate: z.string().max(10).default(''),
  stops: z
    .array(
      z.object({
        id: z.string().max(120).default(''),
        name: z.string().max(160),
        city: z.string().max(80).default(''),
        state: z.string().max(60).default(''),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        done: z.boolean().default(false),
      })
    )
    .max(20)
    .default([]),
  itinerary: z.string().max(20000).default(''),
  notes: z.string().trim().max(2000).default(''),
});

export const wishlistRouter = ownedResource({
  collection: 'wishlist',
  prefix: 'w_',
  schema: wishlistSchema,
});

export const cellarRouter = ownedResource({
  collection: 'cellar',
  prefix: 'b_',
  schema: cellarSchema,
});

export const tripRouter = ownedResource({
  collection: 'trips',
  prefix: 't_',
  schema: tripSchema,
});
