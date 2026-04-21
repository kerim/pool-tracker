# Pool Occupancy Tracker

Polls the Wanhua Sports Center pool headcount every 30 min during pool hours and records the count.

- **Live viewer:** https://kerim.github.io/pool-tracker/
- **Raw data:** [`data/occupancy.csv`](data/occupancy.csv)
- **Implementation plan:** [`docs/superpowers/plans/2026-04-21-pool-tracker.md`](docs/superpowers/plans/2026-04-21-pool-tracker.md)
- **Non-obvious findings:** [`docs/findings.md`](docs/findings.md)
- **Operator setup (one-time):** [`HANDOFF.md`](HANDOFF.md)

## How it works

A Cloudflare Worker runs on Cron Triggers (33 times per day, 06:00–22:00 Taiwan, UTC+8). Each run fetches the public pool page, extracts the current headcount from an inline Vue.js JSON blob via regex + double `JSON.parse`, and appends a row to `data/occupancy.csv` in this repo via the GitHub Contents API. On any failure, the Worker opens or comments on a GitHub issue labeled `scraper-failure`.

A GitHub Pages static site in the repo root reads the CSV client-side and renders an hour-of-day distribution (box plot per hour + individual observation dots with vertical-offset spreading for overlapping values) using Observable Plot. The page auto-refreshes every 5 minutes. Typography: Fraunces display serif + IBM Plex Sans/Mono body. Palette: ink on warm paper, pool-blue weekday dots, terracotta weekend dots, dashed capacity reference at y=100.

## Layout

- `src/` — Worker source (TypeScript): `constants`, `parser`, `time`, `csv`, `github`, `worker`
- `tests/` — Vitest unit tests + captured page fixture
- `wrangler.toml` — Worker config + cron triggers + observability
- `index.html`, `viewer.js` — static viewer served by GitHub Pages
- `data/occupancy.csv` — auto-created by the Worker on first run
