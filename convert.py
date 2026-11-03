"""Convert one or more KNMI-style NetCDF files (station x time) to one GeoParquet file.

Usage: python convert.py <file.nc> [<more.nc> ...] [-o web/obs.parquet]

One row per station, worldwide capable: stations from several files are merged
(union of columns, missing values are null) and sorted along a Z-order curve.
"""
import json, sys
import geopandas as gpd
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import xarray as xr

ROW_GROUP = 512  # stations per row group; spatially sorted, so a row group is a compact area
META_KEYS = ("long_name", "units", "standard_name")


def morton(lon, lat):
    """Z-order (Morton) key of lon/lat on a 16-bit grid; nearby stations get nearby keys."""
    x = np.clip((np.asarray(lon) + 180) / 360 * 65535, 0, 65535).astype(np.uint64)
    y = np.clip((np.asarray(lat) + 90) / 180 * 65535, 0, 65535).astype(np.uint64)
    key = np.zeros(len(x), dtype=np.uint64)
    for b in range(16):
        key |= ((x >> np.uint64(b)) & np.uint64(1)) << np.uint64(2 * b)
        key |= ((y >> np.uint64(b)) & np.uint64(1)) << np.uint64(2 * b + 1)
    return key


def read(path):
    """Returns (DataFrame with one row per station, variable descriptions, dataset attributes)."""
    ds = xr.open_dataset(path).isel(time=-1)  # latest time step
    df = pd.DataFrame({
        "station_id": [str(s) for s in ds["station"].values],
        "station_name": [str(n).strip() for n in ds["stationname"].values],
        "source": "KNMI",
        "time": pd.Timestamp(ds["time"].values).tz_localize("UTC").floor("ms"),
    })
    variables = {}
    for v in ds.data_vars:
        d = ds[v]
        if d.dims != ("station",) or v == "stationname":
            continue
        if d.dtype.kind in "US":
            df[v] = [str(x).strip() for x in d.values]  # e.g. wsi
        elif d.dtype.kind in "fiu":
            df[v] = d.values.astype("float32")
            variables[v] = {k: str(d.attrs[k]) for k in META_KEYS if k in d.attrs}
    for v in ("lon", "lat"):
        df[v] = ds[v].values.astype("float64")
        variables[v] = {k: str(ds[v].attrs[k]) for k in META_KEYS if k in ds[v].attrs}
    return df, variables, ds.attrs


args = sys.argv[1:]
out = "web/obs.parquet"
if "-o" in args:
    i = args.index("-o")
    out = args[i + 1]
    del args[i:i + 2]
if not args:
    sys.exit(__doc__)

frames, variables, attrs = [], {}, {}
for p in args:
    df, v, a = read(p)
    frames.append(df)
    variables.update(v)
    attrs = attrs or dict(a)
df = pd.concat(frames, ignore_index=True)
df = df.drop_duplicates(["source", "station_id"], keep="last")
df = df[df["lon"].between(-180, 180) & df["lat"].between(-90, 90)]
df = df.iloc[np.argsort(morton(df["lon"], df["lat"]), kind="stable")].reset_index(drop=True)

gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df["lon"], df["lat"]), crs="EPSG:4326")
gdf.to_parquet(out, index=False, schema_version="1.1.0", write_covering_bbox=True, compression="snappy")

# Rewrite with small row groups and the variable descriptions (long name, units) in the file metadata
table = pq.read_table(out)
meta = dict(table.schema.metadata or {})
meta[b"knmi:variables"] = json.dumps(variables, ensure_ascii=False).encode()
meta[b"knmi:dataset"] = json.dumps(
    {k: str(attrs[k]) for k in ("title", "institution", "source", "references", "Conventions") if k in attrs},
    ensure_ascii=False,
).encode()
pq.write_table(table.replace_schema_metadata(meta), out, row_group_size=ROW_GROUP, compression="snappy", write_statistics=True)
print(len(variables), "variables,", len(gdf), "stations ->", out)
