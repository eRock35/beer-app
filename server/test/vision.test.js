import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeImagePayload,
  scanToPourDraft,
  MAX_IMAGE_BYTES,
  SCAN_SCHEMA,
} from '../src/domain/vision.js';

const b64 = (s) => Buffer.from(s).toString('base64');

test('decodes a data URL and a bare base64 string alike', () => {
  const fromDataUrl = decodeImagePayload(`data:image/png;base64,${b64('hello')}`);
  assert.equal(fromDataUrl.mediaType, 'image/png');
  assert.equal(fromDataUrl.data, b64('hello'));

  const bare = decodeImagePayload(b64('hello'), 'image/webp');
  assert.equal(bare.mediaType, 'image/webp');

  // No declared type at all falls back to JPEG, which is what a phone camera gives.
  assert.equal(decodeImagePayload(b64('hello')).mediaType, 'image/jpeg');
});

test('the data URL media type wins over a mismatched declared type', () => {
  const out = decodeImagePayload(`data:image/png;base64,${b64('x')}`, 'image/jpeg');
  assert.equal(out.mediaType, 'image/png');
});

test('rejects unsupported types, junk payloads and oversized photos', () => {
  assert.throws(() => decodeImagePayload(`data:image/tiff;base64,${b64('x')}`), { status: 415 });
  assert.throws(() => decodeImagePayload('data:image/png;base64,not valid!!'), { status: 400 });
  assert.throws(() => decodeImagePayload('', 'image/png'), { status: 400 });

  const huge = 'A'.repeat(Math.ceil(((MAX_IMAGE_BYTES + 1024) * 4) / 3));
  assert.throws(() => decodeImagePayload(huge, 'image/jpeg'), { status: 413 });
});

test('strips whitespace that line-wrapped base64 carries', () => {
  const wrapped = `${b64('hello world padding')}`.replace(/(.{4})/g, '$1\n');
  const out = decodeImagePayload(wrapped, 'image/jpeg');
  assert.ok(!/\s/.test(out.data));
  assert.equal(Buffer.from(out.data, 'base64').toString(), 'hello world padding');
});

test('the scan schema never asks the model for a taste score', () => {
  // The whole design rests on this: appearance is visible, the other four axes
  // are not. If a future edit adds one of them here, that guarantee is gone.
  const json = JSON.stringify(SCAN_SCHEMA).toLowerCase();
  for (const axis of ['aroma', 'flavour', 'mouthfeel']) {
    assert.ok(!json.includes(`"${axis}"`), `schema must not contain a ${axis} field`);
  }
  const appearance = SCAN_SCHEMA.properties.appearance.properties;
  assert.ok(appearance.score, 'appearance keeps its score');
  assert.ok(appearance.haze, 'haziness is reported');
  assert.ok(appearance.srm, 'colour is reported');
});

test('a scan becomes a pour draft with only the appearance axis filled', () => {
  const draft = scanToPourDraft({
    identified: { beerName: 'Beer: Barrel Aged', brewery: 'Side Project', style: 'Barrel-Aged Imperial Stout' },
    appearance: { score: 9, clarity: 'opaque', headRetention: 'excellent' },
    abv: { value: 13.4, basis: 'label' },
  });

  assert.equal(draft.beerName, 'Beer: Barrel Aged');
  assert.equal(draft.abv, 13.4);
  assert.equal(draft.appearanceScore, 9);
  assert.ok(draft.tags.includes('opaque'));
  // Nothing tasteable may leak into the draft.
  assert.equal(draft.flavour, undefined);
  assert.equal(draft.aroma, undefined);
});

test('a label-only shot yields no appearance score', () => {
  const draft = scanToPourDraft({
    identified: { beerName: 'Something', brewery: '', style: 'Pilsner' },
    appearance: { score: null, clarity: 'unknown', headRetention: 'unknown' },
    abv: { value: null, low: 4.5, high: 5.5, basis: 'style-estimate' },
  });
  assert.equal(draft.appearanceScore, null);
  assert.equal(draft.abv, null);
  assert.deepEqual(draft.tags, []);
});
