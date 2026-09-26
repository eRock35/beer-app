import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { W } from '../domain/cards.js';

/**
 * SVG to PNG with resvg: a Rust renderer with prebuilt binaries and no
 * system libraries, so the same card comes out of the sandbox and Cloud Run.
 *
 * System fonts are never loaded - the container has none worth having - and
 * Inter (SIL OFL, licence beside it in server/fonts) is the only face. Loaded
 * through require() in a try so a platform without a prebuilt binary degrades
 * to "cards unavailable" (a 503) instead of refusing to boot the whole app.
 */
const require = createRequire(import.meta.url);
let Resvg = null;
try {
  ({ Resvg } = require('@resvg/resvg-js'));
} catch {
  Resvg = null;
}

const fontDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fonts');
const FONT_FILES = ['Inter-Regular.ttf', 'Inter-Bold.ttf', 'Inter-Black.ttf'].map((f) => path.join(fontDir, f));

export const cardsAvailable = () => Boolean(Resvg);

/** A PNG buffer, or null when the renderer is not installed. */
export function png(svg) {
  if (!Resvg) return null;
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Inter' },
  });
  return r.render().asPng();
}

/**
 * Rendered cards, newest kept. A share is frozen, so its picture never
 * changes - and a link pasted into a group chat is fetched by every client
 * in it, each wanting the same bytes.
 */
export function createPngCache(max = 200) {
  const m = new Map();
  return {
    get(k) {
      const v = m.get(k);
      if (v) {
        m.delete(k);
        m.set(k, v);
      }
      return v || null;
    },
    set(k, v) {
      m.set(k, v);
      if (m.size > max) m.delete(m.keys().next().value);
    },
  };
}
