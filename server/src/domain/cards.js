/**
 * Share cards: the picture a pasted link unfolds into, and the image the
 * share sheet hands to Messages or Instagram. 1200x630, the size every
 * unfurler (iMessage, X, Slack, LinkedIn) crops least.
 *
 * Built as SVG here from numbers the SERVER worked out - never from an image
 * or a figure the browser sends. A share link lives on this domain, and
 * letting a request choose what it shows would make it a place to host
 * anything. lib/png.js rasterises it with Inter bundled in server/fonts.
 *
 * Same approach as the football app's cards.js, ported to ES modules and
 * given the Hopscotch palette. The fonts are Inter's Latin subset, so text
 * outside it (emoji, most symbols) would draw as a blank: `latin()` drops it
 * from anything a person typed, and every mark on a card is a drawn shape.
 *
 * Pure: strings in, a string out.
 */
export const W = 1200;
export const H = 630;

const C = {
  bg: '#141210',
  bg2: '#2D2415',
  text: '#F5F4EF',
  dim: '#B5B2A6',
  faint: '#8F8C80',
  amber: '#E8A93C',
  foam: '#FBF0DB',
  line: '#3A352B',
  green: '#2DBC88',
};

/**
 * Text for an SVG text node or attribute value: control characters dropped,
 * then every character that could open a tag or close a quote escaped.
 */
export function x(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only what the bundled font can draw: Latin, Latin-1, Latin Extended-A/B,
 * and the typographic punctuation people actually type (curly quotes, dashes,
 * the ellipsis, the middle dot). A beer called "Hazy 🍑 Boi" becomes
 * "Hazy Boi" rather than "Hazy  Boi" with a hole in it.
 */
export function latin(s) {
  return String(s ?? '')
    .replace(/[^ -~ -ɏ–—‘-‟…·]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Roughly fit `s` in `px` at `size` (Inter averages ~0.55em a character). */
export function fit(s, size, px, weight = 400) {
  const str = latin(s);
  const per = size * (weight >= 700 ? 0.6 : 0.54);
  const max = Math.max(4, Math.floor(px / per));
  return str.length <= max ? str : `${str.slice(0, max - 1).trimEnd()}…`;
}

function text(xp, y, s, { size = 32, weight = 400, fill = C.text, anchor = 'start', px = 1080, spacing = 0 } = {}) {
  return (
    `<text x="${xp}" y="${y}" font-family="Inter" font-size="${size}" font-weight="${weight}" fill="${fill}"` +
    ` text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${x(fit(s, size, px, weight))}</text>`
  );
}

/** A headline number, shrunk to fit its width rather than cut short. */
function big(xp, y, s, maxSize, px, fill = C.text) {
  const str = latin(s);
  const size = Math.min(maxSize, Math.floor(px / (Math.max(1, str.length) * 0.62)));
  return `<text x="${xp}" y="${y}" font-family="Inter" font-size="${size}" font-weight="900" fill="${fill}" letter-spacing="-3">${x(str)}</text>`;
}

/** The mark: a pint glass with a head on it, drawn, not a glyph. */
function glass(tx, ty, scale = 1) {
  return (
    `<g transform="translate(${tx} ${ty}) scale(${scale})">` +
    `<path d="M2 8 L34 8 L30 46 Q29.5 50 25.5 50 L10.5 50 Q6.5 50 6 46 Z" fill="${C.amber}"/>` +
    `<path d="M0 10 Q0 0 9 2 Q13 -3 19 1 Q26 -3 30 3 Q37 2 36 10 Z" fill="${C.foam}"/>` +
    `<rect x="11" y="18" width="3.5" height="24" rx="1.75" fill="${C.foam}" fill-opacity="0.45"/>` +
    '</g>'
  );
}

function frame(inner, { footLeft = 'Hopscotch · a craft beer passport', footRight = 'Log yours free' } = {}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    `<stop offset="0" stop-color="${C.bg2}"/><stop offset="0.6" stop-color="${C.bg}"/></linearGradient>` +
    '<radialGradient id="glow" cx="0.95" cy="0" r="0.65">' +
    `<stop offset="0" stop-color="${C.amber}" stop-opacity="0.32"/>` +
    `<stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>` +
    glass(60, 44, 0.8) +
    text(104, 80, 'Hopscotch', { size: 30, weight: 900, spacing: -0.5 }) +
    inner +
    `<line x1="60" y1="${H - 74}" x2="${W - 60}" y2="${H - 74}" stroke="${C.line}" stroke-width="2"/>` +
    text(60, H - 34, footLeft, { size: 24, fill: C.faint, px: 700 }) +
    text(W - 60, H - 34, footRight, { size: 24, fill: C.amber, weight: 700, anchor: 'end', px: 380 }) +
    '</svg>'
  );
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** A badge-count seal: a ring of amber with the count inside it. */
function seal(cx, cy, n, of) {
  const r = 58;
  const share = of ? Math.max(0, Math.min(1, n / of)) : 0;
  const len = 2 * Math.PI * r;
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.line}" stroke-width="12"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.amber}" stroke-width="12" stroke-linecap="round"` +
    ` stroke-dasharray="${(len * share).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>` +
    `<text x="${cx}" y="${cy + 16}" font-family="Inter" font-size="48" font-weight="900" fill="${C.text}" text-anchor="middle">${x(String(n))}</text>`
  );
}

/**
 * A drinker's passport, frozen at share time.
 *   { by, beers, badges, badgeTotal, states, breweries, longestStreak,
 *     currentStreak, topBeer: {beerName, brewery, score} | null, earned: [name] }
 */
export function passportSvg(d) {
  const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  const beers = n(d.beers);
  let out = text(60, 176, `${d.by || 'A Hopscotch drinker'}’s beer passport`, { size: 34, weight: 700, fill: C.dim, px: 1080 });
  out += big(56, 330, String(beers), 168, 520);
  out += text(60, 384, beers === 1 ? 'beer logged' : 'beers logged', { size: 32, weight: 700, fill: C.amber, px: 520 });

  // Right-hand column: the badge seal, then three numbers.
  out += seal(700, 262, n(d.badges), n(d.badgeTotal));
  out += text(784, 250, 'badges', { size: 30, weight: 700, px: 360 });
  out += text(784, 288, `of ${n(d.badgeTotal)}`, { size: 26, fill: C.dim, px: 360 });

  const rows = [
    [n(d.states), n(d.states) === 1 ? 'state' : 'states'],
    [n(d.breweries), n(d.breweries) === 1 ? 'brewery' : 'breweries'],
    [n(d.longestStreak), n(d.longestStreak) === 1 ? 'day, best streak' : 'days, best streak'],
  ];
  rows.forEach(([v, label], i) => {
    const y = 384 + i * 44;
    out += text(700, y, String(v), { size: 34, weight: 900, anchor: 'end', px: 160 });
    out += text(716, y, label, { size: 28, fill: C.dim, px: 420 });
  });
  if (n(d.currentStreak) >= 2) {
    out += text(716, 384 + 3 * 44, `on a ${n(d.currentStreak)}-day run now`, { size: 26, weight: 700, fill: C.green, px: 420 });
  }

  const top = d.topBeer;
  if (top && top.beerName) {
    const score = Number.isFinite(top.score) ? `Snob Score ${Math.round(top.score)}` : '';
    out += text(60, 452, 'TOP BEER', { size: 20, weight: 700, fill: C.faint, spacing: 2, px: 400 });
    out += text(60, 490, top.beerName, { size: 30, weight: 700, px: 560 });
    const sub = [top.brewery, score].map(latin).filter(Boolean).join(' · ');
    if (sub) out += text(60, 526, sub, { size: 24, weight: 700, fill: C.amber, px: 560 });
  }
  return frame(out);
}

/**
 * A shared crawl, from the frozen copy the share link reads.
 *   { title, by, city, state, stops: [{name, walkMinutes}], totalMiles, walkable }
 */
export function crawlSvg(d) {
  const stops = Array.isArray(d.stops) ? d.stops : [];
  let out = text(60, 170, `${d.by || 'Someone'} shared a crawl`, { size: 30, weight: 700, fill: C.dim, px: 1080 });
  out += text(60, 244, d.title || 'A crawl', { size: 60, weight: 900, px: 1080, spacing: -1 });
  const where = [d.city, d.state].map(latin).filter(Boolean).join(', ');
  const verdict =
    d.walkable === false ? 'a car night' : d.walkable ? 'walkable' : '';
  const miles = Number.isFinite(Number(d.totalMiles)) && d.totalMiles != null ? `${Number(d.totalMiles)} mi` : '';
  out += text(60, 296, [where, plural(stops.length, 'stop', 'stops'), miles, verdict].filter(Boolean).join(' · '), {
    size: 30, weight: 700, fill: C.amber, px: 1080,
  });

  // Four rows fit above the footer; with more than four stops the fourth row
  // says how many are left rather than crowding the rule.
  const shown = stops.slice(0, stops.length > 4 ? 3 : 4);
  shown.forEach((s, i) => {
    const y = 368 + i * 46;
    out += `<circle cx="78" cy="${y - 10}" r="17" fill="${C.amber}"/>`;
    out += `<text x="78" y="${y - 1}" font-family="Inter" font-size="22" font-weight="900" fill="${C.bg}" text-anchor="middle">${i + 1}</text>`;
    const walk = i > 0 && Number.isFinite(Number(s.walkMinutes)) && s.walkMinutes != null ? `${Number(s.walkMinutes)} min walk` : '';
    out += text(110, y, s.name, { size: 30, weight: 700, px: walk ? 820 : 1030 });
    if (walk) out += text(W - 60, y, walk, { size: 24, fill: C.dim, anchor: 'end', px: 200 });
  });
  const more = stops.length - shown.length;
  if (more > 0) out += text(110, 368 + shown.length * 46, `+${more} more`, { size: 24, fill: C.faint, px: 400 });
  return frame(out, { footRight: 'Plan your own' });
}

export const NO_NAME = 'A Hopscotch drinker';

/**
 * True when a display name is really the email address, or its local part.
 * Registration and the shared-account door used to fill an empty name with
 * the local part (until 2026-09-27), so rows from before then carry one;
 * those count as no name at all wherever a name leaves the server.
 */
export function nameIsEmail(user) {
  const raw = String(user?.displayName ?? '').trim();
  const local = String(user?.email || '').split('@')[0].toLowerCase();
  return !raw || raw.includes('@') || Boolean(local && raw.toLowerCase() === local);
}

/**
 * The name the feed, comments and anything else other people read show for
 * someone: their display name in full, or "A Hopscotch drinker" when they
 * have none that is not their address. Not trimmed to Latin: the feed is
 * HTML, not a card with a Latin-only font.
 */
export function publicName(user) {
  if (!user || nameIsEmail(user)) return NO_NAME;
  return String(user.displayName).trim().slice(0, 60);
}

/**
 * The name a share carries: the first word of the display name, or "A
 * Hopscotch drinker". Never the email: a name equal to its local part (or
 * with an @ in it) counts as no name at all - see nameIsEmail().
 */
export function shareName(user) {
  const fallback = NO_NAME;
  const raw = latin(user?.displayName);
  const local = String(user?.email || '').split('@')[0].toLowerCase();
  if (!raw || nameIsEmail(user) || (local && raw.toLowerCase() === local)) return fallback;
  const first = raw.split(' ')[0].replace(/[^\p{L}\p{N}'’.-]/gu, '').slice(0, 24);
  return first || fallback;
}
