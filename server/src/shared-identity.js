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

/** Where the shared account is managed: password, passkeys, leaving. The
 *  subdomain is the page - `/account` on the apex is an alias that still
 *  works, so an older link in someone's history is not broken. */
export const ACCOUNT_URL = 'https://acct.strongtechnicalconsulting.com';

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
 * Who the shared-domain cookie on this request belongs to, as the identity
 * service tells it: `{ uid, email, displayName }`, or null. Exported for the
 * link route, which needs the identity without a Hopscotch row.
 */
export async function sharedIdentity(req) {
  if (!sharedSignInEnabled()) return null;
  const raw = req.cookies?.[COOKIE];
  if (!raw) return null;
  const identity = await whoIs(raw);
  if (!identity) return null;
  const email = String(identity.email || '').trim().toLowerCase();
  const uid = String(identity.uid || '').trim();
  // No uid, no sign-in: the uid is what a row is linked by (see below), and
  // an answer without one is not one this code knows how to trust.
  if (!email || !uid) return null;
  return { uid, email, displayName: String(identity.displayName || '').trim() };
}

/**
 * The Hopscotch user behind a shared session.
 *
 * Returns `{ user }`, `{ linkRequired: { email } }`, or null.
 *
 * This does NOT move Hopscotch's data onto identity. Pours, cellars and trips
 * are keyed by this app's own `u_...` ids; identity says WHO, and the local
 * row carries that identity's `identityUid`.
 *
 * ## Linked by uid, never by email alone (2026-09-27)
 *
 * This used to hand the shared session whichever local row had the same
 * email. The identity service does not verify that an address belongs to the
 * person who registers it, so anyone could register someone else's address
 * there and walk into their Hopscotch account - private pours, cellar, trips.
 * Now:
 *
 *  - A row whose `identityUid` is this identity's uid is theirs. Matched by
 *    uid, so a change of case in the email does not matter.
 *  - No row with this email at all: a fresh one is created, carrying the uid.
 *    Nothing to take over, and the alternative is telling someone who signed
 *    in correctly that they have no account here.
 *  - A row with this email made by the shared door before the uid was stored
 *    (`fromSharedAccount`, no password): linked now. It was only ever
 *    reachable through this same address on the shared account, so linking it
 *    grants nothing new - and it has no password to link it with.
 *  - A Hopscotch account with its own password and no link: NOT signed in.
 *    Proving an address to the identity service proves nothing about who made
 *    this account. The page offers "link it" instead, which takes this
 *    account's Hopscotch password once (POST /api/auth/link-shared).
 *  - A row linked to a DIFFERENT identity uid: nobody.
 */
export async function resolveSharedSession(req) {
  const identity = await sharedIdentity(req);
  if (!identity) return null;

  const store = getStore();
  const [linked] = await store.query(USERS, { where: [['identityUid', '==', identity.uid]], limit: 1 });
  if (linked) return { user: linked };

  const [byEmail] = await store.query(USERS, { where: [['email', '==', identity.email]], limit: 1 });
  if (byEmail) {
    if (byEmail.identityUid) return null;
    if (byEmail.fromSharedAccount && !byEmail.passwordHash) {
      return { user: await store.patch(USERS, byEmail.id, { identityUid: identity.uid }) };
    }
    return { linkRequired: { email: identity.email } };
  }

  const user = await store.put(USERS, newId('u_'), {
    email: identity.email,
    // Never the email's local part: this name is shown on the public feed.
    displayName: identity.displayName.slice(0, 60),
    // No passwordHash on purpose. This account signs in on the shared
    // password or passkey; leaving the field unset means Hopscotch's own
    // /login cannot be used against it, rather than being open to an empty
    // one. checkPassword already refuses a missing hash.
    homeCity: '', homeState: '', homeBreweryName: '', homeBreweryId: '',
    whiteWhaleBrewery: '', units: 'imperial',
    fromSharedAccount: true,
    identityUid: identity.uid,
    createdAt: new Date().toISOString(),
  });
  return { user };
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
