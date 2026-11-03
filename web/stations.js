import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from "https://esm.sh/hyparquet@1.17.1";

// config.json holds the Zarr URL used by all pages (absolute, or relative to the config file; default "obs.zarr" = the store next to the pages).
// stations.parquet is expected next to the Zarr store.
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
export const STATIONS_URL = ZARR_URL.replace(/[^/]+\/?$/, "stations.parquet");

async function exists(url) {
  try { return (await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } })).status; } catch { return 0; }
}

// Throws a readable error when the config, the Zarr store or stations.parquet cannot be found
async function checkSources() {
  if (configError) throw configError;
  const hint = `Check the "zarr" URL in the config file (${configUrl.href}) or create the data with convert.py.`;
  let s = await exists(`${ZARR_URL}/zarr.json`);
  if (s < 200 || s >= 300) throw new Error(`Zarr store not found at ${ZARR_URL} (${s ? "HTTP " + s : "not reachable"}). ${hint}`);
  s = await exists(STATIONS_URL);
  if (s < 200 || s >= 300) throw new Error(`Stations file not found at ${STATIONS_URL} (${s ? "HTTP " + s : "not reachable"}). It must be next to the Zarr store. ${hint}`);
}

const dec = v => typeof v === "string" ? v : new TextDecoder().decode(v);

// Point from WKB (ISO/OGC, 2D) or an already decoded GeoJSON geometry
function point(g) {
  if (g && g.coordinates) return g.coordinates;
  const b = Uint8Array.from(g), v = new DataView(b.buffer), le = b[0] === 1;
  return [v.getFloat64(5, le), v.getFloat64(13, le)];
}

// Reads stations.parquet (GeoParquet). Row order == station index in obs.zarr.
// Returns { time, variables, stations: [{ id, name, height, lon, lat }] }
export async function loadStations() {
  await checkSources();
  const url = STATIONS_URL;
  const file = await asyncBufferFromUrl({ url });
  const md = await parquetMetadataAsync(file);
  const kv = Object.fromEntries((md.key_value_metadata || []).map(e => [e.key, e.value]));
  const { time, variables } = JSON.parse(kv.knmi);
  const rows = await parquetReadObjects({ file, metadata: md, utf8: false });
  const stations = rows.map(r => {
    const [lon, lat] = point(r.geometry);
    return { id: dec(r.id), name: dec(r.name), height: Number(r.height), lon, lat };
  });
  return { time, variables, stations };
}
