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
import { cellarRouter, tripRouter, wishlistRouter } from './routes/collections.js';
import { passportRouter } from './routes/passport.js';
import { aiRouter } from './routes/ai.js';
import { AXES } from './domain/scoring.js';
import { FLAVOUR_TAGS, STYLES, STYLE_FAMILIES } from './domain/styles.js';

async function main() {
  await initStore();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(compression());
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
  app.use('/api/passport', passportRouter);
  app.use('/api/ai', aiRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint.' }));

  // Built SPA, when there is one. In dev, Vite serves the client instead.
  const dist = config.webDist;
  if (fs.existsSync(dist)) {
    app.use(
      express.static(dist, {
        // Hashed asset filenames can be cached hard; index.html must not be.
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
          else if (/\.[0-9a-f]{8,}\./.test(filePath)) {
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
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error('[hopscotch]', err);
    if (res.headersSent) return;
    res.status(status).json({
      error: status >= 500 ? 'Something broke on our end.' : err.message,
      details: err.details,
    });
  });

  app.listen(config.port, config.host, () => {
    console.log(
      `[hopscotch] listening on http://${config.host}:${config.port} ` +
        `(store=${config.dbDriver}, ai=${config.aiEnabled ? 'on' : 'off'})`
    );
    if (!config.aiEnabled) {
      console.log('[hopscotch] sommelier disabled — set ANTHROPIC_API_KEY to enable it.');
    }
  });
}

main().catch((err) => {
  console.error('[hopscotch] failed to start:', err);
  process.exit(1);
});
