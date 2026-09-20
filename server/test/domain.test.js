import test from 'node:test';
import assert from 'node:assert/strict';

import { snobScore, verdict, AXES } from '../src/domain/scoring.js';
import { familyOf } from '../src/domain/styles.js';
import { haversineKm, planRoute, describeRoute } from '../src/domain/geo.js';
import { computeBadges } from '../src/domain/badges.js';

test('snob score weights flavour heaviest', () => {
  const flat = snobScore({ aroma: 8, appearance: 8, flavour: 8, mouthfeel: 8, overall: 8 });
  assert.equal(flat, 80);

  // Moving flavour up one point must move the score more than moving
  // appearance up one point, because flavour carries 3.5x the weight.
  const base = { aroma: 5, appearance: 5, flavour: 5, mouthfeel: 5, overall: 5 };
  const flavourUp = snobScore({ ...base, flavour: 6 });
  const appearanceUp = snobScore({ ...base, appearance: 6 });
  assert.ok(flavourUp > appearanceUp, `${flavourUp} should beat ${appearanceUp}`);
});

test('snob score handles partial and empty input', () => {
  assert.equal(snobScore({}), null);
  // A single axis is re-normalised against the weight actually used.
  assert.equal(snobScore({ flavour: 7 }), 70);
  assert.equal(snobScore({ flavour: 99 }), 100, 'clamps above 10');
});

test('axis weights sum to one', () => {
  const total = AXES.reduce((n, a) => n + a.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights summed to ${total}`);
});

test('verdict tracks the score bands', () => {
  assert.equal(verdict(96).label, 'World class');
  assert.equal(verdict(82).label, 'Very good');
  assert.equal(verdict(20).label, 'Drain pour');
  assert.equal(verdict(null).label, 'Unscored');
});

test('style families fall back sensibly for unknown names', () => {
  assert.equal(familyOf('Imperial Stout'), 'stout');
  assert.equal(familyOf('Double Dry Hopped IPA'), 'ipa');
  assert.equal(familyOf('Raspberry Gose'), 'sour');
  assert.equal(familyOf('Some Brewer Invented This'), 'specialty');
  assert.equal(familyOf(''), 'specialty');
});

test('haversine matches a known distance', () => {
  // St. Louis to Kansas City is about 384 km.
  const km = haversineKm({ lat: 38.627, lng: -90.1994 }, { lat: 39.0997, lng: -94.5786 });
  assert.ok(Math.abs(km - 384) < 15, `got ${km}`);
});

test('route planner beats naive input order', () => {
  const start = { lat: 0, lng: 0 };
  // Deliberately zig-zagged so nearest-neighbour + 2-opt has work to do.
  const stops = [
    { name: 'far', lat: 0, lng: 0.09 },
    { name: 'near', lat: 0, lng: 0.01 },
    { name: 'mid', lat: 0, lng: 0.05 },
  ];
  const route = planRoute(stops, start);
  assert.deepEqual(route.map((s) => s.name), ['near', 'mid', 'far']);

  const described = describeRoute(route, start);
  assert.equal(described.legs.length, 3);
  // 0.09 degrees of longitude at the equator is about 10 km, so this spread is
  // a drive, not a walk — and the planner should say so.
  assert.ok(Math.abs(described.totalKm - 10) < 0.5, `got ${described.totalKm} km`);
  assert.equal(described.walkable, false);
  assert.ok(described.legs.every((l) => l.walkMinutes >= 0));
});

test('a tight cluster reads as walkable with sane walk times', () => {
  const start = { lat: 0, lng: 0 };
  const stops = [
    { name: 'a', lat: 0, lng: 0.009 },
    { name: 'b', lat: 0, lng: 0.018 },
    { name: 'c', lat: 0, lng: 0.027 },
  ];
  const described = describeRoute(planRoute(stops, start), start);
  // About 3 km end to end: roughly 40 minutes of walking across the evening.
  assert.ok(described.totalKm < 5, `got ${described.totalKm} km`);
  assert.equal(described.walkable, true);
  assert.ok(described.totalWalkMinutes > 0 && described.totalWalkMinutes < 90);
});

test('route planner passes short lists through untouched', () => {
  const stops = [{ lat: 1, lng: 1 }];
  assert.deepEqual(planRoute(stops, null), stops);
});

test('route planner drops stops without coordinates', () => {
  const stops = [
    { name: 'a', lat: 0, lng: 0.01 },
    { name: 'no-coords', lat: null, lng: null },
    { name: 'b', lat: 0, lng: 0.02 },
    { name: 'c', lat: 0, lng: 0.03 },
  ];
  const route = planRoute(stops, { lat: 0, lng: 0 });
  assert.equal(route.length, 3);
  assert.ok(!route.some((s) => s.name === 'no-coords'));
});

test('badges are earned from pours, and streaks count consecutive days', () => {
  const pours = [
    { style: 'Imperial Stout', state: 'MO', drankAt: '2026-09-01', createdAt: '2026-09-01T10:00:00Z', score: 96, notes: 'x'.repeat(50), brewery: 'Side Project' },
    { style: 'Hazy IPA', state: 'CA', createdAt: '2026-09-02T10:00:00Z', score: 80, notes: '', brewery: 'Other' },
    { style: 'Pilsner', state: 'CA', createdAt: '2026-09-03T10:00:00Z', score: 40, notes: '', brewery: 'Other' },
    // A gap here, so the streak should stay at 3 rather than running to 4.
    { style: 'Gose', state: 'NY', createdAt: '2026-09-20T10:00:00Z', score: 70, notes: '', brewery: 'Other' },
  ];
  const { badges, stats } = computeBadges(pours, { cellarCount: 0 });

  assert.equal(stats.total, 4);
  assert.deepEqual(stats.states, ['CA', 'MO', 'NY']);
  assert.equal(stats.longestStreak, 3);
  assert.equal(stats.worldClass, 1);
  assert.equal(stats.drainPours, 1, 'a 40 is a drain pour');

  const byId = Object.fromEntries(badges.map((b) => [b.id, b]));
  assert.ok(byId['first-pour'].earned);
  assert.ok(byId['passport-stamped'].earned, 'three states earns the stamp');
  assert.ok(byId['honest-critic'].earned);
  assert.ok(!byId.century.earned);
  assert.equal(byId.century.progress, 4);
  assert.ok(byId['road-warrior'].pct > 0 && !byId['road-warrior'].earned);
});

test('barrel-aged detection reads the style, name and notes', () => {
  const { stats } = computeBadges([
    { style: 'Barrel-Aged Imperial Stout', beerName: 'X', createdAt: '2026-01-01T00:00:00Z' },
    { style: 'Imperial Stout', beerName: 'Bourbon County', createdAt: '2026-01-02T00:00:00Z' },
    { style: 'Pilsner', beerName: 'Clean', notes: 'no wood here', createdAt: '2026-01-03T00:00:00Z' },
  ]);
  assert.equal(stats.barrelAged, 2);
});
