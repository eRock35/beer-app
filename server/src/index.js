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
import { AXES } from './domain/scoring.js';
import { FLAVOUR_TAGS, STYLES, STYLE_FAMILIES } from './domain/styles.js';

async function main() {
  await initStore();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(compression());
  // Photos go to /api/ai/scan as base64, so that one route needs more headroom
  // than everything else. The client downscales first; this is the ceiling.
  app.use('/api/ai/scan', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '1mb' }));
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
  app.use('/api/ai', aiRouter);
  app.use('/api/dispatch', dispatchRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint.' }));

  // Built SPA, when there is one. In dev, Vite serves the client instead.
  const dist = config.webDist;
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
