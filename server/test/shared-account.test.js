// Signing in to Hopscotch with the account that covers every app.
//
// Hopscotch keeps its own users - pours, cellars and trips are keyed by its
// own `u_...` ids - so the shared account is a second DOOR, not a migration.
// What is worth pinning down is the wiring: that the shared cookie is honoured,
// that it maps to one local row rather than a new one each time, that a
// revoked session stops working, that the app's own accounts still win, and
// that an identity service which is down costs a door rather than the app.
//
// The identity service is a stand-in on localhost. The real one is asked over
// HTTPS, which is the whole point of the design - Hopscotch holds no signing
// secret and no database credentials, so the only account it can ever learn
// about is the one whose cookie was presented to it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const PORT = 8793;
const IDENTITY_PORT = 8794;
const B = `http://127.0.0.1:${PORT}`;
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hopscotch-shared-')), 'test.sqlite');

process.env.PORT = String(PORT);
process.env.HOST = '127.0.0.1';
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_PATH = dbFile;
process.env.JWT_SECRET = 'test-secret-at-least-sixteen-chars';
process.env.WEB_DIST = path.join(os.tmpdir(), 'no-such-dist');
process.env.IDENTITY_VERIFY_URL = `http://127.0.0.1:${IDENTITY_PORT}/api/id/me`;
delete process.env.ANTHROPIC_API_KEY;

const J = { 'content-type': 'application/json' };
const post = (p, body, cookie) =>
  fetch(B + p, { method: 'POST', headers: cookie ? { ...J, cookie } : J, body: JSON.stringify(body ?? {}) });
const get = (p, cookie) => fetch(B + p, { headers: cookie ? { cookie } : {} });

/** What the identity service answers for an address. Its uid is the
 *  base64url of the lowercased address, as the real one derives it. */
const who = (email, displayName) => ({
  email,
  uid: Buffer.from(email.trim().toLowerCase()).toString('base64url'),
  ...(displayName !== undefined ? { displayName } : {}),
});

/** The stand-in identity service. `sessions` is what it will vouch for; empty
 *  it and the same cookie stops being anybody, which is what revocation looks
 *  like from here. It does NOT check that anyone owns the address they
 *  registered with - neither does the real one, which is the point of the
 *  takeover tests below. */
const sessions = new Map([['good-session', who('Owner@Example.com', 'Erik')]]);
let asked = 0;
let identityDown = false;
let identity;

let server;
let clearCache;
let store;

before(async () => {
  identity = http.createServer((req, res) => {
    asked += 1;
    if (identityDown) { req.socket.destroy(); return; }
    const raw = /stc_session=([^;]+)/.exec(req.headers.cookie || '');
    const who = raw && sessions.get(decodeURIComponent(raw[1]));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(who ? { signedIn: true, ...who } : { signedIn: false }));
  });
  await new Promise((r) => identity.listen(IDENTITY_PORT, '127.0.0.1', r));

  server = await (await import('../src/index.js')).started;
  ({ __clearSharedSessionCache: clearCache } = await import('../src/shared-identity.js'));
  store = (await import('../src/store/index.js')).getStore();
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(B + '/api/health')).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(async () => {
  await new Promise((r) => (server ? server.close(r) : r()));
  await new Promise((r) => identity.close(r));
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
});

test('a shared session signs you in, with no Hopscotch account', async () => {
  clearCache();
  const res = await get('/api/auth/me', 'stc_session=good-session');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user?.email, 'owner@example.com', 'the address is normalised');
  assert.equal(body.sharedAccount, true);
  assert.equal(body.accountUrl, 'https://acct.strongtechnicalconsulting.com');
});

test('...and the same person is the same row, not a new one each visit', async () => {
  clearCache();
  const first = await (await get('/api/auth/me', 'stc_session=good-session')).json();
  clearCache();
  const second = await (await get('/api/auth/me', 'stc_session=good-session')).json();
  assert.equal(first.user.id, second.user.id);
});

test('a signed-out visitor is told the shared account works here', async () => {
  const body = await (await get('/api/auth/me')).json();
  assert.equal(body.user, null);
  assert.equal(body.sharedSignIn, true, 'the sign-in screen needs this to offer it');
});

test('the answer is cached, so a busy page does not ask every request', async () => {
  clearCache();
  const before = asked;
  await get('/api/auth/me', 'stc_session=good-session');
  await get('/api/auth/me', 'stc_session=good-session');
  await get('/api/auth/me', 'stc_session=good-session');
  assert.equal(asked - before, 1, 'one question for three requests');
});

test('a revoked session stops working - deleting an account deletes it here too', async () => {
  clearCache();
  sessions.delete('good-session');
  const body = await (await get('/api/auth/me', 'stc_session=good-session')).json();
  assert.equal(body.user, null);
  sessions.set('good-session', who('Owner@Example.com', 'Erik'));
});

test("Hopscotch's own account wins over a sibling app's cookie in the same jar", async () => {
  clearCache();
  const reg = await post('/api/auth/register', { email: 'local@example.com', password: 'a-long-password-1' });
  assert.equal(reg.status, 201);
  const own = (reg.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  const body = await (await get('/api/auth/me', `${own}; stc_session=good-session`)).json();
  assert.equal(body.user.email, 'local@example.com');
  assert.equal(body.sharedAccount, false, 'this session did not come in on the shared account');
});

test('an identity service that is down costs a door, not the app', async () => {
  clearCache();
  identityDown = true;
  const shared = await (await get('/api/auth/me', 'stc_session=good-session')).json();
  assert.equal(shared.user, null, 'fails closed');
  const open = await get('/api/breweries?q=portland');
  assert.notEqual(open.status, 500, 'and everything else still answers');
  identityDown = false;
});

test('signing out of a shared session signs you out of the domain', async () => {
  clearCache();
  const res = await post('/api/auth/logout', {}, 'stc_session=good-session');
  const body = await res.json();
  assert.equal(body.signedOutEverywhere, true);
  const cleared = (res.headers.getSetCookie() || []).join(' ');
  assert.match(cleared, /stc_session=;/, 'the shared cookie is cleared');
  assert.match(cleared, /Max-Age=0/);
});

/* ---- linked by identity uid, never by email alone (2026-09-27) ---------- */

const cookieOf = (res) => (res.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
const patch = (p, body, cookie) =>
  fetch(B + p, { method: 'PATCH', headers: cookie ? { ...J, cookie } : J, body: JSON.stringify(body ?? {}) });

async function nativeAccount(email, password, displayName) {
  const reg = await post('/api/auth/register', { email, password, ...(displayName ? { displayName } : {}) });
  assert.equal(reg.status, 201, `register ${email}`);
  const cookie = cookieOf(reg);
  return { cookie, user: (await reg.json()).user };
}

test('a shared session for a native account\'s address does NOT open it (the takeover)', async () => {
  clearCache();
  const victim = await nativeAccount('victim@example.com', 'victims-own-password');
  const pour = await post('/api/pours', { beerName: 'Private stash', visibility: 'private' }, victim.cookie);
  assert.equal(pour.status, 201);
  const { pour: secret } = await pour.json();

  // Anyone can register the victim's address on the identity service.
  sessions.set('attacker-session', who('Victim@Example.com', 'Totally the victim'));
  const me = await (await get('/api/auth/me', 'stc_session=attacker-session')).json();
  assert.equal(me.user, null, 'not signed in as the victim');
  assert.equal(me.sharedAccount, false);
  assert.deepEqual(me.sharedLink, { required: true, email: 'victim@example.com' }, 'offered the link instead');

  assert.equal((await get('/api/pours', 'stc_session=attacker-session')).status, 401, 'no journal');
  assert.equal((await get(`/api/pours/${secret.id}`, 'stc_session=attacker-session')).status, 404, 'no private pour');
  assert.equal(
    (await patch('/api/auth/me', { displayName: 'pwned' }, 'stc_session=attacker-session')).status,
    401,
    'no profile'
  );
  const row = await store.get('users', victim.user.id);
  assert.equal(row.identityUid, undefined, 'and the row was not linked behind the scenes');
  assert.equal(row.displayName, '');
});

test('linking needs the Hopscotch password: a wrong one links nothing', async () => {
  clearCache();
  const wrong = await post('/api/auth/link-shared', { password: 'a-guess' }, 'stc_session=attacker-session');
  assert.equal(wrong.status, 401);
  const [row] = await store.query('users', { where: [['email', '==', 'victim@example.com']] });
  assert.equal(row.identityUid, undefined);
  assert.equal((await (await get('/api/auth/me', 'stc_session=attacker-session')).json()).user, null);
});

test('linking needs a shared session too, not just the password', async () => {
  clearCache();
  const res = await post('/api/auth/link-shared', { password: 'victims-own-password' });
  assert.equal(res.status, 401);
});

test('the right password links the two, and after that the shared sign-in opens it', async () => {
  clearCache();
  sessions.set('victim-session', who('victim@example.com', 'Victim'));
  const linked = await post('/api/auth/link-shared', { password: 'victims-own-password' }, 'stc_session=victim-session');
  assert.equal(linked.status, 200);
  const { user } = await linked.json();
  assert.equal(user.email, 'victim@example.com');
  assert.equal(user.passwordHash, undefined, 'the hash never leaves the server');

  clearCache();
  const me = await (await get('/api/auth/me', 'stc_session=victim-session')).json();
  assert.equal(me.user.id, user.id);
  assert.equal(me.sharedAccount, true);
  assert.equal(me.sharedLink, null);
  const journal = await (await get('/api/pours', 'stc_session=victim-session')).json();
  assert.equal(journal.pours.length, 1, 'their own private pour is theirs');
});

test('the reverse: a native account made first with someone else\'s address does not capture them', async () => {
  clearCache();
  // Someone registers natively with an address they do not own...
  const squatter = await nativeAccount('arrives-later@example.com', 'squatters-password');
  await post('/api/pours', { beerName: 'Planted', visibility: 'public' }, squatter.cookie);
  // ...and its real owner arrives through the shared account.
  sessions.set('owner-later', who('arrives-later@example.com', 'Real Owner'));
  const me = await (await get('/api/auth/me', 'stc_session=owner-later')).json();
  assert.equal(me.user, null, 'not silently signed in to the squatter\'s account');
  assert.equal(me.sharedLink?.required, true);
});

test('a fresh shared user still gets a row, carrying its identity uid and no name from the address', async () => {
  clearCache();
  sessions.set('fresh', who('fresh.face@example.com'));
  const me = await (await get('/api/auth/me', 'stc_session=fresh')).json();
  assert.equal(me.user.email, 'fresh.face@example.com');
  assert.equal(me.user.fromSharedAccount, true);
  assert.equal(me.user.identityUid, who('fresh.face@example.com').uid);
  assert.equal(me.user.displayName, '', 'not "fresh.face"');
});

test('an already-linked row signs in by uid, even when the stored email differs in case', async () => {
  clearCache();
  const uid = who('mixed.case@example.com').uid;
  await store.put('users', 'u_mixedcase', {
    email: 'Mixed.Case@Example.COM',
    displayName: 'Mixed',
    identityUid: uid,
    createdAt: new Date().toISOString(),
  });
  sessions.set('mixed', who('mixed.case@example.com', 'Mixed'));
  const me = await (await get('/api/auth/me', 'stc_session=mixed')).json();
  assert.equal(me.user?.id, 'u_mixedcase');
});

test('a row the shared door made before uids were stored is linked on sight', async () => {
  clearCache();
  // What userFromSharedSession wrote before 2026-09-27: no password, no uid.
  await store.put('users', 'u_legacyshared', {
    email: 'legacy@example.com',
    displayName: 'Legacy',
    fromSharedAccount: true,
    createdAt: new Date().toISOString(),
  });
  sessions.set('legacy', who('legacy@example.com'));
  const me = await (await get('/api/auth/me', 'stc_session=legacy')).json();
  assert.equal(me.user?.id, 'u_legacyshared');
  assert.equal((await store.get('users', 'u_legacyshared')).identityUid, who('legacy@example.com').uid);
});

test('a row linked to a different identity is nobody\'s through this one', async () => {
  clearCache();
  await store.put('users', 'u_otherlink', {
    email: 'relinked@example.com',
    displayName: 'Other',
    identityUid: 'some-other-uid',
    createdAt: new Date().toISOString(),
  });
  sessions.set('relinked', who('relinked@example.com'));
  const me = await (await get('/api/auth/me', 'stc_session=relinked')).json();
  assert.equal(me.user, null);
});
