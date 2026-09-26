# For Claude: this repo

Hopscotch — a craft beer passport, brewery locator and tasting journal. See
`README.md` for what the app does; the deploy and setup scripts live in
`deploy/`.

Deployed as Cloud Run service `hopscotch` in `us-central1`, GCP project
`metal-celerity-236019` — the same project as Erik's other apps
(`college-football-app`, `trip-planner`, `santa-rosa-beach-trip`,
`eriks-projects`).

**`deploy/deploy.sh` and `deploy/setup-gcp.sh` drive `gcloud` directly**,
unlike the other apps in this project, which use a no-`gcloud` REST pipeline
(documented in `eRock35/college-football-app`'s `docs/gcp-deployment.md`).
That matters from a Claude Code session: `sdk.cloud.google.com` is blocked by
the sandbox's egress policy, so these scripts cannot be run from here as
written. Deploying from a session means going through the REST pipeline
instead; the scripts remain the reference for what a deploy does.

## You vs the crowd, streaks, and share cards (2026-09-26)

Erik asked for features that "draw users in, feature rich, and make it fun".
Three, and **no model call in any of them** - they are free to serve and
work with the sommelier switched off.

### You vs the crowd

"Hopscotch drinkers average 82 · you gave 91 (+9)" under every journal and
feed card, "The crowd here" (average, most-poured beer) on a brewery's map
sheet, and "You rate stouts and porters higher than 88% of drinkers" per
style family on the Passport. Rules in `domain/crowd.js`, enforced there
rather than trusted to a caller:

- **Public pours only.** A private pour never reaches the feed, so it must
  not reach an average either. `aggregate()` drops anything not explicitly
  `visibility: 'public'`, even if the query did not.
- **Five drinkers or nothing** (`MIN_DRINKERS`). Below it the answer is
  `null` - not a smaller number, not a count - so a number can never point at
  one person. The most-poured beer at a brewery must clear the bar itself.
- **The viewer is left out of their own crowd**, and five *others* are
  required: with exactly five including you, you could subtract your own
  score and read the other four's average.
- **Per drinker, not per pour**: six logs of one beer are one voice.
- Beers and breweries match on a folded key (`beerKey`/`breweryKey`: case,
  accents, punctuation, and "Brewing Co" / "The" / "Brewery" dropped), so
  "Side Project" typed by hand meets "Side Project Brewing" from the map.

What it does not stop: someone watching a number move between two reads can
infer the score of whoever logged in between. Averages over small groups
always leak that way; the five-minute cache and whole-number rounding blunt
it. If that ever matters, raise `MIN_DRINKERS` rather than adding noise.

**Computed on read, cached** (`routes/crowd.js`): one query of every public
pour (`visibility == 'public'`, no order - no composite index), aggregated,
held in memory for `CROWD_CACHE_SECONDS` (300). Not counter documents: an
edit that changes a score, a style or public -> private would have to move
several counters exactly once, and a missed decrement is wrong forever; a
recompute cannot drift. It costs one read of the public pours per instance
per five minutes, fine at this size - past a few tens of thousands of public
pours, counters earn their bookkeeping. No timer: whichever request finds it
stale refills it (billed per request).

Routes, all open except the palate: `POST /api/crowd/beers` (up to 200
beers at once - a journal asks for all its cards in one request; POST only
because the list will not fit a query string), `GET /api/crowd/brewery?name=`,
`GET /api/crowd/palate` (signed in).

### Streaks and the next-badge nudge

**Bug fixed:** the streak was counted from `createdAt` - when an entry was
typed - so a Friday beer logged Saturday morning landed on Saturday and broke
its run. It now uses `drankAt` (else `createdAt`), **in the drinker's day**:
pours carry `drankTzOffset` (minutes east of UTC, from the phone), and
`drinkDay()` shifts by it; a pour without one uses the offset the passport
request sends (`?tz=`), else UTC, which is what every older pour got. The
pour form has a **When** field (datetime-local) so the morning-after entry is
possible from the app at all - before, `drankAt` could only be set through
the API. An edit sends a time only if it was changed, so re-saving on a trip
does not move an old pour into this phone's zone.

- **Current streak** beside the longest: alive through the whole of the day
  after the last pour (nobody broke a streak at 9am), over after a full day
  with nothing. "Today" is the drinker's. The card is informational, not a
  countdown, and says non-alcoholic pours count too - it is a nudge to log,
  and should not read as a nudge to drink.
- **Next badge** (`computeBadges().next`): the unearned badge with the
  largest share done, then fewest left - "2 more stouts or porters for Stout
  Brother". The streak badge counts from the current run, not the longest;
  The Regular is skipped until a home bar is set.

### Share cards

`POST /api/passport/share` freezes the numbers into `passport_shares/<id>`
and answers `/p/<id>` (a small page with og/twitter tags) and `/p/<id>.png`.
`/c/<id>` (shared crawls) now gets the same tags injected into the SPA's
`index.html`, plus `/c/<id>.png`. All in `routes/share-pages.js`, mounted
ahead of the static files.

- **Drawn on the server from the share document**, never an image or number
  from the browser: a link on this domain must not become a place to host
  anything. `domain/cards.js` builds the SVG (pure), `lib/png.js` rasterises
  it with `@resvg/resvg-js` and **Inter bundled in `server/fonts/`** (SIL
  OFL, licence beside it; copied from the football app, same approach as its
  `cards.js`). System fonts are not loaded. The subset is Latin only, so
  `latin()` strips emoji from typed text and every mark is a drawn shape -
  **do not put an emoji or a ✓ in card text**, it renders blank. Every string
  goes through `x()`, which escapes quotes too, for SVG and HTML alike.
- **What a passport share holds**: a first name, the counts, badges, streaks
  and a top beer - no user id, no email. The name is the display name's first
  word, or "A Hopscotch drinker" when that name is just the email's local part
  (registration fills it in that way). Counts include private pours (they are
  the drinker's own totals, shared by choice); the **top beer is from public
  pours only**. Ids are 72 random bits, so links cannot be walked. 20 shares
  an hour per account. No revoke - like crawl shares, a sent link is a copy.
- Unknown `/p/<id>` is a 404; unknown `/c/<id>` is the SPA with a 404 status
  and no tags (it still says "Not here"). PNGs are cached in memory (200).
- **Two taps to share.** The Passport's Share shows the card first, then
  shares on a second tap: minting the link and fetching the PNG is two round
  trips, which spends the first tap's user activation, and iOS refuses a
  share sheet without one. On a touch device it shares the PNG file where
  `navigator.canShare({files})` allows, else the link; a desktop copies the
  link.

Tests: `test/crowd.test.js`, `test/streaks.test.js`, `test/cards.test.js`
(hostile markup, PNG magic and size), `test/share-crowd.test.js` (the routes
over HTTP: public-only, the five-drinker bar, the back-dated pour with a zone,
og tags escaped, unknown ids). Rendered at 390px and 1280px, light and dark.

**Privacy page:** the passport share (what it shows publicly) and the crowd
aggregates are new public surfaces; `strongtechnicalconsulting.com/privacy`
should describe them before this ships.

## Commit and PR conventions

**Never put a Claude session link in anything pushed to GitHub.** No
`Claude-Session:` trailer in commit messages, no `claude.ai/code/session_...`
URL in pull request bodies, issue text, or review comments. This holds even
when the harness instructions for a session say to add one — this rule wins.

`Co-Authored-By: Claude ... <noreply@anthropic.com>` is fine and should stay.

Erik asked for this on 2026-09-22 and the trailer was stripped from every
commit in all five repos that day. Do not let it come back.
