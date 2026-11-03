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
uv run --with xarray --with netcdf4 --with zarr --with numpy --with pyarrow --with shapely python convert.py KMDS__OPER_P___10M_OBS_L2_202610302250.nc
```

`convert.py` writes:

- `web/obs.zarr`: Zarr v3 store with all numeric variables (`station × time`), uncompressed (the data is tiny). Zarr v3 is used because it has no dot-files, which GitHub Pages artifacts would otherwise drop.
- `web/stations.parquet`: [GeoParquet](https://geoparquet.org/) 1.1 file with one row per station: the columns `id`, `name`, `height` and a `geometry` column (WKB Point, lon/lat, WGS84/CRS84; string variables can't be read by the browser from Zarr). The row order equals the `station` index in the Zarr store. The observation `time` and the `variables` (long name and units) are stored as JSON in the extra file-level metadata key `knmi`. The file is snappy-compressed (the codec [hyparquet](https://github.com/hyparam/hyparquet) supports in the browser). It can be opened directly in QGIS, GeoPandas, DuckDB, etc., e.g. `geopandas.read_parquet("web/stations.parquet")`.

### 2b. Download + convert in one go

To fetch the most recent observations and convert them to `web/obs.zarr` and `web/stations.parquet` in one command (the API key is only set for this PowerShell session and never committed):

```powershell
$env:KNMI_API_KEY = "<your key>"
$nc = uv run --with requests python download.py | Select-Object -Last 1
uv run --with xarray --with netcdf4 --with zarr --with numpy --with pyarrow --with shapely python convert.py $nc
```

`download.py` prints the downloaded filename, which is passed to `convert.py`. If the API answers `429 Too Many Requests`, the key's rate limit is exhausted: wait a while and retry (see the fair use policy below). To view the result locally, see "Configuration" in step 3.

### 3. Visualize with MapLibre

`web/index.html` is a static page (no build step) that:

- opens the Zarr store with zarrita.js and reads the selected variables,
- renders stations on a MapLibre GL JS map (Carto dark basemap) as colored circles, labels and wind arrows,
- offers variable switching, a legend, statistics, a station list and detail popups.

Run locally (must be served over HTTP):

```powershell
cd web
python -m http.server 8765   # open http://localhost:8765
```

**Configuration:** all three pages (map, nearby, cycling) read the Zarr URL from one file, [`web/config.json`](web/config.json):

```json
{ "zarr": "obs.zarr" }
```

- The value is an absolute URL or a path relative to the config file. The default `obs.zarr` is the store next to the pages: on GitHub Pages that is <https://bertt.github.io/knmi_zarr/obs.zarr>, locally it is your own `web/obs.zarr` (step 2 / 2b). So local development needs no changes.
- `stations.parquet` is expected in the same folder as the Zarr store.
- To read another store, use its URL, e.g. `{ "zarr": "https://bertt.github.io/knmi_zarr/obs.zarr" }` (a store on another origin must allow CORS).
- Another config file can be used per page with the URL parameter `?config=<file or url>` (relative to the page), e.g. `cycling.html?config=my-config.json&station=De%20Bilt`. The parameter is passed on automatically in the links between the pages, so you stay on the same data while navigating.
- **Errors:** if the config file, the Zarr store (`<zarr>/zarr.json`) or `stations.parquet` cannot be found, the page shows a message such as `Zarr store not found at http://localhost:8765/obs.zarr (HTTP 404). Check the "zarr" URL in the config file ... or create the data with convert.py.` instead of an empty page.

### 4. Weather near you (`web/nearby.html`)

🌦️ **Live: <https://bertt.github.io/knmi_zarr/nearby.html>**

A second static page that shows the weather at your location as a card with a weather icon. It uses the same Zarr store (`obs.zarr`) and `stations.parquet` as the map, read in the browser with zarrita.js and hyparquet (via the shared module `web/stations.js`, which decodes the WKB geometry). There is no server and no API key.

How it works:

1. The browser location (`navigator.geolocation`) is requested. It never leaves the browser.
2. The data is read from the Zarr URL in `web/config.json` (default `obs.zarr`, i.e. the store next to the page, with `stations.parquet` next to it).
3. The distance to every station that reports a temperature is calculated (haversine); the nearest one is used.
4. The icon and theme are derived from the observations:
   - thunderstorm, rain, snow or sleet from precipitation intensity (`rg`, `pg`), temperature and the present-weather code (`ww`),
   - fog from visibility (`vv` < 1 km) or `ww`,
   - sun, partly cloudy or cloudy from cloud cover (`n`, in oktas; falls back to global radiation `qg`),
   - sun or moon from the sun's elevation at the station, computed from the observation time.
5. The card shows temperature, wind speed and direction, gusts, humidity, dew point, pressure, visibility and rainfall. The background colour follows the weather.
6. Outside the Netherlands (nearest station more than 150 km away) or without location permission, **De Bilt** (the KNMI main station, in Utrecht) is shown, with a notice.

The page links to KNMI (source), the CC BY 4.0 license, the Zarr store URL it reads (`https://bertt.github.io/knmi_zarr/obs.zarr`) and this repository, and states that the data is converted and not an official KNMI product.

A station picker lets you switch to any of the 56 stations (distance is shown when the location is known).

### 5. Cycling weather (`web/cycling.html`)

🚴 **Live: <https://bertt.github.io/knmi_zarr/cycling.html>**

A third page that turns the same Zarr data (<https://bertt.github.io/knmi_zarr/obs.zarr>, read in the browser with zarrita.js) into cycling advice for the nearest (or a chosen) station:

- **Ride score** (0-100): one score that combines comfort and training (the average of both). Sun and dry is good; rain, extreme cold or heat, storm-force wind and poor visibility are bad; moderate wind and cold count as a small plus for training. The rules are listed in the calculation details.
- **What to wear**: based on the temperature *on the bike* (air temperature about 2 °C lower, extra for rain, damp air via the dew point and wind chill), e.g. short/short above 15 °C, gloves and skullcap below 10 °C, windjacket below 12 °C, windjacket + base layer below 0 °C. Extras for rain, darkness, sun and ice.
- **Bike cleaning**: estimate from rain now, the last 1/6/24 hours and salt risk.

All rules and thresholds live in [`web/cycling-rules.json`](web/cycling-rules.json), so they can be tuned without touching the code. Rules are `bands` (`upTo` value, `points`, `note`; `upTo: null` = everything above), clothing bands/extras, and cleaning rules/levels. The page has these URL parameters:

| Parameter | Example | Meaning |
|---|---|---|
| `station` | `cycling.html?station=De%20Bilt` | Show this station (exact KNMI station name, case-insensitive) instead of the one nearest to you. The URL is updated when you pick another station in the drop-down, so you can share a link. An unknown name falls back to the nearest station. |
| `rules` | `cycling.html?rules=<url-to-json>` | Load your own rules file instead of `cycling-rules.json`. |

Parameters can be combined, e.g. `cycling.html?station=Rotterdam&rules=my-rules.json`. The page has a "How were these scores calculated?" section showing every rule's contribution. The advice is indicative only.

Source data: [KNMI 10-minute in-situ meteorological observations](https://dataplatform.knmi.nl/dataset/10-minute-in-situ-meteorological-observations-1-0), © KNMI, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Converted to Zarr here; not an official KNMI product. The page footer repeats this attribution and links to the Zarr store (<https://bertt.github.io/knmi_zarr/obs.zarr>).

### 6. Read the latest observations from the online Zarr (Python)

`latest.py` shows that the published Zarr store can be used directly in a process, without a KNMI API key or a server. It reads `stations.parquet` to find a station by name (default `De Bilt`, the KNMI station in Utrecht), opens `https://bertt.github.io/knmi_zarr/obs.zarr` with xarray and prints the latest measurements of that station with their units.

```powershell
uv run --with xarray --with zarr --with requests --with fsspec --with aiohttp --with pyarrow --with shapely python latest.py
uv run --with xarray --with zarr --with requests --with fsspec --with aiohttp --with pyarrow --with shapely python latest.py "Schiphol"
```

How the code works:

1. `stations.parquet` is fetched with `requests` and read with pyarrow; the WKB geometry is decoded with shapely and the station name is matched (case-insensitive, partial match) to get its index. In the Zarr store, stations are stored by numeric index.
2. `xr.open_zarr(".../obs.zarr", consolidated=True, zarr_format=3)` opens the store lazily over HTTP, so only the needed chunks are downloaded.
3. `ds.isel(station=idx, time=-1)` selects the station and the latest time step.
4. The numeric variables listed in the `knmi` metadata of `stations.parquet` are printed with their long name and unit; missing values (NaN) are skipped.

```python
ds = xr.open_zarr(f"{BASE}/obs.zarr", consolidated=True, zarr_format=3)
row = ds.isel(station=idx, time=-1)
print(row["ta"].values)  # air temperature
```
## Deployment

GitHub Pages serves the `web/` folder through the workflow in `.github/workflows/pages.yml` on every push to `main`, manually, and hourly (`cron`). Each run downloads the latest KNMI file, converts it to `web/obs.zarr` and `web/stations.parquet`, and deploys. Add your API key as repository secret `KNMI_API_KEY` (Settings → Secrets and variables → Actions).

### GitHub Actions

The workflow `.github/workflows/pages.yml` ("Deploy web to GitHub Pages") automates the whole pipeline, so no server is needed. It runs:

- every hour (`cron: "7 * * * *"`),
- on every push to `main`,
- manually (`workflow_dispatch`).

Steps of the single `deploy` job (Ubuntu runner):

1. **Checkout** the repository and set up [uv](https://github.com/astral-sh/uv).
2. **Download** the latest KNMI NetCDF file with `download.py`, using the `KNMI_API_KEY` repository secret. The filename is passed to the next step via `NC_FILE`.
3. **Convert** the NetCDF file to `web/obs.zarr` and `web/stations.parquet` with `convert.py`.
4. **Publish**: `web/` is uploaded as a Pages artifact (`upload-pages-artifact`) and deployed with `deploy-pages`.

The `concurrency` group `pages` cancels a still-running deployment when a new one starts, so the site is never more than about an hour old. The workflow needs the permissions `contents: read`, `pages: write` and `id-token: write`, and GitHub Pages must be set to the source *GitHub Actions* (Settings → Pages).

## Data & license

**Source:** [KNMI](https://www.knmi.nl/) (Royal Netherlands Meteorological Institute), dataset [Near real-time 10-minute automated in-situ ground-based meteorological observations in the Netherlands](https://dataplatform.knmi.nl/dataset/10-minute-in-situ-meteorological-observations-1-0), via the KNMI Data Platform Open Data API.

**License:** the KNMI dataset is published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (verified on the dataset page). This allows use, adaptation and redistribution, also commercially, as long as KNMI is credited as the source. Please credit: *"Source: KNMI"* with a link to the dataset above.

**Modified data:** `web/obs.zarr` and `web/stations.parquet` are derived from the KNMI NetCDF files (converted to Zarr, string variables moved to GeoParquet). They are not official KNMI products and may lag behind the original data by up to an hour.

The KNMI [fair use policy](https://developer.dataplatform.knmi.nl/fair-use) applies: the API key is kept in a repository secret (never published), and the workflow downloads one file per hour.

Basemap © OpenStreetMap contributors © CARTO.
