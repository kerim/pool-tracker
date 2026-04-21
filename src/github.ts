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

// appendRow and reportFailure added in Tasks 8 and 9.

// Re-exports so consumers don't need multiple import sites:
export { CSV_HEADER, CSV_PATH, FAILURE_LABEL, ISSUE_TITLE, OWNER, REPO };
export { lastRowTimestamp };
export { taiwanIsoNow };
