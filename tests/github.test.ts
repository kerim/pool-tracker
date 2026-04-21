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
