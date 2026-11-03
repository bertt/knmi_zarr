import shutil, sys
import numpy as np
import xarray as xr

CHUNK = 512  # stations per chunk; stations are sorted along a Z-order curve, so a chunk is a compact area


def morton(lon, lat):
    """Z-order (Morton) key of lon/lat on a 16-bit grid; nearby stations get nearby keys."""
    x = np.clip((np.asarray(lon) + 180) / 360 * 65535, 0, 65535).astype(np.uint64)
    y = np.clip((np.asarray(lat) + 90) / 180 * 65535, 0, 65535).astype(np.uint64)
    key = np.zeros(len(x), dtype=np.uint64)
    for b in range(16):
        key |= ((x >> np.uint64(b)) & np.uint64(1)) << np.uint64(2 * b)
        key |= ((y >> np.uint64(b)) & np.uint64(1)) << np.uint64(2 * b + 1)
    return key


src = sys.argv[1]
ds = xr.open_dataset(src)
ds = ds.drop_vars([v for v in ds.data_vars if ds[v].dtype.kind in "US" and ds[v].ndim == 0])

# Station id and name are stored as string coordinates next to lat, lon and height
codes = np.array([str(s) for s in ds["station"].values], dtype=object)  # object = variable-length string (vlen-utf8)
names = np.array([str(n).strip() for n in ds["stationname"].values], dtype=object)
ds = ds.drop_vars("stationname")

# Sort the stations spatially and use the position as numeric `station` index
order = np.argsort(morton(ds["lon"].values, ds["lat"].values), kind="stable")
ds = ds.isel(station=order)
codes, names = codes[order], names[order]
n = len(codes)
ds = ds.assign_coords(station=np.arange(n), station_id=("station", codes), station_name=("station", names))
for c in list(ds.variables):  # other string variables (e.g. wsi) also as vlen-utf8, which browsers can read
    if ds[c].dtype.kind in "US":
        ds[c] = ds[c].astype(object)
ds["station_id"].attrs["long_name"] = "station id (stable identifier; the position in this store can change)"
ds["station_name"].attrs["long_name"] = "station name"

# Bounding box of every station chunk: lets a client read only the chunks in its area
lon, lat = ds["lon"].values, ds["lat"].values
ds.attrs["station_chunk_size"] = CHUNK
ds.attrs["station_chunk_bbox"] = [
    [float(lon[i:i + CHUNK].min()), float(lat[i:i + CHUNK].min()), float(lon[i:i + CHUNK].max()), float(lat[i:i + CHUNK].max())]
    for i in range(0, n, CHUNK)
]

def chunks(v):
    return tuple(min(CHUNK, n) if d == "station" else 1 if d == "time" else s for d, s in zip(v.dims, v.shape))

shutil.rmtree("web/obs.zarr", ignore_errors=True)
enc = {v: {"chunks": chunks(ds[v])} for v in ds.variables if "station" in ds[v].dims}
for v in ds.data_vars:
    enc.setdefault(v, {})["compressors"] = None
for c in ds.coords:
    enc.setdefault(c, {})["compressors"] = None
enc["time"] = {"compressors": None, "units": "seconds since 1970-01-01T00:00:00", "dtype": "int64"}
ds.to_zarr("web/obs.zarr", mode="w", zarr_format=3, consolidated=True, encoding=enc)
print(len(ds.data_vars), "variables,", n, "stations")
