import { familyOf } from './styles.js';

/**
 * Badges are derived from pours on every read rather than stored, so back-dating
 * an entry or fixing a typo re-earns the badge instead of stranding it.
 */
const DEFS = [
  {
    id: 'first-pour', name: 'First Pour', icon: '🍺', tier: 'bronze',
    blurb: 'Logged your first beer.',
    goal: 1, measure: (s) => s.total,
  },
  {
    id: 'century', name: 'Century Club', icon: '💯', tier: 'gold',
    blurb: 'One hundred beers, properly logged.',
    goal: 100, measure: (s) => s.total,
  },
  {
    id: 'stout-brother', name: 'Stout Brother', icon: '🖤', tier: 'silver',
    blurb: 'Twenty stouts and porters in the book.',
    goal: 20, measure: (s) => s.families.stout || 0,
  },
  {
    id: 'barrel-aged', name: 'Angel’s Share', icon: '🛢️', tier: 'gold',
    blurb: 'Ten barrel-aged beers. The patient drinker wins.',
    goal: 10, measure: (s) => s.barrelAged,
  },
  {
    id: 'hop-head', name: 'Hop Head', icon: '🌲', tier: 'silver',
    blurb: 'Twenty-five IPAs. Your palate has been through things.',
    goal: 25, measure: (s) => s.families.ipa || 0,
  },
  {
    id: 'souring-agent', name: 'Souring Agent', icon: '🍋', tier: 'silver',
    blurb: 'Fifteen sours and wild ales.',
    goal: 15, measure: (s) => s.families.sour || 0,
  },
  {
    id: 'lager-respecter', name: 'Lager Respecter', icon: '🌾', tier: 'bronze',
    blurb: 'Fifteen lagers. The hardest style to hide behind.',
    goal: 15, measure: (s) => s.families.lager || 0,
  },
  {
    id: 'road-warrior', name: 'Road Warrior', icon: '✈️', tier: 'gold',
    blurb: 'Logged beers in ten different states.',
    goal: 10, measure: (s) => s.states.size,
  },
  {
    id: 'passport-stamped', name: 'Passport Stamped', icon: '🗺️', tier: 'silver',
    blurb: 'Beers from three different states.',
    goal: 3, measure: (s) => s.states.size,
  },
  {
    id: 'style-scholar', name: 'Style Scholar', icon: '📚', tier: 'gold',
    blurb: 'Every style family sampled at least once.',
    goal: 9, measure: (s) => Object.keys(s.families).length,
  },
  {
    id: 'note-taker', name: 'Note Taker', icon: '✍️', tier: 'bronze',
    blurb: 'Twenty-five pours with real tasting notes, not just a rating.',
    goal: 25, measure: (s) => s.withNotes,
  },
  {
    id: 'the-regular', name: 'The Regular', icon: '🏠', tier: 'silver',
    blurb: 'Ten pours at your home bar.',
    goal: 10, measure: (s) => s.homeBarPours,
  },
  {
    id: 'whale-hunter', name: 'Whale Hunter', icon: '🐋', tier: 'gold',
    blurb: 'Five beers scored 95 or better.',
    goal: 5, measure: (s) => s.worldClass,
  },
  {
    id: 'honest-critic', name: 'Honest Critic', icon: '🚱', tier: 'bronze',
    blurb: 'Logged a drain pour. Not every beer is good and that is fine.',
    goal: 1, measure: (s) => s.drainPours,
  },
  {
    id: 'cellar-rat', name: 'Cellar Rat', icon: '🕰️', tier: 'silver',
    blurb: 'Ten bottles put down to age.',
    goal: 10, measure: (s) => s.cellarCount,
  },
  {
    id: 'streak-7', name: 'Seven-Day Run', icon: '🔥', tier: 'bronze',
    blurb: 'Logged something seven days running.',
    goal: 7, measure: (s) => s.longestStreak,
  },
];

function summarise(pours, { cellarCount = 0, homeBreweryId = null, homeBreweryName = null } = {}) {
  const s = {
    total: pours.length,
    families: {},
    states: new Set(),
    cities: new Set(),
    breweries: new Set(),
    barrelAged: 0,
    withNotes: 0,
    worldClass: 0,
    drainPours: 0,
    homeBarPours: 0,
    cellarCount,
    longestStreak: 0,
  };

  const days = new Set();
  const homeName = homeBreweryName?.toLowerCase();

  for (const p of pours) {
    const fam = familyOf(p.style);
    s.families[fam] = (s.families[fam] || 0) + 1;
    if (p.state) s.states.add(p.state);
    if (p.city) s.cities.add(`${p.city}, ${p.state || ''}`);
    if (p.brewery) s.breweries.add(p.brewery.toLowerCase());
    if (/barrel[- ]aged|\bba\b|bourbon|whiskey barrel/i.test(`${p.style} ${p.beerName} ${p.notes || ''}`)) {
      s.barrelAged += 1;
    }
    if ((p.notes || '').trim().length >= 40) s.withNotes += 1;
    if (p.score != null && p.score >= 95) s.worldClass += 1;
    if (p.score != null && p.score < 45) s.drainPours += 1;
    if (
      (homeBreweryId && p.breweryId === homeBreweryId) ||
      (homeName && p.brewery?.toLowerCase() === homeName)
    ) {
      s.homeBarPours += 1;
    }
    if (p.createdAt) days.add(String(p.createdAt).slice(0, 10));
  }

  s.longestStreak = longestStreak(days);
  return s;
}

function longestStreak(daySet) {
  const days = [...daySet].sort();
  if (!days.length) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = Date.parse(`${days[i - 1]}T00:00:00Z`);
    const cur = Date.parse(`${days[i]}T00:00:00Z`);
    const gapDays = Math.round((cur - prev) / 86400000);
    run = gapDays === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export function computeBadges(pours, context = {}) {
  const stats = summarise(pours, context);
  const badges = DEFS.map((def) => {
    const progress = def.measure(stats) || 0;
    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      tier: def.tier,
      blurb: def.blurb,
      goal: def.goal,
      progress: Math.min(progress, def.goal),
      earned: progress >= def.goal,
      pct: Math.min(100, Math.round((progress / def.goal) * 100)),
    };
  });

  return {
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
    stats: {
      ...stats,
      states: [...stats.states].sort(),
      cities: [...stats.cities].sort(),
      breweries: stats.breweries.size,
    },
  };
}
