import { PAGE_URL, UA } from "./constants.js";
import { parsePoolCount } from "./parser.js";
import { appendRow, reportFailure } from "./github.js";
import { taiwanIsoNow } from "./time.js";

interface Env {
  GITHUB_TOKEN: string;
}

async function fetchHtml(): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      lastErr = e;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw lastErr;
}

export default {
  async scheduled(
    _evt: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    try {
      const html = await fetchHtml();
      const count = parsePoolCount(html);
      const row = `${taiwanIsoNow()},${count}\n`;
      await appendRow(env.GITHUB_TOKEN, row);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      await reportFailure(env.GITHUB_TOKEN, msg);
      throw e;
    }
  },
};
