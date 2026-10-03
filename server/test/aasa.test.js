// The iPhone app's association file, /.well-known/apple-app-site-association
// (see eriks-projects/mobile/README.md). Apple's fetcher sends no cookie,
// follows no redirect and reads it only as JSON, so:
//  - no APPLE_TEAM_ID, or a malformed one: a 404 - never the SPA's index.html,
//    which the catch-all would otherwise serve with a 200;
//  - set: 200, application/json, no redirect, no cookie, no sign-in;
//  - links open the app everywhere but /api/*, and the app may use the
//    passwords saved for this site;
//  - the Team ID is read per request, so a revision's env is all it takes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const PORT = 8798;
const B = `http://127.0.0.1:${PORT}`;
const PATH = '/.well-known/apple-app-site-association';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hopscotch-aasa-'));
const dist = path.join(tmp, 'dist');
fs.mkdirSync(dist);
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><head><title>Hopscotch</title></head><body><div id="root"></div></body></html>');

process.env.PORT = String(PORT);
process.env.HOST = '127.0.0.1';
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_PATH = path.join(tmp, 'test.sqlite');
process.env.JWT_SECRET = 'test-secret-at-least-sixteen-chars';
process.env.WEB_DIST = dist;
process.env.IDENTITY_VERIFY_URL = '';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.APPLE_TEAM_ID;

const get = (p, headers = {}) => fetch(B + p, { redirect: 'manual', headers });
let server;

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
});

after(async () => {
  delete process.env.APPLE_TEAM_ID;
  await new Promise((r) => (server ? server.close(r) : r()));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('no Team ID, or a malformed one: 404, not the app page', async () => {
  delete process.env.APPLE_TEAM_ID;
  let r = await get(PATH);
  assert.equal(r.status, 404);
  assert.ok(!(await r.text()).includes('<div id="root">'));
  for (const bad of ['abcde12345', 'ABCDE1234', 'ABCDE12345X', 'ABCDE-1234']) {
    process.env.APPLE_TEAM_ID = bad;
    r = await get(PATH);
    assert.equal(r.status, 404, bad);
  }
});

test('set: JSON with no redirect, cookie or sign-in, naming this app', async () => {
  process.env.APPLE_TEAM_ID = 'ABCDE12345';
  const r = await get(PATH, { 'X-Forwarded-Proto': 'https' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /^application\/json\b/);
  assert.equal(r.headers.get('set-cookie'), null);
  assert.match(r.headers.get('cache-control') || '', /max-age=3600/);
  const body = await r.json();
  const id = 'ABCDE12345.com.strongtechnicalconsulting.hopscotch';
  assert.deepEqual(body.applinks.details.length, 1);
  assert.deepEqual(body.applinks.details[0].appIDs, [id]);
  assert.deepEqual(
    body.applinks.details[0].components.map((c) => [c['/'], Boolean(c.exclude)]),
    [['/api/*', true], ['*', false]]
  );
  assert.deepEqual(body.webcredentials, { apps: [id] });
});

test('read per request', async () => {
  process.env.APPLE_TEAM_ID = 'ZZZZZ99999';
  const body = await (await get(PATH)).json();
  assert.deepEqual(body.webcredentials.apps, ['ZZZZZ99999.com.strongtechnicalconsulting.hopscotch']);
});
