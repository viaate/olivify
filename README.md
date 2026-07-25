# The Via-nancial District 🗽🐀

A single-file, phone-first budgeting app for Via's two-week NYU trip to NYC
(**July 27 → August 9, 2026** · **$1,800** + **$30 dining dollars**), narrated by
Carlo "Slice" Ratigan, Chief Fiscal Rodent.

The entire app is **`index.html`** — no build, no dependencies, no server.
All CSS/JS is inline so it can be published as a private claude.ai Artifact
(which blocks all external requests) and opened straight from a phone's home
screen.

## How the budget works

- **Daily allowance with rollover (cumulative carry).** Available-today =
  `round(total × dayNumber / tripDays) − everything spent through today`.
  Underspend yesterday and today grows; overspend and it shrinks. It's a pure
  function of the expense list, so edits/backfills/date-changes recompute
  perfectly. A secondary **pace** stat shows what daily average lands the trip
  at exactly $0.
- **Three categories**, styled as subway line bullets: **E**ats (food & drinks),
  **F**un (going out), **S**tuff (shopping & misc).
- **Dining dollars** are a separate mini-balance — flagged expenses draw from
  the $30, never the $1,800, and can't overdraw it (one tap switches a blocked
  charge to the real budget).
- Day boundaries are **America/New_York** regardless of device timezone.
- All money is integer cents; the per-day allowances sum to exactly the total.

## Data & backups

State auto-saves to `localStorage` (`vianancial.v1`, versioned schema) on every
change. Storage failures degrade to in-memory mode with a warning banner. Data
written by a *newer* schema than the page renders read-only rather than risking
a wipe. Settings → Backups offers JSON export (via the Artifact downloads API,
clipboard fallback), CSV export, and validated paste-to-import (with preview
and an automatic `.bak` snapshot before replacing anything).

## Tests

A dependency-free Playwright harness (uses the globally installed `playwright`
package and the preinstalled Chromium):

```sh
NODE_PATH="$(npm root -g)" node tests/run-tests.cjs      # 15 behavioral tests
NODE_PATH="$(npm root -g)" node tests/screenshots.cjs    # renders every screen
```

The suite covers exact-cents rollover math, dining-dollar accounting,
persistence across reload, edit/delete/undo, import/export round-trips,
hostile-input rejection (including XSS-shaped notes), storage-failure and
newer-schema guards, phase transitions, and both color themes.
`tests/seed.js` re-implements the money math independently so tests never
trust the app's own logic.

## Publishing

Publish `index.html` as a claude.ai Artifact with
`capabilities: {downloads: true}`. The file intentionally has no
`<!doctype>/<html>/<head>/<body>` wrapper (the Artifact publisher adds one);
browsers hoist its leading `<title>/<meta>/<style>` correctly when opened
directly, so the same file also works from `file://` or any static server.
