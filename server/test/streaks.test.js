// Streaks and the next-badge nudge.
//
// The streak used to be counted from createdAt - when an entry was typed - so
// a Friday beer logged on Saturday morning landed on Saturday and broke the
// run it belonged to. These hold it to drankAt, in the drinker's own day.
import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBadges, drinkDay } from '../src/domain/badges.js';

const pour = (drankAt, extra = {}) => ({
  beerName: 'Test Pour',
  brewery: 'Somewhere',
  style: 'Hazy IPA',
  score: 80,
  drankAt,
  createdAt: drankAt,
  ...extra,
});

// Far enough ahead that no current streak is alive, when a test is not about one.
const LATER = { now: Date.parse('2027-01-01T12:00:00Z') };

test('a beer logged the next morning counts on the day it was drunk', () => {
  const pours = [
    pour('2026-09-21T19:00:00Z'),
    pour('2026-09-22T19:00:00Z'),
    // Drunk Wednesday evening, typed in Thursday morning.
    pour('2026-09-23T20:00:00Z', { createdAt: '2026-09-24T08:30:00Z' }),
  ];
  const { stats } = computeBadges(pours, LATER);
  assert.equal(stats.longestStreak, 3, 'Mon, Tue, Wed - not Mon, Tue, Thu');
});

test('a back-dated pour fills the gap it belongs in', () => {
  const pours = [
    pour('2026-09-21T19:00:00Z'),
    pour('2026-09-23T19:00:00Z'),
    // Tuesday's beer, remembered and logged on Friday.
    pour('2026-09-22T19:00:00Z', { createdAt: '2026-09-25T12:00:00Z' }),
  ];
  assert.equal(computeBadges(pours, LATER).stats.longestStreak, 3);
});

test('a pour with no drankAt still counts, by createdAt', () => {
  const pours = [
    { ...pour(undefined), createdAt: '2026-09-21T12:00:00Z' },
    { ...pour(undefined), createdAt: '2026-09-22T12:00:00Z' },
  ];
  assert.equal(computeBadges(pours, LATER).stats.longestStreak, 2);
});

test('the day is the drinker’s, not UTC’s', () => {
  // 8:30pm on Monday the 21st in Denver (UTC-6) is 02:30 Tuesday in UTC.
  const denver = { drankTzOffset: -360 };
  const monday = pour('2026-09-22T02:30:00Z', denver);
  assert.equal(drinkDay(monday), '2026-09-21');
  assert.equal(drinkDay(pour('2026-09-22T02:30:00Z')), '2026-09-22', 'no offset: UTC, as before');

  const pours = [
    pour('2026-09-21T01:00:00Z', denver), // Sunday 7pm local
    monday, // Monday 8:30pm local
    pour('2026-09-23T01:00:00Z', denver), // Tuesday 7pm local
  ];
  assert.equal(computeBadges(pours, LATER).stats.longestStreak, 3);
});

test('pours without an offset take the one the caller knows', () => {
  const pours = [pour('2026-09-21T01:00:00Z'), pour('2026-09-22T01:00:00Z')];
  assert.equal(drinkDay(pours[0], -360), '2026-09-20');
  assert.equal(computeBadges(pours, { ...LATER, tzOffset: -360 }).stats.longestStreak, 2);
});

test('the current streak is alive through the day after the last pour', () => {
  const now = Date.parse('2026-09-26T18:00:00Z');
  const run = [pour('2026-09-24T19:00:00Z'), pour('2026-09-25T19:00:00Z')];

  let { stats } = computeBadges(run, { now });
  assert.equal(stats.currentStreak, 2, 'nothing yet today does not end it');
  assert.equal(stats.loggedToday, false);

  ({ stats } = computeBadges([...run, pour('2026-09-26T17:00:00Z')], { now }));
  assert.equal(stats.currentStreak, 3);
  assert.equal(stats.loggedToday, true);

  ({ stats } = computeBadges([pour('2026-09-23T19:00:00Z')], { now }));
  assert.equal(stats.currentStreak, 0, 'a whole day missed ends it');
});

test('the current streak sits beside a longer one in the past', () => {
  const now = Date.parse('2026-09-26T18:00:00Z');
  const past = ['01', '02', '03', '04', '05'].map((d) => pour(`2026-09-${d}T19:00:00Z`));
  const { stats } = computeBadges([...past, pour('2026-09-26T12:00:00Z')], { now });
  assert.equal(stats.longestStreak, 5);
  assert.equal(stats.currentStreak, 1);
});

test('"today" is the drinker’s today', () => {
  // 03:00 UTC on the 27th is 9pm on the 26th in Denver.
  const now = Date.parse('2026-09-27T03:00:00Z');
  const pours = [pour('2026-09-26T20:00:00Z', { drankTzOffset: -360 })];
  assert.equal(computeBadges(pours, { now, tzOffset: -360 }).stats.loggedToday, true);
  assert.equal(computeBadges(pours, { now, tzOffset: 0 }).stats.loggedToday, false);
  // With no tz from the caller, the latest pour's own offset is used.
  assert.equal(computeBadges(pours, { now }).stats.loggedToday, true);
});

test('the nudge names the unearned badge closest to done', () => {
  const stouts = Array.from({ length: 18 }, () => pour('2026-09-01T19:00:00Z', { style: 'Imperial Stout', state: 'VT' }));
  const { next } = computeBadges(stouts, LATER);
  assert.equal(next.id, 'stout-brother');
  assert.equal(next.remaining, 2);
  assert.equal(next.text, '2 more stouts or porters for Stout Brother');
  assert.equal(next.pct, 90);
});

test('one left reads in the singular', () => {
  const stouts = Array.from({ length: 19 }, () => pour('2026-09-01T19:00:00Z', { style: 'Porter', state: 'VT' }));
  assert.equal(computeBadges(stouts, LATER).next.text, '1 more stout or porter for Stout Brother');
});

test('the streak nudge counts from the run you are on', () => {
  const now = Date.parse('2026-09-26T18:00:00Z');
  const pours = ['23', '24', '25', '26'].map((d) => pour(`2026-09-${d}T12:00:00Z`, { state: 'VT' }));
  const { next } = computeBadges(pours, { now });
  assert.equal(next.id, 'streak-7');
  assert.equal(next.text, '3 more days in a row for Seven-Day Run');
});

test('a badge you cannot work towards is never the nudge', () => {
  // Nine home-bar pours would make The Regular the closest - but with no home
  // bar set on the account there is no way to earn it, so it is skipped.
  const pours = Array.from({ length: 9 }, () => pour('2026-09-01T19:00:00Z', { brewery: 'Local' }));
  assert.equal(computeBadges(pours, { ...LATER, homeBreweryName: 'Local' }).next.id, 'the-regular');
  assert.notEqual(computeBadges(pours, LATER).next.id, 'the-regular');
});

test('an empty journal is nudged towards its first pour', () => {
  const { next } = computeBadges([], LATER);
  assert.equal(next.id, 'first-pour');
  assert.equal(next.text, 'Log your first beer for First Pour');
});
