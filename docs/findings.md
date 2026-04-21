# Findings — non-obvious things discovered building this

Stuff that would have saved iteration time if known upfront. Kept terse on purpose.

## Scraping

- The target page renders via Vue.js. The raw HTML has exactly ONE `.venue_machine` element — a `v-for` *template*, not rendered output. Its `v-text` spans are empty; a BeautifulSoup/CSS-selector approach silently returns nothing. Extract from the inline `this.venueInfo = JSON.parse("…")` literal instead.
- The page embeds a second `JSON.parse(…)` call elsewhere (WordPress emoji support probe) that reads from `sessionStorage`, not a string literal. Anchor the regex on `this.venueInfo` to avoid cross-match.
- The captured JSON is double-escaped: the outer `JSON.parse` unescapes the JS string literal, the inner one parses the array.
- `UseQty` can be negative in the raw payload (the site's own Vue template clamps it with `venue.UseQty<0?0:venue.UseQty`). Mirror the clamp in our parser.

## Cloudflare Worker

- **GitHub Actions cron is documented-unreliable** — runs can be delayed under high load and dropped entirely when load is high enough; top-of-hour is the worst time. For any job that needs to actually fire on schedule, use CF Cron Triggers (which fire within seconds of schedule).
- CF Workers free plan supports up to 3 distinct cron expressions per Worker. We use all 3.
- `wrangler.toml` is authoritative on deploy — any dashboard-side setting that isn't also in the file gets reset on the next `wrangler deploy`.
- Enabling Observability requires `[observability] enabled = true` in `wrangler.toml` AND a deploy; logs before that deploy aren't retroactive.
- For diagnosing a silently-failing scheduled Worker, the fastest path is `npx wrangler dev --remote --test-scheduled` + `curl http://localhost:8787/__scheduled?cron=…`. It runs the Worker on CF's edge with production bindings + secrets, prints logs live.

## GitHub Contents API

- `GET /repos/{owner}/{repo}/contents/{path}` returns base64 content with embedded newlines every ~60 chars — strip whitespace before `atob`.
- On sha mismatch during PUT, the API returns **either** `409` **or** `422` (varies). Retry both.
- PUT 422 error bodies can echo back the request payload (including our base64 CSV content). When relaying errors into a PUBLIC GitHub issue via the failure alerter, truncate response snippets to ≤200 chars.
- **Never use the Search API (`/search/issues`) for "does an issue exist right now?"** — it has 1-10 min indexing lag. Use the REST `/issues?state=open&labels=…` endpoint instead.
- Fine-grained PATs need `Contents: RW` + `Issues: RW` on the target repo. Extra whitespace when pasting the PAT into `wrangler secret put` silently breaks auth later (401 Bad credentials).

## Observable Plot (via UMD bundle)

- The UMD bundle requires **d3 loaded as a separate global before Plot**. Without it, internal Plot initialization throws mid-module and `Plot.boxY` (and siblings) end up undefined → "is not a function". Load order:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <script src="https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/dist/plot.umd.min.js"></script>
  ```
- Plot 0.6.x's `dx` (and `dy`) option is **constant-only**, not a per-row channel. You cannot do `dx: "fieldName"` or `dx: d => d.something`. If you need per-row horizontal offset within a band, either:
  - Accept the stack (dots at band center, rely on opacity for density), or
  - Pre-compute a custom x value (e.g., `x: d => d.hour + d.jitter`) and use a linear x scale with explicit integer ticks.
- Plot 0.6.x `title` channel does NOT reliably render as a native browser tooltip. Use `tip: true` (or `Plot.tip(…)` as a separate mark) for reliable hover tooltips. `channels: { When: "timestamp", … }` adds extra fields to the tip overlay.
- Band scales automatically render one tick per domain entry — no explicit `ticks` array needed. Mixing explicit `ticks` with a non-integer linear domain (e.g. `[5.5, 22.5]`) appears to break the axis renderer entirely (no labels, warning triangle).
- `r: 0` on `Plot.boxY` suppresses its default outlier dots so a dedicated `Plot.dot` layer can own the point rendering.

## Viewer accessibility

- To make radios visually-hidden but still focusable and announced by screen readers, use the 1px clip-rect sr-only pattern — **not** `width: 0; height: 0; pointer-events: none` (which collapses focus).
- With hidden radios, use `:has(input:focus-visible)` on the parent `label` to proxy focus styling onto the visible pill.
- Touch targets below 24px fail WCAG 2.5.8. `min-height: 32px` on pill labels is a safe floor regardless of font size.

## Dot stacking

- When two observations share identical `(hour, use_qty)`, dots render at the same pixel and read as one. With data that lands on round integers and a schedule that visits the same hours repeatedly, this happens a lot.
- Fix: pre-compute per-row `yOffset` in `loadData` by grouping by `(hour, use_qty)` and spreading the group across ±0.4 swimmers. Dots remain visually near their true value (always within 0.4) and the tooltip shows the exact integer.
- When rendering multiple charts (pool + gym) that share the same row objects, do NOT precompute jitter once on the row — each chart needs its own `(hour, column_value)` grouping. Keep offsets in a per-chart `WeakMap` keyed by row object so charts don't clobber each other's offsets.

## Multi-venue expansion

- The source page's `this.venueInfo` array carries every venue at that URL (pool + gym in our case) in a single payload. Adding a second tracked venue needed zero changes to the fetch layer — only parser output, CSV schema, and renderer.
- CSV schema migration while a 30-min cron is live is the riskiest moment. If the old Worker runs against a migrated file (or vice versa) for even one tick, the result is mixed-schema silent corruption. Procedure: commit the migrated CSV + new Worker code in the same commit, then `wrangler deploy` within the first 25 minutes. Keep the `appendRow` dedup guard column-agnostic (first-comma split) so it survives schema transitions.
- Secondary venues should be soft-fail: if the gym entry is absent or malformed on a given fetch, write an empty CSV field rather than throwing. Throwing would kill the pool data collection that run — and alert spam for a non-primary metric is worse than missing one gym observation.
- Rollback from a schema migration must be atomic too. Reverting the Worker code without also reverting the CSV header leaves the next cron fire appending a 2-field row to a 3-column CSV. One-liner we captured: `awk -F',' 'NR==1{print "timestamp_tw,use_qty"} NR>1{print $1","$2}' data/occupancy.csv`.
- Empty-state matters per-chart, not just overall. A gym chart rendered from pre-migration rows has zero observations even though `allRows.length > 0`, so a page-level "no data" message doesn't fire. Each `renderChart` needs its own empty-state placeholder — otherwise the section renders as just a heading, which looks broken.
