const CSV_URL = "./data/occupancy.csv";
const REFRESH_MS = 5 * 60 * 1000;
const HOUR_DOMAIN = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

const rootStyles = getComputedStyle(document.documentElement);
const COLOR = {
  blue: rootStyles.getPropertyValue("--blue").trim(),
  terra: rootStyles.getPropertyValue("--terra").trim(),
  muted: rootStyles.getPropertyValue("--muted").trim(),
  ink: rootStyles.getPropertyValue("--ink").trim(),
};

let allRows = [];

async function loadData() {
  const r = await fetch(CSV_URL);
  if (r.status === 404) { allRows = []; return; }
  if (!r.ok) throw new Error(`CSV fetch ${r.status}`);
  const text = await r.text();
  allRows = d3.csvParse(text, row => {
    const ts = row.timestamp_tw;
    const qty = parseInt(row.use_qty, 10);
    if (!ts || !Number.isFinite(qty)) return null;
    // Parse hour from the timestamp string (positions 11-13) and weekday from
    // the YYYY-MM-DD prefix so we stay in Taiwan wall time regardless of the
    // viewer's local timezone.
    const hour = parseInt(ts.slice(11, 13), 10);
    if (!Number.isFinite(hour)) return null;
    const [y, m, dd] = ts.slice(0, 10).split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    return { timestamp: ts, hour, use_qty: qty, isWeekend: dow === 0 || dow === 6 };
  });

  // Spread dots that land on identical (hour, use_qty) coordinates so a stack
  // of N observations reads as N visible marks. Offsets stay under ±0.4
  // swimmers so they don't misrepresent the integer count.
  const stackSize = new Map();
  for (const r of allRows) {
    const key = `${r.hour},${r.use_qty}`;
    stackSize.set(key, (stackSize.get(key) ?? 0) + 1);
  }
  const stackSeen = new Map();
  for (const r of allRows) {
    const key = `${r.hour},${r.use_qty}`;
    const n = stackSize.get(key);
    const i = stackSeen.get(key) ?? 0;
    stackSeen.set(key, i + 1);
    r.yOffset = n > 1 ? ((i - (n - 1) / 2) / (n - 1)) * 0.8 : 0;
  }
}

function filteredRows() {
  const mode = document.querySelector('input[name="days"]:checked').value;
  if (mode === "weekday") return allRows.filter(r => !r.isWeekend);
  if (mode === "weekend") return allRows.filter(r => r.isWeekend);
  return allRows;
}

function render() {
  const rows = filteredRows();
  const chart = document.getElementById("chart");
  chart.replaceChildren();
  const n = allRows.length;
  document.getElementById("meta").textContent =
    `${n} ${n === 1 ? "observation" : "observations"} · last updated ${new Date().toLocaleTimeString()}`;
  if (rows.length === 0) {
    chart.textContent = "No data yet. First poll will appear within 30 minutes.";
    return;
  }
  const plot = Plot.plot({
    x: {
      type: "band",
      domain: HOUR_DOMAIN,
      label: "Hour of day — Taiwan",
      tickFormat: d => String(d).padStart(2, "0"),
    },
    y: {
      label: "Swimmers ↑",
      grid: true,
      domain: [0, 100],
    },
    style: {
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      fontSize: 12,
      color: COLOR.ink,
      background: "transparent",
    },
    marks: [
      Plot.ruleY([100], { stroke: COLOR.muted, strokeDasharray: "3 3", strokeOpacity: 0.6 }),
      // r: 0 suppresses boxY's default outlier dots — the dedicated Plot.dot
      // layer below owns all point rendering.
      Plot.boxY(rows, {
        x: "hour",
        y: "use_qty",
        stroke: COLOR.muted,
        strokeWidth: 1,
        r: 0,
      }),
      Plot.dot(rows, {
        x: "hour",
        y: d => d.use_qty + d.yOffset,
        fill: d => d.isWeekend ? COLOR.terra : COLOR.blue,
        stroke: "white",
        strokeWidth: 0.5,
        fillOpacity: 0.85,
        r: 5,
        tip: true,
        channels: {
          When: "timestamp",
          Day: d => d.isWeekend ? "Weekend" : "Weekday",
        },
      }),
    ],
    width: 900,
    height: 480,
    marginLeft: 54,
    marginBottom: 54,
    marginTop: 20,
    marginRight: 20,
  });
  chart.append(plot);
}

async function refresh() {
  try {
    await loadData();
    render();
    document.getElementById("status").textContent = "";
  } catch (e) {
    document.getElementById("status").textContent = `load error: ${e.message}`;
  }
}

document.querySelectorAll('input[name="days"]').forEach(i => i.addEventListener("change", render));
refresh();
setInterval(refresh, REFRESH_MS);
