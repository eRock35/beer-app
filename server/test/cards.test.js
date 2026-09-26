// Share cards: what they escape, what they drop, and that they are PNGs.
//
// Everything on a card came from something a person typed - a display name,
// a beer, a crawl title - so every one of those is thrown at it here as
// markup and quote-breaking input.
import assert from 'node:assert/strict';
import test from 'node:test';
import { crawlSvg, fit, latin, passportSvg, shareName, x } from '../src/domain/cards.js';
import { cardsAvailable, png } from '../src/lib/png.js';

const HOSTILE = `"><script>alert(1)</script><img src=x onerror=alert(2)> ' & </text><text>`;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The SVG's own elements, with every escaped string removed. */
const tagsIn = (svg) => [...svg.matchAll(/<([a-zA-Z]+)[\s>/]/g)].map((m) => m[1]);

test('x() escapes everything that could open a tag or close a quote', () => {
  assert.equal(x(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(x('a\u0000b\u001fc'), 'abc');
  assert.equal(x(null), '');
});

test('latin() keeps what Inter can draw and drops the rest', () => {
  assert.equal(latin('Hazy 🍑 Boi'), 'Hazy Boi');
  assert.equal(latin('Cuvée René — “Gueuze”…'), 'Cuvée René — “Gueuze”…');
  assert.equal(latin('Pale​ Ale'), 'Pale Ale');
});

test('fit() trims to the width with an ellipsis', () => {
  const out = fit('a'.repeat(200), 30, 300, 700);
  assert.ok(out.length < 30);
  assert.ok(out.endsWith('…'));
});

const PASSPORT = {
  by: HOSTILE,
  beers: 47,
  badges: 6,
  badgeTotal: 16,
  states: 7,
  breweries: 23,
  longestStreak: 5,
  currentStreak: 3,
  topBeer: { beerName: HOSTILE, brewery: HOSTILE, score: 96 },
};

test('a hostile passport draws as text, never as markup', () => {
  const svg = passportSvg(PASSPORT);
  assert.equal(svg.includes('<script'), false);
  assert.equal(svg.includes('<img'), false);
  assert.equal(svg.includes('onerror=alert'), true, 'the words survive as text');
  const tags = new Set(tagsIn(svg));
  for (const t of tags) assert.ok(['svg', 'defs', 'linearGradient', 'stop', 'radialGradient', 'rect', 'g', 'path', 'text', 'line', 'circle'].includes(t), `unexpected <${t}>`);
  assert.equal(svg.split('<text').length, svg.split('</text>').length, 'every text node closes');
});

test('a hostile crawl draws as text, never as markup', () => {
  const svg = crawlSvg({
    title: HOSTILE,
    by: HOSTILE,
    city: HOSTILE,
    state: HOSTILE,
    stops: [{ name: HOSTILE }, { name: HOSTILE, walkMinutes: '"><x' }],
    totalMiles: '"><x',
    walkable: true,
  });
  assert.equal(svg.includes('<script'), false);
  assert.equal(svg.includes('<x'), false);
  assert.equal(svg.includes('NaN'), false);
});

test('garbage numbers draw as zero, not NaN', () => {
  const svg = passportSvg({ beers: 'lots', badges: {}, badgeTotal: null, states: -3 });
  assert.equal(svg.includes('NaN'), false);
  assert.equal(svg.includes('A Hopscotch drinker'), true);
});

test('the renderer is installed and makes 1200x630 PNGs', { skip: !cardsAvailable() && 'resvg not installed' }, () => {
  for (const svg of [passportSvg(PASSPORT), crawlSvg({ title: 'T', stops: [] })]) {
    const buf = png(svg);
    assert.deepEqual([...buf.subarray(0, 8)], PNG_MAGIC);
    // IHDR: width and height, big-endian, at bytes 16..23.
    assert.equal(buf.readUInt32BE(16), 1200);
    assert.equal(buf.readUInt32BE(20), 630);
  }
});

test('a share is signed with a first name, never an email', () => {
  assert.equal(shareName({ displayName: 'Erik Strong', email: 'erik@example.com' }), 'Erik');
  // Registration fills an empty display name with the email's local part.
  assert.equal(shareName({ displayName: 'jsmith', email: 'jsmith@example.com' }), 'A Hopscotch drinker');
  assert.equal(shareName({ displayName: 'JSmith', email: 'jsmith@example.com' }), 'A Hopscotch drinker');
  assert.equal(shareName({ displayName: 'me@example.com', email: 'other@example.com' }), 'A Hopscotch drinker');
  assert.equal(shareName({ displayName: '', email: 'x@example.com' }), 'A Hopscotch drinker');
  assert.equal(shareName({ displayName: '🍺🍺' }), 'A Hopscotch drinker');
  assert.equal(shareName({ displayName: 'Zoë O’Neil' }), 'Zoë');
  assert.equal(/[<>"]/.test(shareName({ displayName: HOSTILE })), false);
});
