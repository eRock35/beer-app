export const VERDICT_TONE = {
  'World class': 'var(--series-3)',
  Exceptional: 'var(--series-3)',
  'Very good': 'var(--series-1)',
  Solid: 'var(--series-1)',
  Drinkable: 'var(--series-4)',
  Flawed: 'var(--series-2)',
  'Drain pour': 'var(--critical)',
  Unscored: 'var(--text-muted)',
};

export function verdictFor(score) {
  if (score == null) return 'Unscored';
  if (score >= 95) return 'World class';
  if (score >= 88) return 'Exceptional';
  if (score >= 80) return 'Very good';
  if (score >= 70) return 'Solid';
  if (score >= 60) return 'Drinkable';
  if (score >= 45) return 'Flawed';
  return 'Drain pour';
}

export function relativeDate(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const day = 86400000;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < day) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export const dateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export function placeLine(...parts) {
  return parts.filter(Boolean).join(', ');
}

export function distanceLabel(miles) {
  if (miles == null) return '';
  if (miles < 0.1) return 'right here';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/** Cellar drink-window state. Drives both the label and the status colour. */
export function drinkWindowState(bottle, today = new Date()) {
  const now = today.toISOString().slice(0, 10);
  const { drinkFrom, drinkBy } = bottle;
  if (drinkBy && drinkBy < now) return { key: 'past', label: 'Past its window', tone: 'var(--critical)' };
  if (drinkFrom && drinkFrom > now) return { key: 'resting', label: `Resting until ${drinkFrom}`, tone: 'var(--text-muted)' };
  if (drinkBy) {
    const daysLeft = Math.round((Date.parse(drinkBy) - today.getTime()) / 86400000);
    if (daysLeft <= 120) return { key: 'drink-now', label: `Drink within ${daysLeft} days`, tone: 'var(--warning)' };
  }
  if (drinkFrom || drinkBy) return { key: 'ready', label: 'In its window', tone: 'var(--good)' };
  return { key: 'unknown', label: 'No window set', tone: 'var(--text-muted)' };
}
