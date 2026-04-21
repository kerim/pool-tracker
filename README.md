# Pool Occupancy Tracker

Polls the Wanhua Sports Center pool and gym headcounts every 30 min during opening hours and records the counts.

- **Live viewer:** https://kerim.github.io/pool-tracker/
- **Raw data:** [`data/occupancy.csv`](data/occupancy.csv)
- **Implementation plan:** [`docs/superpowers/plans/2026-04-21-pool-tracker.md`](docs/superpowers/plans/2026-04-21-pool-tracker.md)
- **Non-obvious findings:** [`docs/findings.md`](docs/findings.md)
- **Operator setup (one-time):** [`HANDOFF.md`](HANDOFF.md)

## How it works

A Cloudflare Worker runs on Cron Triggers (33 times per day, 06:00–22:00 Taiwan, UTC+8). Each run fetches the public venue page, extracts both the pool (`游泳池`) and gym (`健身房`) headcounts from an inline Vue.js JSON blob via regex + double `JSON.parse`, and appends a row to `data/occupancy.csv` in this repo via the GitHub Contents API. On any failure (pool entry missing or malformed), the Worker opens or comments on a GitHub issue labeled `scraper-failure`. Gym absence is tolerated (empty `gym_qty` field) so a transient gym outage on the source page doesn't kill pool collection.

A GitHub Pages static site in the repo root reads the CSV client-side and renders two stacked hour-of-day distributions (pool on top, gym below) using Observable Plot: box plot per hour + individual observation dots with vertical-offset spreading for overlapping values. Capacity reference lines sit at y=100 for pool and y=150 for gym. The page auto-refreshes every 5 minutes. Typography: Fraunces display serif + IBM Plex Sans/Mono body. Palette: ink on warm paper, blue weekday dots, terracotta weekend dots.

## CSV schema

```
timestamp_tw,pool_qty,gym_qty
2026-04-21T12:18+08:00,22,
2026-04-22T08:00+08:00,24,17
```

Empty `gym_qty` means "no observation" (historical pre-expansion rows, or transient gym outage). A legitimate count of zero is written as `,0`. The first-comma dedup guard in `appendRow` is schema-agnostic.

## Layout

- `src/` — Worker source (TypeScript): `constants`, `parser`, `time`, `csv`, `github`, `worker`
- `tests/` — Vitest unit tests + captured page fixture
- `wrangler.toml` — Worker config + cron triggers + observability
- `index.html`, `viewer.js` — static viewer served by GitHub Pages
- `data/occupancy.csv` — 3-column CSV (`timestamp_tw,pool_qty,gym_qty`), auto-created by the Worker on first run
