# Athletic Load Tracker

A local-first web app for logging daily training and recovery metrics and turning
them into the load-management numbers used in elite GAA and AFL setups —
**sRPE load, ACWR, training monotony & strain** — plus an **overtraining flag
engine** built from the published literature.

It mirrors the structure of the load-management spreadsheet it was built from:
log multiple sessions per day, capture the same GPS / HR / Whoop / wellness
fields, and get an automatic weekly summary with a risk band per week.

## Features

- **Log sessions** — every field from your sheet (RPE, duration, GPS distance/HSR/sprint,
  max speed, accelerations, avg/max HR, Whoop strain, HRV, resting HR, sleep,
  restorative sleep, recovery %, energy, soreness, notes). Load = RPE × duration
  is calculated for you. **Multiple sessions per day** are supported — each save
  is one session row, and they are summed per day.
- **Dashboard** — current ACWR, acute & chronic load, week-on-week change, HRV,
  resting HR, recovery, monotony, plus active flags and trend charts.
- **Weekly summary** — Sunday-start weeks with totals, monotony, strain, wellness
  averages, ACWR and a GREEN / CAUTION / HIGH risk band.
- **Overtraining flags** — literature-based (see below), each shown with its reason
  and source.
- **Import** — paste rows straight from your spreadsheet (tab-separated); columns
  are matched by name. **Export** to CSV and JSON backup; restore from JSON.
- **Cross-device sync** — optional, via a private GitHub Gist (no backend). Your
  data follows you across phone/laptop with a smart id-based merge.
- **No dependencies, no server, no tracking.** Pure HTML/CSS/JS. Data lives in
  your browser's `localStorage` (and your private gist if sync is on).

## Run it

Just open `index.html` in any modern browser — desktop or phone. Nothing to install.

To use it from your phone like an app, host the folder (e.g. **GitHub Pages**:
repo *Settings → Pages → deploy from branch*, root folder) and "Add to Home
Screen". Because storage is per-browser, **export a JSON backup regularly** and
re-import when switching device.

## Getting your existing data in

1. Open the **Import / Export** tab.
2. In your spreadsheet, copy the header row + the daily-log rows.
3. Paste into the box and click **Import pasted rows** (tick *Replace all* for a
   clean load). Dates in `dd/mm/yyyy` or `yyyy-mm-dd` are both understood.

## Cross-device sync

The app stays serverless — sync uses a **private GitHub Gist** as the store, so
your data follows you without anything to host or maintain.

**One-time setup**

1. GitHub → *Settings → Developer settings → Personal access tokens*. Create a
   **fine-grained token** with **Gists: Read and write**, or a **classic** token
   with the `gist` scope.
2. Open **Import / Export & Sync**, paste the token, leave *Gist ID* blank, and
   click **Create & push** — this makes a new private gist and fills in the ID.
3. On your other devices, paste the **same token and Gist ID**, then **Pull &
   merge**. Tick **Auto-sync on save** to sync automatically (it also pulls on
   startup).

**How merging works** — each session has an `id` and an `updatedAt` stamp. On
sync the app pulls the gist, merges by id (newest edit wins), propagates deletes
via tombstones, then pushes the result. Editing on two devices is safe; only an
edit to the *same* session on both before syncing resolves to the most recent.

> Sync calls the GitHub API, which requires the app be served over **http(s)**
> (GitHub Pages or `localhost`) — not a `file://` page. The token is stored only
> in that browser's `localStorage`; use **Forget token** to remove it.

## The metrics

| Metric | Definition |
|---|---|
| Session load (sRPE) | RPE × duration (min) |
| Daily load | Σ session loads that day |
| Acute load | rolling 7-day sum of daily load |
| Chronic load | 28-day average daily load × 7 |
| **ACWR** | acute ÷ chronic (coupled). Needs ~4 weeks of data |
| Monotony (Foster) | mean daily load ÷ SD of daily load over the week |
| Strain (Foster) | weekly load × monotony |

## The overtraining flags & their evidence

| Flag | Trigger | Basis |
|---|---|---|
| ACWR danger | ≥ 2.0 | Highest injury odds in elite Gaelic football (Malone et al., 2017) |
| ACWR spike | > 1.5 | Spikes > 1.5 raised injury risk in GAA, esp. less-experienced players |
| ACWR elevated | 1.3–1.5 | 1.35–1.50 band linked to late-season injury risk (GAA) |
| Under-loaded | < 0.8 | U-shaped risk — low chronic load is itself a risk factor (AFL) |
| Weekly spike | > +15% / +50% week-on-week | Week-to-week load increments predict injury in AFL (Rogalski et al., 2013) |
| Monotony | > 2.0 | Monotonous high-load training → illness/overtraining (Foster, 1998) |
| Strain | top 15% of your history | Strain spikes coincide with illness (Foster) |
| HRV suppressed | > 7% below 28-day baseline, esp. 3+ days | Sustained HRV decline tracks accumulated fatigue |
| Resting HR up | ≥ baseline + 5 bpm | Classic non-functional-overreaching marker |
| Recovery low | < 34% red / 34–66% amber | Whoop readiness bands |
| Sleep | < 7 h, or 7-day avg < 7 h | Acute & chronic sleep loss impair recovery |
| Soreness / energy | ≥ 7 / ≤ 3 (of 10) | Subjective wellness flags fatigue early (Saw et al., 2016) |
| Overtraining pattern | recovery red + load red/amber | Convergent markers (Meeusen et al. consensus) |

Thresholds are centralised in `flags.js` (`LM.CFG`) so you can tune them to your
own baselines.

### How to read it

No single flag means "stop". The signal is in **convergence**: a green ACWR with
good HRV, recovery and sleep is a green light to push; a workload spike landing on
top of suppressed HRV, poor recovery and high soreness is the pattern that
precedes breakdown — that is when the dashboard turns red.

## References

- **Malone et al. (2017)** — Acute:chronic workload ratio & injury in elite Gaelic football. *J Sci Med Sport.*
- **Rogalski, Dawson, Heasman, Gabbett (2013)** — Training & game loads and injury risk in elite Australian footballers. *J Sci Med Sport.*
- **Colby et al. (2014) / Carey et al. (2018)** — High-risk loading conditions & ACWR in elite AFL.
- **Foster (1998)** — Monitoring training with reference to the overtraining syndrome. *Med Sci Sports Exerc.*
- **Gabbett (2016)** — The training–injury prevention paradox. *Br J Sports Med.*
- **Saw, Main, Gastin (2016)** — Monitoring athletes through self-report. *Br J Sports Med.*
- **Meeusen et al. (2013)** — Prevention, diagnosis & treatment of the overtraining syndrome (ECSS/ACSM consensus).
- Drew & Finch (2016); Hulin et al. (2016) — workload & injury reviews.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell & views |
| `styles.css` | Styling |
| `flags.js` | Pure metric & flag engine (`window.LM`) — no DOM, unit-testable |
| `sync.js` | GitHub Gist sync + pure `mergeEnvelopes()` (`window.Sync`) |
| `app.js` | UI, persistence, charts, import/export, sync wiring |

## Disclaimer

Educational decision-support, **not medical advice**. Individualise thresholds
with your S&C coach / physio.
