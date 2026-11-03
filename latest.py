"""Print the latest observations of a station from the online Zarr store.

Usage: python latest.py [station name]   (default: "De Bilt", the KNMI station in Utrecht)
"""
import io
import json
import sys

import pyarrow.parquet as pq
import requests
import shapely
import xarray as xr

BASE = "https://bertt.github.io/knmi_zarr"
name = sys.argv[1] if len(sys.argv) > 1 else "De Bilt"

resp = requests.get(f"{BASE}/stations.parquet", timeout=30)
resp.raise_for_status()
table = pq.read_table(io.BytesIO(resp.content))
meta = json.loads(table.schema.metadata[b"knmi"])
points = shapely.from_wkb(table["geometry"].to_pylist())
stations = [
    {"name": n, "lon": p.x, "lat": p.y}
    for n, p in zip(table["name"].to_pylist(), points)
]
matches = [i for i, s in enumerate(stations) if name.lower() in s["name"].lower()]
if not matches:
    sys.exit(f"Station '{name}' not found. Available: " + ", ".join(s["name"] for s in stations))
idx = matches[0]
station = stations[idx]

ds = xr.open_zarr(f"{BASE}/obs.zarr", consolidated=True, zarr_format=3)
row = ds.isel(station=idx, time=-1)

print(f"{station['name']} ({station['lat']:.3f}, {station['lon']:.3f}) at {row['time'].values}")
for var, info in meta["variables"].items():
    value = float(row[var].values)
    if value == value:  # skip NaN
        print(f"{info['long_name']:<60} {value:>10.1f} {info['units']}")
