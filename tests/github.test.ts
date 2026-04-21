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

  it("sends Authorization and X-GitHub-Api-Version headers", async () => {
    mockFetchOnce({ status: 404, body: {} });
    await ghGetCsv(TOKEN);
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
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

  it("sends Authorization and X-GitHub-Api-Version headers", async () => {
    mockFetchOnce({ status: 200, body: {} });
    await ghPutCsv(TOKEN, "hello", null, "test");
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });
});

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
    expect(calls).toHaveLength(1);
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
    expect(calls).toHaveLength(2);
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

import { reportFailure } from "../src/github.js";

describe("reportFailure", () => {
  it("comments on the existing tracker issue when one exists", async () => {
    mockFetchOnce({ status: 200, body: [{ number: 42 }] });
    mockFetchOnce({ status: 201, body: {} });
    await reportFailure(TOKEN, "boom");
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    const commentCall = calls[1];
    expect(commentCall[0]).toContain("/issues/42/comments");
    const body = JSON.parse((commentCall[1] as RequestInit).body as string);
    expect(body.body).toContain("boom");
  });

  it("opens a new labeled issue when no tracker issue is open", async () => {
    mockFetchOnce({ status: 200, body: [] });
    mockFetchOnce({ status: 201, body: { number: 1 } });
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
