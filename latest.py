"""Print the latest observations of a station from the online Zarr store.

Usage: python latest.py [station name]   (default: "De Bilt", the KNMI station in Utrecht)
"""
import sys

import requests
import xarray as xr

BASE = "https://bertt.github.io/knmi_zarr"
name = sys.argv[1] if len(sys.argv) > 1 else "De Bilt"

meta = requests.get(f"{BASE}/stations.geojson", timeout=30).json()
stations = [{**f["properties"], "lon": f["geometry"]["coordinates"][0], "lat": f["geometry"]["coordinates"][1]} for f in meta["features"]]
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
