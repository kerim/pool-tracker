const CSV_URL = "./data/occupancy.csv";
const REFRESH_MS = 5 * 60 * 1000;
const HOUR_DOMAIN = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
let allRows = [];

async function loadData() {
  const r = await fetch(CSV_URL, { cache: "no-cache" });
  if (r.status === 404) { allRows = []; return; }
  if (!r.ok) throw new Error(`CSV fetch ${r.status}`);
  const text = await r.text();
  const lines = text.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .slice(1); // drop header
  allRows = lines.flatMap(line => {
    const comma = line.indexOf(",");
    if (comma <= 0) return [];
    const ts = line.slice(0, comma);
    const qty = parseInt(line.slice(comma + 1), 10);
    if (!Number.isFinite(qty)) return [];
    // Hour-of-day: parse from the timestamp STRING (positions 11-13). Stays
    // in Taiwan wall time regardless of viewer's local timezone.
    const hour = parseInt(ts.slice(11, 13), 10);
    if (!Number.isFinite(hour)) return [];
    // Day-of-week: Taiwan-local YYYY-MM-DD -> UTC date -> getUTCDay. Correct
    // regardless of viewer's timezone.
    const [y, m, dd] = ts.slice(0, 10).split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    return [{ timestamp: ts, hour, use_qty: qty, isWeekend }];
  });
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
      color: "#1a1612",
      background: "transparent",
    },
    marks: [
      Plot.ruleY([100], { stroke: "#6b645c", strokeDasharray: "3 3", strokeOpacity: 0.6 }),
      Plot.boxY(rows, {
        x: "hour",
        y: "use_qty",
        stroke: "#6b645c",
        strokeWidth: 1,
        r: 0,
      }),
      Plot.dot(rows, {
        x: "hour",
        y: "use_qty",
        fill: d => d.isWeekend ? "#b44a28" : "#2a588a",
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
