/**
 * Schemas and prompts for reading a photograph of a beer.
 *
 * The hard rule running through all of this: Claude can see the beer, so it can
 * judge appearance — colour, clarity, head, lacing — and that maps directly onto
 * the Appearance axis of the score. It cannot taste the beer, so it must never
 * produce aroma, flavour, mouthfeel or overall scores from a photo. Those four
 * axes stay empty for the drinker to fill in.
 */

export const CLARITY_LEVELS = ['brilliant', 'clear', 'slight haze', 'hazy', 'opaque', 'unknown'];
export const HEAD_RETENTION = ['poor', 'fair', 'good', 'excellent', 'unknown'];
export const CONFIDENCE = ['high', 'medium', 'low', 'none'];

/** Raw JSON Schema, passed through jsonSchemaOutputFormat. */
export const SCAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['shot', 'identified', 'appearance', 'abv', 'expectations', 'flags', 'caveats'],
  properties: {
    shot: {
      type: 'string',
      enum: ['label', 'pour', 'both', 'unclear'],
      description: 'What the photo actually shows: a can or bottle label, beer in a glass, both, or too unclear to tell.',
    },
    identified: {
      type: 'object',
      additionalProperties: false,
      required: ['beerName', 'brewery', 'style', 'confidence', 'readFromLabel', 'notes'],
      properties: {
        beerName: { type: ['string', 'null'], description: 'Exactly as printed. Null if not legible.' },
        brewery: { type: ['string', 'null'] },
        style: {
          type: ['string', 'null'],
          description: 'Printed style if there is one, otherwise the closest style judged from appearance.',
        },
        confidence: { type: 'string', enum: CONFIDENCE },
        readFromLabel: {
          type: 'boolean',
          description: 'True only if these details were legibly printed on the packaging, not inferred.',
        },
        notes: { type: 'string', description: 'One short line on what made this identifiable or not.' },
      },
    },
    appearance: {
      type: 'object',
      additionalProperties: false,
      required: ['colour', 'srm', 'clarity', 'haze', 'head', 'headRetention', 'lacing', 'score', 'reasoning'],
      properties: {
        colour: { type: ['string', 'null'], description: 'Plain description, e.g. "deep mahogany with ruby edges".' },
        srm: { type: ['number', 'null'], description: 'Estimated SRM colour, 1 (palest straw) to 40+ (black).' },
        clarity: { type: 'string', enum: CLARITY_LEVELS },
        haze: {
          type: ['number', 'null'],
          description: '0 means brilliantly clear, 10 means fully opaque. Null if no beer is visible.',
        },
        head: { type: ['string', 'null'], description: 'Colour, texture and depth of the head.' },
        headRetention: { type: 'string', enum: HEAD_RETENTION },
        lacing: { type: ['string', 'null'] },
        score: {
          type: ['number', 'null'],
          description:
            'The Appearance axis, 0 to 10, judged against what this style should look like. Null unless beer in a glass is clearly visible.',
        },
        reasoning: { type: 'string', description: 'One or two sentences justifying the appearance score.' },
      },
    },
    abv: {
      type: 'object',
      additionalProperties: false,
      required: ['value', 'low', 'high', 'basis'],
      properties: {
        value: { type: ['number', 'null'], description: 'Only when printed on the label.' },
        low: { type: ['number', 'null'], description: 'Low end of a style-typical estimate when not printed.' },
        high: { type: ['number', 'null'] },
        basis: { type: 'string', enum: ['label', 'style-estimate', 'unknown'] },
      },
    },
    expectations: {
      type: 'string',
      description:
        'What this style typically tastes like, framed as expectation, never as a verdict on this specific beer. Two sentences at most.',
    },
    flags: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string' },
      description: 'Anything visibly off: flat pour, chill haze, oxidised colour, dirty glass, wrong glassware.',
    },
    caveats: { type: 'string', description: 'What the photo could not tell you. One or two sentences.' },
  },
};

export const SCAN_SYSTEM = `You judge photographs of beer for a tasting journal used by someone who knows beer well.

You can see the beer. You cannot taste it. That line decides everything you output:

- APPEARANCE is yours to score. Colour, SRM, clarity, haze, head formation and retention, lacing, glassware — you can see all of it, so score the Appearance axis 0-10 honestly, judged against what the style should look like. A hazy IPA that is opaque is correct; a Helles that is hazy is a fault. Say which you are looking at.
- AROMA, FLAVOUR, MOUTHFEEL and OVERALL are not yours. Never score them, never imply a score for them, never describe how this specific beer tastes. The "expectations" field is for what the STYLE is typically like, phrased as expectation.
- If the photo shows only a can or bottle and no poured beer, set appearance.score to null. Do not score the appearance of a can.

Reading labels: transcribe exactly what is printed. Do not autocorrect a brewery name into a more famous one that looks similar, and do not fill in an ABV you cannot actually read — that is what the style estimate is for. Set readFromLabel to false the moment you are inferring rather than reading.

Be specific and brief. A beer snob is reading this and will notice hedging.`;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Largest decoded image we will forward upstream. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Accepts `data:image/jpeg;base64,...` or bare base64 and returns what the
 * Messages API wants. Throws a plain Error with a `status` so the route can
 * rethrow it as an HttpError.
 */
export function decodeImagePayload(raw, declaredType) {
  const trimmed = String(raw || '').trim();
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/is.exec(trimmed);
  const mediaType = (match ? match[1] : declaredType || 'image/jpeg').toLowerCase();
  const data = match ? match[2] : trimmed;

  const fail = (status, message) => {
    const err = new Error(message);
    err.status = status;
    throw err;
  };

  if (!ALLOWED_IMAGE_TYPES.includes(mediaType)) {
    fail(415, `That image type (${mediaType}) is not supported. Use JPEG, PNG or WebP.`);
  }
  if (!data || !/^[A-Za-z0-9+/\r\n]+={0,2}$/.test(data)) {
    fail(400, 'That image did not decode. Try taking it again.');
  }
  // Base64 carries 3 bytes per 4 characters.
  const approxBytes = Math.floor((data.replace(/\s/g, '').length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    fail(413, 'That photo is too large. The app normally shrinks it — try again.');
  }

  return { mediaType, data: data.replace(/\s/g, ''), approxBytes };
}

/** Turns a scan result into the fields the pour form expects. */
export function scanToPourDraft(scan) {
  const tags = [];
  const a = scan.appearance || {};
  if (a.clarity && a.clarity !== 'unknown') tags.push(a.clarity);
  if (a.headRetention === 'excellent' || a.headRetention === 'good') tags.push('creamy');

  return {
    beerName: scan.identified?.beerName || '',
    brewery: scan.identified?.brewery || '',
    style: scan.identified?.style || '',
    abv: scan.abv?.value ?? null,
    appearanceScore: a.score ?? null,
    tags,
  };
}
