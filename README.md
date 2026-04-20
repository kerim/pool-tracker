# Pool Occupancy Tracker

Polls the Wanhua Sports Center pool headcount every 30 min during pool hours and records the count.

- **Live viewer:** https://<github-username>.github.io/pool-tracker/ (replace `<github-username>`)
- **Raw data:** [`data/occupancy.csv`](data/occupancy.csv)
- **Implementation plan:** [`docs/superpowers/plans/2026-04-21-pool-tracker.md`](docs/superpowers/plans/2026-04-21-pool-tracker.md)

## How it works

A Cloudflare Worker runs on Cron Triggers (33 times per day, 06:00–22:00 Taiwan). Each run fetches the public pool page, extracts the current headcount from an inline Vue.js JSON blob, and appends a row to `data/occupancy.csv` via the GitHub Contents API.

A GitHub Pages static site in the repo root reads the CSV client-side and renders an hour-of-day distribution (box plot + strip overlay) using Observable Plot. The page auto-refreshes every 5 minutes.
