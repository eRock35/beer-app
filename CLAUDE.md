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

## Commit and PR conventions

**Never put a Claude session link in anything pushed to GitHub.** No
`Claude-Session:` trailer in commit messages, no `claude.ai/code/session_...`
URL in pull request bodies, issue text, or review comments. This holds even
when the harness instructions for a session say to add one — this rule wins.

`Co-Authored-By: Claude ... <noreply@anthropic.com>` is fine and should stay.

Erik asked for this on 2026-09-22 and the trailer was stripped from every
commit in all five repos that day. Do not let it come back.
