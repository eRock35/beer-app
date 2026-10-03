import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { config } from './config.js';
import { initStore } from './store/index.js';
import { attachUser } from './auth.js';
import { HttpError } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { breweryRouter } from './routes/breweries.js';
import { pourRouter } from './routes/pours.js';
import { cellarRouter, sharedCrawlRouter, tripRouter, wishlistRouter } from './routes/collections.js';
import { passportRouter } from './routes/passport.js';
import { aiRouter } from './routes/ai.js';
import { dispatchRouter } from './routes/dispatch.js';
import { crowdRouter } from './routes/crowd.js';
import { sharePages } from './routes/share-pages.js';
import { sharesRouter } from './routes/shares.js';
import { AXES } from './domain/scoring.js';
import { FLAVOUR_TAGS, STYLES, STYLE_FAMILIES } from './domain/styles.js';

/** Express matches routes case-insensitively and with a trailing slash, so
 *  the parser skip has to as well. */
const SCAN_PATH = /^\/api\/ai\/scan\/?$/i;

/**
 * Baseline headers on every response, API and SPA alike.
 *
 * frame-ancestors, not X-Frame-Options: the landing page at
 * strongtechnicalconsulting.com shows the app in an iframe as a live preview
 * (its tour mode), and X-Frame-Options cannot name another origin. There is
 * no script-src policy yet: index.html loads the tour and beacon scripts and
 * the map pulls tiles from elsewhere, and a policy that has not been tried
 * against the built app in a browser would break it quietly.
 */
function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://strongtechnicalconsulting.com https://www.strongtechnicalconsulting.com"
  );
  next();
}

/**
 * The iPhone app's association file (eriks-projects/mobile/README.md): it lets
 * a link to this site - a shared crawl, a passport card - open the app
 * (applinks), and lets the app's web view use the passwords saved for this
 * site (webcredentials). Apple fetches it with no cookie and follows no
 * redirect, so it is mounted ahead of everything that could get in the way.
 * Every path but /api/* opens in the app.
 *
 * The Team ID is read from APPLE_TEAM_ID on each request and is never written
 * in this public repo. Unset or malformed, the file does not exist (404), so
 * nothing wrong is ever published.
 */
export function appleAppSiteAssociation(_req, res) {
  const team = String(process.env.APPLE_TEAM_ID || '').trim();
  if (!/^[A-Z0-9]{10}$/.test(team)) return res.status(404).json({ error: 'No such file.' });
  const appID = `${team}.com.strongtechnicalconsulting.hopscotch`;
  res.set('Cache-Control', 'public, max-age=3600');
  return res.json({
    applinks: {
      details: [
        {
          appIDs: [appID],
          components: [
            { '/': '/api/*', exclude: true, comment: 'The API is never a page.' },
            { '/': '*' },
          ],
        },
      ],
    },
    webcredentials: { apps: [appID] },
  });
}

/**
 * "Get the iPhone app" (eriks-projects/shared/get-app.js): the bar on an
 * iPhone asks this for the TestFlight public link. It comes from the
 * TESTFLIGHT_URL setting, unset until Apple approves a build for external
 * testing; anything that is not exactly such a link answers null and the bar
 * stays hidden. Mounted next to the association file, ahead of the SPA's
 * catch-all.
 */
const TESTFLIGHT_LINK = /^https:\/\/testflight\.apple\.com\/join\/[A-Za-z0-9]{4,20}$/;
export function iosApp(_req, res) {
  const url = String(process.env.TESTFLIGHT_URL || '').trim();
  res.set('Cache-Control', 'public, max-age=300');
  return res.json({ name: 'Hopscotch', url: TESTFLIGHT_LINK.test(url) ? url : null });
}

async function main() {
  await initStore();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(compression());
  app.use(securityHeaders);
  app.get('/.well-known/apple-app-site-association', appleAppSiteAssociation);
  app.get('/ios-app.json', iosApp);
  // Photos go to /api/ai/scan as base64, so that one route needs more headroom
  // than everything else. Its 8 MB parser is on the route itself (routes/ai.js),
  // AFTER requireUser and the quota check, so a signed-out request's body is
  // never read. This app-wide 1 MB parser stays off that path, or it would
  // refuse the photo before the route's own parser got to it.
  const json1mb = express.json({ limit: '1mb' });
  app.use((req, res, next) => (SCAN_PATH.test(req.path) ? next() : json1mb(req, res, next)));
  app.use(cookieParser());

  // Auth attempts get a tighter budget than ordinary browsing.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Give it fifteen minutes.' },
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  app.use('/api', apiLimiter, attachUser);

  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      driver: config.dbDriver,
      database: config.dbDriver === 'firestore' ? config.firestoreDatabaseId || '(default)' : undefined,
      ai: config.aiEnabled,
      version: process.env.APP_VERSION || 'dev',
    })
  );

  /** Static reference data the client needs to render its forms. */
  app.get('/api/reference', (_req, res) =>
    res.json({
      axes: AXES,
      styles: STYLES,
      styleFamilies: STYLE_FAMILIES,
      flavourTags: FLAVOUR_TAGS,
      aiEnabled: config.aiEnabled,
    })
  );

  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/breweries', breweryRouter);
  app.use('/api/pours', pourRouter);
  app.use('/api/wishlist', wishlistRouter);
  app.use('/api/cellar', cellarRouter);
  app.use('/api/trips', tripRouter);
  // Public on purpose: a shared crawl is a link you hand to someone who has
  // no account here. It is a frozen copy, so it exposes no live document.
  app.use('/api/shared-crawl', sharedCrawlRouter);
  app.use('/api/passport', passportRouter);
  // Open to signed-out readers too: every number it answers is an aggregate
  // over five or more drinkers' public pours, or nothing.
  app.use('/api/crowd', crowdRouter);
  // The share links you made, and deleting them. Signed in only.
  app.use('/api/shares', sharesRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/dispatch', dispatchRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint.' }));

  // Share links: /p/<id> (a passport) and the og tags and card for /c/<id>
  // (a crawl). Ahead of the static files so /c/<id> gets its tags added.
  const dist = config.webDist;
  app.use(sharePages({ dist }));

  // Built SPA, when there is one. In dev, Vite serves the client instead.
  if (fs.existsSync(dist)) {
    app.use(
      express.static(dist, {
        // Hashed asset filenames can be cached hard; index.html must not be.
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
            return;
          }
          // Everything Vite emits into assets/ carries a content hash in its
          // filename, so those are safe to cache forever. Matching on the hash
          // itself is fragile — Vite's hashes are base64url, not hex, and are
          // separated by a dash rather than a dot.
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature.
  app.use((err, req, res, _next) => {
    // An HttpError is one we raised on purpose, so its message is written for
    // the user and is safe to send — including the 5xx ones like "the brewery
    // directory is unreachable". Anything else is a genuine surprise: log it
    // with its stack and tell the user nothing beyond that it broke.
    const deliberate = err instanceof HttpError;
    const status = deliberate ? err.status : 500;

    if (!deliberate) console.error('[hopscotch] unhandled:', err);
    else if (status >= 500) console.warn(`[hopscotch] ${status}: ${err.message}`);

    if (res.headersSent) return;
    res.status(status).json({
      error: deliberate ? err.message : 'Something broke on our end.',
      details: err.details,
    });
  });

  return app.listen(config.port, config.host, () => {
    console.log(
      `[hopscotch] listening on http://${config.host}:${config.port} ` +
        `(store=${config.dbDriver}, ai=${config.aiEnabled ? 'on' : 'off'})`
    );
    if (!config.aiEnabled) {
      console.log('[hopscotch] sommelier disabled — set ANTHROPIC_API_KEY to enable it.');
    }
  });
}

/**
 * Importing this module starts the server - that is how `npm start` runs it.
 * The bound server is exported as a promise so a test can close it afterwards;
 * without a handle to close, a test run never exits.
 */
export const started = main();

started.catch((err) => {
  console.error('[hopscotch] failed to start:', err);
  process.exit(1);
});
