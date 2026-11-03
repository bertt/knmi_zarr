import * as zarr from "https://esm.sh/zarrita@0.7.5";

// config.json holds the Zarr URL used by all pages (absolute, or relative to the config file; default "obs.zarr" = the store next to the pages).
// Station id, name, longitude, latitude and height are stored in the Zarr store itself.
// The config file can be overridden with ?config=<file or url> (relative to the page), e.g. ?config=my-config.json
const configUrl = new URL(new URLSearchParams(location.search).get("config") || "config.json", location.href);
let configError = null, config = {};
try {
  const r = await fetch(configUrl, { cache: "no-cache" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  config = await r.json();
  if (typeof config.zarr !== "string") throw new Error('missing "zarr" property');
} catch (err) {
  configError = new Error(`Config file ${configUrl.href} could not be loaded: ${err.message}`);
}
export const ZARR_URL = new URL(config.zarr ?? "obs.zarr", configUrl).href;

// Keep ?config=... when following relative links to other pages (also for links added later)
const configParam = new URLSearchParams(location.search).get("config");
function keepConfig(root) {
  if (!configParam || (root.nodeType !== 1 && root.nodeType !== 9)) return;
  const links = [...root.querySelectorAll("a[href]"), ...(root.matches?.("a[href]") ? [root] : [])];
  for (const a of links) {
    const h = a.getAttribute("href");
    if (/^([a-z][a-z0-9+.-]*:|#)/i.test(h)) continue; // absolute URLs and anchors
    const u = new URL(h, location.href);
    if (!u.searchParams.has("config")) { u.searchParams.set("config", configParam); a.setAttribute("href", u.href); }
  }
}
keepConfig(document);
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(keepConfig))).observe(document.body, { childList: true, subtree: true });

async function exists(url) {
  try { return (await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, cache: "no-store" })).status; } catch { return 0; }
}

// Throws a readable error when the config or the Zarr store cannot be found
async function checkSources() {
  if (configError) throw configError;
  const hint = `Check the "zarr" URL in the config file (${configUrl.href}) or create the data with convert.py.`;
  const s = await exists(`${ZARR_URL}/zarr.json`);
  if (s < 200 || s >= 300) throw new Error(`Zarr store not found at ${ZARR_URL} (${s ? "HTTP " + s : "not reachable"}). ${hint}`);
}

const UNIT_MS = { days: 864e5, hours: 36e5, minutes: 6e4, seconds: 1e3 };
// Decodes a CF time value ("<unit> since <date>") to an ISO string
function cfTime(value, units) {
  const m = /^(\w+) since (.+)$/.exec(units || "");
  if (!m || !UNIT_MS[m[1]]) throw new Error(`Unsupported time units "${units}" in the Zarr store`);
  // Safari rejects "1970-01-01Z" and other non-strict ISO forms, so parse the base date explicitly
  const p = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d(?:\.\d+)?))?)?\s*(Z|[+-]\d\d:?\d\d)?$/.exec(m[2].trim());
  if (!p) throw new Error(`Unsupported time base "${m[2]}" in the Zarr store`);
  let base = Date.UTC(+p[1], +p[2] - 1, +p[3], +(p[4] || 0), +(p[5] || 0), 0, Math.round(parseFloat(p[6] || 0) * 1000));
  if (p[7] && p[7] !== "Z") {
    const z = p[7].replace(":", "");
    base -= (z[0] === "-" ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(3, 5)) * 6e4;
  }
  return new Date(base + Number(value) * UNIT_MS[m[1]]).toISOString();
}

const readAll = async (root, name, sel) => {
  const arr = await zarr.open.v3(root.resolve(name), { kind: "array" });
  return (await zarr.get(arr, sel)).data;
};

// Reads the station metadata (id, name, longitude, latitude, height), the observation time and the variable descriptions from the Zarr store.
// The stations are sorted spatially and stored in chunks (consolidated attribute `station_chunk_bbox`).
// Optional bbox [west, south, east, north]: only id, name and height of the chunks that intersect the bbox are read
// (the others have id, name and height null). Without bbox all stations are read.
// Returns { time, variables, stations: [{ id, name, height, lon, lat }] }; the array position is the `station` index of every variable.
export async function loadStations({ bbox } = {}) {
  await checkSources();
  const res = await fetch(`${ZARR_URL}/zarr.json`, { cache: "no-cache" });
  const group = await res.json();
  const nodes = group.consolidated_metadata?.metadata;
  if (!nodes) throw new Error(`The Zarr store at ${ZARR_URL} has no consolidated metadata. Create it with convert.py.`);
  const variables = {};
  for (const [name, a] of Object.entries(nodes)) {
    const d = a.dimension_names;
    if (typeof a.data_type === "string" && a.data_type.startsWith("float") && d?.length === 2 && d[0] === "station" && d[1] === "time")
      variables[name] = { long_name: a.attributes?.long_name ?? name, units: a.attributes?.units ?? "" };
  }
  const root = zarr.root(new zarr.FetchStore(ZARR_URL));
  const [t, lon, lat] = await Promise.all(["time", "lon", "lat"].map(n => readAll(root, n)));
  const time = cfTime(t[t.length - 1], nodes.time?.attributes?.units);
  const n = lon.length, size = group.attributes?.station_chunk_size ?? n, boxes = group.attributes?.station_chunk_bbox;
  const stations = Array.from({ length: n }, (_, i) => ({ id: null, name: null, height: null, lon: lon[i], lat: lat[i] }));
  const wanted = [];
  for (let c = 0; c * size < n; c++) {
    const b = boxes?.[c];
    if (bbox && b && (b[2] < bbox[0] || b[0] > bbox[2] || b[3] < bbox[1] || b[1] > bbox[3])) continue;
    wanted.push(c);
  }
  await Promise.all(wanted.map(async c => {
    const sel = [zarr.slice(c * size, Math.min(n, (c + 1) * size))];
    const [id, name, height] = await Promise.all(["station_id", "station_name", "height"].map(k => readAll(root, k, sel)));
    id.forEach((v, j) => Object.assign(stations[c * size + j], { id: String(v), name: String(name[j]), height: Number(height[j]) }));
  }));
  return { time, variables, stations };
}
