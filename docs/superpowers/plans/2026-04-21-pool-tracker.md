# Pool Occupancy Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a zero-maintenance 3-week data-collection system: a Cloudflare Worker that polls Wanhua Sports Center's pool headcount every 30 min during pool hours, appends rows to a CSV in a public GitHub repo via the Contents API, and a GitHub Pages static viewer that renders an hour-of-day distribution (box plot + strip overlay) that updates live.

**Architecture:** One CF Worker on Cron Triggers, TypeScript, free plan. Scraper uses regex + double-`JSON.parse` on an inline Vue.js initializer (the CSS selectors in the original plan would have silently returned nothing). Data lives in `data/occupancy.csv` inside the same repo, written via GitHub Contents API with dedup guard and 3-attempt retry on sha conflicts. Failure alerting opens or comments on a GitHub issue labeled `scraper-failure`. Viewer is `index.html` + `viewer.js` served by GitHub Pages, reads the CSV client-side, renders with Observable Plot (`boxY` + `dot`), auto-refreshes every 5 min.

**Tech Stack:** TypeScript, Cloudflare Workers (compatibility_date `2026-04-21`), Wrangler, Vitest (pure-function unit tests only — no Worker runtime tests), GitHub REST API, Observable Plot CDN build, GitHub Pages.

**Spec:** `/Users/niyaro/.claude/plans/use-the-brainstorm-skill-polished-wreath.md` (approved 2026-04-21). Read it first — this plan is the execution breakdown of that spec, not a replacement.

---

## File structure

Target final layout under `/Users/niyaro/Code/pool-tracker/`:

```
pool-tracker/
├── src/
│   ├── constants.ts        # PAGE_URL, OWNER, REPO, CSV_PATH, CSV_HEADER, ISSUE_TITLE, FAILURE_LABEL, UA
│   ├── parser.ts           # parsePoolCount(html) → number
│   ├── time.ts             # taiwanIsoNow(d?) → string
│   ├── csv.ts              # lastRowTimestamp(csv) → string | null
│   ├── github.ts           # GhHttpError, ghHeaders, ghGetCsv, ghPutCsv, appendRow, reportFailure
│   └── worker.ts           # scheduled handler — imports and wires the above
├── tests/
│   ├── fixture.html        # live page HTML captured during Task 3
│   ├── parser.test.ts
│   ├── time.test.ts
│   ├── csv.test.ts
│   └── github.test.ts      # uses mocked global fetch
├── wrangler.toml
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── index.html              # GitHub Pages entrypoint
├── viewer.js
├── data/
│   └── occupancy.csv       # created by the Worker on first run (NOT in initial commits)
├── README.md
└── docs/
    └── superpowers/
        ├── specs/          # link to approved spec
        └── plans/
            └── 2026-04-21-pool-tracker.md   # this file
```

**Split rationale:** `src/` files are split so each one has one responsibility and a file's tests fit next to it. `worker.ts` is a thin wire-up that imports from the others. This keeps pure-function testing trivial (no Workers runtime needed) and isolates the only hard-to-test code (the scheduled handler's orchestration) to one small file.

---

## Task 1: Initialize project directory and git

**Files:**
- Create: `/Users/niyaro/Code/pool-tracker/.gitignore`
- Create: `/Users/niyaro/Code/pool-tracker/README.md`

- [ ] **Step 1: Initialize git**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git init -b main
```
Expected: `Initialized empty Git repository in /Users/niyaro/Code/pool-tracker/.git/`

- [ ] **Step 2: Write .gitignore**

Create `/Users/niyaro/Code/pool-tracker/.gitignore`:
```
node_modules/
.wrangler/
.dev.vars
.DS_Store
dist/
coverage/
*.log
```

- [ ] **Step 3: Write README.md**

Create `/Users/niyaro/Code/pool-tracker/README.md`:
```markdown
# Pool Occupancy Tracker

Polls the Wanhua Sports Center pool headcount every 30 min during pool hours and records the count.

- **Live viewer:** https://<github-username>.github.io/pool-tracker/ (replace `<github-username>`)
- **Raw data:** [`data/occupancy.csv`](data/occupancy.csv)
- **Design spec:** see brainstorm output in conversation history
- **Implementation plan:** [`docs/superpowers/plans/2026-04-21-pool-tracker.md`](docs/superpowers/plans/2026-04-21-pool-tracker.md)

## How it works

A Cloudflare Worker runs on Cron Triggers (33 times per day, 06:00–22:00 Taiwan). Each run fetches the public pool page, extracts the current headcount from an inline Vue.js JSON blob, and appends a row to `data/occupancy.csv` via the GitHub Contents API.

A GitHub Pages static site in the repo root reads the CSV client-side and renders an hour-of-day distribution (box plot + strip overlay) using Observable Plot. The page auto-refreshes every 5 minutes.
```

- [ ] **Step 4: First commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add .gitignore README.md && git commit -m "chore: initialize repo"
```
Expected: `[main (root-commit) ...] chore: initialize repo`

---

## Task 2: Install Node toolchain (package.json, tsconfig, vitest config)

**Files:**
- Create: `/Users/niyaro/Code/pool-tracker/package.json`
- Create: `/Users/niyaro/Code/pool-tracker/tsconfig.json`
- Create: `/Users/niyaro/Code/pool-tracker/vitest.config.ts`

- [ ] **Step 1: Write package.json**

Create `/Users/niyaro/Code/pool-tracker/package.json`:
```json
{
  "name": "pool-tracker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "deploy": "wrangler deploy",
    "dev": "wrangler dev --test-scheduled"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250101.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.90.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

Create `/Users/niyaro/Code/pool-tracker/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "es2022",
    "moduleResolution": "bundler",
    "lib": ["es2023"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Write vitest.config.ts**

Create `/Users/niyaro/Code/pool-tracker/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run (requires `dangerouslyDisableSandbox: true` — npm install writes outside sandbox allowlist):
```bash
cd /Users/niyaro/Code/pool-tracker && npm install
```
Expected: `node_modules/` populated, `package-lock.json` created, no errors.

- [ ] **Step 5: Verify typecheck passes on empty project**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx tsc --noEmit
```
Expected: no output (clean).

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add package.json tsconfig.json vitest.config.ts package-lock.json && git commit -m "chore: node toolchain (ts, vitest, wrangler)"
```

---

## Task 3: Capture page fixture and write constants

**Files:**
- Create: `/Users/niyaro/Code/pool-tracker/tests/fixture.html`
- Create: `/Users/niyaro/Code/pool-tracker/src/constants.ts`

- [ ] **Step 1: Capture live page HTML as a test fixture**

Run (sandbox-bypass needed — target host is not in the allowlist):
```bash
mkdir -p /Users/niyaro/Code/pool-tracker/tests && \
curl -sS -o /Users/niyaro/Code/pool-tracker/tests/fixture.html \
  --max-time 15 \
  "https://whsc.com.tw/%E5%A0%B4%E9%A4%A8%E4%BB%8B%E7%B4%B9/%E6%B8%B8%E6%B3%B3%E6%B1%A0/"
```
Expected: file exists and is roughly 50–60 KB.

- [ ] **Step 2: Sanity-check the fixture contains the target markers**

Run:
```bash
grep -c "this.venueInfo = JSON.parse" /Users/niyaro/Code/pool-tracker/tests/fixture.html && \
grep -c "游泳池" /Users/niyaro/Code/pool-tracker/tests/fixture.html
```
Expected: both counts ≥ 1 (the `this.venueInfo` line should appear exactly once; `游泳池` appears multiple times).

- [ ] **Step 3: Write src/constants.ts**

Create `/Users/niyaro/Code/pool-tracker/src/constants.ts`:
```ts
export const PAGE_URL =
  "https://whsc.com.tw/%E5%A0%B4%E9%A4%A8%E4%BB%8B%E7%B4%B9/%E6%B8%B8%E6%B3%B3%E6%B1%A0/";
export const VENUE_NAME = "游泳池";

// Filled in at deploy time. Keep as const string so TypeScript catches forgotten edits.
export const OWNER = "CHANGE_ME_BEFORE_DEPLOY";
export const REPO = "pool-tracker";

export const CSV_PATH = "data/occupancy.csv";
export const CSV_HEADER = "timestamp_tw,use_qty\n";

export const ISSUE_TITLE = "[pool-tracker] scraper failure";
export const FAILURE_LABEL = "scraper-failure";

export const UA = `pool-tracker/1.0 (+https://github.com/${OWNER}/${REPO})`;
```

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add tests/fixture.html src/constants.ts && git commit -m "feat: add page fixture and constants"
```

---

## Task 4: TDD `parsePoolCount`

**Files:**
- Create: `/Users/niyaro/Code/pool-tracker/tests/parser.test.ts`
- Create: `/Users/niyaro/Code/pool-tracker/src/parser.ts`

- [ ] **Step 1: Manually read the expected `UseQty` from the fixture**

Run:
```bash
grep -A 6 "游泳池" /Users/niyaro/Code/pool-tracker/tests/fixture.html | grep UseQty | head -1
```
Expected: a line like `    \"UseQty\": 18`. Note the integer value (call it `EXPECTED_QTY`).

- [ ] **Step 2: Write tests/parser.test.ts**

Create `/Users/niyaro/Code/pool-tracker/tests/parser.test.ts`. **Replace `EXPECTED_QTY` with the value you just read.**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parsePoolCount } from "../src/parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, "fixture.html"), "utf8");
const EXPECTED_QTY = 18; // TODO: set from Step 1 of Task 4 before running

describe("parsePoolCount", () => {
  it("extracts the pool UseQty from the live-captured page fixture", () => {
    expect(parsePoolCount(FIXTURE)).toBe(EXPECTED_QTY);
  });

  it("clamps negative UseQty to zero (mirroring the Vue template's guard)", () => {
    const html = `noise this.venueInfo = JSON.parse("[{\\"MachineName\\":\\"\u6e38\u6cf3\u6c60\\",\\"MaxQty\\":100,\\"UseQty\\":-3}]") more noise`;
    expect(parsePoolCount(html)).toBe(0);
  });

  it("throws if the venueInfo literal is missing", () => {
    expect(() => parsePoolCount("<html>no script here</html>")).toThrow(/venueInfo literal not found/);
  });

  it("throws if the target venue is missing from payload", () => {
    const html = `this.venueInfo = JSON.parse("[{\\"MachineName\\":\\"健身房\\",\\"MaxQty\\":150,\\"UseQty\\":5}]")`;
    expect(() => parsePoolCount(html)).toThrow(/not present in payload/);
  });

  it("throws if UseQty is not a finite number", () => {
    const html = `this.venueInfo = JSON.parse("[{\\"MachineName\\":\\"\u6e38\u6cf3\u6c60\\",\\"MaxQty\\":100,\\"UseQty\\":null}]")`;
    expect(() => parsePoolCount(html)).toThrow(/UseQty is not a finite number/);
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL (parser not written yet)**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/parser.test.ts
```
Expected: FAIL with `Cannot find module '../src/parser.js'` or similar.

- [ ] **Step 4: Implement src/parser.ts**

Create `/Users/niyaro/Code/pool-tracker/src/parser.ts`:
```ts
import { VENUE_NAME } from "./constants.js";

type Venue = { MachineName: string; MaxQty: number; UseQty: number };

export function parsePoolCount(html: string): number {
  // The `this.venueInfo =` prefix anchors us; the other `JSON.parse` on the
  // page is a WordPress emoji-support probe that reads from `sessionStorage`,
  // not a string literal, and cannot match this pattern. The `s` flag lets
  // `.` cross newlines (the literal spans multiple lines with `\r\n` escapes).
  // The captured group includes the outer quotes, so the first JSON.parse
  // unescapes the JS string literal to a JSON string, and the second
  // JSON.parse produces the array.
  const m = html.match(/this\.venueInfo\s*=\s*JSON\.parse\((".+?")\)/s);
  if (!m) throw new Error("venueInfo literal not found in page HTML");
  const venues: Venue[] = JSON.parse(JSON.parse(m[1]));
  const pool = venues.find((v) => v.MachineName === VENUE_NAME);
  if (!pool) throw new Error(`venue '${VENUE_NAME}' not present in payload`);
  if (typeof pool.UseQty !== "number" || !Number.isFinite(pool.UseQty)) {
    throw new Error(
      `venue '${VENUE_NAME}' UseQty is not a finite number: ${JSON.stringify(pool.UseQty)}`,
    );
  }
  return Math.max(0, pool.UseQty);
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/parser.test.ts
```
Expected: `5 passed`. If the first test fails with a value mismatch, re-read Step 1 and update `EXPECTED_QTY`.

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add src/parser.ts tests/parser.test.ts && git commit -m "feat(parser): extract pool count from inline Vue JSON blob"
```

---

## Task 5: TDD `taiwanIsoNow`

**Files:**
- Create: `/Users/niyaro/Code/pool-tracker/tests/time.test.ts`
- Create: `/Users/niyaro/Code/pool-tracker/src/time.ts`

- [ ] **Step 1: Write tests/time.test.ts**

Create `/Users/niyaro/Code/pool-tracker/tests/time.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { taiwanIsoNow } from "../src/time.js";

describe("taiwanIsoNow", () => {
  it("formats a UTC instant as Taiwan wall time with +08:00 offset", () => {
    // 2026-04-21T06:30:00Z → Taiwan 14:30
    const d = new Date("2026-04-21T06:30:00Z");
    expect(taiwanIsoNow(d)).toBe("2026-04-21T14:30+08:00");
  });

  it("handles date-boundary crossings correctly", () => {
    // 2026-04-20T22:00:00Z → Taiwan 06:00 on 2026-04-21
    const d = new Date("2026-04-20T22:00:00Z");
    expect(taiwanIsoNow(d)).toBe("2026-04-21T06:00+08:00");
  });

  it("pads single-digit month/day/hour/minute to two characters", () => {
    // 2026-01-01T00:05:00Z → Taiwan 08:05 on 2026-01-01
    const d = new Date("2026-01-01T00:05:00Z");
    expect(taiwanIsoNow(d)).toBe("2026-01-01T08:05+08:00");
  });

  it("produces the expected shape with no argument (uses current time)", () => {
    const out = taiwanIsoNow();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+08:00$/);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/time.test.ts
```
Expected: FAIL with `Cannot find module '../src/time.js'`.

- [ ] **Step 3: Implement src/time.ts**

Create `/Users/niyaro/Code/pool-tracker/src/time.ts`:
```ts
export function taiwanIsoNow(d: Date = new Date()): string {
  // Manual +8h shift then read UTC fields. Equivalent to Intl with
  // Asia/Taipei, smaller, and correct because Taiwan has observed no DST
  // since 1979.
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  const yyyy = tw.getUTCFullYear();
  const mm = String(tw.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tw.getUTCDate()).padStart(2, "0");
  const hh = String(tw.getUTCHours()).padStart(2, "0");
  const mi = String(tw.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}+08:00`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/time.test.ts
```
Expected: `4 passed`.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add src/time.ts tests/time.test.ts && git commit -m "feat(time): taiwanIsoNow formatter"
```

---

## Task 6: TDD `lastRowTimestamp`

**Files:**
- Create: `/Users/niyaro/Code/pool-tracker/tests/csv.test.ts`
- Create: `/Users/niyaro/Code/pool-tracker/src/csv.ts`

- [ ] **Step 1: Write tests/csv.test.ts**

Create `/Users/niyaro/Code/pool-tracker/tests/csv.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { lastRowTimestamp } from "../src/csv.js";

describe("lastRowTimestamp", () => {
  it("returns null for header-only CSV", () => {
    expect(lastRowTimestamp("timestamp_tw,use_qty\n")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(lastRowTimestamp("")).toBeNull();
  });

  it("returns the timestamp of the last data row", () => {
    const csv =
      "timestamp_tw,use_qty\n2026-04-21T06:00+08:00,3\n2026-04-21T06:30+08:00,5\n";
    expect(lastRowTimestamp(csv)).toBe("2026-04-21T06:30+08:00");
  });

  it("tolerates trailing blank lines", () => {
    const csv =
      "timestamp_tw,use_qty\n2026-04-21T06:00+08:00,3\n2026-04-21T06:30+08:00,5\n\n\n";
    expect(lastRowTimestamp(csv)).toBe("2026-04-21T06:30+08:00");
  });

  it("returns null for a row with no comma", () => {
    expect(lastRowTimestamp("timestamp_tw,use_qty\nbogusrow\n")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/csv.test.ts
```
Expected: FAIL with `Cannot find module '../src/csv.js'`.

- [ ] **Step 3: Implement src/csv.ts**

Create `/Users/niyaro/Code/pool-tracker/src/csv.ts`:
```ts
export function lastRowTimestamp(csv: string): string | null {
  const trimmed = csv.replace(/\n+$/, "");
  const lines = trimmed.split("\n");
  if (lines.length < 2) return null;
  const last = lines[lines.length - 1];
  const comma = last.indexOf(",");
  return comma > 0 ? last.slice(0, comma) : null;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/csv.test.ts
```
Expected: `5 passed`.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add src/csv.ts tests/csv.test.ts && git commit -m "feat(csv): lastRowTimestamp dedup helper"
```

---

## Task 7: TDD GitHub Contents API client (GhHttpError, ghGetCsv, ghPutCsv)

**Files:**
- Create: `/Users/niyaro/Code/pool-tracker/tests/github.test.ts`
- Create: `/Users/niyaro/Code/pool-tracker/src/github.ts`

These tests mock `globalThis.fetch`. No Workers runtime needed.

- [ ] **Step 1: Write tests/github.test.ts — initial assertions for ghGetCsv + ghPutCsv + GhHttpError**

Create `/Users/niyaro/Code/pool-tracker/tests/github.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GhHttpError,
  ghGetCsv,
  ghPutCsv,
} from "../src/github.js";

const TOKEN = "ghp_fake_token";

function mockFetchOnce(response: { status: number; body: unknown; headers?: Record<string, string> }) {
  const r = new Response(
    typeof response.body === "string" ? response.body : JSON.stringify(response.body),
    { status: response.status, headers: response.headers },
  );
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(r);
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GhHttpError", () => {
  it("carries status, path, and snippet", () => {
    const e = new GhHttpError(422, "PUT contents", "Validation Failed");
    expect(e.status).toBe(422);
    expect(e.path).toBe("PUT contents");
    expect(e.snippet).toBe("Validation Failed");
    expect(e.message).toContain("422");
  });
});

describe("ghGetCsv", () => {
  it("returns null on 404", async () => {
    mockFetchOnce({ status: 404, body: {} });
    const out = await ghGetCsv(TOKEN);
    expect(out).toBeNull();
  });

  it("throws GhHttpError with truncated snippet on non-ok non-404", async () => {
    mockFetchOnce({ status: 500, body: "x".repeat(500) });
    await expect(ghGetCsv(TOKEN)).rejects.toMatchObject({
      status: 500,
      snippet: expect.stringMatching(/^x{200}$/),
    });
  });

  it("decodes base64 content and returns sha", async () => {
    const contentRaw = "timestamp_tw,use_qty\n2026-04-21T06:00+08:00,3\n";
    const encoded = Buffer.from(contentRaw, "utf8").toString("base64");
    mockFetchOnce({
      status: 200,
      body: { sha: "abc123", content: encoded, encoding: "base64" },
    });
    const out = await ghGetCsv(TOKEN);
    expect(out).toEqual({ sha: "abc123", content: contentRaw });
  });

  it("throws if encoding is not base64", async () => {
    mockFetchOnce({
      status: 200,
      body: { sha: "abc123", content: "raw", encoding: "none" },
    });
    await expect(ghGetCsv(TOKEN)).rejects.toThrow(/unexpected encoding/);
  });
});

describe("ghPutCsv", () => {
  it("sends a PUT with base64 content and sha", async () => {
    mockFetchOnce({ status: 200, body: { commit: { sha: "new" } } });
    await ghPutCsv(TOKEN, "hello", "oldsha", "test");
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const init = call[1] as RequestInit;
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string);
    expect(body.sha).toBe("oldsha");
    expect(Buffer.from(body.content, "base64").toString("utf8")).toBe("hello");
    expect(body.message).toBe("test");
  });

  it("omits sha on first-run create", async () => {
    mockFetchOnce({ status: 201, body: {} });
    await ghPutCsv(TOKEN, "hello", null, "init");
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.sha).toBeUndefined();
  });

  it("throws GhHttpError with truncated snippet on non-ok", async () => {
    mockFetchOnce({ status: 422, body: "y".repeat(500) });
    await expect(ghPutCsv(TOKEN, "hello", "oldsha", "test")).rejects.toMatchObject({
      status: 422,
      snippet: expect.stringMatching(/^y{200}$/),
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/github.test.ts
```
Expected: FAIL with `Cannot find module '../src/github.js'`.

- [ ] **Step 3: Implement src/github.ts (partial — just GhHttpError, ghHeaders, ghFetch, ghGetCsv, ghPutCsv)**

Create `/Users/niyaro/Code/pool-tracker/src/github.ts`:
```ts
import {
  CSV_HEADER,
  CSV_PATH,
  FAILURE_LABEL,
  ISSUE_TITLE,
  OWNER,
  REPO,
} from "./constants.js";
import { lastRowTimestamp } from "./csv.js";
import { taiwanIsoNow } from "./time.js";

export const GH_CONTENTS = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CSV_PATH}`;

export const ghHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "pool-tracker-worker",
  "X-GitHub-Api-Version": "2022-11-28",
});

export class GhHttpError extends Error {
  constructor(
    public status: number,
    public path: string,
    public snippet: string,
  ) {
    super(`GH ${path} ${status}: ${snippet}`);
    this.name = "GhHttpError";
  }
}

async function ghFetch(
  url: string,
  init: RequestInit,
  path: string,
): Promise<Response> {
  const r = await fetch(url, init);
  if (!r.ok) {
    // Truncate to 200 chars: PUT 422 error bodies can echo the request
    // payload (including our base64 CSV content), which would leak into a
    // PUBLIC GitHub issue via reportFailure.
    const snippet = (await r.text()).slice(0, 200);
    throw new GhHttpError(r.status, path, snippet);
  }
  return r;
}

export async function ghGetCsv(
  token: string,
): Promise<{ sha: string; content: string } | null> {
  const r = await fetch(GH_CONTENTS, { headers: ghHeaders(token) });
  if (r.status === 404) return null;
  if (!r.ok) {
    const snippet = (await r.text()).slice(0, 200);
    throw new GhHttpError(r.status, "GET contents", snippet);
  }
  const j = (await r.json()) as {
    sha: string;
    content: string;
    encoding: string;
  };
  if (j.encoding !== "base64") {
    throw new Error(`unexpected encoding: ${j.encoding}`);
  }
  // CSV is ASCII-only by construction (ISO timestamp + integer). If that
  // ever changes, swap atob for a TextDecoder-based helper.
  return { sha: j.sha, content: atob(j.content.replace(/\s/g, "")) };
}

export async function ghPutCsv(
  token: string,
  newContent: string,
  sha: string | null,
  message: string,
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    content: btoa(newContent),
  };
  if (sha) body.sha = sha;
  await ghFetch(
    GH_CONTENTS,
    {
      method: "PUT",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "PUT contents",
  );
}

// appendRow and reportFailure added in subsequent tasks.

// Re-export so the next tasks don't break imports:
export { CSV_HEADER, CSV_PATH, FAILURE_LABEL, ISSUE_TITLE, OWNER, REPO };
export { lastRowTimestamp };
export { taiwanIsoNow };
```

- [ ] **Step 4: Run tests — expect PASS**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/github.test.ts
```
Expected: `8 passed` (1 GhHttpError + 4 ghGetCsv + 3 ghPutCsv).

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add src/github.ts tests/github.test.ts && git commit -m "feat(github): contents API client (get/put, truncated error snippets)"
```

---

## Task 8: TDD `appendRow` (dedup + 3-attempt retry on 409/422)

**Files:**
- Modify: `/Users/niyaro/Code/pool-tracker/tests/github.test.ts`
- Modify: `/Users/niyaro/Code/pool-tracker/src/github.ts`

- [ ] **Step 1: Append `appendRow` tests to tests/github.test.ts**

Append to the end of `/Users/niyaro/Code/pool-tracker/tests/github.test.ts`:
```ts
import { appendRow } from "../src/github.js";

function mockGet(csvContent: string | null, sha = "sha1") {
  if (csvContent === null) {
    mockFetchOnce({ status: 404, body: {} });
  } else {
    mockFetchOnce({
      status: 200,
      body: {
        sha,
        content: Buffer.from(csvContent, "utf8").toString("base64"),
        encoding: "base64",
      },
    });
  }
}

function mockPut(status = 200) {
  mockFetchOnce({ status, body: status >= 400 ? "err" : {} });
}

describe("appendRow", () => {
  it("creates the CSV on first run (no sha)", async () => {
    mockGet(null);
    mockPut(201);
    await appendRow(TOKEN, "2026-04-21T06:00+08:00,3\n");
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    const put = calls[1][1] as RequestInit;
    const body = JSON.parse(put.body as string);
    expect(body.sha).toBeUndefined();
    expect(Buffer.from(body.content, "base64").toString("utf8"))
      .toBe("timestamp_tw,use_qty\n2026-04-21T06:00+08:00,3\n");
  });

  it("appends to existing CSV with sha", async () => {
    mockGet("timestamp_tw,use_qty\n2026-04-21T06:00+08:00,3\n", "shaA");
    mockPut(200);
    await appendRow(TOKEN, "2026-04-21T06:30+08:00,5\n");
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const put = calls[1][1] as RequestInit;
    const body = JSON.parse(put.body as string);
    expect(body.sha).toBe("shaA");
    expect(Buffer.from(body.content, "base64").toString("utf8"))
      .toBe("timestamp_tw,use_qty\n2026-04-21T06:00+08:00,3\n2026-04-21T06:30+08:00,5\n");
  });

  it("skips append if last row's timestamp matches the new row (dedup)", async () => {
    mockGet("timestamp_tw,use_qty\n2026-04-21T06:00+08:00,3\n", "shaA");
    await appendRow(TOKEN, "2026-04-21T06:00+08:00,3\n");
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1); // only GET, no PUT
  });

  it("retries once on 409, succeeds on second attempt", async () => {
    mockGet("timestamp_tw,use_qty\n", "shaA");
    mockPut(409);
    mockGet("timestamp_tw,use_qty\n", "shaB");
    mockPut(200);
    await appendRow(TOKEN, "2026-04-21T06:00+08:00,3\n");
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(4);
  });

  it("retries up to 3 times total on persistent 409", async () => {
    mockGet("timestamp_tw,use_qty\n", "shaA");
    mockPut(409);
    mockGet("timestamp_tw,use_qty\n", "shaB");
    mockPut(409);
    mockGet("timestamp_tw,use_qty\n", "shaC");
    mockPut(409);
    await expect(appendRow(TOKEN, "2026-04-21T06:00+08:00,3\n")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("does not retry on non-conflict errors (500)", async () => {
    mockGet("timestamp_tw,use_qty\n", "shaA");
    mockPut(500);
    await expect(appendRow(TOKEN, "2026-04-21T06:00+08:00,3\n")).rejects.toMatchObject({
      status: 500,
    });
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2); // GET + PUT, then bail
  });

  it("also treats 422 as a conflict and retries", async () => {
    mockGet("timestamp_tw,use_qty\n", "shaA");
    mockPut(422);
    mockGet("timestamp_tw,use_qty\n", "shaB");
    mockPut(200);
    await appendRow(TOKEN, "2026-04-21T06:00+08:00,3\n");
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (appendRow not exported yet)**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/github.test.ts
```
Expected: FAIL with `No "appendRow" export in src/github.ts`.

- [ ] **Step 3: Add `appendRow` to src/github.ts**

In `/Users/niyaro/Code/pool-tracker/src/github.ts`, replace the line `// appendRow and reportFailure added in subsequent tasks.` with:

```ts
export async function appendRow(token: string, row: string): Promise<void> {
  const myTs = row.split(",")[0];
  // Up to 3 attempts, jittered backoff, survives concurrent-write races
  // (409) and transient flaps. GitHub Contents API returns 409 on sha
  // mismatch; occasionally 422 with a "sha" validation error.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 400));
    }
    const current = await ghGetCsv(token);
    // Dedup guard: if a prior PUT succeeded server-side but we never saw
    // the 200 (timeout/retry), don't append a second row for the same
    // ISO-minute timestamp.
    if (current && lastRowTimestamp(current.content) === myTs) return;
    const content = current ? current.content + row : CSV_HEADER + row;
    try {
      await ghPutCsv(
        token,
        content,
        current?.sha ?? null,
        `data: ${row.trim()}`,
      );
      return;
    } catch (e) {
      lastErr = e;
      const isConflict =
        e instanceof GhHttpError && (e.status === 409 || e.status === 422);
      if (!isConflict) throw e;
      // fall through to retry
    }
  }
  throw lastErr ?? new Error("appendRow: exhausted retries");
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/github.test.ts
```
Expected: all previously passing tests plus 7 new `appendRow` tests → `15 passed`.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add src/github.ts tests/github.test.ts && git commit -m "feat(github): appendRow with dedup + 3-attempt conflict retry"
```

---

## Task 9: TDD `reportFailure`

**Files:**
- Modify: `/Users/niyaro/Code/pool-tracker/tests/github.test.ts`
- Modify: `/Users/niyaro/Code/pool-tracker/src/github.ts`

- [ ] **Step 1: Append `reportFailure` tests**

Append to `/Users/niyaro/Code/pool-tracker/tests/github.test.ts`:
```ts
import { reportFailure } from "../src/github.js";

describe("reportFailure", () => {
  it("comments on the existing tracker issue when one exists", async () => {
    mockFetchOnce({ status: 200, body: [{ number: 42 }] }); // GET /issues
    mockFetchOnce({ status: 201, body: {} });               // POST comment
    await reportFailure(TOKEN, "boom");
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    const commentCall = calls[1];
    expect(commentCall[0]).toContain("/issues/42/comments");
    const body = JSON.parse((commentCall[1] as RequestInit).body as string);
    expect(body.body).toContain("boom");
  });

  it("opens a new labeled issue when no tracker issue is open", async () => {
    mockFetchOnce({ status: 200, body: [] });                 // GET /issues
    mockFetchOnce({ status: 201, body: { number: 1 } });      // POST issue
    await reportFailure(TOKEN, "boom");
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const issueCall = calls[1];
    const body = JSON.parse((issueCall[1] as RequestInit).body as string);
    expect(body.title).toBe("[pool-tracker] scraper failure");
    expect(body.labels).toEqual(["scraper-failure"]);
    expect(body.body).toContain("boom");
  });

  it("never throws even if the list call fails", async () => {
    mockFetchOnce({ status: 500, body: "oops" });
    await expect(reportFailure(TOKEN, "boom")).resolves.toBeUndefined();
  });

  it("never throws even if a POST throws", async () => {
    mockFetchOnce({ status: 200, body: [{ number: 42 }] });
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down"),
    );
    await expect(reportFailure(TOKEN, "boom")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (reportFailure not exported)**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/github.test.ts
```
Expected: FAIL on missing `reportFailure`.

- [ ] **Step 3: Add `reportFailure` to src/github.ts**

Append to `/Users/niyaro/Code/pool-tracker/src/github.ts` (after `appendRow`):
```ts
export async function reportFailure(
  token: string,
  errorMessage: string,
): Promise<void> {
  try {
    const when = taiwanIsoNow();
    // errorMessage already has GH response bodies truncated to 200 chars
    // (by GhHttpError), so it's safe to put in a public issue.
    const body = `\`${when}\`\n\n\`\`\`\n${errorMessage}\n\`\`\``;

    const listUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}/issues?` +
      `state=open&labels=${FAILURE_LABEL}&per_page=1`;
    const list = await fetch(listUrl, { headers: ghHeaders(token) });
    if (!list.ok) return; // best-effort; bail silently
    const issues = (await list.json()) as { number: number }[];

    if (issues.length > 0) {
      await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/issues/${issues[0].number}/comments`,
        {
          method: "POST",
          headers: { ...ghHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
    } else {
      await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
        method: "POST",
        headers: { ...ghHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ISSUE_TITLE,
          body,
          labels: [FAILURE_LABEL],
        }),
      });
    }
  } catch {
    // Truly best-effort. If alerting itself fails, the primary error is
    // still in CF logs and Cron Trigger metrics (because `scheduled`
    // re-throws). We never cascade alerting failures.
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/github.test.ts
```
Expected: `19 passed`.

- [ ] **Step 5: Typecheck**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 6: Commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add src/github.ts tests/github.test.ts && git commit -m "feat(github): reportFailure (labeled issue, best-effort)"
```

---

## Task 10: Wire up the scheduled handler (worker.ts)

**Files:**
- Create: `/Users/niyaro/Code/pool-tracker/src/worker.ts`

No unit test — this is orchestration across already-tested units. Integration verification happens in Task 14.

- [ ] **Step 1: Write src/worker.ts**

Create `/Users/niyaro/Code/pool-tracker/src/worker.ts`:
```ts
import { PAGE_URL, UA } from "./constants.js";
import { parsePoolCount } from "./parser.js";
import { appendRow, reportFailure } from "./github.js";
import { taiwanIsoNow } from "./time.js";

interface Env {
  GITHUB_TOKEN: string;
}

async function fetchHtml(): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      lastErr = e;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw lastErr;
}

export default {
  async scheduled(
    _evt: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    try {
      const html = await fetchHtml();
      const count = parsePoolCount(html);
      const row = `${taiwanIsoNow()},${count}\n`;
      await appendRow(env.GITHUB_TOKEN, row);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      await reportFailure(env.GITHUB_TOKEN, msg); // never throws
      throw e; // surface in CF logs + Cron Trigger metrics
    }
  },
};
```

- [ ] **Step 2: Typecheck**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Run full test suite (sanity)**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add src/worker.ts && git commit -m "feat(worker): scheduled handler wiring fetch + parse + append + alert"
```

---

## Task 11: Wrangler config

**Files:**
- Create: `/Users/niyaro/Code/pool-tracker/wrangler.toml`

- [ ] **Step 1: Write wrangler.toml**

Create `/Users/niyaro/Code/pool-tracker/wrangler.toml`:
```toml
name = "pool-tracker"
main = "src/worker.ts"
compatibility_date = "2026-04-21"

# Pool hours 06:00-22:00 Taiwan (UTC+8) = 22:00 UTC prev day through 14:00 UTC.
# 33 polls/day total. Every 30 min, inclusive of opening and closing times.
[triggers]
crons = [
  "0,30 22,23 * * *",   # 06:00-07:30 Taiwan (4 firings)
  "0,30 0-13 * * *",    # 08:00-21:30 Taiwan (28 firings)
  "0 14 * * *",         # 22:00 Taiwan (1 firing, last poll of day)
]
```

- [ ] **Step 2: Commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add wrangler.toml && git commit -m "chore: wrangler.toml with cron triggers"
```

---

## Task 12: GitHub repo creation and label setup

**Files:**
- None in repo (actions against GitHub)

- [ ] **Step 1: Create a public GitHub repo named `pool-tracker`**

Run (requires `gh` CLI logged in; if not, do it via GitHub UI):
```bash
gh repo create pool-tracker --public --description "Wanhua Sports Center pool occupancy tracker" --source /Users/niyaro/Code/pool-tracker --remote origin --push
```
Expected: repo created and current branch pushed.

If `gh` is not available, run:
```bash
# Create repo via the UI, then:
cd /Users/niyaro/Code/pool-tracker && \
  git remote add origin https://github.com/<github-username>/pool-tracker.git && \
  git push -u origin main
```

- [ ] **Step 2: Create the `scraper-failure` label**

Run:
```bash
gh label create scraper-failure --repo <github-username>/pool-tracker --color d73a4a --description "Pool-tracker worker failure alerts"
```
Expected: label created.

If `gh` is not available: open the repo → Issues → Labels → New label → name `scraper-failure`.

- [ ] **Step 3: Fill `OWNER` in src/constants.ts**

Open `/Users/niyaro/Code/pool-tracker/src/constants.ts` and change:
```ts
export const OWNER = "CHANGE_ME_BEFORE_DEPLOY";
```
to your GitHub username, e.g.:
```ts
export const OWNER = "kerim";
```

- [ ] **Step 4: Re-run tests (OWNER change affects no tests, but typecheck should still pass)**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx vitest run && npx tsc --noEmit
```
Expected: all green.

- [ ] **Step 5: Commit and push**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add src/constants.ts && git commit -m "chore: set OWNER for deploy" && git push
```

---

## Task 13: Cloudflare account, PAT, secret, deploy

**Files:** None

- [ ] **Step 1: Ensure you have a Cloudflare account**

If not, sign up at https://dash.cloudflare.com/sign-up (free, email verification).

- [ ] **Step 2: Generate a GitHub fine-grained PAT**

In GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token:
- Resource owner: your account
- Repository access: "Only select repositories" → `pool-tracker`
- Repository permissions:
  - Contents: Read and write
  - Issues: Read and write
  - Metadata: Read-only (auto-included)
- Expiration: 90 days minimum
- Generate token. **Copy it** — you won't see it again.

- [ ] **Step 3: Log in to Wrangler**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx wrangler login
```
Expected: browser opens, you approve, terminal confirms.

- [ ] **Step 4: Set the GITHUB_TOKEN secret**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx wrangler secret put GITHUB_TOKEN
```
At the prompt, paste the PAT. Expected: `Success!`.

- [ ] **Step 5: Deploy**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx wrangler deploy
```
Expected: deploy URL printed, cron triggers registered.

- [ ] **Step 6: Manually trigger the Worker**

Open Cloudflare Dashboard → Workers & Pages → `pool-tracker` → Triggers tab → next to any cron trigger, click "Run now" (exact wording may vary).

OR via local dev:
```bash
cd /Users/niyaro/Code/pool-tracker && npx wrangler dev --test-scheduled
# in another terminal:
curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"
```

- [ ] **Step 7: Verify first run wrote a row**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git pull && cat data/occupancy.csv
```
Expected: header + one row matching `YYYY-MM-DDTHH:MM+08:00,<integer>`.

- [ ] **Step 8: Sanity-check the value matches the live page**

Open https://whsc.com.tw/%E5%A0%B4%E9%A4%A8%E4%BB%8B%E7%B4%B9/%E6%B8%B8%E6%B3%B3%E6%B1%A0/ in a browser within ~2 min of the recorded timestamp. Verify the displayed pool count equals the integer in the CSV (±1).

If it matches, you have a working scraper. If not, re-run Task 4's fixture test against a fresh capture:
```bash
curl -sS --max-time 15 "https://whsc.com.tw/%E5%A0%B4%E9%A4%A8%E4%BB%8B%E7%B4%B9/%E6%B8%B8%E6%B3%B3%E6%B1%A0/" > /Users/niyaro/Code/pool-tracker/tests/fixture.html
npx vitest run tests/parser.test.ts
```

---

## Task 14: Viewer — index.html

**Files:**
- Create: `/Users/niyaro/Code/pool-tracker/index.html`

- [ ] **Step 1: Write index.html**

Create `/Users/niyaro/Code/pool-tracker/index.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Pool Occupancy — Wanhua Sports Center</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2em auto; padding: 0 1em; }
    #meta { color: #666; font-size: 0.9em; margin-bottom: 1em; }
    #filter { margin: 1em 0; }
    #chart { min-height: 400px; }
    #status { color: #a00; }
  </style>
</head>
<body>
  <h1>Pool Occupancy by Hour of Day</h1>
  <div id="meta"></div>
  <div id="filter">
    Show:
    <label><input type="radio" name="days" value="all" checked> All days</label>
    <label><input type="radio" name="days" value="weekday"> Weekdays</label>
    <label><input type="radio" name="days" value="weekend"> Weekends</label>
  </div>
  <div id="chart"></div>
  <div id="status"></div>
  <script src="https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/dist/plot.umd.min.js"></script>
  <script src="viewer.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add index.html && git commit -m "feat(viewer): minimal HTML shell"
```

---

## Task 15: Viewer — viewer.js

**Files:**
- Create: `/Users/niyaro/Code/pool-tracker/viewer.js`

- [ ] **Step 1: Write viewer.js**

Create `/Users/niyaro/Code/pool-tracker/viewer.js`:
```js
const CSV_URL = "./data/occupancy.csv";
const REFRESH_MS = 5 * 60 * 1000;
let allRows = [];

async function loadData() {
  const r = await fetch(CSV_URL, { cache: "no-cache" });
  if (r.status === 404) { allRows = []; return; }
  if (!r.ok) throw new Error(`CSV fetch ${r.status}`);
  const text = await r.text();
  const lines = text.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .slice(1); // drop header
  allRows = lines.flatMap(line => {
    const comma = line.indexOf(",");
    if (comma <= 0) return [];
    const ts = line.slice(0, comma);
    const qty = parseInt(line.slice(comma + 1), 10);
    if (!Number.isFinite(qty)) return [];
    // Hour-of-day: parse from the timestamp STRING (positions 11-13). Stays
    // in Taiwan wall time regardless of viewer's local timezone.
    const hour = parseInt(ts.slice(11, 13), 10);
    if (!Number.isFinite(hour)) return [];
    // Day-of-week: Taiwan-local YYYY-MM-DD → UTC date → getUTCDay. Correct
    // regardless of viewer's timezone.
    const [y, m, dd] = ts.slice(0, 10).split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    return [{ timestamp: ts, hour, use_qty: qty, isWeekend }];
  });
}

function filteredRows() {
  const mode = document.querySelector('input[name="days"]:checked').value;
  if (mode === "weekday") return allRows.filter(r => !r.isWeekend);
  if (mode === "weekend") return allRows.filter(r => r.isWeekend);
  return allRows;
}

function render() {
  const rows = filteredRows();
  const chart = document.getElementById("chart");
  chart.replaceChildren();
  document.getElementById("meta").textContent =
    `${allRows.length} observations · last updated ${new Date().toLocaleTimeString()}`;
  if (rows.length === 0) {
    chart.textContent = "No data yet. First poll will appear within 30 minutes.";
    return;
  }
  const plot = Plot.plot({
    x: { label: "Hour of day (Taiwan)", domain: [5.5, 22.5] },
    y: { label: "Swimmers", grid: true, domain: [0, 100] },
    marks: [
      Plot.boxY(rows, { x: "hour", y: "use_qty" }),
      Plot.dot(rows, {
        x: "hour",
        y: "use_qty",
        fill: d => d.isWeekend ? "#d62728" : "#1f77b4",
        fillOpacity: 0.35,
        r: 2,
        dx: () => (Math.random() - 0.5) * 0.6,
      }),
    ],
    width: 860,
    height: 460,
    marginLeft: 50,
    marginBottom: 50,
  });
  chart.append(plot);
}

async function refresh() {
  try {
    await loadData();
    render();
    document.getElementById("status").textContent = "";
  } catch (e) {
    document.getElementById("status").textContent = `load error: ${e.message}`;
  }
}

document.querySelectorAll('input[name="days"]').forEach(i => i.addEventListener("change", render));
refresh();
setInterval(refresh, REFRESH_MS);
```

- [ ] **Step 2: Commit and push**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git add viewer.js && git commit -m "feat(viewer): Observable Plot box + strip dot renderer" && git push
```

---

## Task 16: Enable GitHub Pages

**Files:** None

- [ ] **Step 1: Enable Pages**

On github.com, go to the repo → Settings → Pages:
- Source: **Deploy from a branch**
- Branch: **main** → Folder: **/ (root)**
- Save.

- [ ] **Step 2: Wait for first build**

Watch Actions tab. The "pages build and deployment" action should run and succeed in ~1 minute.

- [ ] **Step 3: Visit the published URL**

Open `https://<github-username>.github.io/pool-tracker/` in a browser.

Expected behavior depends on whether the Worker has written a row:
- If `data/occupancy.csv` does not yet exist: chart area shows "No data yet. First poll will appear within 30 minutes." and `#meta` shows `0 observations · last updated HH:MM:SS`.
- If at least one row exists: box plot + a single dot renders at the appropriate hour.

- [ ] **Step 4: Verify auto-refresh**

Leave the page open for ~5 minutes and wait for the next cron firing. Confirm the `meta` line's timestamp updates and (if a new row landed) the chart picks it up without a manual reload.

---

## Task 17: Failure-path verification

**Files:**
- Temporarily modify `/Users/niyaro/Code/pool-tracker/src/constants.ts`

- [ ] **Step 1: Break the venue name**

Change `src/constants.ts`:
```ts
export const VENUE_NAME = "nonexistent-venue-for-test";
```

- [ ] **Step 2: Redeploy**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && npx wrangler deploy
```

- [ ] **Step 3: Manually trigger the Worker**

Use the Cloudflare dashboard "Run now" button, or the dev endpoint from Task 13 Step 6.

- [ ] **Step 4: Verify a failure issue opens**

Open the repo's Issues tab. Expect one open issue titled `[pool-tracker] scraper failure` with label `scraper-failure`, body containing a Taiwan timestamp and the error message `venue 'nonexistent-venue-for-test' not present in payload`.

- [ ] **Step 5: Trigger a second failure, confirm it comments (not a second issue)**

Trigger again. Refresh the Issues tab. Expect still exactly ONE open issue, now with two comments (the initial body and the new comment).

- [ ] **Step 6: Restore and redeploy**

Change `src/constants.ts` back:
```ts
export const VENUE_NAME = "游泳池";
```
Then:
```bash
cd /Users/niyaro/Code/pool-tracker && git checkout -- src/constants.ts && npx wrangler deploy
```
(Or restore by editing manually if already committed.)

- [ ] **Step 7: Close the test issue**

Close the `[pool-tracker] scraper failure` issue on GitHub.

- [ ] **Step 8: Trigger once more; confirm successful write + no new issue**

Manually trigger. Confirm a new commit + row land in `data/occupancy.csv`, and no new failure issue is opened.

---

## Task 18: Dedup-guard verification

**Files:** None

- [ ] **Step 1: Note the most recent row**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git pull && tail -1 data/occupancy.csv
```
Note the timestamp (e.g. `2026-04-21T14:30+08:00,18`).

- [ ] **Step 2: Manually trigger the Worker within the same ISO minute**

Use the Cloudflare dashboard "Run now". Do this within the same wall-clock minute as the existing last-row timestamp — e.g. if the last row is `14:30`, trigger again before 14:31.

- [ ] **Step 3: Verify no duplicate row**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git pull && tail -3 data/occupancy.csv
```
Expected: the most recent timestamp appears **exactly once**. No duplicate row. (If the trigger fell into a new minute, the guard legitimately allows a new row — retry Step 2 more quickly.)

---

## Task 19: 24-hour cron sanity

**Files:** None

- [ ] **Step 1: Wait 24+ hours after deploy**

No action.

- [ ] **Step 2: Count commits from the Worker across a full Taiwan day**

Run:
```bash
cd /Users/niyaro/Code/pool-tracker && git pull && git log --author="pool-bot\|<github-username>" --since="24 hours ago" --oneline | wc -l
```
(Adjust the `--author` filter to whatever identity appears in commits; GitHub Contents API commits by default use the token owner's identity.)

Expected: 30–33 commits. Fewer than 30 → investigate a cron slot that was missed by checking the Cloudflare dashboard's Worker logs at that time.

- [ ] **Step 3: Quick visual check**

Open the viewer URL. Confirm the chart has a plausible shape: dots cluster around evening hours, dip near the 10:00 cleaning window.

---

## Task 20: One-week distribution sanity

**Files:** None

- [ ] **Step 1: Wait ≥7 days after deploy**

No action.

- [ ] **Step 2: Load the viewer and inspect**

Open `https://<github-username>.github.io/pool-tracker/`. Expect:
- Recognizable structure (not random noise)
- Dip or zero values visible around the 10:00 cleaning window
- Weekday filter and Weekend filter show visibly different distributions

If the data looks structureless or flat, suspect a parsing regression. Re-capture the fixture and re-run the parser test:
```bash
curl -sS --max-time 15 "https://whsc.com.tw/%E5%A0%B4%E9%A4%A8%E4%BB%8B%E7%B4%B9/%E6%B8%B8%E6%B3%B3%E6%B1%A0/" > /Users/niyaro/Code/pool-tracker/tests/fixture.html
cd /Users/niyaro/Code/pool-tracker && npx vitest run tests/parser.test.ts
```

---

## Self-review notes

Spec coverage: all the following spec sections have at least one task.

| Spec section | Implemented by |
|--------------|----------------|
| Context (silent parser failure, GH Actions cron) | Task 4 fixture-test design; Task 11 cron triggers |
| Architecture / data flow | Tasks 3–11 |
| Scraper: fetchHtml | Task 10 (worker.ts) |
| Scraper: parsePoolCount | Task 4 |
| Scraper: taiwanIsoNow | Task 5 |
| Scraper: scheduled handler | Task 10 |
| GitHub client: ghGetCsv/ghPutCsv | Task 7 |
| GitHub client: appendRow + dedup + retries | Task 8 |
| Failure alerting: reportFailure | Task 9 |
| Cron schedule | Task 11 |
| Viewer: index.html | Task 14 |
| Viewer: viewer.js | Task 15 |
| GitHub PAT, secret, deploy | Task 13 |
| Pages enablement | Task 16 |
| Verification: fixture test | Task 4 |
| Verification: scraper sanity | Task 13 |
| Verification: failure path | Task 17 |
| Verification: dedup guard | Task 18 |
| Verification: cron sanity | Task 19 |
| Verification: distribution sanity | Task 20 |

Type / naming consistency: all method names and type shapes match between tasks (`appendRow(token, row)`, `reportFailure(token, msg)`, `ghGetCsv(token)`, `ghPutCsv(token, content, sha, message)`, `GhHttpError {status, path, snippet}`, `parsePoolCount(html) → number`, `taiwanIsoNow(d?) → string`, `lastRowTimestamp(csv) → string | null`).

No placeholders. Every code-editing step contains the exact code to write.
