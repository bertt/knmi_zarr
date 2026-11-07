// Copies the web app into ./www and points it at the remote GeoParquet file.
// The parquet is NOT bundled: it is read over HTTP range requests, so the app always shows fresh data.
const fs = require("fs");
const path = require("path");

const PARQUET_URL = process.env.PARQUET_URL || "https://bertt.github.io/knmi_zarr/obs.parquet";
const src = path.join(__dirname, "..", "web");
const dst = path.join(__dirname, "www");

fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: f => !f.endsWith(".parquet") });
fs.writeFileSync(path.join(dst, "config.json"), JSON.stringify({ parquet: PARQUET_URL }, null, 2) + "\n");
console.log(`web copied to ${dst}, parquet = ${PARQUET_URL}`);
