// Findings from the 2026-09-27 audit that are not the shared-account door or
// the model's budget (those have their own suites): names that were email
// addresses, private pours reachable through cheers and comments, a brewery
// website that could be a script, the baseline response headers, and a login
// that answered faster for an address with no account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

import { NO_NAME, publicName, shareName } from '../src/domain/cards.js';

const PORT = 8797;
const B = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hopscotch-security-'));
const dist = path.join(tmp, 'dist');
fs.mkdirSync(dist);
fs.writeFileSync(
  path.join(dist, 'index.html'),
  '<!doctype html><html><head><title>Hopscotch</title></head><body><div id="root"></div></body></html>'
);

process.env.PORT = String(PORT);
process.env.HOST = '127.0.0.1';
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_PATH = path.join(tmp, 'test.sqlite');
process.env.JWT_SECRET = 'test-secret-at-least-sixteen-chars';
process.env.WEB_DIST = dist;
process.env.IDENTITY_VERIFY_URL = '';
delete process.env.ANTHROPIC_API_KEY;

const J = { 'content-type': 'application/json' };
const post = (p, body, cookie) =>
  fetch(B + p, { method: 'POST', headers: cookie ? { ...J, cookie } : J, body: JSON.stringify(body ?? {}) });
const get = (p, cookie) => fetch(B + p, { headers: cookie ? { cookie } : {} });

let server;
let store;
const people = {};

async function register(key, displayName) {
  const r = await post('/api/auth/register', {
    email: `${key}@example.com`,
    password: `security-test-${key}`,
    ...(displayName ? { displayName } : {}),
  });
  assert.equal(r.status, 201, `register ${key}`);
  people[key] = {
    user: (await r.json()).user,
    cookie: r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '),
  };
  return people[key];
}

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
  store = (await import('../src/store/index.js')).getStore();
});

after(async () => {
  await new Promise((r) => (server ? server.close(r) : r()));
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* ---- names ------------------------------------------------------------- */

test('a name that is really the address is no name, wherever it is shown', () => {
  assert.equal(publicName({ displayName: 'erik.s', email: 'Erik.S@example.com' }), NO_NAME);
  assert.equal(publicName({ displayName: 'erik@example.com', email: 'x@example.com' }), NO_NAME);
  assert.equal(publicName({ displayName: '  ', email: 'x@example.com' }), NO_NAME);
  assert.equal(publicName(null), NO_NAME);
  assert.equal(publicName({ displayName: 'Erik Strong', email: 'erik@example.com' }), 'Erik Strong');
  assert.equal(shareName({ displayName: 'erik.s', email: 'erik.s@example.com' }), NO_NAME);
});

test('registering without a name stores none - not the email local part', async () => {
  const { user } = await register('quiet.person');
  assert.equal(user.displayName, '');
  const row = await store.get('users', user.id);
  assert.equal(row.displayName, '');
});

test('the public feed, comments and a shared crawl never show an address as a name', async () => {
  const quiet = people['quiet.person'];
  // A row from before the fix: its display name IS the local part.
  const legacy = await register('legacy.local');
  await store.patch('users', legacy.user.id, { displayName: 'legacy.local' });
  const named = await register('named', 'Erik Strong');

  const pour = await (await post('/api/pours', { beerName: 'Pliny', visibility: 'public' }, legacy.cookie)).json();
  await post('/api/pours', { beerName: 'Zombie Dust', visibility: 'public' }, quiet.cookie);
  await post('/api/pours', { beerName: 'Heady Topper', visibility: 'public' }, named.cookie);

  const feed = await (await get('/api/pours/feed')).json();
  const authors = feed.pours.map((p) => p.author.displayName);
  assert.ok(!authors.some((a) => /legacy\.local|quiet\.person|@/.test(a)), JSON.stringify(authors));
  assert.ok(authors.includes('Erik Strong'), 'a chosen name still shows');
  assert.equal(feed.pours.find((p) => p.beerName === 'Pliny').author.displayName, NO_NAME);

  // A comment written today, and one stored before the fix with the old name.
  assert.equal((await post(`/api/pours/${pour.pour.id}/comments`, { body: 'Nice' }, legacy.cookie)).status, 201);
  await store.put('comments', 'c_oldstyle', {
    pourId: pour.pour.id,
    userId: legacy.user.id,
    authorName: 'legacy.local',
    body: 'from before',
    createdAt: new Date(0).toISOString(),
  });
  const detail = await (await get(`/api/pours/${pour.pour.id}`)).json();
  assert.deepEqual(detail.comments.map((c) => c.authorName), [NO_NAME, NO_NAME]);
  const stored = await store.query('comments', { where: [['pourId', '==', pour.pour.id]] });
  assert.ok(stored.every((c) => c.authorName !== 'legacy.local' || c.id === 'c_oldstyle'));

  // A crawl share made now, and one of the oldest kind (carrying userId).
  const trip = await (
    await post('/api/trips', { title: 'Loop', stops: [{ name: 'A' }, { name: 'B' }] }, legacy.cookie)
  ).json();
  const share = await (await post(`/api/trips/${trip.item.id}/share`, {}, legacy.cookie)).json();
  const fresh = await (await get(`/api/shared-crawl/${share.shareId}`)).json();
  assert.equal(fresh.crawl.by, NO_NAME);
  await store.put('shared_crawls', 's_oldestkind', {
    title: 'Old',
    stops: [{ name: 'A' }],
    by: 'legacy.local',
    userId: legacy.user.id,
    createdAt: new Date(0).toISOString(),
  });
  const old = await (await get('/api/shared-crawl/s_oldestkind')).json();
  assert.equal(old.crawl.by, NO_NAME);
  assert.equal(old.crawl.userId, undefined);
  const page = await (await get('/c/s_oldestkind')).text();
  assert.ok(!page.includes('legacy.local'), 'nor in the og tags');
});

/* ---- private pours ----------------------------------------------------- */

test('a private pour is a 404 to anyone else - cheering and commenting too', async () => {
  const owner = await register('keeper', 'Keeper');
  const other = await register('nosy', 'Nosy');
  const { pour } = await (await post('/api/pours', { beerName: 'Secret', visibility: 'private' }, owner.cookie)).json();

  assert.equal((await post(`/api/pours/${pour.id}/cheers`, {}, other.cookie)).status, 404);
  assert.equal((await post(`/api/pours/${pour.id}/comments`, { body: 'hi' }, other.cookie)).status, 404);
  assert.equal((await get(`/api/pours/${pour.id}`, other.cookie)).status, 404);
  assert.equal(await store.count('cheers', { where: [['pourId', '==', pour.id]] }), 0);
  assert.equal(await store.count('comments', { where: [['pourId', '==', pour.id]] }), 0);

  // Its owner still can.
  assert.equal((await post(`/api/pours/${pour.id}/cheers`, {}, owner.cookie)).status, 200);
  assert.equal((await post(`/api/pours/${pour.id}/comments`, { body: 'note' }, owner.cookie)).status, 201);
});

/* ---- brewery websites -------------------------------------------------- */

test('a brewery website is only ever an http(s) URL', async () => {
  const { safeWebsite } = await import('../src/routes/breweries.js');
  assert.equal(safeWebsite('https://treehousebrew.com'), 'https://treehousebrew.com/');
  assert.equal(safeWebsite('http://example.com/beer'), 'http://example.com/beer');
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'treehousebrew.com', '', null]) {
    assert.equal(safeWebsite(bad), '', String(bad));
  }
});

/* ---- headers ----------------------------------------------------------- */

test('API and page responses carry the baseline headers, and the landing page may frame the app', async () => {
  for (const p of ['/api/health', '/', '/journal']) {
    const r = await get(p);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', p);
    assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', p);
    const csp = r.headers.get('content-security-policy') || '';
    assert.match(csp, /frame-ancestors 'self' https:\/\/strongtechnicalconsulting\.com https:\/\/www\.strongtechnicalconsulting\.com/, p);
    assert.equal(r.headers.get('x-frame-options'), null, 'X-Frame-Options could not allow the landing page');
  }
});

/* ---- sign-in ----------------------------------------------------------- */

test('login: no account and a wrong password get the same answer, in comparable time', async () => {
  const time = async (email) => {
    const t = process.hrtime.bigint();
    const r = await post('/api/auth/login', { email, password: 'not-the-password' });
    return { r, ms: Number(process.hrtime.bigint() - t) / 1e6 };
  };
  await time('warm-up@example.com'); // the stand-in hash is made on first use
  const missing = await time('nobody-here@example.com');
  const wrong = await time('keeper@example.com');
  assert.equal(missing.r.status, 401);
  assert.equal(wrong.r.status, 401);
  assert.deepEqual(await missing.r.json(), await wrong.r.json());
  // A bcrypt compare at cost 12 is tens of milliseconds at least; skipping it
  // made "no account" answer in about one. Loose bound, so a busy machine
  // does not make this flaky.
  assert.ok(missing.ms > wrong.ms / 4, `missing ${missing.ms.toFixed(1)}ms vs wrong ${wrong.ms.toFixed(1)}ms`);
});

test('an account with no Hopscotch password cannot be signed into with any password', async () => {
  await store.put('users', 'u_nopassword', {
    email: 'shared-only@example.com',
    displayName: 'Shared',
    fromSharedAccount: true,
    createdAt: new Date().toISOString(),
  });
  const r = await post('/api/auth/login', { email: 'shared-only@example.com', password: 'anything-at-all' });
  assert.equal(r.status, 401);
});
