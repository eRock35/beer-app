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
    unit: ['beer', 'beers'],
    nudge: () => 'Log your first beer for First Pour',
  },
  {
    id: 'century', name: 'Century Club', icon: '💯', tier: 'gold',
    blurb: 'One hundred beers, properly logged.',
    goal: 100, measure: (s) => s.total,
    unit: ['beer', 'beers'],
  },
  {
    id: 'stout-brother', name: 'Stout Brother', icon: '🖤', tier: 'silver',
    blurb: 'Twenty stouts and porters in the book.',
    goal: 20, measure: (s) => s.families.stout || 0,
    unit: ['stout or porter', 'stouts or porters'],
  },
  {
    id: 'barrel-aged', name: 'Angel’s Share', icon: '🛢️', tier: 'gold',
    blurb: 'Ten barrel-aged beers. The patient drinker wins.',
    goal: 10, measure: (s) => s.barrelAged,
    unit: ['barrel-aged beer', 'barrel-aged beers'],
  },
  {
    id: 'hop-head', name: 'Hop Head', icon: '🌲', tier: 'silver',
    blurb: 'Twenty-five IPAs. Your palate has been through things.',
    goal: 25, measure: (s) => s.families.ipa || 0,
    unit: ['IPA', 'IPAs'],
  },
  {
    id: 'souring-agent', name: 'Souring Agent', icon: '🍋', tier: 'silver',
    blurb: 'Fifteen sours and wild ales.',
    goal: 15, measure: (s) => s.families.sour || 0,
    unit: ['sour', 'sours'],
  },
  {
    id: 'lager-respecter', name: 'Lager Respecter', icon: '🌾', tier: 'bronze',
    blurb: 'Fifteen lagers. The hardest style to hide behind.',
    goal: 15, measure: (s) => s.families.lager || 0,
    unit: ['lager', 'lagers'],
  },
  {
    id: 'road-warrior', name: 'Road Warrior', icon: '✈️', tier: 'gold',
    blurb: 'Logged beers in ten different states.',
    goal: 10, measure: (s) => s.states.size,
    unit: ['new state', 'new states'],
  },
  {
    id: 'passport-stamped', name: 'Passport Stamped', icon: '🗺️', tier: 'silver',
    blurb: 'Beers from three different states.',
    goal: 3, measure: (s) => s.states.size,
    unit: ['new state', 'new states'],
  },
  {
    id: 'style-scholar', name: 'Style Scholar', icon: '📚', tier: 'gold',
    blurb: 'Every style family sampled at least once.',
    goal: 9, measure: (s) => Object.keys(s.families).length,
    unit: ['new style family', 'new style families'],
  },
  {
    id: 'note-taker', name: 'Note Taker', icon: '✍️', tier: 'bronze',
    blurb: 'Twenty-five pours with real tasting notes, not just a rating.',
    goal: 25, measure: (s) => s.withNotes,
    unit: ['pour with real notes', 'pours with real notes'],
  },
  {
    id: 'the-regular', name: 'The Regular', icon: '🏠', tier: 'silver',
    blurb: 'Ten pours at your home bar.',
    goal: 10, measure: (s) => s.homeBarPours,
    unit: ['pour at your home bar', 'pours at your home bar'],
    // Nothing to nudge towards until a home bar is set on the account.
    reachable: (s) => s.hasHomeBar,
  },
  {
    id: 'whale-hunter', name: 'Whale Hunter', icon: '🐋', tier: 'gold',
    blurb: 'Five beers scored 95 or better.',
    goal: 5, measure: (s) => s.worldClass,
    unit: ['beer scored 95+', 'beers scored 95+'],
  },
  {
    id: 'honest-critic', name: 'Honest Critic', icon: '🚱', tier: 'bronze',
    blurb: 'Logged a drain pour. Not every beer is good and that is fine.',
    goal: 1, measure: (s) => s.drainPours,
    unit: ['drain pour', 'drain pours'],
    nudge: () => 'Log a drain pour (under 45) for Honest Critic',
  },
  {
    id: 'cellar-rat', name: 'Cellar Rat', icon: '🕰️', tier: 'silver',
    blurb: 'Ten bottles put down to age.',
    goal: 10, measure: (s) => s.cellarCount,
    unit: ['bottle in the cellar', 'bottles in the cellar'],
  },
  {
    id: 'streak-7', name: 'Seven-Day Run', icon: '🔥', tier: 'bronze',
    blurb: 'Logged something seven days running.',
    goal: 7, measure: (s) => s.longestStreak,
    unit: ['day in a row', 'days in a row'],
    // The badge measures the longest run, but the nudge is about the run you
    // are on: a 4-day streak last spring is not 3 days from anything today.
    remaining: (s) => 7 - s.currentStreak,
  },
];

const DAY_MS = 86400000;

/**
 * The calendar day a pour belongs to, in the drinker's own time zone.
 *
 * The streak used to read `createdAt`, which is when the entry was TYPED: a
 * Friday IPA logged on Saturday morning landed on Saturday and broke the run
 * it belonged to. `drankAt` is when it was drunk. And a UTC slice of either
 * puts an 8pm Tuesday pint in Denver on Wednesday, so the day is taken in the
 * offset recorded with the pour (`drankTzOffset`, minutes east of UTC, sent
 * by the phone), else the offset the caller knows the drinker is in now, else
 * UTC - which is what every pour logged before the offset existed gets.
 */
export function drinkDay(pour, fallbackOffset = 0) {
  const t = Date.parse(pour?.drankAt || pour?.createdAt || '');
  if (!Number.isFinite(t)) return '';
  return dayKey(t, Number.isFinite(pour.drankTzOffset) ? pour.drankTzOffset : fallbackOffset);
}

/** 'YYYY-MM-DD' for an instant, seen from `offsetMinutes` east of UTC. */
export function dayKey(ms, offsetMinutes = 0) {
  const off = Number.isFinite(offsetMinutes) ? Math.max(-840, Math.min(840, offsetMinutes)) : 0;
  return new Date(ms + off * 60000).toISOString().slice(0, 10);
}

const prevDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

function summarise(pours, { cellarCount = 0, homeBreweryId = null, homeBreweryName = null, now = Date.now(), tzOffset } = {}) {
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
    currentStreak: 0,
    loggedToday: false,
    hasHomeBar: Boolean(homeBreweryId || homeBreweryName),
  };

  const days = new Set();
  const homeName = homeBreweryName?.toLowerCase();
  // Where the drinker is now: what the caller says, else where they were for
  // their most recent pour that recorded it. "Today" is theirs, not the server's.
  const latest = [...pours]
    .filter((p) => Number.isFinite(p.drankTzOffset))
    .sort((a, b) => String(b.drankAt || '').localeCompare(String(a.drankAt || '')))[0];
  const offset = Number.isFinite(tzOffset) ? tzOffset : latest ? latest.drankTzOffset : 0;

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
    const day = drinkDay(p, offset);
    if (day) days.add(day);
  }

  const today = dayKey(now, offset);
  s.longestStreak = longestStreak(days);
  s.currentStreak = currentStreak(days, today);
  s.loggedToday = days.has(today);
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
    const gapDays = Math.round((cur - prev) / DAY_MS);
    run = gapDays === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * The run you are on. It is still alive through the whole of the day after
 * the last pour - nobody has broken a streak at 9am because they have not had
 * a beer yet - and it is over once a full day passes with nothing logged.
 */
function currentStreak(daySet, today) {
  let day = daySet.has(today) ? today : prevDay(today);
  let run = 0;
  while (daySet.has(day)) {
    run += 1;
    day = prevDay(day);
  }
  return run;
}

/**
 * The unearned badge closest to done, said as the thing to do next:
 * "2 more stouts or porters for Stout Brother". Closest is by share of the
 * goal, then by fewest left, so a badge a single pour away beats one that is
 * further along a long road only when the shares tie.
 */
function nextBadge(badges, stats) {
  const candidates = badges
    .map((b) => ({ b, def: DEFS.find((d) => d.id === b.id) }))
    .filter(({ b, def }) => !b.earned && (!def.reachable || def.reachable(stats)))
    .map(({ b, def }) => {
      const remaining = Math.max(1, def.remaining ? def.remaining(stats) : b.goal - b.progress);
      return { b, def, remaining, share: (b.goal - remaining) / b.goal };
    })
    .sort((x, y) => y.share - x.share || x.remaining - y.remaining);
  if (!candidates.length) return null;
  const { b, def, remaining, share } = candidates[0];
  const [one, many] = def.unit;
  return {
    id: b.id,
    name: b.name,
    icon: b.icon,
    remaining,
    goal: b.goal,
    pct: Math.round(share * 100),
    text: def.nudge ? def.nudge() : `${remaining} more ${remaining === 1 ? one : many} for ${b.name}`,
  };
}

/**
 * `context.now` and `context.tzOffset` (minutes east of UTC) say what "today"
 * is for this drinker; both are optional and only the current streak uses them.
 */
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
    next: nextBadge(badges, stats),
    stats: {
      ...stats,
      states: [...stats.states].sort(),
      cities: [...stats.cities].sort(),
      breweries: stats.breweries.size,
    },
  };
}
