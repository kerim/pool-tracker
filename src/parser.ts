import { GYM_VENUE_NAME, POOL_VENUE_NAME } from "./constants.js";

type Venue = { MachineName: string; MaxQty: number; UseQty: number };

export interface VenueCounts {
  pool: number;
  gym: number | null;
}

export function parseVenueCounts(html: string): VenueCounts {
  const m = html.match(/this\.venueInfo\s*=\s*JSON\.parse\((".+?")\)/s);
  if (!m) {
    throw new Error(
      `venueInfo literal not found in page HTML (length=${html.length}, head=${JSON.stringify(html.slice(0, 120))})`,
    );
  }
  const venues: Venue[] = JSON.parse(JSON.parse(m[1]));

  const pool = venues.find((v) => v.MachineName === POOL_VENUE_NAME);
  if (!pool) throw new Error(`venue '${POOL_VENUE_NAME}' not present in payload`);
  if (typeof pool.UseQty !== "number" || !Number.isFinite(pool.UseQty)) {
    throw new Error(
      `venue '${POOL_VENUE_NAME}' UseQty is not a finite number: ${JSON.stringify(pool.UseQty)}`,
    );
  }

  // Gym is optional: a transient source-site outage on the gym entry must not
  // kill pool data collection. Missing entry or non-finite UseQty → null,
  // which the Worker serializes as an empty CSV field.
  const gymEntry = venues.find((v) => v.MachineName === GYM_VENUE_NAME);
  let gym: number | null = null;
  if (
    gymEntry &&
    typeof gymEntry.UseQty === "number" &&
    Number.isFinite(gymEntry.UseQty)
  ) {
    gym = Math.max(0, gymEntry.UseQty);
  }

  return { pool: Math.max(0, pool.UseQty), gym };
}
