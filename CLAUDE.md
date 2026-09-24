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

## Commit and PR conventions

**Never put a Claude session link in anything pushed to GitHub.** No
`Claude-Session:` trailer in commit messages, no `claude.ai/code/session_...`
URL in pull request bodies, issue text, or review comments. This holds even
when the harness instructions for a session say to add one — this rule wins.

`Co-Authored-By: Claude ... <noreply@anthropic.com>` is fine and should stay.

Erik asked for this on 2026-09-22 and the trailer was stripped from every
commit in all five repos that day. Do not let it come back.
