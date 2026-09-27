import { Router } from 'express';
import { getStore } from '../store/index.js';
import { notFound, wrap } from '../lib/http.js';
import { requireUser } from '../auth.js';
import { ownerTag, ownsShare } from '../lib/share-owner.js';
import { forgetCard } from './share-pages.js';

/**
 * Your shared links: the passports and crawls you have handed out, and a
 * way to take any of them back.
 *
 * Found by `owner`, the HMAC tag written on each share (lib/share-owner.js)
 * - one equality filter, no order, so no composite index; sorted here.
 * Deleting is the owner's alone, and anyone else gets the same 404 as for a
 * link that never existed, so the route does not confirm that an id is real.
 *
 * A deleted link is dead everywhere at once: /p/<id>, /c/<id> and their
 * PNGs read the share document on every request, so no instance can serve a
 * card from memory after the document is gone. What cannot be recalled is a
 * preview a chat app already fetched and kept - that copy is theirs.
 */
export const sharesRouter = Router();
sharesRouter.use(requireUser);

const KINDS = {
  passport: { collection: 'passport_shares', path: 'p' },
  crawl: { collection: 'shared_crawls', path: 'c' },
};

const newestFirst = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

sharesRouter.get(
  '/',
  wrap(async (req, res) => {
    const store = getStore();
    const tag = ownerTag(req.user.id);
    const [passports, crawls] = await Promise.all([
      store.query('passport_shares', { where: [['owner', '==', tag]], limit: 200 }),
      store.query('shared_crawls', { where: [['owner', '==', tag]], limit: 200 }),
    ]);
    const origin = `${req.protocol}://${req.get('host')}`;
    res.set('Cache-Control', 'no-store');
    res.json({
      passports: passports.sort(newestFirst).map((s) => ({
        id: s.id,
        url: `${origin}/p/${s.id}`,
        png: `${origin}/p/${s.id}.png`,
        beers: s.beers,
        badges: s.badges,
        createdAt: s.createdAt,
      })),
      crawls: crawls.sort(newestFirst).map((s) => ({
        id: s.id,
        url: `${origin}/c/${s.id}`,
        title: s.title,
        stops: s.stops?.length || 0,
        createdAt: s.createdAt,
      })),
    });
  })
);

sharesRouter.delete(
  '/:kind/:id',
  wrap(async (req, res) => {
    const kind = KINDS[req.params.kind];
    if (!kind) throw notFound('No such link.');
    const id = String(req.params.id || '').slice(0, 60);
    const store = getStore();
    const share = await store.get(kind.collection, id);
    if (!share || !ownsShare(share, req.user.id)) throw notFound('No such link.');
    await store.delete(kind.collection, id);
    forgetCard(kind.path, id);
    res.json({ ok: true });
  })
);
