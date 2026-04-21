const CSV_URL = "./data/occupancy.csv";
const REFRESH_MS = 5 * 60 * 1000;
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
  document.getElementById("meta").textContent =
    `${allRows.length} observations · last updated ${new Date().toLocaleTimeString()}`;
  if (rows.length === 0) {
    chart.textContent = "No data yet. First poll will appear within 30 minutes.";
    return;
  }
  const plot = Plot.plot({
    x: {
      label: "Hour of day (Taiwan)",
      domain: [5.5, 22.5],
      ticks: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
      tickFormat: d => String(d).padStart(2, "0"),
    },
    y: { label: "Swimmers", grid: true, domain: [0, 100] },
    marks: [
      Plot.boxY(rows, { x: "hour", y: "use_qty" }),
      Plot.dot(rows, {
        x: "hour",
        y: "use_qty",
        fill: d => d.isWeekend ? "#d62728" : "#1f77b4",
        fillOpacity: 0.6,
        r: 3,
        dx: () => (Math.random() - 0.5) * 0.6,
      }),
    ],
    width: 860,
    height: 460,
    marginLeft: 50,
    marginBottom: 50,
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
