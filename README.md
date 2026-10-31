# knmi_zarr

KNMI 10-minute weather observations → **Zarr** → interactive **MapLibre** map.

🌍 **Live demo: https://bertt.github.io/knmi_zarr/**

The demo reads the Zarr store directly in the browser (via [zarrita.js](https://github.com/manzt/zarrita.js)) and shows all KNMI automatic weather stations (including the Caribbean Netherlands) on a map. The Zarr store contains 90 numeric `station × time` variables; the demo currently shows 21 of them, grouped by category: temperature, precipitation, wind, humidity & pressure, and sun, clouds & visibility.

## Pipeline

### 1. Download from KNMI

Data comes from the KNMI Data Platform dataset
[`10-minute-in-situ-meteorological-observations`](https://dataplatform.knmi.nl/dataset/10-minute-in-situ-meteorological-observations-1-0) (NetCDF, one file per 10 minutes, 56 stations).

1. Request a free Open Data API key at <https://developer.dataplatform.knmi.nl/open-data-api>.
2. Expose it as an environment variable (never commit it):

   ```powershell
   $env:KNMI_API_KEY = "<your key>"
   ```

3. Download the latest file:

   ```powershell
   uv run --with requests python download.py
   ```

   This calls `GET /datasets/10-minute-in-situ-meteorological-observations/versions/1.0/files` (newest first), then `GET .../files/{filename}/url` for a temporary download URL, and saves e.g. `KMDS__OPER_P___10M_OBS_L2_202610302250.nc`.

### 2. Convert NetCDF → Zarr

```powershell
uv run --with xarray --with netcdf4 --with zarr --with numpy python convert.py KMDS__OPER_P___10M_OBS_L2_202610302250.nc
```

`convert.py` writes:

- `web/obs.zarr`: Zarr v3 store with all numeric variables (`station × time`), uncompressed (the data is tiny). Zarr v3 is used because it has no dot-files, which GitHub Pages artifacts would otherwise drop.
- `web/stations.json`: station ids, names, coordinates and height (string variables can't be read by the browser from Zarr).

### 3. Visualize with MapLibre

`web/index.html` is a static page (no build step) that:

- opens `obs.zarr` with zarrita.js and reads the selected variables,
- renders stations on a MapLibre GL JS map (Carto dark basemap) as colored circles, labels and wind arrows,
- offers variable switching, a legend, statistics, a station list and detail popups.

Run locally (must be served over HTTP):

```powershell
cd web
python -m http.server 8765   # open http://localhost:8765
```

### 4. Read the latest observations from the online Zarr (Python)

`latest.py` shows that the published Zarr store can be used directly in a process, without a KNMI API key or a server. It reads `stations.json` to find a station by name (default `De Bilt`, the KNMI station in Utrecht), opens `https://bertt.github.io/knmi_zarr/obs.zarr` with xarray and prints the latest measurements of that station with their units.

```powershell
uv run --with xarray --with zarr --with requests --with fsspec --with aiohttp python latest.py
uv run --with xarray --with zarr --with requests --with fsspec --with aiohttp python latest.py "Schiphol"
```

How the code works:

1. `stations.json` is fetched with `requests` and the station name is matched (case-insensitive, partial match) to get its index. In the Zarr store, stations are stored by numeric index.
2. `xr.open_zarr(".../obs.zarr", consolidated=True, zarr_format=3)` opens the store lazily over HTTP, so only the needed chunks are downloaded.
3. `ds.isel(station=idx, time=-1)` selects the station and the latest time step.
4. The numeric variables listed in `stations.json` are printed with their long name and unit; missing values (NaN) are skipped.

```python
ds = xr.open_zarr(f"{BASE}/obs.zarr", consolidated=True, zarr_format=3)
row = ds.isel(station=idx, time=-1)
print(row["ta"].values)  # air temperature
```
## Deployment

GitHub Pages serves the `web/` folder through the workflow in `.github/workflows/pages.yml` on every push to `main`, manually, and hourly (`cron`). Each run downloads the latest KNMI file, converts it to `web/obs.zarr` and `web/stations.json`, and deploys. Add your API key as repository secret `KNMI_API_KEY` (Settings → Secrets and variables → Actions).

### GitHub Actions

The workflow `.github/workflows/pages.yml` ("Deploy web to GitHub Pages") automates the whole pipeline, so no server is needed. It runs:

- every hour (`cron: "7 * * * *"`),
- on every push to `main`,
- manually (`workflow_dispatch`).

Steps of the single `deploy` job (Ubuntu runner):

1. **Checkout** the repository and set up [uv](https://github.com/astral-sh/uv).
2. **Download** the latest KNMI NetCDF file with `download.py`, using the `KNMI_API_KEY` repository secret. The filename is passed to the next step via `NC_FILE`.
3. **Convert** the NetCDF file to `web/obs.zarr` and `web/stations.json` with `convert.py`.
4. **Publish**: `web/` is uploaded as a Pages artifact (`upload-pages-artifact`) and deployed with `deploy-pages`.

The `concurrency` group `pages` cancels a still-running deployment when a new one starts, so the site is never more than about an hour old. The workflow needs the permissions `contents: read`, `pages: write` and `id-token: write`, and GitHub Pages must be set to the source *GitHub Actions* (Settings → Pages).

## Data & license

Data © KNMI, available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Basemap © OpenStreetMap contributors © CARTO.
