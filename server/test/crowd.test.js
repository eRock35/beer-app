// You vs the crowd.
//
// The two rules that matter are privacy rules, so they are what this holds
// still: only public pours count, and nothing is said about fewer than five
// drinkers - five OTHER than whoever is asking.
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

const pour = (userId, score, extra = {}) => ({
  userId,
  beerName: 'Heady Topper',
  brewery: 'The Alchemist',
  style: 'Double IPA',
  family: 'ipa',
  score,
  visibility: 'public',
  ...extra,
});

const HEADY = { brewery: 'The Alchemist', beerName: 'Heady Topper' };

test('the bar is five drinkers', () => {
  assert.equal(MIN_DRINKERS, 5);
});

test('four drinkers is nothing at all - not a smaller number', () => {
  const agg = aggregate(['a', 'b', 'c', 'd'].map((u) => pour(u, 80)));
  const r = beerCrowd(agg, HEADY);
  assert.equal(r.crowd, null);
  assert.equal(JSON.stringify(r).includes('"drinkers"'), false, 'not even a count');
});

test('five drinkers is an average', () => {
  const agg = aggregate(['a', 'b', 'c', 'd', 'e'].map((u, i) => pour(u, 78 + i * 2)));
  assert.deepEqual(beerCrowd(agg, HEADY).crowd, { drinkers: 5, average: 82 });
});

test('private pours never count - not in the average, not towards the five', () => {
  const pours = [
    ...['a', 'b', 'c', 'd'].map((u) => pour(u, 80)),
    pour('secret', 10, { visibility: 'private' }),
  ];
  assert.equal(beerCrowd(aggregate(pours), HEADY).crowd, null, 'four public + one private is four');

  const withFifth = [...pours, pour('e', 80), pour('secret2', 0, { visibility: 'private' })];
  assert.deepEqual(beerCrowd(aggregate(withFifth), HEADY).crowd, { drinkers: 5, average: 80 });
});

test('a pour with no visibility is not assumed public', () => {
  const pours = ['a', 'b', 'c', 'd', 'e'].map((u) => pour(u, 80, { visibility: undefined }));
  assert.equal(beerCrowd(aggregate(pours), HEADY).crowd, null);
});

test('one drinker is one voice, however many times they log it', () => {
  const pours = [
    ...['a', 'b', 'c', 'd'].map((u) => pour(u, 80)),
    ...Array.from({ length: 6 }, () => pour('regular', 20)),
  ];
  // Per pour it would be (4*80 + 6*20)/10 = 44. Per drinker it is (4*80+20)/5.
  assert.deepEqual(beerCrowd(aggregate(pours), HEADY).crowd, { drinkers: 5, average: 68 });
});

test('the viewer is taken out of the crowd they are compared with', () => {
  const pours = [...['a', 'b', 'c', 'd'].map((u) => pour(u, 82)), pour('me', 91)];
  const agg = aggregate(pours);
  // Signed out, five drinkers.
  assert.equal(beerCrowd(agg, HEADY).crowd.drinkers, 5);
  // Signed in as one of them, four others - so nothing, or you could subtract
  // yourself and read the other four's average.
  const mine = beerCrowd(agg, HEADY, { viewerId: 'me', viewerPours: [pour('me', 91)] });
  assert.equal(mine.crowd, null);
  assert.deepEqual(mine.you, { average: 91, pours: 1, delta: null });
});

test('you vs the crowd: "average 82 · you gave 91 (+9)"', () => {
  const pours = [...['a', 'b', 'c', 'd', 'e'].map((u) => pour(u, 82)), pour('me', 91)];
  const r = beerCrowd(aggregate(pours), HEADY, { viewerId: 'me', viewerPours: [pour('me', 91)] });
  assert.deepEqual(r.crowd, { drinkers: 5, average: 82 });
  assert.deepEqual(r.you, { average: 91, pours: 1, delta: 9 });
});

test('your own private pour still counts as yours', () => {
  const pours = ['a', 'b', 'c', 'd', 'e'].map((u) => pour(u, 70));
  const mine = [pour('me', 60, { visibility: 'private' })];
  const r = beerCrowd(aggregate([...pours, ...mine]), HEADY, { viewerId: 'me', viewerPours: mine });
  assert.equal(r.crowd.drinkers, 5);
  assert.equal(r.you.delta, -10);
});

test('the same beer typed differently is the same beer', () => {
  assert.equal(beerKey('The Alchemist', 'Heady Topper'), beerKey('Alchemist Brewery', 'heady  topper!'));
  assert.equal(breweryKey('Side Project Brewing Co.'), breweryKey('side project'));
  assert.equal(breweryKey('Brasserie Cantillon'), breweryKey('Brasserie  Cantillón'));
  assert.equal(breweryKey('Brewery'), 'brewery', 'a name that is all noise keeps itself');
  assert.equal(beerKey('Anywhere', ''), '', 'no beer, no key');
});

test('a brewery: its average and its most-poured beer', () => {
  const at = (beerName) => ({ brewery: 'Hill Farmstead Brewery', beerName, style: 'Saison', family: 'belgian' });
  const pours = [
    // Edward: six drinkers.
    ...['a', 'b', 'c', 'd', 'e', 'f'].map((u) => pour(u, 90, at('Edward'))),
    // Arthur: five drinkers but more pours each.
    ...['a', 'b', 'c', 'd', 'e'].flatMap((u) => [pour(u, 88, at('Arthur')), pour(u, 88, at('Arthur'))]),
    // Everett: only three - never named, however popular with them.
    ...['a', 'b', 'c'].flatMap((u) => Array.from({ length: 5 }, () => pour(u, 95, at('Everett')))),
  ];
  const r = breweryCrowd(aggregate(pours), 'Hill Farmstead');
  assert.equal(r.brewery, 'Hill Farmstead Brewery');
  assert.equal(r.crowd.drinkers, 6);
  assert.deepEqual(r.mostPoured, { beerName: 'Edward', drinkers: 6 });
});

test('no beer at a brewery clears five, so none is named', () => {
  const pours = ['a', 'b', 'c', 'd', 'e'].map((u, i) => pour(u, 80, { beerName: `Beer ${i}` }));
  const r = breweryCrowd(aggregate(pours), 'The Alchemist');
  assert.equal(r.crowd.drinkers, 5, 'the brewery itself has five');
  assert.equal(r.mostPoured, null);
});

test('an unknown brewery is empty, not an error', () => {
  const r = breweryCrowd(aggregate([]), 'Nowhere Brewing');
  assert.equal(r.crowd, null);
  assert.equal(r.mostPoured, null);
});

test('you rate stouts higher than N% of drinkers', () => {
  const stout = (userId, score, extra) => pour(userId, score, { style: 'Imperial Stout', family: 'stout', beerName: 'Dark', ...extra });
  const others = [70, 72, 74, 76, 78, 80, 95, 97].map((s, i) => stout(`u${i}`, s));
  const mine = [stout('me', 88), stout('me', 92, { visibility: 'private' })];
  const agg = aggregate([...others, ...mine, stout('hidden', 100, { visibility: 'private' })]);

  const [s] = familyStanding(agg, { viewerId: 'me', viewerPours: mine });
  assert.equal(s.family, 'stout');
  assert.equal(s.noun, 'stouts and porters');
  assert.equal(s.yourAverage, 90);
  assert.equal(s.drinkers, 8, 'the private rater is not in the crowd');
  assert.equal(s.percentile, 75, 'six of the eight rate them lower');
});

test('no percentile from one pour, or against fewer than five', () => {
  const stout = (userId, score) => pour(userId, score, { style: 'Porter', family: 'stout' });
  const five = ['a', 'b', 'c', 'd', 'e'].map((u) => stout(u, 80));
  assert.deepEqual(familyStanding(aggregate(five), { viewerId: 'me', viewerPours: [stout('me', 90)] }), []);

  const four = five.slice(0, 4);
  const mine = [stout('me', 90), stout('me', 91)];
  assert.deepEqual(familyStanding(aggregate([...four, ...mine]), { viewerId: 'me', viewerPours: mine }), []);
});
