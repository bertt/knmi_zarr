"""Print the latest observations of a station from the online Zarr store.

Usage: python latest.py [station name]   (default: "De Bilt", the KNMI station in Utrecht)
"""
import sys

import xarray as xr

BASE = "https://bertt.github.io/knmi_zarr"
name = sys.argv[1] if len(sys.argv) > 1 else "De Bilt"

ds = xr.open_zarr(f"{BASE}/obs.zarr", consolidated=True, zarr_format=3)
names = ds["station_name"].values
matches = [i for i, n in enumerate(names) if name.lower() in str(n).lower()]
if not matches:
    sys.exit(f"Station '{name}' not found. Available: " + ", ".join(str(n) for n in names))
row = ds.isel(station=matches[0], time=-1)

print(f"{row['station_name'].item()} ({row['lat'].item():.3f}, {row['lon'].item():.3f}) at {row['time'].values}")
for var in ds.data_vars:
    if ds[var].dims != ("station", "time") or ds[var].dtype.kind != "f":
        continue
    value = float(row[var].values)
    if value == value:  # skip NaN
        print(f"{ds[var].attrs.get('long_name', var):<60} {value:>10.1f} {ds[var].attrs.get('units', '')}")
