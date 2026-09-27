// The crowd, the passport share and the share pages, over real HTTP against
// the SQLite driver - the wiring is what is worth holding here: who can see
// which number, what a share link carries, and what a pasted link unfolds to.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const PORT = 8792;
const B = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hopscotch-share-'));
const dist = path.join(tmp, 'dist');
fs.mkdirSync(dist);
// A stand-in for the built SPA, so /c/<id> has an index.html to add tags to.
fs.writeFileSync(
  path.join(dist, 'index.html'),
  '<!doctype html><html><head><title>Hopscotch — Craft Beer Passport</title></head><body><div id="root"></div></body></html>'
);

process.env.PORT = String(PORT);
process.env.HOST = '127.0.0.1';
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_PATH = path.join(tmp, 'test.sqlite');
process.env.JWT_SECRET = 'test-secret-at-least-sixteen-chars';
process.env.WEB_DIST = dist;
process.env.CROWD_CACHE_SECONDS = '0';
delete process.env.ANTHROPIC_API_KEY;

const J = { 'content-type': 'application/json' };
const send = (method, p, body, cookie) =>
  fetch(B + p, { method, headers: cookie ? { ...J, cookie } : J, body: body === undefined ? undefined : JSON.stringify(body) });
const post = (p, body, cookie) => send('POST', p, body ?? {}, cookie);
const get = (p, cookie) => fetch(B + p, { headers: cookie ? { cookie } : {} });

const HOSTILE = `"><img src=x onerror=alert(1)> $' </title><script>alert(2)</script>`;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const HEADY = { beerName: 'Heady Topper', brewery: 'The Alchemist', style: 'Double IPA' };

let server;
let store;
const cookies = {};

async function register(key, displayName) {
  const r = await post('/api/auth/register', {
    email: `${key}@example.com`,
    password: `hopscotch-test-${key}`,
    ...(displayName ? { displayName } : {}),
  });
  assert.equal(r.status, 201, `register ${key}`);
  cookies[key] = r.headers.getSetCookie().join('; ');
}

async function logPour(key, body) {
  const r = await post('/api/pours', body, cookies[key]);
  assert.equal(r.status, 201, `pour for ${key}: ${await r.clone().text()}`);
  return (await r.json()).pour;
}

const flavourOnly = (score) => ({ flavour: score / 10 });

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

  await register('owner', 'Erik Strong');
  for (const k of ['u1', 'u2', 'u3', 'u4', 'u5', 'hidden']) await register(k);

  // Five public drinkers of Heady Topper at 80..84, one private at 10.
  for (const [i, k] of ['u1', 'u2', 'u3', 'u4', 'u5'].entries()) {
    await logPour(k, { ...HEADY, scores: flavourOnly(80 + i) });
  }
  await logPour('hidden', { ...HEADY, scores: flavourOnly(10), visibility: 'private' });
  await logPour('owner', { ...HEADY, scores: flavourOnly(91) });
  // A beer only four people have had.
  for (const k of ['u1', 'u2', 'u3', 'u4']) {
    await logPour(k, { beerName: 'Focal Banger', brewery: 'The Alchemist', style: 'Hazy IPA', scores: flavourOnly(85) });
  }
});

after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* ---------------- the crowd ---------------- */

test('signed out: public pours only, everyone counted', async () => {
  const r = await post('/api/crowd/beers', { beers: [HEADY] });
  assert.equal(r.status, 200);
  const { beers, minDrinkers } = await r.json();
  assert.equal(minDrinkers, 5);
  // u1..u5 (80..84) and owner (91); the private 10 is nowhere.
  assert.deepEqual(beers[0].crowd, { drinkers: 6, average: 84 });
  assert.equal(beers[0].you, null);
});

test('signed in: the crowd is everyone but you, and "you gave 91 (+9)"', async () => {
  const { beers } = await (await post('/api/crowd/beers', { beers: [HEADY] }, cookies.owner)).json();
  assert.deepEqual(beers[0].crowd, { drinkers: 5, average: 82 });
  assert.deepEqual(beers[0].you, { average: 91, pours: 1, delta: 9 });
});

test('the private drinker does not count themselves in, and still sees their own score', async () => {
  const { beers } = await (await post('/api/crowd/beers', { beers: [HEADY] }, cookies.hidden)).json();
  assert.deepEqual(beers[0].crowd, { drinkers: 6, average: 84 });
  assert.equal(beers[0].you.average, 10);
});

test('four drinkers is no answer', async () => {
  const { beers } = await (
    await post('/api/crowd/beers', { beers: [{ beerName: 'Focal Banger', brewery: 'Alchemist' }] })
  ).json();
  assert.equal(beers[0].crowd, null);
});

test('a brewery: average and most-poured, spelling forgiven', async () => {
  const r = await get('/api/crowd/brewery?name=' + encodeURIComponent('alchemist brewing co'));
  const body = await r.json();
  assert.equal(body.brewery, 'The Alchemist');
  assert.equal(body.crowd.drinkers, 6);
  assert.deepEqual(body.mostPoured, { beerName: 'Heady Topper', drinkers: 6 });
});

test('the palate standing needs an account', async () => {
  assert.equal((await get('/api/crowd/palate')).status, 401);
  const r = await get('/api/crowd/palate', cookies.owner);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray((await r.json()).families));
});

test('bad crowd input is a 400, not a crash', async () => {
  assert.equal((await post('/api/crowd/beers', { beers: 'nope' })).status, 400);
  assert.equal((await post('/api/crowd/beers', { beers: Array.from({ length: 201 }, () => HEADY) })).status, 400);
});

/* ---------------- the drinker's day ---------------- */

test('a back-dated pour with its time zone counts on the drinker’s day', async () => {
  await register('streaker', 'Streaker');
  // Denver, UTC-6: 8pm on each of the three days before "now".
  const now = new Date();
  const denverToday = new Date(now.getTime() - 360 * 60000).toISOString().slice(0, 10);
  const at = (daysAgo) => {
    const day = new Date(Date.parse(`${denverToday}T00:00:00Z`) - daysAgo * 86400000).toISOString().slice(0, 10);
    // 20:00 local is 02:00 UTC the next day.
    return new Date(Date.parse(`${day}T20:00:00Z`) + 360 * 60000).toISOString();
  };
  for (const d of [3, 2, 1]) {
    const pour = await logPour('streaker', { ...HEADY, drankAt: at(d), drankTzOffset: -360 });
    assert.equal(pour.drankTzOffset, -360, 'the offset survives the schema');
  }
  const passport = await (await get('/api/passport?tz=-360', cookies.streaker)).json();
  assert.equal(passport.stats.longestStreak, 3);
  assert.equal(passport.stats.currentStreak, 3, 'yesterday’s pour keeps it alive today');
  assert.equal(passport.stats.loggedToday, false);
  assert.ok(passport.next?.text, 'there is a next badge to aim for');
});

test('a time zone offset out of range is refused', async () => {
  const r = await post('/api/pours', { ...HEADY, drankTzOffset: 5000 }, cookies.owner);
  assert.equal(r.status, 400);
});

/* ---------------- sharing a passport ---------------- */

test('sharing a passport needs an account', async () => {
  assert.equal((await post('/api/passport/share', {})).status, 401);
});

test('a shared passport is a frozen card with og tags, and no account in it', async () => {
  // A public pour with a hostile name is the owner's top beer.
  await logPour('owner', { beerName: HOSTILE, brewery: HOSTILE, style: 'Imperial Stout', scores: flavourOnly(97) });
  // A private pour scoring higher must NOT be the one named.
  await logPour('owner', { beerName: 'Secret Stash', brewery: 'Nobody', scores: flavourOnly(100), visibility: 'private' });

  const r = await post('/api/passport/share', {}, cookies.owner);
  assert.equal(r.status, 201);
  const { id, url, png } = await r.json();
  assert.match(id, /^[A-Za-z0-9_-]{12}$/);
  assert.ok(url.endsWith(`/p/${id}`));
  assert.ok(png.endsWith(`/p/${id}.png`));

  const doc = await store.get('passport_shares', id);
  assert.equal(doc.by, 'Erik');
  assert.equal(doc.userId, undefined);
  assert.equal(JSON.stringify(doc).includes('@example.com'), false);
  assert.equal(doc.topBeer.beerName, HOSTILE, 'the top PUBLIC beer');
  assert.equal(doc.beers, 3, 'counts are the drinker’s own totals, private included');

  const page = await get(`/p/${id}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const html = await page.text();
  assert.match(html, new RegExp(`<meta property="og:image" content="http://127\\.0\\.0\\.1:${PORT}/p/${id}\\.png">`));
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta property="og:title" content="Erik’s beer passport: 3 beers, \d+ badges">/);
  // The hostile beer name is in the description - escaped, everywhere.
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('<script>alert'), false);
  assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(html.includes('Secret Stash'), false);
  assert.equal(html.includes('@example.com'), false);

  const img = await get(`/p/${id}.png`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  const buf = Buffer.from(await img.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 8)], PNG_MAGIC);
});

test('a name that is just the email becomes "A Hopscotch drinker"', async () => {
  const { id } = await (await post('/api/passport/share', {}, cookies.u1)).json();
  const html = await (await get(`/p/${id}`)).text();
  assert.ok(html.includes('A Hopscotch drinker’s beer passport'));
  assert.equal(html.includes('u1'), false);
});

test('an unknown passport share is a 404', async () => {
  assert.equal((await get('/p/AAAAAAAAAAAA')).status, 404);
  assert.equal((await get('/p/AAAAAAAAAAAA.png')).status, 404);
  assert.equal((await get('/p/short')).status, 404);
  assert.equal((await get('/p/..%2F..%2Fetc')).status, 404);
});

/* ---------------- a shared crawl unfolds ---------------- */

test('a shared crawl link carries og tags and a card', async () => {
  const trip = await (
    await post(
      '/api/trips',
      {
        title: HOSTILE,
        city: 'Portland',
        state: 'Oregon',
        stops: [
          { id: 'b1', name: 'Cascade Barrel House' },
          { id: 'b2', name: HOSTILE, walkMinutes: 12 },
        ],
        walkable: true,
      },
      cookies.owner
    )
  ).json();
  const { shareId } = await (await post(`/api/trips/${trip.item.id}/share`, {}, cookies.owner)).json();

  const r = await get(`/c/${shareId}`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes('<div id="root"></div>'), 'still the SPA');
  assert.match(html, new RegExp(`<meta property="og:image" content="http://127\\.0\\.0\\.1:${PORT}/c/${shareId}\\.png">`));
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta property="og:description" content="Erik Strong shared a crawl: 2 stops in Portland, Oregon\./);
  assert.equal(html.includes('<script>alert'), false);
  assert.equal(html.includes('<img src=x'), false);
  assert.equal((html.match(/<title>/g) || []).length, 1, 'the title was replaced, not broken out of');
  // Escaped, "$'" is "$&#39;" - and "$&" is a replacement pattern that
  // String.replace would expand into the matched text.
  assert.ok(html.includes('$&#39;'), 'a $ pattern in the title is text, not a replacement');

  const img = await get(`/c/${shareId}.png`);
  assert.equal(img.status, 200);
  assert.deepEqual([...Buffer.from(await img.arrayBuffer()).subarray(0, 8)], PNG_MAGIC);
});

test('an unknown crawl is the SPA with a 404 and no tags', async () => {
  const r = await get('/c/s_nope');
  assert.equal(r.status, 404);
  const html = await r.text();
  assert.ok(html.includes('<div id="root"></div>'));
  assert.equal(html.includes('og:image'), false);
  assert.equal((await get('/c/s_nope.png')).status, 404);
});

/* ---------------- taking a link back ---------------- */

const del = (p, cookie) => fetch(B + p, { method: 'DELETE', headers: cookie ? { cookie } : {} });

test('a share records its maker without naming them', async () => {
  const { id } = await (await post('/api/passport/share', {}, cookies.owner)).json();
  const doc = await store.get('passport_shares', id);
  assert.ok(doc.owner, 'an owner tag');
  const me = (await (await get('/api/auth/me', cookies.owner)).json()).user;
  assert.notEqual(doc.owner, me.id);
  assert.equal(JSON.stringify(doc).includes(me.id), false, 'no user id anywhere in it');
  // Two users' tags differ; the same user's tag is stable.
  const other = await (await post('/api/passport/share', {}, cookies.u2)).json();
  assert.notEqual((await store.get('passport_shares', other.id)).owner, doc.owner);
});

test('your shared links lists yours and only yours', async () => {
  assert.equal((await get('/api/shares')).status, 401);
  const mine = await (await get('/api/shares', cookies.owner)).json();
  const theirs = await (await get('/api/shares', cookies.u2)).json();
  assert.ok(mine.passports.length >= 2);
  assert.ok(mine.crawls.length >= 1, 'the crawl shared above');
  const mineIds = new Set(mine.passports.map((p) => p.id));
  for (const p of theirs.passports) assert.equal(mineIds.has(p.id), false);
  assert.ok(mine.passports[0].url.endsWith(`/p/${mine.passports[0].id}`));
  assert.equal(JSON.stringify(mine).includes('owner'), false, 'the tag is not sent back');
});

test('only the maker can delete a passport link; then it is dead', async () => {
  const { id } = await (await post('/api/passport/share', {}, cookies.owner)).json();
  // Warm this instance's card cache, so delete has something to forget.
  assert.equal((await get(`/p/${id}.png`)).status, 200);

  assert.equal((await del(`/api/shares/passport/${id}`)).status, 401, 'signed out');
  assert.equal((await del(`/api/shares/passport/${id}`, cookies.u2)).status, 404, 'someone else: as if it did not exist');
  assert.equal((await get(`/p/${id}`)).status, 200, 'still live after their attempt');

  assert.equal((await del(`/api/shares/passport/${id}`, cookies.owner)).status, 200);
  const page = await get(`/p/${id}`);
  assert.equal(page.status, 404);
  assert.equal((await page.text()).includes('og:image'), false);
  assert.equal((await get(`/p/${id}.png`)).status, 404, 'the cached card is not served');
  assert.equal((await del(`/api/shares/passport/${id}`, cookies.owner)).status, 404, 'twice is a 404');
  const list = await (await get('/api/shares', cookies.owner)).json();
  assert.equal(list.passports.some((p) => p.id === id), false);
});

test('a crawl link can be taken back too, and never shows its tag', async () => {
  const trip = await (await post('/api/trips', { title: 'Delete me', stops: [{ id: 'x', name: 'Stop' }] }, cookies.owner)).json();
  const { shareId } = await (await post(`/api/trips/${trip.item.id}/share`, {}, cookies.owner)).json();
  const read = await (await get(`/api/shared-crawl/${shareId}`)).json();
  assert.equal(read.crawl.owner, undefined);
  assert.equal(read.crawl.userId, undefined);

  assert.equal((await get(`/c/${shareId}.png`)).status, 200);
  assert.equal((await del(`/api/shares/crawl/${shareId}`, cookies.u2)).status, 404);
  assert.equal((await del(`/api/shares/crawl/${shareId}`, cookies.owner)).status, 200);

  const page = await get(`/c/${shareId}`);
  assert.equal(page.status, 404);
  assert.equal((await page.text()).includes('og:image'), false);
  assert.equal((await get(`/c/${shareId}.png`)).status, 404);
  assert.equal((await get(`/api/shared-crawl/${shareId}`)).status, 404);
});

test('a share made before owner tags existed cannot be deleted by anyone', async () => {
  await store.put('shared_crawls', 's_legacy', { title: 'Old', stops: [], by: 'Erik', createdAt: '2026-09-01T00:00:00Z' });
  assert.equal((await del('/api/shares/crawl/s_legacy', cookies.owner)).status, 404);
  assert.equal((await get('/api/shared-crawl/s_legacy')).status, 200, 'and still works');
  assert.equal((await del('/api/shares/nonsense/x', cookies.owner)).status, 404);
});
