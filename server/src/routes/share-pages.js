import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { getStore } from '../store/index.js';
import { crawlSvg, passportSvg, x } from '../domain/cards.js';
import { createPngCache, png } from '../lib/png.js';
import { crawlByline } from './collections.js';

/**
 * The public faces of a share link, served outside /api because they are
 * what a person (or an unfurler - iMessage, Slack, X) actually opens:
 *
 *   /p/<id>       a passport someone shared: a small page with og:image
 *   /p/<id>.png   its card
 *   /c/<id>       a shared crawl: the SPA's own page, with og tags added
 *   /c/<id>.png   its card
 *
 * Everything drawn or written here comes from the frozen share document,
 * never from the request, and every value is escaped with cards.x() - the
 * same function for SVG text and HTML attributes, since it escapes quotes.
 */
const PASSPORT_ID = /^[A-Za-z0-9_-]{12}$/;
const CRAWL_ID = /^[A-Za-z0-9_-]{1,60}$/;

const pngCache = createPngCache(200);

/** Drops a deleted share's card from this instance's memory. Other instances
 *  hold their own copies, but never serve them: every card request reads the
 *  share document first, and a deleted one is a 404. */
export function forgetCard(kind, id) {
  pngCache.delete(`${kind}:${id}`);
}

const origin = (req) => `${req.protocol}://${req.get('host')}`;

function sendPng(res, key, draw) {
  let buf = pngCache.get(key);
  if (!buf) {
    buf = png(draw());
    if (!buf) return res.status(503).type('text/plain').send('Cards are unavailable.');
    pngCache.set(key, buf);
  }
  // A share is frozen, so its picture never changes - but it can be deleted,
  // so browsers and proxies are only told to keep it for five minutes.
  res.set('Cache-Control', 'public, max-age=300');
  res.set('X-Content-Type-Options', 'nosniff');
  return res.type('image/png').send(buf);
}

const notHere = (res) => res.status(404).type('text/plain').send('Not here.');

/** The tags that make a pasted link unfold into the picture. */
function ogTags({ title, description, image, url }) {
  return [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Hopscotch">',
    `<meta property="og:title" content="${x(title)}">`,
    `<meta property="og:description" content="${x(description)}">`,
    `<meta property="og:image" content="${x(image)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:url" content="${x(url)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${x(title)}">`,
    `<meta name="twitter:description" content="${x(description)}">`,
    `<meta name="twitter:image" content="${x(image)}">`,
  ].join('\n');
}

export function passportTitle(s) {
  const beers = Number(s.beers) || 0;
  return `${s.by || 'A Hopscotch drinker'}’s beer passport: ${beers} ${beers === 1 ? 'beer' : 'beers'}, ${Number(s.badges) || 0} badges`;
}

export function passportDescription(s) {
  const parts = [
    `${Number(s.states) || 0} ${s.states === 1 ? 'state' : 'states'}`,
    `${Number(s.breweries) || 0} ${s.breweries === 1 ? 'brewery' : 'breweries'}`,
  ];
  if (s.longestStreak > 1) parts.push(`a ${s.longestStreak}-day best streak`);
  const top = s.topBeer?.beerName ? ` Top beer: ${s.topBeer.beerName}.` : '';
  return `${parts.join(', ')}.${top} Hopscotch is a craft beer passport - log yours free.`;
}

/**
 * A small standalone page around the card. Light or dark to match the
 * reader; the card itself is always the dark one.
 */
function passportPage(req, id, s) {
  const title = passportTitle(s);
  const description = passportDescription(s);
  const image = `${origin(req)}/p/${id}.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${x(title)}</title>
<meta name="description" content="${x(description)}">
<meta name="robots" content="noindex">
${ogTags({ title, description, image, url: `${origin(req)}/p/${id}` })}
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f5f3ee">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121211">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
:root{color-scheme:light dark;--bg:#f5f3ee;--label:#17160f;--label-2:#5f5c54;--tint:#8a5806;--tint-fill:#b3730a;--on-tint:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#121211;--label:#f5f4ef;--label-2:#b5b2a6;--tint:#f0be62;--tint-fill:#e8a93c;--on-tint:#17160f}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--label);font:17px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
main{width:100%;max-width:760px;padding:24px 16px calc(24px + env(safe-area-inset-bottom));text-align:center}
img{display:block;width:100%;height:auto;border-radius:16px;box-shadow:0 18px 50px -18px rgba(0,0,0,.45)}
h1{font-size:22px;line-height:1.25;margin:22px 0 6px;overflow-wrap:anywhere}
p{color:var(--label-2);margin:0 0 22px;overflow-wrap:anywhere}
a.go{display:inline-flex;align-items:center;justify-content:center;min-height:50px;background:var(--tint-fill);color:var(--on-tint);text-decoration:none;font-weight:700;padding:0 26px;border-radius:14px}
small{display:block;color:var(--label-2);margin-top:22px;font-size:13px}
</style>
</head>
<body>
<main>
<img src="${x(image)}" alt="${x(title)}" width="1200" height="630">
<h1>${x(title)}</h1>
<p>${x(description)}</p>
<a class="go" href="/">Start your own passport</a>
<small>A snapshot from the day it was shared, not a live view.</small>
</main>
</body>
</html>`;
}

function crawlSummary(c) {
  const stops = Array.isArray(c.stops) ? c.stops : [];
  const where = [c.city, c.state].filter(Boolean).join(', ');
  const route = stops.slice(0, 4).map((s) => s.name).join(' → ') + (stops.length > 4 ? ' …' : '');
  return `${c.by || 'Someone'} shared a crawl: ${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}${where ? ` in ${where}` : ''}. ${route}`;
}

export function sharePages({ dist }) {
  const router = Router();
  const indexFile = path.join(dist, 'index.html');
  let indexHtml = null;
  const spa = () => {
    if (indexHtml == null && fs.existsSync(indexFile)) indexHtml = fs.readFileSync(indexFile, 'utf8');
    return indexHtml;
  };

  router.get(/^\/p\/([A-Za-z0-9_-]{12})\.png$/, async (req, res, next) => {
    try {
      const id = req.params[0];
      const share = await getStore().get('passport_shares', id);
      if (!share) return notHere(res);
      return sendPng(res, `p:${id}`, () => passportSvg(share));
    } catch (err) {
      return next(err);
    }
  });

  router.get('/p/:id', async (req, res, next) => {
    try {
      const id = String(req.params.id || '');
      if (!PASSPORT_ID.test(id)) return notHere(res);
      const share = await getStore().get('passport_shares', id);
      if (!share) return notHere(res);
      res.set('Cache-Control', 'public, max-age=60');
      return res.type('html').send(passportPage(req, id, share));
    } catch (err) {
      return next(err);
    }
  });

  router.get(/^\/c\/([A-Za-z0-9_-]{1,60})\.png$/, async (req, res, next) => {
    try {
      const id = req.params[0];
      const crawl = await getStore().get('shared_crawls', id);
      if (!crawl) return notHere(res);
      const by = await crawlByline(crawl);
      return sendPng(res, `c:${id}`, () => crawlSvg({ ...crawl, by }));
    } catch (err) {
      return next(err);
    }
  });

  /**
   * A shared crawl is still the SPA's page (SharedCrawlView draws it); this
   * only adds the og tags to index.html on the way out, so a pasted link
   * unfolds into the route. An unknown id gets the page untouched with a 404,
   * and the SPA says "Not here" as it always did.
   */
  router.get('/c/:shareId', async (req, res, next) => {
    try {
      const html = spa();
      if (!html) return next();
      const id = String(req.params.shareId || '');
      const crawl = CRAWL_ID.test(id) ? await getStore().get('shared_crawls', id) : null;
      res.set('Cache-Control', 'no-cache');
      if (!crawl) return res.status(404).type('html').send(html);
      crawl.by = await crawlByline(crawl);
      const title = `${crawl.title || 'A crawl'} · Hopscotch`;
      const tags = ogTags({
        title,
        description: crawlSummary(crawl),
        image: `${origin(req)}/c/${id}.png`,
        url: `${origin(req)}/c/${id}`,
      });
      // Function replacers: a title containing "$'" must not be read as a
      // replacement pattern.
      const page = html
        .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${x(title)}</title>`)
        .replace('</head>', () => `${tags}\n</head>`);
      return res.type('html').send(page);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
