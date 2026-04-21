const CSV_URL = "./data/occupancy.csv";
const REFRESH_MS = 5 * 60 * 1000;
const HOUR_DOMAIN = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

const POOL_CAPACITY = 100;
const GYM_CAPACITY = 150;

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
    const pool = parseInt(row.pool_qty, 10);
    // Pool is required: drop the row if missing. Matches v1 behavior.
    if (!ts || !Number.isFinite(pool)) return null;
    const rawGym = parseInt(row.gym_qty, 10);
    // Empty/malformed gym_qty is expected for historical rows; null means
    // "skip this row for the gym chart" — the pool chart still uses it.
    const gym = Number.isFinite(rawGym) ? rawGym : null;
    const hour = parseInt(ts.slice(11, 13), 10);
    if (!Number.isFinite(hour)) return null;
    const [y, m, dd] = ts.slice(0, 10).split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    return { timestamp: ts, hour, pool, gym, isWeekend: dow === 0 || dow === 6 };
  });
}

function filteredRows() {
  const mode = document.querySelector('input[name="days"]:checked').value;
  if (mode === "weekday") return allRows.filter(r => !r.isWeekend);
  if (mode === "weekend") return allRows.filter(r => r.isWeekend);
  return allRows;
}

// Spread dots that land on identical (hour, value) coordinates so a stack of
// N observations reads as N visible marks. Offsets stay under ±0.4 units so
// they don't misrepresent the integer count. Computed per-chart on the rows
// actually shown, stored in a local WeakMap so pool and gym don't collide.
function computeJitter(rows, column) {
  const stackSize = new Map();
  for (const r of rows) {
    const key = `${r.hour},${r[column]}`;
    stackSize.set(key, (stackSize.get(key) ?? 0) + 1);
  }
  const stackSeen = new Map();
  const offsets = new WeakMap();
  for (const r of rows) {
    const key = `${r.hour},${r[column]}`;
    const n = stackSize.get(key);
    const i = stackSeen.get(key) ?? 0;
    stackSeen.set(key, i + 1);
    offsets.set(r, n > 1 ? ((i - (n - 1) / 2) / (n - 1)) * 0.8 : 0);
  }
  return offsets;
}

function renderChart(rows, { column, capacity, containerId, yLabel, emptyLabel }) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  const visible = rows.filter(r => Number.isFinite(r[column]));
  if (visible.length === 0) {
    const msg = document.createElement("div");
    msg.className = "chart-empty";
    msg.textContent = emptyLabel ?? "No data yet.";
    container.append(msg);
    return;
  }
  const offsets = computeJitter(visible, column);
  const plot = Plot.plot({
    x: {
      type: "band",
      domain: HOUR_DOMAIN,
      label: "Hour of day — Taiwan",
      tickFormat: d => String(d).padStart(2, "0"),
    },
    y: {
      label: yLabel,
      grid: true,
      domain: [0, capacity],
    },
    style: {
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      fontSize: 12,
      color: COLOR.ink,
      background: "transparent",
    },
    marks: [
      Plot.ruleY([capacity], { stroke: COLOR.muted, strokeDasharray: "3 3", strokeOpacity: 0.6 }),
      Plot.boxY(visible, {
        x: "hour",
        y: column,
        stroke: COLOR.muted,
        strokeWidth: 1,
        r: 0,
      }),
      Plot.dot(visible, {
        x: "hour",
        y: d => d[column] + (offsets.get(d) ?? 0),
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
  container.append(plot);
}

function render() {
  const rows = filteredRows();
  const n = allRows.length;
  document.getElementById("meta").textContent =
    `${n} ${n === 1 ? "observation" : "observations"} · last updated ${new Date().toLocaleTimeString()}`;
  const status = document.getElementById("status");
  if (rows.length === 0) {
    document.getElementById("pool-chart").replaceChildren();
    document.getElementById("gym-chart").replaceChildren();
    status.textContent = "No data yet. First poll will appear within 30 minutes.";
    return;
  }
  status.textContent = "";
  renderChart(rows, {
    column: "pool",
    capacity: POOL_CAPACITY,
    containerId: "pool-chart",
    yLabel: "Swimmers ↑",
    emptyLabel: "No pool data in this filter.",
  });
  renderChart(rows, {
    column: "gym",
    capacity: GYM_CAPACITY,
    containerId: "gym-chart",
    yLabel: "Gym users ↑",
    emptyLabel: "No gym data yet — historical rows were pool-only. First scheduled run after deploy will populate this chart.",
  });
}

async function refresh() {
  try {
    await loadData();
    render();
    // render() manages #status for the empty-data case; don't clobber that.
    const status = document.getElementById("status");
    if (allRows.length > 0) status.textContent = "";
  } catch (e) {
    document.getElementById("status").textContent = `load error: ${e.message}`;
  }
}

document.querySelectorAll('input[name="days"]').forEach(i => i.addEventListener("change", render));
refresh();
setInterval(refresh, REFRESH_MS);
