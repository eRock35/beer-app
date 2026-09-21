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

/** The stand-in identity service. `sessions` is what it will vouch for; empty
 *  it and the same cookie stops being anybody, which is what revocation looks
 *  like from here. */
const sessions = new Map([['good-session', { email: 'Owner@Example.com', displayName: 'Erik' }]]);
let asked = 0;
let identityDown = false;
let identity;

let server;
let clearCache;

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
  sessions.set('good-session', { email: 'Owner@Example.com', displayName: 'Erik' });
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
