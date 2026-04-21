# Pool Tracker — Hand-off checklist

Everything buildable locally is done. This is what you need to do in external systems to get the tracker live. Budget ~30 minutes for the full sequence.

Working directory: `/Users/niyaro/Code/pool-tracker/` (18 commits, `main` branch).

Test state: `npx vitest run` → 37 passed. `npx tsc --noEmit` → clean.

Spec: `docs/superpowers/plans/2026-04-21-pool-tracker.md`.

---

## Before you start: pick a GitHub username

Everywhere below I write `<you>`. Replace with your actual GitHub username (e.g. `kerim`). It's also the `OWNER` constant we need to set in `src/constants.ts` — step 4 below.

---

## 1. Create the GitHub repo (public)

Via `gh` if you have it:
```bash
cd /Users/niyaro/Code/pool-tracker
gh repo create pool-tracker --public \
  --description "Wanhua Sports Center pool occupancy tracker" \
  --source . --remote origin --push
```

Or manually: create `https://github.com/<you>/pool-tracker` as **public** on github.com, then:
```bash
cd /Users/niyaro/Code/pool-tracker
git remote add origin https://github.com/<you>/pool-tracker.git
git push -u origin main
```

Reason for public: free GitHub Pages requires it, and we need Pages to host the viewer. Pool occupancy is not sensitive data.

## 2. Create the `scraper-failure` label

The Worker's alerter expects this label to exist before it tries to tag a failure issue.

Via `gh`:
```bash
gh label create scraper-failure --repo <you>/pool-tracker \
  --color d73a4a --description "Pool-tracker worker failure alerts"
```

Or manually: repo → Issues → Labels → New label → name `scraper-failure`, any color.

## 3. Enable GitHub Pages

Repo Settings → Pages → Source: **Deploy from a branch**, Branch: `main`, Folder: `/ (root)`. Save.

The first Pages build kicks off automatically. It will publish `index.html` and `viewer.js` to `https://<you>.github.io/pool-tracker/`. Before the Worker runs, the viewer will fetch `./data/occupancy.csv` and get 404 — that's expected; the JS handles it and shows "No data yet."

## 4. Set OWNER in constants, commit, push

Edit `src/constants.ts`:
```ts
export const OWNER = "CHANGE_ME_BEFORE_DEPLOY";
```
Change to your username:
```ts
export const OWNER = "<you>";
```

Then:
```bash
cd /Users/niyaro/Code/pool-tracker
git add src/constants.ts
git commit -m "chore: set OWNER for deploy"
git push
```

## 5. Create a GitHub fine-grained PAT

Go to github.com → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → "Generate new token".

- **Token name**: `pool-tracker-worker`
- **Expiration**: 90 days (covers the 3-week collection with margin)
- **Resource owner**: your account
- **Repository access**: "Only select repositories" → pick **only** `pool-tracker`
- **Repository permissions**:
  - Contents: **Read and write**
  - Issues: **Read and write**
  - Metadata: Read-only (auto-added)

Generate. **Copy the token immediately** — you can't see it again. Save it somewhere temporary like a password manager.

## 6. Cloudflare account and wrangler login

If you don't have a Cloudflare account, sign up at https://dash.cloudflare.com/sign-up (free, email verification, ~5 min).

Then from the project dir:
```bash
cd /Users/niyaro/Code/pool-tracker
npx wrangler login
```
A browser window opens. Authorize. Terminal should confirm.

## 7. Set the GITHUB_TOKEN secret

```bash
npx wrangler secret put GITHUB_TOKEN
```
At the prompt, paste the PAT from step 5. You should see `Success!`.

## 8. Deploy

```bash
npx wrangler deploy
```
You should see:
- A deploy URL (you won't use it for anything since there's no HTTP handler)
- "Cron Triggers" list confirming the 3 crons are registered

## 9. Smoke test: trigger the worker manually

Cloudflare Dashboard → **Workers & Pages** → **pool-tracker** → **Triggers** tab → find a cron, click **"Run"** (exact button text may vary).

OR locally:
```bash
npx wrangler dev --test-scheduled
# in another terminal:
curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"
```

Then check the repo on github.com:
- There should be a fresh commit from the PAT owner identity
- `data/occupancy.csv` should exist with two lines: header + one data row like `2026-04-21T14:30+08:00,17`
- The `github.io` URL should render with "1 observation · …" and one dot on the chart

Sanity check: open https://whsc.com.tw/%E5%A0%B4%E9%A4%A8%E4%BB%8B%E7%B4%B9/%E6%B8%B8%E6%B3%B3%E6%B1%A0/ in a browser. The pool count shown should match the `use_qty` in the CSV (±1 within a minute — counter ticks live).

If the count is wrong or the Worker errors:
```bash
cd /Users/niyaro/Code/pool-tracker
curl -sS --max-time 15 "https://whsc.com.tw/%E5%A0%B4%E9%A4%A8%E4%BB%8B%E7%B4%B9/%E6%B8%B8%E6%B3%B3%E6%B1%A0/" > tests/fixture.html
# Update EXPECTED_QTY in tests/parser.test.ts to the new live value, then:
npx vitest run tests/parser.test.ts
```
If the test fails with a parser error, the site structure changed.

---

## 10. Failure-path verification (optional but recommended)

Prove the alerter works before you start relying on it.

Temporarily break the venue name:
```bash
# src/constants.ts:
export const VENUE_NAME = "nonexistent-venue-for-test";
```
Then:
```bash
npx wrangler deploy
# manually trigger via dashboard "Run"
```
Check the repo Issues tab: a new issue titled `[pool-tracker] scraper failure` should appear with the `scraper-failure` label and a Taiwan timestamp in the body.

Manually trigger again: the same issue should get a new comment, not a second issue.

Restore:
```bash
git checkout -- src/constants.ts
npx wrangler deploy
```
Close the test issue on GitHub. Trigger once more: a new CSV commit should land, no new failure issue.

## 11. Dedup verification (optional)

Trigger twice within the same wall-clock minute (manually). Only one row should be appended for that minute — the second trigger should see the existing row and skip.

## 12. Wait for data

Every 30 min during pool hours (06:00-22:00 Taiwan), you should see:
- A new commit from the PAT owner identity on `data/occupancy.csv`
- A new dot on the `github.io` chart within ~5 min of the commit

After 24 h:
```bash
cd /Users/niyaro/Code/pool-tracker
git pull
git log --since="24 hours ago" --oneline data/occupancy.csv | wc -l
```
Expected: ~30-33 entries. Fewer than 30 → check the Cloudflare dashboard's Worker logs for the gap.

After ~1 week the chart should show recognizable structure: higher median + wider IQR during evenings, dip around 10:00-10:30 cleaning window, visible weekday vs weekend difference.

After 3 weeks you have your data. Pull `data/occupancy.csv` and analyze.

---

## Troubleshooting

**Worker deploys but never writes to the repo.**
→ Check Cloudflare Dashboard → Workers → pool-tracker → Logs. Most likely: PAT is wrong or expired. `npx wrangler secret put GITHUB_TOKEN` and paste a fresh PAT.

**Repo shows failure issues but no CSV commits.**
→ Open the issue; it will contain the error message. If it mentions "venueInfo literal not found", the site's HTML structure has changed. Re-capture fixture and re-run parser test (see step 9).

**Viewer shows "load error: CSV fetch 404" permanently.**
→ Worker has never written. Check the dashboard logs as above.

**Viewer shows stale data.**
→ GitHub Pages caches aggressively. Fresh data appears within ~5 min of a commit. If it's been longer: hard refresh (Cmd+Shift+R); check that the latest commit actually contains the row.

**Commit count drops mid-week.**
→ CF Cron Triggers are genuinely reliable but not infallible — occasional dashboard-side outages happen. Gaps of 1-2 slots/week are acceptable. Persistent gaps (multiple consecutive) mean something is broken — check Worker logs.

**Need to change the polling cadence.**
→ Edit the cron expressions in `wrangler.toml` and `npx wrangler deploy`. Free plan supports up to 3 distinct cron expressions per Worker (we use all 3).

---

## After 3 weeks: wrap-up

1. Pull the final CSV: `git pull && cp data/occupancy.csv ~/Desktop/pool-data-final.csv`
2. Revoke the PAT on GitHub (Settings → Developer settings → PAT → Delete)
3. Delete the Cloudflare Worker (Dashboard → Workers → pool-tracker → Settings → Delete) so the cron stops firing
4. Keep or archive the repo — it still holds the data and the code
