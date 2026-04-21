import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseVenueCounts } from "../src/parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, "fixture.html"), "utf8");

describe("parseVenueCounts", () => {
  it("extracts both pool and gym UseQty from the live-captured page fixture", () => {
    expect(parseVenueCounts(FIXTURE)).toEqual({ pool: 17, gym: 9 });
  });

  it("clamps negative pool UseQty to zero", () => {
    const html = `noise this.venueInfo = JSON.parse("[{\\"MachineName\\":\\"游泳池\\",\\"MaxQty\\":100,\\"UseQty\\":-3}]") more noise`;
    expect(parseVenueCounts(html)).toEqual({ pool: 0, gym: null });
  });

  it("clamps negative gym UseQty to zero", () => {
    const html = `this.venueInfo = JSON.parse("[{\\"MachineName\\":\\"游泳池\\",\\"MaxQty\\":100,\\"UseQty\\":5},{\\"MachineName\\":\\"健身房\\",\\"MaxQty\\":150,\\"UseQty\\":-5}]")`;
    expect(parseVenueCounts(html)).toEqual({ pool: 5, gym: 0 });
  });

  it("throws if the venueInfo literal is missing", () => {
    expect(() => parseVenueCounts("<html>no script here</html>")).toThrow(/venueInfo literal not found/);
  });

  it("throws if the pool venue is missing from payload", () => {
    const html = `this.venueInfo = JSON.parse("[{\\"MachineName\\":\\"健身房\\",\\"MaxQty\\":150,\\"UseQty\\":5}]")`;
    expect(() => parseVenueCounts(html)).toThrow(/not present in payload/);
  });

  it("throws if pool UseQty is not a finite number", () => {
    const html = `this.venueInfo = JSON.parse("[{\\"MachineName\\":\\"游泳池\\",\\"MaxQty\\":100,\\"UseQty\\":null}]")`;
    expect(() => parseVenueCounts(html)).toThrow(/UseQty is not a finite number/);
  });

  it("returns gym: null when gym venue is absent (does not throw)", () => {
    const html = `this.venueInfo = JSON.parse("[{\\"MachineName\\":\\"游泳池\\",\\"MaxQty\\":100,\\"UseQty\\":7}]")`;
    expect(parseVenueCounts(html)).toEqual({ pool: 7, gym: null });
  });

  it("returns gym: null when gym UseQty is non-finite (does not throw)", () => {
    const html = `this.venueInfo = JSON.parse("[{\\"MachineName\\":\\"游泳池\\",\\"MaxQty\\":100,\\"UseQty\\":7},{\\"MachineName\\":\\"健身房\\",\\"MaxQty\\":150,\\"UseQty\\":null}]")`;
    expect(parseVenueCounts(html)).toEqual({ pool: 7, gym: null });
  });
});
