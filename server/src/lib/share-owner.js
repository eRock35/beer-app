import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Who made a share link, without saying so.
 *
 * A share document is read by anyone holding the link, so it cannot carry a
 * user id - that would tie a public card back to an account. It carries
 * `owner`: an HMAC of the user id under a key derived from JWT_SECRET. The
 * server can recompute it for whoever is signed in and match ("your shared
 * links", delete), and nothing outside the server can turn it back into an
 * account or match two shares to the same person without the secret.
 *
 * Derived from JWT_SECRET rather than a secret of its own so no new secret
 * has to be created and bound to the runtime account. The cost: rotating
 * JWT_SECRET orphans every existing tag - the links keep working, but nobody
 * can list or delete them from the app any more. Rotation already signs
 * everyone out, so it is not done lightly; if it ever is, this is the thing
 * to remember.
 */
const key = crypto.createHmac('sha256', config.jwtSecret).update('hopscotch:share-owner:v1').digest();

export function ownerTag(userId) {
  return crypto.createHmac('sha256', key).update(String(userId)).digest('base64url');
}

/** Constant-time: a share's tag against the signed-in user's. */
export function ownsShare(share, userId) {
  if (!share?.owner || !userId) return false;
  const a = Buffer.from(String(share.owner));
  const b = Buffer.from(ownerTag(userId));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
