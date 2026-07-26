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
- **Dining dollars** are a separate mini-balance of **$30 per week,
  use-it-or-lose-it** (week 1 = Jul 27–Aug 2, week 2 = Aug 3–9). Flagged
  expenses draw from the week their *date* falls in, never the $1,800, and
  can't overdraw a week (one tap switches a blocked charge to the real budget).
- Day boundaries are **America/New_York** regardless of device timezone.
- All money is integer cents; the per-day allowances sum to exactly the total.
- Trip dates and totals are **hardcoded by design** (per Via) — Settings shows
  them read-only; only quick-add buttons and backups are editable.

## The fun layer

- **Carlo reacts**: tap him for NYC wisdom (10 taps earn him a permanent crown);
  his accessories track budget health — sunglasses when flush, a sweat drop when
  wobbly, a grayed slice when today's overdrawn, a tiny violin when the trip is
  busted, a party hat on 3+ day under-budget streaks.
- **Achievements**: ten NYC badges (Dollar Slice Scholar, Bodega Baron, Museum
  Rat, Early Bird, Night Owl, The Untouchable, Streak Freak, Wall Street Energy,
  Meal Plan MVP, Sixth Borough) computed live from the expense log; unlocks
  toast + confetti + fanfare, shown on the Stats badge wall.
- **Can I afford it?** on Today: type a price, get slice-equivalents, what's
  left of today after buying, the new required pace, and a verdict.
- **Split-by-N** chips (÷2 ÷3 ÷4) under the amount field for group bills.
- **Report cards**: canvas-drawn 1080×1920 PNGs (day recap + trip report card)
  in a share overlay — long-press to save, or Download via the Artifact
  downloads API when available.
- **Sounds** (cha-ching / sad trombone / fanfare / squeak, synthesized, mutable
  in Settings), **confetti** (skipped under reduced-motion), and a once-a-day
  fake **MTA service advisory** keyed to yesterday's performance.

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
