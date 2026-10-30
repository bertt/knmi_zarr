# knmi_zar

KNMI 10-minute weather observations → **Zarr** → interactive **MapLibre** map.

🌍 **Live demo: https://bertt.github.io/knmi_zar/**

The demo reads the Zarr store directly in the browser (via [zarrita.js](https://github.com/manzt/zarrita.js)) and shows all KNMI automatic weather stations (including the Caribbean Netherlands) on a map: temperature, wind (with arrows), humidity, pressure, visibility, cloud cover, radiation and more.

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

## Deployment

GitHub Pages serves the `web/` folder through the workflow in `.github/workflows/pages.yml` on every push to `main`.

## Data & license

Data © KNMI, available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Basemap © OpenStreetMap contributors © CARTO.
