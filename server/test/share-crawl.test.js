// Sharing a crawl by link, over real HTTP against the SQLite driver.
//
// The other suites here are pure-domain on purpose. This one is not: what is
// worth pinning down about a share is the wiring - who may mint a link, who may
// read it, and that reading it does not need an account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const PORT = 8791;
const B = `http://127.0.0.1:${PORT}`;
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hopscotch-test-')), 'test.sqlite');

process.env.PORT = String(PORT);
process.env.HOST = '127.0.0.1';
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_PATH = dbFile;
process.env.JWT_SECRET = 'test-secret-at-least-sixteen-chars';
process.env.WEB_DIST = path.join(os.tmpdir(), 'no-such-dist');
delete process.env.ANTHROPIC_API_KEY;

const J = { 'content-type': 'application/json' };
const post = (p, body, cookie) =>
  fetch(B + p, { method: 'POST', headers: cookie ? { ...J, cookie } : J, body: JSON.stringify(body ?? {}) });

let server;
let cookie = '';
let otherCookie = '';
let tripId = '';

const TRIP = {
  title: 'Portland — 2 nights',
  city: 'Portland',
  state: 'Oregon',
  stops: [
    { id: 'b1', name: 'Cascade Barrel House', city: 'Portland', state: 'Oregon', walkMinutes: null },
    { id: 'b2', name: 'Hair of the Dog', city: 'Portland', state: 'Oregon', walkMinutes: 12 },
    { id: 'b3', name: 'Upright Brewing', city: 'Portland', state: 'Oregon', walkMinutes: 18 },
  ],
  totalMiles: 2.4,
  totalWalkMinutes: 30,
  walkable: true,
  itinerary: 'Start at Cascade while it is quiet.',
};

before(async () => {
  server = await (await import('../src/index.js')).started;
  // The server binds asynchronously inside main(); poll until it answers.
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(B + '/api/health');
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  let r = await post('/api/auth/register', { email: 'planner@example.com', password: 'hopscotch-test-1', displayName: 'Erik' });
  cookie = r.headers.getSetCookie().join('; ');
  r = await post('/api/auth/register', { email: 'other@example.com', password: 'hopscotch-test-2', displayName: 'Someone else' });
  otherCookie = r.headers.getSetCookie().join('; ');

  r = await post('/api/trips', TRIP, cookie);
  tripId = (await r.json()).item.id;
});

after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
});

test('a stop keeps the walk it was planned with', async () => {
  // zod strips undeclared keys, so this is the assertion that catches the
  // schema forgetting a field the planner saves.
  const { items } = await (await fetch(`${B}/api/trips`, { headers: { cookie } })).json();
  const trip = items.find((t) => t.id === tripId);
  assert.equal(trip.stops[1].walkMinutes, 12);
  assert.equal(trip.walkable, true);
  assert.equal(trip.totalMiles, 2.4);
});

test('a stranger cannot mint a link for someone else’s trip', async () => {
  const r = await post(`/api/trips/${tripId}/share`, {}, '');
  assert.equal(r.status, 401);
});

test('another account cannot either', async () => {
  const r = await post(`/api/trips/${tripId}/share`, {}, otherCookie);
  assert.equal(r.status, 403);
});

test('a crawl with no stops has nothing to share', async () => {
  const made = await (await post('/api/trips', { title: 'Empty', stops: [] }, cookie)).json();
  const r = await post(`/api/trips/${made.item.id}/share`, {}, cookie);
  assert.equal(r.status, 400);
});

test('the owner gets a link, and anyone can open it', async () => {
  const r = await post(`/api/trips/${tripId}/share`, {}, cookie);
  assert.equal(r.status, 201);
  const { shareId, url } = await r.json();
  assert.match(url, /\/c\//);

  // No cookie at all - that is the whole point of a share.
  const read = await fetch(`${B}/api/shared-crawl/${shareId}`);
  assert.equal(read.status, 200);
  const { crawl } = await read.json();
  assert.equal(crawl.title, TRIP.title);
  assert.equal(crawl.stops.length, 3);
  assert.equal(crawl.stops[2].walkMinutes, 18);
  assert.equal(crawl.walkable, true);
  assert.equal(crawl.by, 'Erik');
  assert.equal(crawl.itinerary, TRIP.itinerary);
  // Nothing ties the link back to the account that made it.
  assert.equal(crawl.userId, undefined);
});

test('the link is a frozen copy, not a view of the trip', async () => {
  const { shareId } = await (await post(`/api/trips/${tripId}/share`, {}, cookie)).json();
  await fetch(`${B}/api/trips/${tripId}`, {
    method: 'PATCH',
    headers: { ...J, cookie },
    body: JSON.stringify({ ...TRIP, title: 'Renamed after sharing', stops: [TRIP.stops[0]] }),
  });
  const { crawl } = await (await fetch(`${B}/api/shared-crawl/${shareId}`)).json();
  assert.equal(crawl.title, TRIP.title);
  assert.equal(crawl.stops.length, 3);
});

test('an unknown link is a 404', async () => {
  const r = await fetch(`${B}/api/shared-crawl/s_nope`);
  assert.equal(r.status, 404);
});

test('the sample passport needs no account, and the real one still does', async () => {
  const r = await fetch(`${B}/api/passport/sample`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.sample, true);
  assert.ok(body.stats.total >= 10);
  assert.ok(body.earnedCount > 0);
  assert.equal(body.timeline.length >= 3, true);

  assert.equal((await fetch(`${B}/api/passport`)).status, 401);
});
