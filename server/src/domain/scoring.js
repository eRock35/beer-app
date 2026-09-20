/**
 * The Snob Score.
 *
 * Five axes, scored 0–10, weighted the way a judge actually weights them:
 * flavour dominates, aroma matters more than people admit, appearance is the
 * least of it. The composite is reported on a 0–100 scale because a 4.2/5 tells
 * you nothing and an 84 tells you something.
 */
export const AXES = [
  { key: 'aroma', label: 'Aroma', weight: 0.25, hint: 'Malt, hop, yeast, barrel, funk. Nose it before you sip.' },
  { key: 'appearance', label: 'Appearance', weight: 0.1, hint: 'Clarity, colour, head retention, lacing.' },
  { key: 'flavour', label: 'Flavour', weight: 0.35, hint: 'Balance, complexity, finish, does it evolve as it warms?' },
  { key: 'mouthfeel', label: 'Mouthfeel', weight: 0.15, hint: 'Body, carbonation, warmth, astringency.' },
  { key: 'overall', label: 'Overall', weight: 0.15, hint: 'Would you order it again? Would you drive for it?' },
];

export const AXIS_KEYS = AXES.map((a) => a.key);

export function snobScore(scores = {}) {
  let total = 0;
  let weightUsed = 0;
  for (const axis of AXES) {
    const raw = Number(scores[axis.key]);
    if (!Number.isFinite(raw)) continue;
    total += Math.max(0, Math.min(10, raw)) * axis.weight;
    weightUsed += axis.weight;
  }
  if (weightUsed === 0) return null;
  return Math.round((total / weightUsed) * 10);
}

/** The words that go with a number, because "83" needs a register. */
export function verdict(score) {
  if (score == null) return { label: 'Unscored', tone: 'neutral' };
  if (score >= 95) return { label: 'World class', tone: 'legendary' };
  if (score >= 88) return { label: 'Exceptional', tone: 'great' };
  if (score >= 80) return { label: 'Very good', tone: 'good' };
  if (score >= 70) return { label: 'Solid', tone: 'fine' };
  if (score >= 60) return { label: 'Drinkable', tone: 'meh' };
  if (score >= 45) return { label: 'Flawed', tone: 'poor' };
  return { label: 'Drain pour', tone: 'bad' };
}
