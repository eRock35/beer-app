// The worked-example passport.
//
// Two things worth holding still: it needs no account (a blank passport is
// exactly when you want to see a full one), and it goes through the same
// computation the real passport does - a sample that renders a shape the app
// cannot actually produce is a lie, not a demo.
import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBadges } from '../src/domain/badges.js';
import { SAMPLE_PROFILE, sampleCellar, samplePours, sampleWishlist } from '../src/domain/sample-journal.js';

test('the sample journal is a real journal', () => {
  const pours = samplePours();
  assert.ok(pours.length >= 10, 'a passport needs enough pours to be worth showing');
  for (const p of pours) {
    assert.ok(p.beerName && p.brewery && p.style, 'every pour is complete');
    assert.ok(Number.isFinite(p.score), `${p.beerName} has a snob score`);
    assert.ok(p.score >= 0 && p.score <= 100, `${p.beerName} scores in range`);
    assert.ok(p.family, `${p.beerName} lands in a style family`);
    assert.ok(!Number.isNaN(Date.parse(p.drankAt)), `${p.beerName} has a real date`);
  }
});

test('the pours are spread over months, so the trend line has shape', () => {
  const months = new Set(samplePours().map((p) => p.drankAt.slice(0, 7)));
  assert.ok(months.size >= 3, `expected several months, got ${months.size}`);
});

test('it is deterministic apart from the clock', () => {
  const now = Date.parse('2026-06-01T00:00:00.000Z');
  assert.deepEqual(samplePours({ now }), samplePours({ now }));
});

test('nothing in the sample carries a user', () => {
  for (const row of [...samplePours(), ...sampleCellar(), ...sampleWishlist()]) {
    assert.equal(row.userId, '');
  }
});

test('it earns badges rather than showing an empty board', () => {
  const cellarCount = sampleCellar().reduce((n, b) => n + (Number(b.quantity) || 0), 0);
  const { earnedCount, badges, stats } = computeBadges(samplePours(), {
    cellarCount,
    homeBreweryId: SAMPLE_PROFILE.homeBreweryId,
    homeBreweryName: SAMPLE_PROFILE.homeBreweryName,
  });
  assert.ok(earnedCount > 0, 'the example passport should have something on it');
  assert.ok(earnedCount < badges.length, 'and something still to earn, or it is not a passport');
  assert.ok(stats.states.length > 1, 'more than one state, or the map is pointless');
});

test('the honest-critic case survives: a drain pour is in there', () => {
  // The seed deliberately includes beers the taster did not like. If someone
  // ever "tidies" the sample to all-nines, the Honest Critic badge and the
  // whole point of the scoring go with it.
  assert.ok(samplePours().some((p) => p.score < 60), 'the sample must include a beer that is not good');
});
