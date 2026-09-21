import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import { newId } from '../lib/ids.js';
import { badRequest, HttpError, parse, wrap } from '../lib/http.js';
import { clearSharedSessionCookie, sharedSignInEnabled, ACCOUNT_URL } from '../shared-identity.js';
import {
  checkPassword,
  clearSessionCookie,
  hashPassword,
  issueToken,
  publicUser,
  requireUser,
  setSessionCookie,
} from '../auth.js';

const credentials = z.object({
  email: z.string().email('Needs to be a real email address.'),
  password: z.string().min(8, 'At least 8 characters.').max(200),
  displayName: z.string().trim().min(1).max(60).optional(),
});

export const authRouter = Router();

authRouter.post(
  '/register',
  wrap(async (req, res) => {
    if (!config.allowRegistration) throw new HttpError(403, 'Registration is closed on this deployment.');
    const body = parse(credentials, req.body);
    const email = body.email.toLowerCase();

    if (config.inviteEmails.length && !config.inviteEmails.includes(email)) {
      throw new HttpError(403, 'That email is not on the invite list for this deployment.');
    }

    const store = getStore();
    const [existing] = await store.query('users', { where: [['email', '==', email]], limit: 1 });
    if (existing) throw badRequest('That email is already registered. Try signing in.');

    const user = await store.put('users', newId('u_'), {
      email,
      displayName: body.displayName || email.split('@')[0],
      passwordHash: await hashPassword(body.password),
      homeCity: '',
      homeState: '',
      homeBreweryName: '',
      homeBreweryId: '',
      whiteWhaleBrewery: '',
      units: 'imperial',
      createdAt: new Date().toISOString(),
    });

    setSessionCookie(res, issueToken(user));
    res.status(201).json({ user: publicUser(user) });
  })
);

authRouter.post(
  '/login',
  wrap(async (req, res) => {
    const body = parse(credentials.omit({ displayName: true }), req.body);
    const store = getStore();
    const [user] = await store.query('users', {
      where: [['email', '==', body.email.toLowerCase()]],
      limit: 1,
    });
    // Same message either way — don't confirm which emails exist.
    const ok = user && (await checkPassword(body.password, user.passwordHash));
    if (!ok) throw new HttpError(401, 'Email or password is wrong.');

    setSessionCookie(res, issueToken(user));
    res.json({ user: publicUser(user) });
  })
);

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  // Signed in on the shared domain account? Then this app's own cookie is not
  // what is holding the session open, and clearing it alone would leave
  // someone pressing "sign out" and staying signed in. Sign them out of the
  // domain, which is what they asked for by the door they came through.
  if (req.viaSharedAccount) clearSharedSessionCookie(req, res);
  res.json({ ok: true, signedOutEverywhere: Boolean(req.viaSharedAccount) });
});

authRouter.get('/me', (req, res) => {
  res.json({
    user: publicUser(req.user),
    // Told to a signed-OUT visitor too: it is the difference between "make an
    // account" and "you already have one, it is the same one as the other
    // apps". Only true on a deployment actually wired for it.
    sharedSignIn: sharedSignInEnabled(),
    // So the profile screen can point at the one page that owns the password
    // and the passkeys, rather than offering to change a password this app
    // does not hold.
    sharedAccount: Boolean(req.viaSharedAccount),
    accountUrl: sharedSignInEnabled() ? ACCOUNT_URL : null,
  });
});

const profilePatch = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  homeCity: z.string().trim().max(80).optional(),
  homeState: z.string().trim().max(40).optional(),
  homeBreweryName: z.string().trim().max(120).optional(),
  homeBreweryId: z.string().trim().max(120).optional(),
  whiteWhaleBrewery: z.string().trim().max(120).optional(),
  units: z.enum(['imperial', 'metric']).optional(),
});

authRouter.patch(
  '/me',
  requireUser,
  wrap(async (req, res) => {
    const changes = parse(profilePatch, req.body);
    const updated = await getStore().patch('users', req.user.id, changes);
    res.json({ user: publicUser(updated) });
  })
);
