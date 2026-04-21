import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parsePoolCount } from "../src/parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, "fixture.html"), "utf8");
const EXPECTED_QTY = 17; // matches the fixture captured during Task 3

describe("parsePoolCount", () => {
  it("extracts the pool UseQty from the live-captured page fixture", () => {
    expect(parsePoolCount(FIXTURE)).toBe(EXPECTED_QTY);
  });

  it("clamps negative UseQty to zero (mirroring the Vue template's guard)", () => {
    const html = `noise this.venueInfo = JSON.parse("[{\\"MachineName\\":\\"游泳池\\",\\"MaxQty\\":100,\\"UseQty\\":-3}]") more noise`;
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
    const html = `this.venueInfo = JSON.parse("[{\\"MachineName\\":\\"游泳池\\",\\"MaxQty\\":100,\\"UseQty\\":null}]")`;
    expect(() => parsePoolCount(html)).toThrow(/UseQty is not a finite number/);
  });
});
