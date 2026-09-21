/**
 * The shared account, read from Hopscotch.
 *
 * Every other app on this domain signs in through one account: one email, one
 * password, one passkey, one cookie scoped to the parent domain. Hopscotch was
 * built before that existed and kept its own users, its own bcrypt hashes and
 * its own JWT - so a passkey enrolled once worked on four apps and not on the
 * fifth, and the person who owns the place had to sign in again to look at a
 * beer list.
 *
 * ## Why this asks over HTTP instead of reading the database
 *
 * The obvious implementation verifies the cookie here (it is an HMAC, the
 * secret is in Secret Manager) and reads the account out of the `identity`
 * Firestore database. That was the first version, and it needed two IAM
 * bindings on `hopscotch-run@`: secretAccessor on the session secret, and
 * datastore.user scoped to the identity database. The deployer can set
 * secret-level IAM but has no `resourcemanager.projects.setIamPolicy`, and
 * Firestore has no per-database IAM policy to set instead - so that version
 * could not be turned on without a console step.
 *
 * Asking the identity service the question directly needs neither. The cookie
 * is forwarded to `/api/id/me` on the landing service, which already verifies
 * it and already reads the live record, and it answers with the account. That
 * is strictly less privilege than the first version - Hopscotch never holds
 * the signing secret, so it cannot mint a session for anyone, and it never
 * holds credentials for the identity database, so it cannot read anyone's
 * record except the one whose cookie was presented to it.
 *
 * Two properties fall out of asking rather than deriving:
 *
 *  - A deleted or disabled account stops working here within the cache
 *    window, because the answer comes from the live record rather than from
 *    the cookie's own claims. An account deleted on the account page has to be
 *    deleted everywhere.
 *  - If the identity service is unreachable, shared sign-in fails closed and
 *    Hopscotch's own accounts carry on. Losing a door is not losing the app.
 *
 * The cost is one HTTPS round trip per sign-in check, so answers are cached
 * for a minute against the cookie itself. That bounds how stale a revoked
 * session can be and keeps a busy page from asking sixty times.
 */
import crypto from 'node:crypto';
import { getStore } from './store/index.js';
import { newId } from './lib/ids.js';

const COOKIE = 'stc_session';
const USERS = 'users';

/** Where the shared account is managed: password, passkeys, leaving. */
export const ACCOUNT_URL = 'https://strongtechnicalconsulting.com/account';

/** Who to ask. Overridable so a test can point it at a local stand-in, and
 *  emptyable so a deployment can turn shared sign-in off outright. */
const verifyUrl = () =>
  (process.env.IDENTITY_VERIFY_URL === undefined
    ? 'https://strongtechnicalconsulting.com/api/id/me'
    : process.env.IDENTITY_VERIFY_URL);

export const sharedSignInEnabled = () => Boolean(verifyUrl());

/* ---------- the cache ---------- */

const TTL_MS = 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map();   // sha256(cookie) -> { at, identity }

/** Keyed by a hash, not the cookie. A session token in a long-lived map is a
 *  credential sitting in memory for no reason; the hash answers the only
 *  question this cache asks, which is "the same cookie as last time?". */
const keyFor = (raw) => crypto.createHash('sha256').update(raw).digest('base64url');

function cached(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) { cache.delete(key); return undefined; }
  return hit.identity;
}

function remember(key, identity) {
  // Negative answers are cached too, and on purpose: a signed-out visitor
  // browsing the map would otherwise ask the identity service on every
  // request for an answer that will not change.
  if (cache.size > MAX_ENTRIES) cache.clear();
  cache.set(key, { at: Date.now(), identity });
}

/** Ask the identity service who this cookie belongs to. Returns the account,
 *  or null for "nobody" - including when the service cannot be reached, which
 *  is the fail-closed half of the bargain above. */
async function whoIs(raw) {
  const key = keyFor(raw);
  const hit = cached(key);
  if (hit !== undefined) return hit;

  let identity = null;
  try {
    const res = await fetch(verifyUrl(), {
      headers: { cookie: `${COOKIE}=${raw}`, accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const body = await res.json();
      if (body && body.signedIn && body.email) identity = body;
    }
  } catch (err) {
    // Unreachable identity service: no shared sign-in this minute. Not cached
    // as a negative for long, and never allowed to fail the request.
    console.error('[auth] could not reach the identity service:', err.message);
  }
  remember(key, identity);
  return identity;
}

/**
 * The Hopscotch user behind a shared session, or null.
 *
 * This does NOT move Hopscotch's data onto identity. Pours, cellars and trips
 * are keyed by this app's own `u_...` ids, and rekeying live data to gain a
 * second sign-in door would be a migration with nothing to gain. Identity says
 * WHO; the local row stays the thing everything is keyed by, matched on email.
 * Same split trip-planner settled on.
 *
 * First sight of an address creates the local row, because the alternative is
 * telling someone who signed in correctly that they have no account here - and
 * Hopscotch's own registration would then refuse the address as taken.
 */
export async function userFromSharedSession(req) {
  if (!sharedSignInEnabled()) return null;
  const raw = req.cookies?.[COOKIE];
  if (!raw) return null;

  const identity = await whoIs(raw);
  if (!identity) return null;
  const email = String(identity.email || '').toLowerCase();
  if (!email) return null;

  const store = getStore();
  const [existing] = await store.query(USERS, { where: [['email', '==', email]], limit: 1 });
  if (existing) return existing;

  return store.put(USERS, newId('u_'), {
    email,
    displayName: identity.displayName || email.split('@')[0],
    // No passwordHash on purpose. This account signs in on the shared
    // password or passkey; leaving the field unset means Hopscotch's own
    // /login cannot be used against it, rather than being open to an empty
    // one. checkPassword already refuses a missing hash.
    homeCity: '', homeState: '', homeBreweryName: '', homeBreweryId: '',
    whiteWhaleBrewery: '', units: 'imperial',
    fromSharedAccount: true,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Sign out of the domain, not just out of Hopscotch.
 *
 * The cookie was set with a Domain attribute covering the parent domain, so
 * clearing it has to name the same Domain - a cookie cleared without one is a
 * different cookie, and the browser keeps sending the original.
 */
export function clearSharedSessionCookie(req, res) {
  const base = String(process.env.PASSKEY_RP_ID || 'strongtechnicalconsulting.com').trim();
  const host = String(req.hostname || '');
  const bits = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (base && (host === base || host.endsWith('.' + base))) bits.push(`Domain=.${base}`);
  res.append('Set-Cookie', bits.join('; '));
  // The signed-out session must not keep answering from the cache.
  const raw = req.cookies?.[COOKIE];
  if (raw) cache.delete(keyFor(raw));
}

/** Test seam: the cache is process-wide and a suite that signs two people in
 *  on the same stand-in would otherwise see the first one's answer. */
export function __clearSharedSessionCache() { cache.clear(); }
