import { VENUE_NAME } from "./constants.js";

type Venue = { MachineName: string; MaxQty: number; UseQty: number };

export function parsePoolCount(html: string): number {
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
