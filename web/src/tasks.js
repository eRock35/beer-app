/**
 * What a person opens Hopscotch to do, and how many taps each takes on a
 * phone starting from the home screen (Find). Nothing renders from this list:
 * it is the record of the "two taps at most" rule, and
 * server/test/design.test.js checks every line of it against the shell and
 * the home screen, so the rule cannot quietly stop being true.
 *
 *   via 'home' - a control on the home screen itself (1 tap)
 *   via 'tab'  - a button in the floating nav (1 tap)
 *   via 'more' - More, then the row (2 taps)
 *   then       - one further tap on a control inside that screen
 */
export const TASKS = [
  { task: 'Find breweries near me', via: 'home', control: 'Use my location', taps: 1 },
  { task: 'Search a city', via: 'home', control: 'Where are you?', taps: 1 },
  { task: 'Log a pour', via: 'home', route: 'journal/new', taps: 1 },
  { task: 'Scan a can or a glass', via: 'home', route: 'journal/new', then: 'Scan the can or the glass', taps: 2 },
  { task: 'Plan a crawl', via: 'home', route: 'trips/new', taps: 1 },
  { task: 'Sign in', via: 'home', route: 'journal', taps: 1 },
  { task: 'Read my journal', via: 'tab', route: 'journal', taps: 1 },
  { task: 'See my passport', via: 'tab', route: 'passport', taps: 1 },
  { task: 'See my trips', via: 'tab', route: 'trips', taps: 1 },
  { task: 'Check the cellar', via: 'more', route: 'cellar', taps: 2 },
  { task: 'Read the feed', via: 'more', route: 'feed', taps: 2 },
  { task: 'Check Dispatch', via: 'more', route: 'dispatch', taps: 2 },
  { task: 'Ask the sommelier', via: 'more', route: 'sommelier', taps: 2 },
  { task: 'Change my account or theme', via: 'more', route: 'account', taps: 2 },
];

export const MAX_TAPS = 2;
