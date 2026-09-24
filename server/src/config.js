import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchor relative paths to the server package, not to whatever directory the
// process happened to start in — otherwise `npm run seed` and `npm start` can
// quietly end up pointed at two different database files.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fromPackageRoot = (p) => (path.isAbsolute(p) ? p : path.resolve(packageRoot, p));

/** When the image was built (see Dockerfile). Null outside a built image. */
function readBuildInfo() {
  try {
    return fs.readFileSync(path.resolve(packageRoot, '..', 'BUILD_INFO'), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

const bool = (v, dflt = false) =>
  v === undefined ? dflt : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

const isProd = process.env.NODE_ENV === 'production';

/**
 * A dev-only fallback secret. In production we refuse to boot without a real
 * one, because a predictable JWT secret means anyone can mint a session.
 */
function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (isProd) {
    throw new Error(
      'JWT_SECRET must be set to at least 16 characters in production. ' +
        'Generate one with: openssl rand -base64 48'
    );
  }
  // Stable for the life of the process so dev logins survive hot reloads badly,
  // but never survive a restart — which is the point.
  return crypto.randomBytes(32).toString('hex');
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',

  jwtSecret: resolveJwtSecret(),
  jwtTtlSeconds: Number(process.env.JWT_TTL_SECONDS || 60 * 60 * 24 * 30),
  cookieName: 'hopscotch_session',

  // 'sqlite' for local dev, 'firestore' for Cloud Run (the container disk is
  // ephemeral, so SQLite there would quietly lose every pour on redeploy).
  dbDriver: process.env.DB_DRIVER || (isProd ? 'firestore' : 'sqlite'),
  sqlitePath: fromPackageRoot(process.env.SQLITE_PATH || './data/hopscotch.sqlite'),
  firestoreProjectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID,
  firestoreCollectionPrefix: process.env.FIRESTORE_PREFIX || 'hopscotch',
  // A project's `(default)` database may be in Datastore mode, which this app
  // cannot use. Naming a database keeps Hopscotch in its own Native-mode store.
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || '',

  breweryApiBase: process.env.BREWERY_API_BASE || 'https://api.openbrewerydb.org/v1',
  nominatimBase: process.env.NOMINATIM_BASE || 'https://nominatim.openstreetmap.org',
  // Nominatim's usage policy requires a real identifying User-Agent.
  userAgent:
    process.env.OUTBOUND_USER_AGENT ||
    'Hopscotch/1.0 (craft beer passport; +https://github.com/eRock35/beer-app)',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
  aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  aiDailyMessageLimit: Number(process.env.AI_DAILY_MESSAGE_LIMIT || 60),
  // Shared secret for the scheduled dispatch sweep. Unset means the endpoint
  // refuses every caller, which is the right default.
  cronSecret: process.env.CRON_SECRET?.trim() || '',
  // The scheduled sweep runs with no user to bill, so the per-user daily cap
  // does not apply to it. This is the only thing bounding what one firing can
  // spend, so it is a hard limit rather than a suggestion.
  dispatchMaxWatchesPerSweep: Number(process.env.DISPATCH_MAX_WATCHES_PER_SWEEP || 25),

  allowRegistration: bool(process.env.ALLOW_REGISTRATION, true),
  // When set, only these emails may register. Handy for a personal deployment.
  inviteEmails: (process.env.INVITE_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  buildInfo: readBuildInfo(),
  webDist: fromPackageRoot(process.env.WEB_DIST || '../web/dist'),
};
