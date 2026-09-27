import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { getStore } from './store/index.js';
import { unauthorized } from './lib/http.js';
import { resolveSharedSession } from './shared-identity.js';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

/** A hash of nothing in particular, compared against when there is no real
 *  one, so "no such account" takes as long as "wrong password". Made once,
 *  lazily, at the same cost factor as real hashes. */
let dummyHash;
const dummy = () => (dummyHash ??= bcrypt.hash('hopscotch-timing-equaliser', 12));

export async function checkPassword(plain, hash) {
  if (!hash) {
    await bcrypt.compare(String(plain ?? ''), await dummy());
    return false;
  }
  return bcrypt.compare(plain, hash);
}

export function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtTtlSeconds,
  });
}

export function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.jwtTtlSeconds * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { path: '/' });
}

function readToken(req) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[config.cookieName] || null;
}

/**
 * Populates req.user when a valid session exists. Never rejects.
 *
 * Two doors. This app's own JWT is tried first because it is the one every
 * existing account uses and the one that works with no extra configuration;
 * the shared domain account is tried second, and only does anything on a
 * deployment wired for it. Second rather than first on purpose: an account
 * already signed in here must not change identity because a sibling app's
 * cookie happens to be in the same jar.
 */
export async function attachUser(req, _res, next) {
  try {
    const token = readToken(req);
    if (token) {
      const payload = jwt.verify(token, config.jwtSecret);
      const user = await getStore().get('users', payload.sub);
      if (user) {
        req.user = user;
        return next();
      }
    }
  } catch {
    // An expired or forged token is simply an anonymous request - fall through
    // to the shared account rather than giving up here.
  }
  try {
    const shared = await resolveSharedSession(req);
    if (shared?.user) {
      req.user = shared.user;
      req.viaSharedAccount = true;
    } else if (shared?.linkRequired) {
      // Signed in on the shared account, but its address belongs to a
      // Hopscotch account that has not been linked to it. Anonymous here;
      // /api/auth/me tells the page so it can offer the link.
      req.sharedLinkRequired = shared.linkRequired;
    }
  } catch (err) {
    // The identity database being unreachable must not take Hopscotch down
    // with it; it just means no shared sign-in on this request.
    console.error('[auth] shared account lookup failed', err.message);
  }
  next();
}

/** Route guard for anything that touches a person's own data. */
export function requireUser(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

/** Strips the password hash before a user object ever leaves the server. */
export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}
