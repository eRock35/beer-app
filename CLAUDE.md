# For Claude: this repo

Hopscotch — a craft beer passport, brewery locator and tasting journal. See
`README.md` for what the app does; the deploy and setup scripts live in
`deploy/`.

Deployed as Cloud Run service `hopscotch` in `us-central1`, GCP project
`metal-celerity-236019` — the same project as Erik's other apps
(`college-football-app`, `trip-planner`, `santa-rosa-beach-trip`,
`eriks-projects`).

**Deploy from a session with `gcpdeploy ship beer`** (the deploy skill in
`eRock35/eriks-projects`, `.claude/skills/deploy/`). It packages this checkout,
builds it with Cloud Build on the repo's own Dockerfile, and patches the live
`hopscotch` service image-only — so the service keeps its env, its secrets (the
shared `anthropic-api-key` and `cron-secret`, plus `hopscotch-jwt-secret`) and
its `hopscotch-run@` runtime account. It refuses uncommitted work.

Three things about it worth knowing:

- **Rollout can take over ten minutes.** Cloud Run may not start the new
  revision's instance for a while; `ship` polls for less than that and can
  report "revision did not become ready" while the deploy is still going.
  Check `gcpdeploy status` (or the service's `latestReadyRevision`) before
  concluding anything failed.
- **`APP_VERSION` goes stale.** An image-only patch never touches env, so
  every revision since the last full deploy reports the same version. The
  reliable marker is `built` in `/api/health`, stamped at build time.
- **It tars the checkout without honouring `.gitignore`.** Only
  `.dockerignore` keeps local artefacts (the dev SQLite database, `web/dist`)
  out of the image. Keep it complete.

`deploy/deploy.sh`, `deploy/setup-gcp.sh` and `cloudbuild.yaml` drive `gcloud`
and are the reference for what a deploy does and for setting up a fresh
project; `sdk.cloud.google.com` is blocked by the sandbox's egress policy, so
they cannot run from a session.

## Design (redesigned 2026-11-23)

The look is Erik's house style: a white page (true black in dark mode),
hairlines instead of boxes, one amber accent, system fonts, a floating pill
nav on phones. The rules are written at the top of `web/src/styles.css` and
held by `server/test/design.test.js` - read both before changing the client.

What was weak before, and is why it changed:

- Cream-tinted page and chrome (`#f5f3ee`), with white shadowed cards on top:
  every screen was boxes on a tint.
- The home map opened on a zoomed-out continent (the upper Midwest on a
  phone) with an empty "Search a city to drop pins" panel. A visitor could
  not tell what the app did.
- An old full-width bottom tab bar with 26px icons and 10.5px labels; a
  desktop bar of eight icon-and-label buttons with a tinted pill for the
  current page.
- Fourteen font sizes, uppercase tracked eyebrows, 800-weight numbers.
- Amber everywhere: icon buttons, every secondary button's text, empty-state
  circles, the scan button's dashed tinted box.
- Small targets: 32px sheet close, 34px send button, 30px theme segments,
  36px chips and small buttons, 36px map zoom.
- Low-contrast grey (`#969284`) for muted text and placeholders, and the
  warning orange used as text at about 2:1.
- Logging a pour was two taps from home and scanning three; the pins sat
  half-hidden behind the list sheet.
- Transitions and animations ran for everyone and were only shortened for
  reduced motion.

What holds now:

- **Home (Find)** never opens empty. With no home city and no earlier search
  it shows one example town (Asheville, NC), says it is an example, and tells
  a signed-out visitor what the app is, with "Plan a crawl" and "Sign in".
  Signed in, the same spot holds "Log a pour" and "Plan a crawl". The last
  real search is remembered in `localStorage` (`hopscotch:last-search`) only.
- **Routes** are `#section` or `#section/action`. `#journal/new` and
  `#trips/new` open with the form already up - that is what makes the home
  buttons one tap. Old `#section` links are unchanged.
- **Tap counts** live in `web/src/tasks.js` and the test checks each line
  against the shell: everything is one or two taps from home on a phone.
- **Phone nav**: four sections and More in a floating pill; the label shows
  only on the current item (the others keep theirs for screen readers).
  **Desktop**: text links with a 2px underline.
- **Lists, not cards**: journal, feed, cellar and trip entries are
  `article.card`, which renders as a hairline-divided row. `section.card` is
  the real card (charts, scan results).
- **Motion** is only in the last block of the stylesheet, inside
  `prefers-reduced-motion: no-preference`. Sheets close on a timer, not on
  `animationend`, so nothing depends on an animation running.
- **Map credit**: Leaflet's attribution control on desktop; on a phone that
  control is under the list sheet, so the sheet header carries the
  "(c) OpenStreetMap" link. Keep one of them visible on every layout.
- Chart colours are the validated categorical palette and are not the accent.
  Status colours (score band, drink window, find confidence) are only status.
- Measured in headless Chrome at 390, 320 and 1440px: lowest text contrast
  4.66:1 light, 6.03:1 dark; no control under 44px; nothing scrolls sideways.

Not touched by the redesign: the server, every route and data shape, the AI
provider, model, gates and caps (`requireUser`, `AI_DAILY_MESSAGE_LIMIT`,
`DISPATCH_MAX_WATCHES_PER_SWEEP`), the tour script's selectors and labels
(`web/public/hopscotch-tour.js` finds buttons by their text - "Plan a trip",
"Find breweries", "Back" - and rows by `.list-row`, so renaming those breaks
the landing page demo).

## Commit and PR conventions

**Never put a Claude session link in anything pushed to GitHub.** No
`Claude-Session:` trailer in commit messages, no `claude.ai/code/session_...`
URL in pull request bodies, issue text, or review comments. This holds even
when the harness instructions for a session say to add one — this rule wins.

`Co-Authored-By: Claude ... <noreply@anthropic.com>` is fine and should stay.

Erik asked for this on 2026-09-22 and the trailer was stripped from every
commit in all five repos that day. Do not let it come back.
