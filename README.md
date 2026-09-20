# 🍺 Hopscotch

**A craft beer passport for people who travel and care what is in the glass.**

You land somewhere for work on a Tuesday. You have two free evenings, no idea
what is good locally, and a phone. Hopscotch finds the breweries, puts the good
ones in walking order, and remembers what you thought of everything you drank —
so that in a year you can answer "what was that barrel-aged thing in Memphis?"

<!-- Screenshots live under docs/; regenerate them with the browser driver in the repo history. -->

---

## What it does

**Find** — Every brewery in the [Open Brewery DB](https://www.openbrewerydb.org/)
directory on a map. Search a city, an address, or use your location. Pins are
colour-coded by whether you have been, want to go, or have never heard of it —
each with its own icon and legend label, so the colour is never doing the work
alone.

**Journal** — Score a beer the way a judge would: aroma, appearance, flavour,
mouthfeel, overall, each 0–10. Those roll into a single **Snob Score** out of
100, weighted so flavour carries 35% and appearance only 10%. Tag flavours from
a controlled vocabulary of 70 terms so your notes stay searchable. Axes you
never touch stay unscored and are left out of the total.

**Passport** — Badges earned from what is actually in your journal (Stout
Brother, Angel's Share, Road Warrior, Honest Critic — for logging a drain pour,
because not every beer is good). A radar of your palate, a breakdown of what you
really drink versus what you say you drink, and a score trend by month. Badges
are recomputed on every read, so fixing a typo or back-dating an entry re-earns
them instead of stranding them.

**Trips** — Give it a city and how many free evenings you have. It finds the
open breweries, you pick the ones worth your time, and it orders them into a
crawl using nearest-neighbour plus 2-opt, with walking distances and a verdict
on whether you need a car. With the sommelier switched on it will also tell you
what to order at each stop.

**Cellar** — What is put down, and more usefully what is about to fall out of
its drink window. Sorted so anything urgent floats to the top.

**Feed** — Pours you mark public, and cheers from everyone else.

**Sommelier** *(optional)* — Claude, with read access to your journal, cellar and
wishlist, so it can answer questions that actually depend on them. Streams its
replies. It also tidies rough tasting notes into clean ones without inventing
flavours you did not describe.

---

## Running it locally

```bash
git clone https://github.com/eRock35/beer-app.git
cd beer-app
npm install

npm run seed        # optional: a demo account with 12 pours and a cellar
npm run dev         # API on :8080, client on :5173
```

Open <http://localhost:5173>. The seed account is
`demo@hopscotch.beer` / `hopscotch-demo`.

Copy `.env.example` to `.env` to configure anything. Every value has a working
default except `JWT_SECRET`, which is required in production and auto-generated
per-process in development.

```bash
npm test            # domain tests: scoring, badges, route planning
npm run build       # production client bundle
npm start           # serve API + built client from one process on :8080
```

---

## Architecture

```
server/                Express 5, ES modules, no build step
  src/domain/          Scoring, badges, style taxonomy, route planning — pure
                       functions, fully unit-tested, no I/O
  src/store/           Document store with two drivers behind one interface
  src/routes/          HTTP surface
web/                   React 18 + Vite, Leaflet for the map
  src/components/      UI primitives and hand-rolled SVG charts
  src/views/           One file per section
```

**The storage layer has two drivers behind one interface.** Locally it is SQLite
(`better-sqlite3`), storing each document as JSON and querying through
`json_extract`, so the query surface is identical to Firestore's. In production
it is Firestore, because Cloud Run's container disk is ephemeral and SQLite
there would quietly lose every pour on redeploy. Switching is one environment
variable.

**Domain logic is pure and separate.** Scoring, badge derivation, the style
taxonomy and the crawl planner have no I/O and no framework, which is why they
can be tested directly and why the AI prompts can reuse the same route ordering
the map shows you.

**No chart library.** The four charts are inline SVG, which keeps the bundle
small and means the colours come from CSS custom properties and therefore track
the light/dark theme for free. The categorical palette is validated for
colour-blind separation; every chart is single-series, and the one place colour
does encode identity (map pins) is capped at three values and backed by icons
and labels.

---

## The sommelier, and where the key lives

The Claude integration is **entirely server-side**. The API key is read from
`ANTHROPIC_API_KEY` in the server process and never leaves it — it is not in the
bundle, not in any response, and not reachable from the browser. Every AI route
sits behind `requireUser`, so an anonymous visitor cannot spend your tokens, and
there is a per-user daily message cap (`AI_DAILY_MESSAGE_LIMIT`, default 60).

**With no key set, the app runs completely normally** and reports the sommelier
as switched off. Nothing else degrades.

Four endpoints, all authenticated:

| Endpoint | What it does |
|---|---|
| `POST /api/ai/chat` | Streaming chat (SSE) with your journal, cellar and wishlist in context |
| `POST /api/ai/polish-notes` | Edits rough tasting notes — never adds a flavour you did not describe |
| `POST /api/ai/trip-plan` | Turns a planned route into an actual evening |
| `POST /api/ai/next-pour` | Three specific recommendations based on what you have been drinking |

Model defaults to `claude-opus-5` with adaptive thinking; override with
`ANTHROPIC_MODEL`.

---

## Deploying to Google Cloud Run

One-time setup — enables the APIs, creates the Artifact Registry repo and the
Firestore database, generates a JWT secret, and grants the runtime service
account Datastore and Secret Manager access:

```bash
gcloud auth login                       # or activate-service-account with a key
PROJECT_ID=your-project ./deploy/setup-gcp.sh
```

Then, for every deploy:

```bash
PROJECT_ID=your-project ./deploy/deploy.sh
```

To switch the sommelier on:

```bash
printf '%s' "sk-ant-..." | gcloud secrets versions add hopscotch-anthropic-key --data-file=-
PROJECT_ID=your-project ./deploy/deploy.sh
```

`cloudbuild.yaml` does the same thing through Cloud Build, and
`.github/workflows/deploy.yml` runs it from GitHub on manual dispatch.

**Secrets are never baked into the image.** `JWT_SECRET` and
`ANTHROPIC_API_KEY` come from Secret Manager at deploy time. Firestore
authenticates through the Cloud Run runtime service account via Application
Default Credentials, so no key file ships anywhere.

### Locking it down to just you

```bash
ALLOW_REGISTRATION=false                        # nobody new
INVITE_EMAILS=you@example.com,friend@example.com  # or an allow-list
```

---

## Credit where it is due

Brewery data from [Open Brewery DB](https://www.openbrewerydb.org/), geocoding
from [Nominatim](https://nominatim.org/), map tiles from
[OpenStreetMap](https://www.openstreetmap.org/copyright). All three are free
community services — the server caches aggressively and sends an identifying
`User-Agent`. If you run this publicly, put a real contact URL in
`OUTBOUND_USER_AGENT` and read Nominatim's
[usage policy](https://operations.osmfoundation.org/policies/nominatim/).
