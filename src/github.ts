import { CSV_HEADER, CSV_PATH, FAILURE_LABEL, ISSUE_TITLE, OWNER, REPO } from "./constants.js";
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

export async function appendRow(token: string, row: string): Promise<void> {
  const myTs = row.split(",")[0];
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
    }
  }
  throw lastErr ?? new Error("appendRow: exhausted retries");
}

export async function reportFailure(
  token: string,
  errorMessage: string,
): Promise<void> {
  try {
    const when = taiwanIsoNow();
    // errorMessage already has GH response bodies truncated to 200 chars
    // (by GhHttpError), so it's safe to put in a public issue.
    // 4-backtick fence: if errorMessage ever contains a 3-backtick sequence,
    // it won't escape the code block and render as markdown (@mention
    // injection, etc.) in the public issue body.
    const body = `\`${when}\`\n\n\`\`\`\`\n${errorMessage}\n\`\`\`\``;

    const listUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}/issues?` +
      `state=open&labels=${encodeURIComponent(FAILURE_LABEL)}&per_page=1`;
    const list = await fetch(listUrl, { headers: ghHeaders(token) });
    if (!list.ok) return;
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
