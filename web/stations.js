import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from "https://esm.sh/hyparquet@1.32.0";

// config.json holds the GeoParquet URL used by all pages (absolute, or relative to the config file; default "obs.parquet" = the file next to the pages).
// Station id, name, longitude, latitude and height are stored in the GeoParquet file itself.
// The config file can be overridden with ?config=<file or url> (relative to the page), e.g. ?config=my-config.json
const configUrl = new URL(new URLSearchParams(location.search).get("config") || "config.json", location.href);
let configError = null, config = {};
try {
  const r = await fetch(configUrl, { cache: "no-cache" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  config = await r.json();
  if (typeof config.parquet !== "string") throw new Error('missing "parquet" property');
} catch (err) {
  configError = new Error(`Config file ${configUrl.href} could not be loaded: ${err.message}`);
}
export const DATA_URL = new URL(config.parquet ?? "obs.parquet", configUrl).href;

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

const NOT_VARIABLE = new Set(["lon", "lat", "height"]);
const NOT_READ = new Set(["geometry", "bbox"]); // WKB geometry and covering bbox are for GIS tools; lon/lat are separate columns

// Reads the station metadata (id, name, longitude, latitude, height), the observation time, the variable descriptions and the values.
// The stations are sorted spatially and stored in row groups of a few hundred stations (worldwide: any number of stations).
// Optional bbox [west, south, east, north]: only the row groups whose lon/lat statistics intersect the bbox are read completely
// (the other stations have id, name, height and values null). Without bbox all stations are read.
// Returns { time, variables, stations: [{ id, name, height, lon, lat }], columns: { variable: [value|null, ...] } };
// the array position is the station index of every column.
export async function loadStations({ bbox } = {}) {
  if (configError) throw configError;
  let file, metadata;
  try {
    file = await asyncBufferFromUrl({ url: DATA_URL });
    metadata = await parquetMetadataAsync(file);
  } catch {
    // GitHub Pages gzips the file, which breaks HTTP range requests (the length is that of the compressed file): read it completely instead
    try {
      const r = await fetch(DATA_URL, { cache: "no-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      file = await r.arrayBuffer();
      metadata = await parquetMetadataAsync(file);
    } catch (err) {
      throw new Error(`GeoParquet file not found at ${DATA_URL} (${err.message}). Check the "parquet" URL in the config file (${configUrl.href}) or create the data with convert.py.`);
    }
  }
  const kv = Object.fromEntries((metadata.key_value_metadata ?? []).map(e => [e.key, e.value]));
  const described = JSON.parse(kv["knmi:variables"] ?? "{}");
  const names = metadata.schema.slice(1).map(s => s.name).filter(n => !NOT_READ.has(n));
  const variables = {};
  for (const [k, a] of Object.entries(described))
    if (!NOT_VARIABLE.has(k) && names.includes(k)) variables[k] = { long_name: a.long_name ?? k, units: a.units ?? "" };

  // Row ranges and lon/lat statistics of every row group
  const groups = []; let start = 0;
  for (const g of metadata.row_groups) {
    const stat = n => g.columns.find(c => c.meta_data?.path_in_schema?.join(".") === n)?.meta_data?.statistics;
    const x = stat("lon"), y = stat("lat");
    groups.push({ start, end: start + Number(g.num_rows), box: x && y ? [x.min_value, y.min_value, x.max_value, y.max_value] : null });
    start += Number(g.num_rows);
  }
  const n = start;
  const lonlat = await parquetReadObjects({ file, metadata, columns: ["lon", "lat"] });
  const stations = lonlat.map(r => ({ id: null, name: null, height: null, lon: r.lon, lat: r.lat }));
  const columns = Object.fromEntries(Object.keys(variables).map(k => [k, new Array(n).fill(null)]));
  let time = null;
  const wanted = groups.filter(g => !bbox || !g.box || !(g.box[2] < bbox[0] || g.box[0] > bbox[2] || g.box[3] < bbox[1] || g.box[1] > bbox[3]));
  const read = names.filter(k => k in variables || ["station_id", "station_name", "height", "time"].includes(k));
  await Promise.all(wanted.map(async g => {
    const rows = await parquetReadObjects({ file, metadata, columns: read, rowStart: g.start, rowEnd: g.end });
    rows.forEach((r, j) => {
      const s = stations[g.start + j];
      s.id = String(r.station_id); s.name = String(r.station_name); s.height = r.height == null ? null : Number(r.height);
      for (const k in variables) { const v = r[k]; columns[k][g.start + j] = v != null && Number.isFinite(Number(v)) ? Number(v) : null; }
      if (r.time && (!time || r.time > time)) time = r.time;
    });
  }));
  if (!time) throw new Error(`The GeoParquet file at ${DATA_URL} has no observation time.`);
  return { time: new Date(time).toISOString(), variables, stations, columns };
}
