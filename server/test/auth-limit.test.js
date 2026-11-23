// The auth rate limiter (30 requests per 15 minutes per IP) is for requests
// that carry a credential. GET /api/auth/me is the session check every page
// load makes; counting it let ordinary browsing lock sign-in with "Too many
// attempts". These hold both halves: /me never trips it, login still does.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const PORT = 8799;
const B = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hopscotch-authlimit-'));
const dist = path.join(tmp, 'dist');
fs.mkdirSync(dist);
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>');

process.env.PORT = String(PORT);
process.env.HOST = '127.0.0.1';
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_PATH = path.join(tmp, 'test.sqlite');
process.env.JWT_SECRET = 'test-secret-at-least-sixteen-chars';
process.env.WEB_DIST = dist;
process.env.IDENTITY_VERIFY_URL = '';
delete process.env.ANTHROPIC_API_KEY;

const J = { 'content-type': 'application/json' };
let server;
let cookie = '';

before(async () => {
  server = await (await import('../src/index.js')).started;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(B + '/api/health')).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  // One registration (counts once against the auth budget) so /me is also
  // checked with a real session, not only signed out.
  const r = await fetch(B + '/api/auth/register', {
    method: 'POST',
    headers: J,
    body: JSON.stringify({ email: 'limit@example.com', password: 'limit-test-password' }),
  });
  assert.equal(r.status, 201);
  cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
});

after(async () => {
  await new Promise((r) => (server ? server.close(r) : r()));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('forty session checks never hit the auth limiter, signed in or out', async () => {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(B + '/api/auth/me', i % 2 ? { headers: { cookie } } : {});
    assert.equal(r.status, 200, `GET /me #${i + 1}`);
    await r.arrayBuffer();
  }
  const me = await (await fetch(B + '/api/auth/me', { headers: { cookie } })).json();
  assert.equal(me.user.email, 'limit@example.com');
});

test('login is still limited: wrong passwords 429 once the budget is spent', async () => {
  const statuses = [];
  for (let i = 0; i < 35; i++) {
    const r = await fetch(B + '/api/auth/login', {
      method: 'POST',
      headers: J,
      body: JSON.stringify({ email: 'limit@example.com', password: 'not-the-password' }),
    });
    statuses.push(r.status);
    await r.arrayBuffer();
  }
  // 30 per window, one already spent on registering.
  assert.ok(statuses.slice(0, 29).every((s) => s === 401), `first 29: ${statuses.slice(0, 29)}`);
  assert.equal(statuses[29], 429);
  assert.ok(statuses.slice(29).every((s) => s === 429));
  const body = await (
    await fetch(B + '/api/auth/login', {
      method: 'POST',
      headers: J,
      body: JSON.stringify({ email: 'limit@example.com', password: 'limit-test-password' }),
    })
  ).json();
  assert.match(body.error, /Too many attempts/);
});

test('every credential-bearing auth route shares that spent budget; /me does not', async () => {
  const routes = [
    ['POST', '/api/auth/register'],
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/link-shared'],
    ['POST', '/api/auth/logout'],
    ['PATCH', '/api/auth/me'],
  ];
  for (const [method, p] of routes) {
    const r = await fetch(B + p, { method, headers: { ...J, cookie }, body: '{}' });
    assert.equal(r.status, 429, `${method} ${p}`);
  }
  const me = await fetch(B + '/api/auth/me', { headers: { cookie } });
  assert.equal(me.status, 200, 'signed-in session check still answers after the lock');
});
