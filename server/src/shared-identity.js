/**
 * The shared account, read from Hopscotch.
 *
 * Every other app on this domain signs in through `eriks-projects/shared/
 * identity.js`: one email, one password, one passkey, one cookie scoped to the
 * parent domain. Hopscotch was built before that existed and kept its own
 * users, its own bcrypt hashes and its own JWT - so a passkey enrolled once
 * worked on four apps and not on the fifth, and the person who owns the place
 * had to sign in again to look at a beer list.
 *
 * This does NOT move Hopscotch's data onto identity. Pours, cellars and trips
 * are keyed by this app's own `u_...` ids, and rekeying live data to get a
 * second sign-in door would be a migration with nothing to gain. Identity says
 * WHO; the local row stays the thing everything is keyed by, matched on email.
 * That is the same split trip-planner settled on.
 *
 * Inert unless BOTH `IDENTITY_SESSION_SECRET` and `IDENTITY_DATABASE_ID` are
 * set on the service, and that is deliberate rather than defensive:
 *
 *  - Without the secret every HMAC is computed over an empty key, so anyone
 *    could mint a session for any account. Refusing to recognise the cookie at
 *    all is the only safe reading of a missing secret.
 *  - Without the identity database this could still verify a cookie - the uid
 *    is just the base64url of the address - but it could not see that the
 *    account had been deleted or disabled, and a deleted account's outstanding
 *    cookie would keep opening Hopscotch for another thirty days. An account
 *    you deleted has to be deleted everywhere.
 *
 * Both are Cloud Run bindings on `hopscotch-run@`, which the deployer has no
 * rights to make. Until they exist this file does nothing and Hopscotch's own
 * sign-in is unchanged - which is why the whole thing is written as an
 * addition and never as a replacement.
 */
import crypto from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { getStore } from './store/index.js';
import { newId } from './lib/ids.js';

const COOKIE = 'stc_session';
const USERS = 'users';

const secret = () => process.env.IDENTITY_SESSION_SECRET || '';
const databaseId = () => process.env.IDENTITY_DATABASE_ID || '';

export const sharedSignInEnabled = () => Boolean(secret() && databaseId());

let client = null;
function identityDb() {
  if (!client) {
    client = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      databaseId: databaseId(),
    });
  }
  return client;
}

/** Verify the shared cookie. Same token shape as shared/identity.js: a
 *  base64url JSON body, a dot, and an HMAC of that body. */
function readToken(token, key) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const idx = token.lastIndexOf('.');
  const body = token.slice(0, idx);
  const expected = Buffer.from(crypto.createHmac('sha256', key).update(body).digest('base64url'));
  const got = Buffer.from(token.slice(idx + 1));
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (!payload || !payload.sub) return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/**
 * The Hopscotch user behind a shared session, or null.
 *
 * First sight of an address creates the local row, because the alternative is
 * telling someone who signed in correctly that they have no account here - and
 * Hopscotch's own registration would then refuse the address as taken.
 */
export async function userFromSharedSession(req) {
  if (!sharedSignInEnabled()) return null;
  const raw = req.cookies?.[COOKIE];
  if (!raw) return null;
  const payload = readToken(raw, secret());
  if (!payload) return null;

  const record = await identityDb().collection(USERS).doc(payload.sub).get().catch(() => null);
  // No record, or a disabled one, means the cookie outlived the account.
  if (!record || !record.exists) return null;
  const identity = record.data();
  if (identity.disabled) return null;

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

/** Where the shared account is managed: password, passkeys, leaving. */
export const ACCOUNT_URL = 'https://strongtechnicalconsulting.com/account';

/**
 * Sign out of the domain, not just out of Hopscotch.
 *
 * The cookie was set with a Domain attribute covering the parent domain, so
 * clearing it has to name the same Domain - a cookie cleared without one is a
 * different cookie, and the browser keeps sending the original.
 */
export function clearSharedSessionCookie(req, res) {
  const base = String(process.env.PASSKEY_RP_ID || '').trim();
  const host = String(req.hostname || '');
  const bits = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (base && (host === base || host.endsWith('.' + base))) bits.push(`Domain=.${base}`);
  res.append('Set-Cookie', bits.join('; '));
}
