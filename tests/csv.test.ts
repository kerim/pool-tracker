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

  it("normalizes CRLF line endings", () => {
    const csv =
      "timestamp_tw,use_qty\r\n2026-04-21T06:00+08:00,3\r\n2026-04-21T06:30+08:00,5\r\n";
    expect(lastRowTimestamp(csv)).toBe("2026-04-21T06:30+08:00");
  });
});
