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
