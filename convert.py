import json, shutil, sys
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import shapely
import xarray as xr


def write_stations(path, stations, meta):
    """Write stations as GeoParquet 1.1 (WKB points, EPSG:4326). Row order == station index in the zarr store.
    The observation time and variable descriptions are stored as extra file-level metadata ("knmi")."""
    geometry = shapely.to_wkb(shapely.points([[s["lon"], s["lat"]] for s in stations]))
    table = pa.table({
        "id": [s["id"] for s in stations],
        "name": [s["name"] for s in stations],
        "height": [s["height"] for s in stations],
        "geometry": pa.array(list(geometry), pa.binary()),
    })
    lons, lats = [s["lon"] for s in stations], [s["lat"] for s in stations]
    geo = {
        "version": "1.1.0",
        "primary_column": "geometry",
        "columns": {"geometry": {
            "encoding": "WKB",
            "geometry_types": ["Point"],  # no crs = OGC:CRS84 (lon/lat)
            "bbox": [min(lons), min(lats), max(lons), max(lats)],
        }},
    }
    table = table.replace_schema_metadata({
        "geo": json.dumps(geo),
        "knmi": json.dumps(meta, ensure_ascii=False),
    })
    pq.write_table(table, path, compression="snappy")  # snappy: supported by hyparquet in the browser

src = sys.argv[1]
ds = xr.open_dataset(src)
ds = ds.drop_vars([v for v in ds.data_vars if ds[v].dtype.kind in "US" and ds[v].ndim == 0])

# Numeric variables only in the zarr (string vars go to a JSON sidecar for the web demo)
names = [str(n).strip() for n in ds["stationname"].values]
codes = [str(s) for s in ds["station"].values]
stations = [
    {"id": c, "name": n, "lat": float(la), "lon": float(lo), "height": float(h)}
    for c, n, la, lo, h in zip(codes, names, ds["lat"].values, ds["lon"].values, ds["height"].values)
]
meta = {
    "time": str(ds["time"].values[0])[:16] + "Z",
    "variables": {
        v: {
            "long_name": ds[v].attrs.get("long_name", v),
            "units": ds[v].attrs.get("units", ""),
        }
        for v in ds.data_vars
        if ds[v].dtype.kind == "f" and ds[v].dims == ("station", "time")
    },
}
write_stations("web/stations.parquet", stations, meta)

num = ds.drop_vars("stationname")
num = num.assign_coords(station=np.arange(len(codes)))  # numeric index; ids are in stations.parquet
shutil.rmtree("web/obs.zarr", ignore_errors=True)
enc = {v: {"compressors": None} for v in num.data_vars}
enc.update({c: {"compressors": None} for c in num.coords})
num.to_zarr("web/obs.zarr", mode="w", zarr_format=3, consolidated=True, encoding=enc)
print(len(meta["variables"]), "variables,", len(stations), "stations")
