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
- **Numbers move two drinkers at a time** (the differencing rule, below).
- **The viewer is left out of their own crowd** - out of the same even
  prefix everyone sees, not out of the full list - and five *others* must
  remain.
- **Per drinker, not per pour**: six logs of one beer are one voice.
- Beers and breweries match on a folded key (`beerKey`/`breweryKey`: case,
  accents, punctuation, and "Brewing Co" / "The" / "Brewery" dropped), so
  "Side Project" typed by hand meets "Side Project Brewing" from the map.

#### The differencing rule (2026-09-27)

An average read before and after one person logs gives that person's score
away: (n+1)*after - n*before. A threshold only decides when the first number
appears, so on its own it never stopped this. Now every aggregate - a beer's
average, a brewery's, its most-poured beer, the style percentile - is taken
over the **largest even-sized prefix** of its drinkers, ordered by the
`createdAt` of each one's first public pour of it (ties by user id):
`settled()` in `domain/crowd.js`.

- `createdAt` is stamped by the server and never edited, so a newcomer always
  sorts last and a back-dated `drankAt` cannot jump the queue.
- Any single drinker arriving or leaving changes the published set by **zero
  or two** people: the 7th drinker is invisible, the 8th brings both in; one
  going private (or deleting) either shrinks the set by two or lets the next
  in line take their place. Always two unknowns in one equation.
- Deterministic: the same pours give the same prefix on every instance and
  every recompute, so two readers or two servers never see sets that differ
  by one.
- The viewer is removed from that prefix **after** it is taken. Removing them
  first would make their set and a signed-out reader's differ by the viewer
  (whose score they know) and one other person - a leak of exactly one.
- Most-poured ties go to the beer's name, never to a pour count, so one
  person logging a beer again cannot change which beer is named.
- The first number now needs six drinkers for a signed-out reader (five is
  odd, so its prefix is four); five others still for a signed-in one.

What still leaks, said plainly:

- **An edit.** A drinker in the prefix changing a score - or making one of
  several pours of the same beer private, which moves their own mean - moves
  the average with the set unchanged. A watcher learns that *someone* moved
  by n times the change, not who.
- **A long history.** Each published value is one linear equation over the
  people behind it; someone recording values for months could in principle
  solve a system of them. Whole numbers and the five-minute cache make that
  impractical, not impossible.
- **The feed.** Public pours are public: the feed and `GET /api/pours/:id`
  show each with its author and score. This rule stops the crowd numbers
  being a *second* way to learn a score (including a drinker's mean across
  repeat pours, and pours old enough to have left the feed), not the first.
  Anyone who wants a score kept off the crowd numbers should mark the pour
  private - which also keeps it off the feed.

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
  an hour per account.
- **Revocable (2026-09-27).** Passport and crawl shares carry `owner`, an
  HMAC of the user id under a key derived from `JWT_SECRET`
  (`lib/share-owner.js`) - the maker can be matched, but the document says
  nothing about who that is, and `GET /api/shared-crawl` strips the field.
  "Your shared links" on the Passport (`GET /api/shares`, one equality
  filter on `owner`, no index) lists them with Delete
  (`DELETE /api/shares/:kind/:id`). Anyone but the maker gets the 404 an
  unknown id gets. A deleted link is dead on every instance at once: the
  pages and PNGs read the share document on every request, so a card still
  in another instance's memory is never served (this instance's copy is
  dropped too). The page's `Cache-Control` is now 60 s and the PNG's 300 s
  (it was a day), so a browser or proxy cannot keep a deleted card for long.
  What cannot be recalled: a preview a chat app already fetched and stored.
  Crawl shares made before 2026-09-27 have no tag and cannot be deleted from
  the app; they keep working. **Rotating `JWT_SECRET` orphans every tag**:
  links stay live but nobody can list or delete them any more.
- Unknown `/p/<id>` is a 404; unknown `/c/<id>` is the SPA with a 404 status
  and no tags (it still says "Not here"). PNGs are cached in memory (200).
- **Two taps to share.** The Passport's Share shows the card first, then
  shares on a second tap: minting the link and fetching the PNG is two round
  trips, which spends the first tap's user activation, and iOS refuses a
  share sheet without one. On a touch device it shares the PNG file where
  `navigator.canShare({files})` allows, else the link; a desktop copies the
  link.

Tests: `test/crowd.test.js` (including one newcomer never moving a number,
two doing, the same numbers from any order, the back-dated newcomer, a
leaver, the viewer's prefix), `test/streaks.test.js`, `test/cards.test.js`
(hostile markup, PNG magic and size), `test/share-crowd.test.js` (the routes
over HTTP: public-only, the five-drinker bar, the back-dated pour with a zone,
og tags escaped, unknown ids, only the maker deletes, a deleted link and its
card are dead). Rendered at 390px and 1280px, light and dark.

**Privacy page:** the passport share (what it shows publicly), that shares
can now be deleted by their maker (and what deletion cannot recall), and the
crowd aggregates are public surfaces; `strongtechnicalconsulting.com/privacy`
should describe them.

## Audit fixes: the shared-account door, model spend, names (2026-09-27)

A read-only audit found these; `test/shared-account.test.js`,
`test/ai-quota.test.js` and `test/security.test.js` hold them.

- **The shared account links by identity uid, never by email alone.** The
  identity service does not verify that an address belongs to whoever
  registers it, so matching its session onto the local row with the same
  email let anyone register someone's address there and become them here.
  `resolveSharedSession()` in `shared-identity.js`: a row whose `identityUid`
  matches signs in; no row with that email creates one carrying the uid; a
  shared-door row from before (`fromSharedAccount`, no password) is linked on
  sight; a Hopscotch account **with its own password** is NOT signed in - the
  page asks for that password once (`POST /api/auth/link-shared`, which needs
  both the shared session and the password) and `/api/auth/me` says
  `sharedLink.required`. The reverse (a native account squatting someone's
  address) now shows its owner the link prompt rather than capturing them.
  Refusing native registration for an address the identity service already
  holds was **not** done: that service has no way to ask, by design (it never
  says whether an address has an account).
- **Model spend is bounded across everyone.** `lib/ai-quota.js`: per account
  per UTC day (`AI_DAILY_MESSAGE_LIMIT` 60; `AI_NEW_ACCOUNT_DAILY_LIMIT` 10 in
  an account's first 24 hours - there is no email verification, so age is
  the only signal) and one ceiling across all accounts
  (`AI_DAILY_GLOBAL_LIMIT` 400), which the dispatch sweep also counts
  against. Both are taken in one transaction (`store.reserve()`, both
  drivers; the rule is `store/reserve.js`) - the old read-then-write let
  parallel requests pass the cap. A cheap preflight refuses a spent day
  before an 8 MB photo is read; the binding check sits after input
  validation and before any model call. Chat `max_tokens` 64000 -> 4000.
- **No name is ever an email.** Registration and the shared door no longer
  fill an empty display name with the local part. `publicName()` (feed,
  comments) and `shareName()` (crawl and passport shares) treat a stored name
  equal to the local part as none. Old comments are re-named from the account
  on read, as are the oldest crawl shares (those still carrying `userId`);
  crawl shares from between those and today froze their name and keep it.
- Cheers and comments on a private pour 404 like reading it; brewery
  websites are http(s) or nothing (server and page); the 8 MB parser runs
  after `requireUser`; the cron secret is compared in constant time; login
  runs a bcrypt compare when there is no account; `.dockerignore` drops
  `server/data` and SQLite files; every response gets `nosniff`,
  `Referrer-Policy` and a CSP of `frame-ancestors` only (the landing page
  frames the app; no `script-src` until one is tried against the built app).
- Register still says an address is taken. Without a mail sender a
  successful registration signs you straight in, so success itself tells
  you the address was free; a vaguer refusal would hide nothing.

## iPhone app (2026-10-03)

Hopscotch ships as an iPhone app too: a Capacitor shell around the live site,
built in `eRock35/eriks-projects`'s `mobile/` (its README is the guide). This
repo's part is `/.well-known/apple-app-site-association`
(`appleAppSiteAssociation` in `server/src/index.js`, mounted right after the
security headers, ahead of the parsers, the `/api` limiter and the SPA
fallback): applinks for everything but `/api/*` (so a shared crawl or passport
link opens the app), webcredentials for the app, from `APPLE_TEAM_ID` read per
request (404 when unset; the Team ID is never written here).
`server/test/aasa.test.js` holds it. Before a public App Store listing,
Hopscotch's own accounts need an in-app delete (guideline 5.1.1).

## Commit and PR conventions

**Never put a Claude session link in anything pushed to GitHub.** No
`Claude-Session:` trailer in commit messages, no `claude.ai/code/session_...`
URL in pull request bodies, issue text, or review comments. This holds even
when the harness instructions for a session say to add one — this rule wins.

`Co-Authored-By: Claude ... <noreply@anthropic.com>` is fine and should stay.

Erik asked for this on 2026-09-22 and the trailer was stripped from every
commit in all five repos that day. Do not let it come back.
