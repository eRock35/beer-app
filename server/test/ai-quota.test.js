// What the sommelier may spend, over real HTTP and against both store drivers.
//
// Registration is open and free, so the per-account cap on its own bounded
// nothing, and it was a read followed by a write: twenty requests fired at
// once all read the same count and all went through. What is held here:
//
//  - the count is taken atomically, so parallel requests cannot pass the cap
//    (SQLite over HTTP, and the Firestore driver against a stand-in with
//    Firestore's transaction semantics - the sandbox has no emulator);
//  - a ceiling across every account, which is what actually bounds the bill;
//  - a smaller allowance for an account in its first day;
//  - every refusal comes before the model is asked anything.
//
// The model is a stand-in on localhost (ANTHROPIC_BASE_URL), counting calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

import { planReservation } from '../src/store/reserve.js';
import { createSqliteStore } from '../src/store/sqlite.js';
import { createFirestoreStore } from '../src/store/firestore.js';

const PORT = 8795;
const MODEL_PORT = 8796;
const B = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hopscotch-quota-'));

process.env.PORT = String(PORT);
process.env.HOST = '127.0.0.1';
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_PATH = path.join(tmp, 'test.sqlite');
process.env.JWT_SECRET = 'test-secret-at-least-sixteen-chars';
process.env.WEB_DIST = path.join(tmp, 'no-such-dist');
process.env.IDENTITY_VERIFY_URL = '';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${MODEL_PORT}`;
process.env.AI_NEW_ACCOUNT_DAILY_LIMIT = '3';
process.env.AI_DAILY_MESSAGE_LIMIT = '6';
process.env.AI_DAILY_GLOBAL_LIMIT = '8';
process.env.CRON_SECRET = 'the-real-cron-secret-value';

const J = { 'content-type': 'application/json' };
const post = (p, body, cookie, extra = {}) =>
  fetch(B + p, {
    method: 'POST',
    headers: { ...J, ...(cookie ? { cookie } : {}), ...extra },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });

let modelCalls = 0;
let model;
let server;
let store;

before(async () => {
  model = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      modelCalls += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: `msg_${modelCalls}`,
          type: 'message',
          role: 'assistant',
          model: 'stand-in',
          content: [{ type: 'text', text: 'Three beers, named.' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        })
      );
    });
  });
  await new Promise((r) => model.listen(MODEL_PORT, '127.0.0.1', r));

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
  await new Promise((r) => model.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function account(key) {
  const r = await post('/api/auth/register', { email: `${key}@example.com`, password: `quota-test-${key}` });
  assert.equal(r.status, 201);
  const user = (await r.json()).user;
  return { user, cookie: r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
}

const ask = (cookie) => post('/api/ai/next-pour', { question: 'What next?' }, cookie);
const statuses = (responses) => responses.map((r) => r.status).sort();

/* ---- the rule itself --------------------------------------------------- */

test('a reservation is all or nothing across its counters', () => {
  const entries = [
    { collection: 'ai_usage', id: 'u_a_d', field: 'count', by: 2, limit: 10, base: { userId: 'u_a' } },
    { collection: 'ai_usage', id: 'all_d', field: 'count', by: 2, limit: 5 },
  ];
  const ok = planReservation(entries, [{ count: 8, note: 'kept' }, { count: 3 }]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.values, [10, 5]);
  assert.equal(ok.writes[0].note, 'kept', 'an existing document keeps its fields');

  const fresh = planReservation(entries, [null, null]);
  assert.equal(fresh.writes[0].userId, 'u_a', 'a new one starts from base');
  assert.equal(fresh.writes[0].count, 2);

  const over = planReservation(entries, [{ count: 1 }, { count: 4 }]);
  assert.equal(over.ok, false);
  assert.equal(over.failed, 1, 'the ceiling refused it');
  assert.equal(over.writes, undefined, 'and nothing is written - not even the counter that had room');

  assert.equal(planReservation([{ ...entries[0], limit: null }], [{ count: 1e6 }]).ok, true, 'no limit is no limit');
});

test('SQLite: fifty reservations at once against a limit of ten take exactly ten', async () => {
  const s = createSqliteStore({ filePath: path.join(tmp, 'race.sqlite') });
  const entry = { collection: 'ai_usage', id: 'race', field: 'count', by: 1, limit: 10, base: {} };
  const results = await Promise.all(Array.from({ length: 50 }, () => s.reserve([entry])));
  assert.equal(results.filter((r) => r.ok).length, 10);
  assert.equal((await s.get('ai_usage', 'race')).count, 10);
  await s.close();
});

/**
 * Enough of Firestore for `reserve()`: documents with versions, and
 * runTransaction with optimistic concurrency - reads are recorded, and a
 * commit whose reads have moved since is thrown away and the function run
 * again, as Firestore does with a contended transaction. Every await yields,
 * so fifty transactions genuinely interleave.
 */
function fakeFirestore() {
  const docs = new Map(); // path -> { data, v }
  const tick = () => new Promise((r) => setImmediate(r));
  const ref = (p) => ({ path: p, id: p.split('/').pop() });
  let retries = 0;
  const db = {
    collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }),
    async runTransaction(fn) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const reads = new Map();
        const writes = [];
        const tx = {
          async getAll(...refs) {
            await tick();
            return refs.map((r) => {
              const d = docs.get(r.path);
              reads.set(r.path, d?.v ?? 0);
              return { exists: Boolean(d), data: () => (d ? { ...d.data } : undefined) };
            });
          },
          set(r, data) {
            writes.push([r.path, data]);
          },
        };
        const result = await fn(tx);
        await tick();
        const moved = [...reads].some(([p, v]) => (docs.get(p)?.v ?? 0) !== v);
        if (moved) {
          retries += 1;
          continue;
        }
        for (const [p, data] of writes) docs.set(p, { data, v: (docs.get(p)?.v ?? 0) + 1 });
        return result;
      }
      throw new Error('transaction contention: gave up');
    },
    docs,
    retries: () => retries,
  };
  return db;
}

test('Firestore: fifty reservations at once against a limit of ten take exactly ten', async () => {
  const db = fakeFirestore();
  const s = createFirestoreStore({ prefix: 't', db });
  const mine = { collection: 'ai_usage', id: 'u_x_day', field: 'count', by: 1, limit: 10, base: { userId: 'u_x' } };
  const all = { collection: 'ai_usage', id: 'all_day', field: 'count', by: 1, limit: 400, base: {} };
  const results = await Promise.all(Array.from({ length: 50 }, () => s.reserve([mine, all])));
  assert.equal(results.filter((r) => r.ok).length, 10);
  assert.equal(db.docs.get('t_ai_usage/u_x_day').data.count, 10);
  assert.equal(db.docs.get('t_ai_usage/all_day').data.count, 10, 'the refused ones spent nothing globally either');
  assert.ok(db.retries() > 0, 'the transactions really did contend');
});

/* ---- over HTTP --------------------------------------------------------- */

test('a new account gets the smaller allowance, and parallel requests cannot pass it', async () => {
  const young = await account('young');
  const before = modelCalls;
  const res = await Promise.all(Array.from({ length: 10 }, () => ask(young.cookie)));
  assert.deepEqual(statuses(res), [200, 200, 200, 429, 429, 429, 429, 429, 429, 429]);
  assert.equal(modelCalls - before, 3, 'the model was asked three times, no more');
  const refused = await res.find((r) => r.status === 429).json();
  assert.match(refused.error, /today's 3 sommelier requests/);
  assert.match(refused.error, /New accounts get 3 a day for their first day, then 6/);
});

test('the day-old account gets the full allowance - until the ceiling across everyone', async () => {
  const old = await account('old');
  await store.patch('users', old.user.id, { createdAt: new Date(Date.now() - 2 * 86400_000).toISOString() });
  const before = modelCalls;
  // Its own allowance is 6, but only 5 of the day's 8 are left after "young".
  const res = await Promise.all(Array.from({ length: 10 }, () => ask(old.cookie)));
  assert.equal(res.filter((r) => r.status === 200).length, 5);
  assert.equal(modelCalls - before, 5);
  const refused = await res.find((r) => r.status === 429).json();
  assert.match(refused.error, /across everyone/);
});

test('with the ceiling reached, nobody gets a model call - not even a fresh account', async () => {
  const late = await account('late');
  const before = modelCalls;
  const r = await ask(late.cookie);
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /answered all it can for today, across everyone/);
  // Refused up front, before its 8 MB body is read or decoded.
  const scan = await post('/api/ai/scan', { image: 'A'.repeat(4096), mediaType: 'image/jpeg' }, late.cookie);
  assert.equal(scan.status, 429);
  assert.equal(modelCalls, before);
  const [all] = await store.query('ai_usage', { where: [['scope', '==', 'all']] });
  assert.equal(all.count, 8, 'the day stopped exactly at its ceiling');
});

test('the scheduled sweep counts against the ceiling too, and stops rather than spends', async () => {
  const owner = await account('watcher');
  const w = await post('/api/dispatch/watches', { kind: 'brewery', target: 'Tree House', places: [{ label: 'Boston' }] }, owner.cookie);
  assert.equal(w.status, 201, await w.clone().text());
  const before = modelCalls;
  const r = await post('/api/dispatch/cron', {}, null, { 'x-cron-secret': 'the-real-cron-secret-value' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ceilingReached, true);
  assert.equal(body.scanned, 0);
  assert.equal(body.deferred, 1);
  assert.equal(modelCalls, before);
});

test('the cron secret is checked, whatever its length', async () => {
  for (const guess of ['nope', 'the-real-cron-secret-valuE', 'the-real-cron-secret-value-and-more', '']) {
    const r = await post('/api/dispatch/cron', {}, null, { 'x-cron-secret': guess });
    assert.equal(r.status, 403, `refused: ${JSON.stringify(guess)}`);
  }
  const { cronSecretMatches } = await import('../src/routes/dispatch.js');
  assert.equal(cronSecretMatches('the-real-cron-secret-value'), true);
  assert.equal(cronSecretMatches(undefined), false);
});

test('the photo route reads its 8 MB body only for a signed-in caller', async () => {
  // Signed out: refused before the body is parsed, so broken JSON is a 401,
  // not a parse error.
  const out = await post('/api/ai/scan', '{"image": this is not json');
  assert.equal(out.status, 401);
  // Signed in, a 2 MB body still gets through the route's own parser (the
  // app-wide one stops at 1 MB) - checked on a route that is not yet spent,
  // by clearing today's counters.
  for (const row of await store.query('ai_usage', {})) await store.delete('ai_usage', row.id);
  const me = await account('scanner');
  const big = await post('/api/ai/scan', { image: 'A'.repeat(2_000_000), mediaType: 'image/tiff' }, me.cookie);
  assert.equal(big.status, 400, 'parsed, then refused on its media type - not a 413');
  const [mine] = await store.query('ai_usage', { where: [['userId', '==', me.user.id]] });
  assert.equal(mine, undefined, 'and a request refused on its input spent nothing');
});
