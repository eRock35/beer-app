// The 2026-11 redesign, held in place.
//
// These read the client's source rather than render it: the rules worth
// pinning are structural (how many taps a task takes, what the nav is made
// of, that motion is opt-in, that the page is white and the map credited),
// and all of them are visible in the files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');
const css = read('src/styles.css');
const app = read('src/App.jsx');
const map = read('src/views/MapView.jsx');
const { TASKS, MAX_TAPS } = await import(path.join(web, 'src', 'tasks.js'));

/** The TABS table in App.jsx, as { id, more, hidden } rows. */
function tabs() {
  const block = app.slice(app.indexOf('const TABS = ['), app.indexOf('];', app.indexOf('const TABS = [')));
  return [...block.matchAll(/\{ id: '(\w+)'[^}]*\}/g)].map((m) => ({
    id: m[1],
    more: /more: true/.test(m[0]),
    hidden: /hidden: true/.test(m[0]),
  }));
}

test('every main task is one or two taps from home', () => {
  const all = tabs();
  const primary = all.filter((t) => !t.more && !t.hidden).map((t) => t.id);
  const more = all.filter((t) => t.more).map((t) => t.id);
  assert.ok(TASKS.length >= 10);
  for (const t of TASKS) {
    assert.ok(t.taps <= MAX_TAPS, `${t.task} takes ${t.taps} taps`);
    const [section, action] = (t.route || '').split('/');
    if (t.via === 'home') {
      // The home screen has to carry the control itself.
      if (t.route) assert.ok(map.includes(`go('${t.route}')`), `home has no button for ${t.task}`);
      else assert.ok(map.includes(t.control), `home has no "${t.control}"`);
      assert.equal(t.taps, t.then ? 2 : 1);
    } else if (t.via === 'tab') {
      assert.ok(primary.includes(section), `${section} is not in the nav pill`);
      assert.equal(t.taps, 1);
    } else {
      assert.equal(t.via, 'more');
      assert.ok(more.includes(section), `${section} is not in the More sheet`);
      assert.equal(t.taps, 2);
    }
    if (section) assert.ok(all.some((x) => x.id === section), `no section ${section}`);
    if (action) {
      // A view that is deep-linked to an action has to honour it.
      const view = read(`src/views/${section[0].toUpperCase()}${section.slice(1)}View.jsx`);
      assert.match(view, /useState\(action === 'new'\)/, `${section} ignores /${action}`);
    }
    if (t.then) assert.ok(read('src/views/PourForm.jsx').includes(t.then), `no "${t.then}" control`);
  }
});

test('the shell passes the action part of the route to the view', () => {
  assert.match(app, /route\.split\('\/'\)/);
  assert.match(app, /action=\{action\}/);
});

test('phone nav is a five-item pill with labels kept for screen readers', () => {
  const primary = tabs().filter((t) => !t.more && !t.hidden);
  assert.equal(primary.length, 4, 'four sections plus More');
  assert.match(app, /<span className="tab-label">\{t\.label\}<\/span>/);
  assert.match(app, /aria-label=\{moreActive \? `More\./);
  const bar = css.slice(css.indexOf('.tabbar {'), css.indexOf('}', css.indexOf('.tabbar {')));
  assert.match(bar, /border-radius: 999px/);
  assert.match(bar, /position: fixed/);
  assert.match(css, /\.tab-item \{[^}]*min-height: 46px/);
  assert.match(css, /\.tab-item\[aria-current='page'\] \.tab-label \{ position: static/);
});

test('desktop nav is plain text with an underline, no icons', () => {
  const nav = app.slice(app.indexOf('<nav className="nav"'), app.indexOf('</nav>'));
  assert.doesNotMatch(nav, /<t\.Icon/);
  assert.match(css, /\.nav-item\[aria-current='page'\]::after \{[^}]*height: 2px/);
});

test('the page is white, true black in dark mode, and nothing is cream', () => {
  assert.match(css, /:root \{[^}]*--bg: #ffffff;/);
  assert.equal((css.match(/--bg: #000000;/g) || []).length, 2, 'dark tokens: media query and data-theme');
  for (const old of ['#f5f3ee', '#ebe8e0', '#fbf0db', '#121211']) {
    assert.ok(!css.includes(old), `old tinted colour ${old} is back`);
    assert.ok(!read('index.html').includes(old));
    assert.ok(!read('src/store.jsx').includes(old));
  }
  assert.match(read('index.html'), /prefers-color-scheme: light\)" content="#ffffff"/);
  assert.match(read('index.html'), /prefers-color-scheme: dark\)" content="#000000"/);
});

test('system fonts only, and five type sizes', () => {
  assert.doesNotMatch(css, /@font-face|@import|fonts\.googleapis/);
  assert.doesNotMatch(read('index.html'), /fonts\.googleapis|rel="preload" as="font"/);
  const sizes = new Set([...css.matchAll(/font-size: ([\d.]+(?:px|em|rem))/g)].map((m) => m[1]));
  // 11px is the label size inside the scaled SVG charts, nowhere else.
  assert.deepEqual([...sizes].sort(), ['11px', '13px', '15px', '16px', '20px', '28px']);
  for (const m of css.matchAll(/^(.*)font-size: 11px/gm)) assert.match(m[1], /\.(axis|value)-label/);
});

test('motion only where the person has not asked for less', () => {
  const start = css.indexOf('/* ---------- motion ---------- */');
  assert.ok(start > 0);
  const before = css.slice(0, start);
  assert.doesNotMatch(before, /\btransition:|\banimation(-\w+)?:|@keyframes/);
  const after = css.slice(start);
  // Every rule that moves is inside a no-preference block.
  const stripped = after.replace(/@media \(prefers-reduced-motion: no-preference\)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  assert.doesNotMatch(stripped, /\btransition:|\banimation(-\w+)?:/);
});

test('buttons are pills at 44px, 48px for the primary action; inputs are 48px', () => {
  assert.match(css, /\.btn \{[^}]*min-height: 44px;[^}]*border-radius: 999px/);
  assert.match(css, /\.btn-primary \{ min-height: 48px/);
  assert.match(css, /\.input, \.select, \.textarea \{[^}]*border-radius: 10px;[^}]*min-height: 48px/);
  assert.match(css, /\.icon-btn \{[^}]*width: 44px; height: 44px/);
});

test('the map keeps its OpenStreetMap credit on every layout', () => {
  // Desktop: Leaflet's own control. Phone: that control is under the list
  // sheet, so the sheet's header carries the link instead.
  assert.match(map, /attributionControl: true/);
  assert.match(map, /attribution: '&copy; OpenStreetMap contributors'/);
  assert.match(map, /className="map-credit"[\s\S]{0,400}https:\/\/www\.openstreetmap\.org\/copyright/);
  assert.match(css, /\.map-sheet, ?[^{]*\{ display: none; \}|\.map-float, \.map-sheet \{ display: none; \}/);
});

test('a first visit shows an example, labelled as one, and never an empty map', () => {
  assert.match(map, /search\(\{ near: EXAMPLE\.place, example: true \}\)/);
  assert.match(map, /An example to look around/);
  assert.match(map, /Find good beer wherever you land\./);
  assert.doesNotMatch(map, /setView\(\s*\[39\.5, -96\]/);
});
