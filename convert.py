import json, shutil, sys
import numpy as np
import xarray as xr

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
    "stations": stations,
    "variables": {
        v: {
            "long_name": ds[v].attrs.get("long_name", v),
            "units": ds[v].attrs.get("units", ""),
        }
        for v in ds.data_vars
        if ds[v].dtype.kind == "f" and ds[v].dims == ("station", "time")
    },
}
json.dump(meta, open("web/stations.json", "w"), ensure_ascii=False)

num = ds.drop_vars("stationname")
num = num.assign_coords(station=np.arange(len(codes)))  # numeric index; ids are in stations.json
shutil.rmtree("web/obs.zarr", ignore_errors=True)
enc = {v: {"compressors": None} for v in num.data_vars}
enc.update({c: {"compressors": None} for c in num.coords})
num.to_zarr("web/obs.zarr", mode="w", zarr_format=3, consolidated=True, encoding=enc)
print(len(meta["variables"]), "variables,", len(stations), "stations")
