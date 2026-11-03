"""Print the latest observations of a station from the online GeoParquet file.

Usage: python latest.py [station name]   (default: "De Bilt", the KNMI station in Utrecht)
"""
import io
import json
import sys
import urllib.request

import geopandas as gpd
import pyarrow.parquet as pq

URL = "https://bertt.github.io/knmi_zarr/obs.parquet"
name = sys.argv[1] if len(sys.argv) > 1 else "De Bilt"

data = urllib.request.urlopen(URL).read()  # the file is small (one row per station)
gdf = gpd.read_parquet(io.BytesIO(data))
variables = json.loads(pq.read_schema(io.BytesIO(data)).metadata[b"knmi:variables"])
matches = gdf[gdf["station_name"].str.contains(name, case=False, regex=False)]
if matches.empty:
    sys.exit(f"Station '{name}' not found. Available: " + ", ".join(gdf["station_name"]))
row = matches.iloc[0]

print(f"{row['station_name']} ({row['lat']:.3f}, {row['lon']:.3f}) at {row['time']}")
for var, meta in variables.items():
    value = row.get(var)
    if var in ("lon", "lat", "height") or value is None or value != value:  # skip NaN
        continue
    print(f"{meta.get('long_name', var):<60} {float(value):>10.1f} {meta.get('units', '')}")
