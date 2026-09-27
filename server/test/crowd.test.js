// You vs the crowd.
//
// The rules that matter are privacy rules, so they are what this holds
// still: only public pours count, nothing is said about fewer than five
// drinkers - five OTHER than whoever is asking - and no published number is
// ever moved by exactly one person arriving or leaving.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MIN_DRINKERS,
  aggregate,
  beerCrowd,
  beerKey,
  breweryCrowd,
  breweryKey,
  familyStanding,
} from '../src/domain/crowd.js';

// Each pour is "created" a minute after the last, so arrival order is the
// order they are written in - the way the server stamps createdAt.
let clock = Date.parse('2026-09-01T00:00:00Z');
const tick = () => new Date((clock += 60000)).toISOString();

const pour = (userId, score, extra = {}) => ({
  userId,
  beerName: 'Heady Topper',
  brewery: 'The Alchemist',
  style: 'Double IPA',
  family: 'ipa',
  score,
  visibility: 'public',
  createdAt: tick(),
  ...extra,
});

const HEADY = { brewery: 'The Alchemist', beerName: 'Heady Topper' };
const crowdOf = (pours, opts) => beerCrowd(aggregate(pours), HEADY, opts).crowd;
const users = (n, prefix = 'u') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

test('the bar is five drinkers', () => {
  assert.equal(MIN_DRINKERS, 5);
});

test('four drinkers is nothing at all - not a smaller number', () => {
  const r = beerCrowd(aggregate(users(4).map((u) => pour(u, 80))), HEADY);
  assert.equal(r.crowd, null);
  assert.equal(JSON.stringify(r).includes('"drinkers"'), false, 'not even a count');
});

test('five is still nothing: the published set is even, so the first number needs six', () => {
  assert.equal(crowdOf(users(5).map((u) => pour(u, 80))), null);
  assert.deepEqual(crowdOf(users(6).map((u, i) => pour(u, 77 + i * 2))), { drinkers: 6, average: 82 });
});

/* ---------------- the differencing rule ---------------- */

test('one new drinker never changes a published number; the second does', () => {
  const base = users(6).map((u, i) => pour(u, 70 + i));
  const before = crowdOf(base);
  assert.deepEqual(before, { drinkers: 6, average: 73 });

  // The seventh logs something extreme. Nothing a reader can see moves.
  const seventh = [...base, pour('late1', 100)];
  assert.deepEqual(crowdOf(seventh), before, 'one newcomer is invisible');

  // The eighth arrives: both enter together.
  const eighth = [...seventh, pour('late2', 60)];
  assert.deepEqual(crowdOf(eighth), { drinkers: 8, average: Math.round((70 + 71 + 72 + 73 + 74 + 75 + 100 + 60) / 8) });
});

test('holds at every size: consecutive drinker counts never differ by one person', () => {
  const pours = [];
  const seen = [];
  for (let i = 0; i < 14; i++) {
    pours.push(pour(`d${i}`, 50 + ((i * 17) % 50)));
    const c = crowdOf(pours);
    seen.push(c ? c.drinkers : 0);
  }
  for (let i = 1; i < seen.length; i++) {
    assert.notEqual(Math.abs(seen[i] - seen[i - 1]), 1, `step ${i}: ${seen[i - 1]} -> ${seen[i]}`);
  }
  assert.deepEqual(seen, [0, 0, 0, 0, 0, 6, 6, 8, 8, 10, 10, 12, 12, 14]);
});

test('it is deterministic: the same pours in any order give the same numbers', () => {
  const pours = users(9).map((u, i) => pour(u, 60 + i * 4));
  const a = crowdOf(pours);
  const b = crowdOf([...pours].reverse());
  const c = crowdOf([...pours].sort(() => 0.5 - Math.random()));
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.deepEqual(a, { drinkers: 8, average: Math.round((60 + 64 + 68 + 72 + 76 + 80 + 84 + 88) / 8) });
});

test('the order is arrival (createdAt), so a back-dated drankAt cannot jump the queue', () => {
  const base = users(7).map((u, i) => pour(u, 70 + i));
  // The newcomer claims to have drunk it last year - it still arrived last.
  const backdated = [...base, pour('late', 20, { drankAt: '2025-01-01T00:00:00Z' })];
  const plain = [...base, pour('late', 20)];
  assert.deepEqual(crowdOf(backdated), crowdOf(plain));
});

test('someone leaving (deleted, or made private) moves two people, never one', () => {
  const pours = users(7).map((u, i) => pour(u, 70 + i * 3));
  const all = crowdOf(pours); // u0..u5
  // u2 goes private: u6 takes the place - two people changed.
  const without = pours.map((p) => (p.userId === 'u2' ? { ...p, visibility: 'private' } : p));
  const after = crowdOf(without);
  assert.equal(after.drinkers, 6);
  assert.equal(after.average, Math.round((70 + 73 + 79 + 82 + 85 + 88) / 6));
  assert.notEqual(after.average, all.average);
  // The waiting seventh leaving changes nothing at all.
  assert.deepEqual(crowdOf(pours.filter((p) => p.userId !== 'u6')), all);
});

test('a repeat pour does not move anyone’s place in line', () => {
  const pours = users(7).map((u, i) => pour(u, 70 + i));
  const before = crowdOf(pours);
  // The seventh (outside the prefix) logs again: still outside.
  assert.deepEqual(crowdOf([...pours, pour('u6', 10)]), before);
});

/* ---------------- what counts ---------------- */

test('private pours never count - not in the average, not towards the bar', () => {
  const pours = [...users(5).map((u) => pour(u, 80)), pour('secret', 10, { visibility: 'private' })];
  assert.equal(crowdOf(pours), null, 'five public + one private is five');
  const withSixth = [...pours, pour('u5', 80), pour('secret2', 0, { visibility: 'private' })];
  assert.deepEqual(crowdOf(withSixth), { drinkers: 6, average: 80 });
});

test('a pour with no visibility is not assumed public', () => {
  assert.equal(crowdOf(users(6).map((u) => pour(u, 80, { visibility: undefined }))), null);
});

test('one drinker is one voice, however many times they log it', () => {
  const pours = [...users(5).map((u) => pour(u, 80)), ...Array.from({ length: 6 }, () => pour('regular', 20))];
  // Per pour it would be (5*80 + 6*20)/11 = 47. Per drinker it is (5*80+20)/6.
  assert.deepEqual(crowdOf(pours), { drinkers: 6, average: 70 });
});

test('the viewer is taken out of the same prefix everyone sees', () => {
  // me arrives third; seven drinkers, so the prefix is the first six.
  const pours = [pour('a', 80), pour('b', 80), pour('me', 91), pour('c', 80), pour('d', 80), pour('e', 80), pour('f', 20)];
  const agg = aggregate(pours);
  const out = beerCrowd(agg, HEADY).crowd;
  assert.deepEqual(out, { drinkers: 6, average: Math.round((80 * 5 + 91) / 6) });
  const mine = beerCrowd(agg, HEADY, { viewerId: 'me', viewerPours: [pours[2]] });
  // a..e, NOT a..f: had the viewer been removed first, the prefix would have
  // reached f, and comparing with the signed-out number would give f away.
  assert.deepEqual(mine.crowd, { drinkers: 5, average: 80 });
  assert.deepEqual(mine.you, { average: 91, pours: 1, delta: 11 });
});

test('a viewer inside a six leaves five others - enough; inside a four, nothing', () => {
  const six = [...users(5).map((u) => pour(u, 82)), pour('me', 91)];
  const r = beerCrowd(aggregate(six), HEADY, { viewerId: 'me', viewerPours: [six[5]] });
  assert.deepEqual(r.crowd, { drinkers: 5, average: 82 });
  assert.deepEqual(r.you, { average: 91, pours: 1, delta: 9 });

  const five = [...users(4).map((u) => pour(u, 82)), pour('me', 91)];
  const none = beerCrowd(aggregate(five), HEADY, { viewerId: 'me', viewerPours: [five[4]] });
  assert.equal(none.crowd, null);
  assert.deepEqual(none.you, { average: 91, pours: 1, delta: null });
});

test('your own private pour still counts as yours', () => {
  const pours = users(6).map((u) => pour(u, 70));
  const mine = [pour('me', 60, { visibility: 'private' })];
  const r = beerCrowd(aggregate([...pours, ...mine]), HEADY, { viewerId: 'me', viewerPours: mine });
  assert.equal(r.crowd.drinkers, 6);
  assert.equal(r.you.delta, -10);
});

test('the same beer typed differently is the same beer', () => {
  assert.equal(beerKey('The Alchemist', 'Heady Topper'), beerKey('Alchemist Brewery', 'heady  topper!'));
  assert.equal(breweryKey('Side Project Brewing Co.'), breweryKey('side project'));
  assert.equal(breweryKey('Brasserie Cantillon'), breweryKey('Brasserie  Cantillón'));
  assert.equal(breweryKey('Brewery'), 'brewery', 'a name that is all noise keeps itself');
  assert.equal(beerKey('Anywhere', ''), '', 'no beer, no key');
});

/* ---------------- breweries ---------------- */

test('a brewery: its average and its most-poured beer', () => {
  const at = (beerName) => ({ brewery: 'Hill Farmstead Brewery', beerName, style: 'Saison', family: 'belgian' });
  const pours = [
    // Edward: eight drinkers.
    ...users(8).map((u) => pour(u, 90, at('Edward'))),
    // Arthur: six drinkers, many pours each - pours never decide.
    ...users(6).flatMap((u) => [pour(u, 88, at('Arthur')), pour(u, 88, at('Arthur')), pour(u, 88, at('Arthur'))]),
    // Everett: three - never named, however popular with them.
    ...users(3).flatMap((u) => Array.from({ length: 5 }, () => pour(u, 95, at('Everett')))),
  ];
  const r = breweryCrowd(aggregate(pours), 'Hill Farmstead');
  assert.equal(r.brewery, 'Hill Farmstead Brewery');
  assert.equal(r.crowd.drinkers, 8);
  assert.deepEqual(r.mostPoured, { beerName: 'Edward', drinkers: 8 });
});

test('most-poured moves only when two drinkers do', () => {
  const at = (beerName) => ({ brewery: 'Hill Farmstead', beerName });
  const pours = [...users(6).map((u) => pour(u, 80, at('Arthur'))), ...users(6, 'v').map((u) => pour(u, 80, at('Edward')))];
  // Tied at six: the name decides.
  assert.equal(breweryCrowd(aggregate(pours), 'Hill Farmstead').mostPoured.beerName, 'Arthur');
  // A seventh Edward drinker is invisible...
  const seven = [...pours, pour('v6', 80, at('Edward'))];
  assert.equal(breweryCrowd(aggregate(seven), 'Hill Farmstead').mostPoured.beerName, 'Arthur');
  // ...an eighth is not.
  const eight = [...seven, pour('v7', 80, at('Edward'))];
  assert.deepEqual(breweryCrowd(aggregate(eight), 'Hill Farmstead').mostPoured, { beerName: 'Edward', drinkers: 8 });
});

test('no beer at a brewery clears the bar, so none is named', () => {
  const pours = users(6).map((u, i) => pour(u, 80, { beerName: `Beer ${i}` }));
  const r = breweryCrowd(aggregate(pours), 'The Alchemist');
  assert.equal(r.crowd.drinkers, 6, 'the brewery itself has six');
  assert.equal(r.mostPoured, null);
});

test('an unknown brewery is empty, not an error', () => {
  const r = breweryCrowd(aggregate([]), 'Nowhere Brewing');
  assert.equal(r.crowd, null);
  assert.equal(r.mostPoured, null);
});

/* ---------------- the palate ---------------- */

const stout = (userId, score, extra) =>
  pour(userId, score, { style: 'Imperial Stout', family: 'stout', beerName: 'Dark', ...extra });

test('you rate stouts higher than N% of drinkers', () => {
  const others = [70, 72, 74, 76, 78, 80, 95, 97].map((s, i) => stout(`o${i}`, s));
  const mine = [stout('me', 88, { visibility: 'private' }), stout('me', 92, { visibility: 'private' })];
  const agg = aggregate([...others, ...mine, stout('hidden', 100, { visibility: 'private' })]);

  const [s] = familyStanding(agg, { viewerId: 'me', viewerPours: mine });
  assert.equal(s.family, 'stout');
  assert.equal(s.noun, 'stouts and porters');
  assert.equal(s.yourAverage, 90);
  assert.equal(s.drinkers, 8, 'the private rater is not in the crowd');
  assert.equal(s.percentile, 75, 'six of the eight rate them lower');
});

test('the percentile moves two drinkers at a time too', () => {
  const others = [70, 72, 74, 76, 78, 80].map((s, i) => stout(`o${i}`, s));
  const mine = [stout('me', 75, { visibility: 'private' }), stout('me', 75, { visibility: 'private' })];
  const at = (list) => familyStanding(aggregate([...list, ...mine]), { viewerId: 'me', viewerPours: mine })[0];
  const before = at(others);
  assert.equal(before.drinkers, 6);
  const one = at([...others, stout('late', 99)]);
  assert.deepEqual(one, before, 'one newcomer changes nothing');
  const two = at([...others, stout('late', 99), stout('later', 10)]);
  assert.equal(two.drinkers, 8);
});

test('no percentile from one pour, or against fewer than five', () => {
  const six = users(6).map((u) => stout(u, 80));
  assert.deepEqual(familyStanding(aggregate(six), { viewerId: 'me', viewerPours: [stout('me', 90)] }), []);

  const four = users(4).map((u) => stout(u, 80));
  const mine = [stout('me', 90, { visibility: 'private' }), stout('me', 91, { visibility: 'private' })];
  assert.deepEqual(familyStanding(aggregate([...four, ...mine]), { viewerId: 'me', viewerPours: mine }), []);
});
