# knmi_zarr

KNMI 10-minute weather observations → **GeoParquet** → interactive **MapLibre** map.

🌍 **Live demo: https://bertt.github.io/knmi_zarr/**

The demo reads the GeoParquet file directly in the browser (via [hyparquet](https://github.com/hyparam/hyparquet)) and shows all KNMI automatic weather stations (including the Caribbean Netherlands) on a map. The file contains one row per station with 90 numeric observation columns (a description of every variable is in [VARIABLES.md](VARIABLES.md)); the demo currently shows 21 of them, grouped by category: temperature, precipitation, wind, humidity & pressure, and sun, clouds & visibility. The file is prepared for stations from all over the world (spatially sorted, bbox-queryable row groups, see step 2).

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

### 2. Convert NetCDF → GeoParquet

```powershell
uv run --with xarray --with netcdf4 --with geopandas --with pyarrow --with numpy python convert.py KMDS__OPER_P___10M_OBS_L2_202610302250.nc
```

`convert.py` writes `web/obs.parquet` (use `-o <file>` for another path): a [GeoParquet](https://geoparquet.org/) 1.1 file with **one row per station** and all numeric variables as nullable columns (see [VARIABLES.md](VARIABLES.md) for the variable names), compressed with snappy. There is no separate stations file: everything is in this one file. It can be opened in QGIS, GeoPandas, DuckDB and other GeoParquet tools.

Columns:

- `station_id` (string, the KNMI station code; the stable identity), `station_name`, `source` (network, e.g. `KNMI`) and `wsi`,
- `lat`, `lon` and `height` (station height in m) as plain columns, plus `geometry` (WKB point, EPSG:4326) and `bbox` (GeoParquet covering column),
- `time`: the observation time (UTC timestamp),
- the 90 observation variables as `float32` columns (missing value = null). The long name, units and standard name of every variable are stored as JSON in the file metadata (key `knmi:variables`; dataset attributes in `knmi:dataset`).

Stations without a temperature measurement (`ta` is null) are left out of the file.

#### NetCDF vs GeoParquet size

The KNMI NetCDF file holds a single time step (not a time series) for all stations. Example run (`KMDS__OPER_P___10M_OBS_L2_202611032140.nc`):

| Format | Size (bytes) | Stations |
|---|---|---|
| NetCDF | 156,175 | 57 |
| GeoParquet (`obs.parquet`) | 95,902 (about 39% smaller) | 48 |

The 9 stations without temperature are dropped from the GeoParquet.

#### Spatial indexing and worldwide stations

The file is designed so that stations from all over the world can be added, while a user usually wants only a small area:

1. **Z-order (Morton) sort:** lon/lat are quantized to a 16-bit grid (about 0.0055° in longitude, 0.0027° in latitude) and their bits are interleaved into one key. Sorting the stations by this key puts stations that are close together next to each other.
2. **Row groups:** the rows are written in row groups of 512 stations. Because of the sort, a row group covers a compact area, and Parquet stores the min/max of `lon` and `lat` of every row group in the file footer (statistics).
3. **Several sources:** `convert.py a.nc b.nc ...` merges the stations of several files (union of the columns, missing values are null; `source` + `station_id` is unique). Stations outside the KNMI network simply have other or missing variables.

A client reads a region like this:

1. Read the footer (metadata and row group statistics) and the small `lon`/`lat` columns, using HTTP range requests.
2. Select the row groups whose lon/lat range intersects the area of interest.
3. Read only those row groups of the other columns.

In `web/stations.js` this is `loadStations({ bbox: [west, south, east, north] })` (using [hyparquet](https://github.com/hyparam/hyparquet)). Stations outside the selected row groups keep their `lon`/`lat` but have `id`, `name`, `height` and values set to `null`. Without a bbox all stations are read; the pages do this now, since there are fewer than 512 stations (one row group).

Notes: a Z-order row group can span a larger area than the stations in it suggest (the curve jumps), so the row group areas may overlap and a query can read a few extra row groups. Always identify a station by `source` + `station_id`.

### 2b. Download + convert in one go

To fetch the most recent observations and convert them to `web/obs.parquet` in one command (the API key is only set for this PowerShell session and never committed):

```powershell
$env:KNMI_API_KEY = "<your key>"
$nc = uv run --with requests python download.py | Select-Object -Last 1
uv run --with xarray --with netcdf4 --with geopandas --with pyarrow --with numpy python convert.py $nc
```

`download.py` prints the downloaded filename, which is passed to `convert.py`. If the API answers `429 Too Many Requests`, the key's rate limit is exhausted: wait a while and retry (see the fair use policy below). To view the result locally, see "Configuration" in step 3.

### 3. Visualize with MapLibre

`web/index.html` is a static page (no build step) that:

- opens the GeoParquet file with hyparquet and reads the selected variables,
- renders stations on a MapLibre GL JS map (Carto dark basemap) as colored circles, labels and wind arrows,
- offers variable switching, a legend, statistics, a station list and detail popups.

Run locally (must be served over HTTP):

```powershell
cd web
python -m http.server 8765   # open http://localhost:8765
```

**Configuration:** all three pages (map, nearby, cycling) read the GeoParquet URL from one file, [`web/config.json`](web/config.json):

```json
{ "parquet": "obs.parquet" }
```

- The value is an absolute URL or a path relative to the config file. The default `obs.parquet` is the file next to the pages: on GitHub Pages that is <https://bertt.github.io/knmi_zarr/obs.parquet>, locally it is your own `web/obs.parquet` (step 2 / 2b). So local development needs no changes.
- To read another file, use its URL, e.g. `{ "parquet": "https://bertt.github.io/knmi_zarr/obs.parquet" }` (a file on another origin must allow CORS and range requests).
- Another config file can be used per page with the URL parameter `?config=<file or url>` (relative to the page), e.g. `cycling.html?config=my-config.json&station=De%20Bilt`. The parameter is passed on automatically in the links between the pages, so you stay on the same data while navigating.
- **Errors:** if the config file or the GeoParquet file cannot be found, the page shows a message such as `GeoParquet file not found at http://localhost:8765/obs.parquet (...). Check the "parquet" URL in the config file ... or create the data with convert.py.` instead of an empty page.

### 4. Weather near you (`web/nearby.html`)

🌦️ **Live: <https://bertt.github.io/knmi_zarr/nearby.html>**

A second static page that shows the weather at your location as a card with a weather icon. It uses the same GeoParquet file (`obs.parquet`) as the map, including the stations, read in the browser with hyparquet (via the shared module `web/stations.js`). There is no server and no API key.

How it works:

1. The browser location (`navigator.geolocation`) is requested. It never leaves the browser.
2. The data is read from the GeoParquet URL in `web/config.json` (default `obs.parquet`, i.e. the file next to the page).
3. The distance to every station that reports a temperature is calculated (haversine); the nearest one is used.
4. The icon and theme are derived from the observations:
   - thunderstorm, rain, snow or sleet from precipitation intensity (`rg`, `pg`), temperature and the present-weather code (`ww`),
   - fog from visibility (`vv` < 1 km) or `ww`,
   - sun, partly cloudy or cloudy from cloud cover (`n`, in oktas; falls back to global radiation `qg`),
   - sun or moon from the sun's elevation at the station, computed from the observation time.
5. The card shows temperature, wind speed and direction, gusts, humidity, dew point, pressure, visibility and rainfall. The background colour follows the weather.
6. Outside the Netherlands (nearest station more than 150 km away) or without location permission, **De Bilt** (the KNMI main station, in Utrecht) is shown, with a notice.

The page links to KNMI (source), the CC BY 4.0 license, the GeoParquet URL it reads (`https://bertt.github.io/knmi_zarr/obs.parquet`) and this repository, and states that the data is converted and not an official KNMI product.

A station picker lets you switch to any of the 56 stations (distance is shown when the location is known).

### 5. Cycling weather (`web/cycling.html`)

🚴 **Live: <https://bertt.github.io/knmi_zarr/cycling.html>**

A third page that turns the same GeoParquet data (<https://bertt.github.io/knmi_zarr/obs.parquet>, read in the browser with hyparquet) into cycling advice for the nearest (or a chosen) station:

- **Ride score** (0-100): one score that combines comfort and training (the average of both). Sun and dry is good; rain, extreme cold or heat, storm-force wind and poor visibility are bad; moderate wind and cold count as a small plus for training. The rules are listed in the calculation details.
- **What to wear**: based on the temperature *on the bike* (air temperature about 2 °C lower, extra for rain, damp air via the dew point and wind chill), e.g. short/short above 15 °C, gloves and skullcap below 10 °C, windjacket below 12 °C, windjacket + base layer below 0 °C. Extras for rain, darkness, sun and ice.
- **Feels-like temperature**: a 🧊 pill shows a standard formula next to the temperature on the bike: wind chill `13.12 + 0.6215·T − 11.37·v^0.16 + 0.3965·T·v^0.16` (T ≤ 10 °C, wind > 4.8 km/h, v = 10 m wind in km/h) or the heat index (T ≥ 27 °C, uses relative humidity). It is hidden when neither formula applies (e.g. calm wind, or 10–27 °C). It ignores riding speed, darkness and wind direction, so it is usually milder than the temperature on the bike.
- **Thick wind ("dikke wind")**: a 🪨 pill flags cold, high-pressure air, which is denser and gives more air resistance ([background](https://www.allesoverwielrennen.nl/dikke-wind/)). The air density is computed from temperature, pressure and humidity and compared with standard air (1.225 kg/m³): +3.5% or more is "thick wind", +7% or more "very thick wind", −3.5% or less "thin wind"; in between nothing is shown. At 1013 hPa and dry air that is roughly ≤ 5 °C for thick and ≤ −5 °C for very thick; higher pressure shifts this a few degrees warmer. The density is `ρ = (p_d·100)/(287.05·T) + (e·100)/(461.5·T)` in kg/m³, with `T = ta + 273.15` (K), `e = es·rh/100` (vapour pressure, hPa), `p_d = pp − e` (dry-air pressure, hPa) and `es = 6.1078·10^(7.5·ta/(ta+237.3))` (Magnus formula); the input columns are `ta` (°C), `pp` (hPa) and `rh` (%). The relative difference is `(ρ / 1.225 − 1)·100`. The thresholds are hard-coded in `web/cycling.html`, not in the rules file.
- **Bike cleaning**: estimate from rain now, the last 1/6/24 hours and salt risk.

All rules and thresholds live in [`web/cycling-rules.json`](web/cycling-rules.json), so they can be tuned without touching the code. Rules are `bands` (`upTo` value, `points`, `note`; `upTo: null` = everything above), clothing bands/extras, and cleaning rules/levels. The page has these URL parameters:

| Parameter | Example | Meaning |
|---|---|---|
| `station` | `cycling.html?station=De%20Bilt` | Show this station (exact KNMI station name, case-insensitive) instead of the one nearest to you. The URL is updated when you pick another station in the drop-down, so you can share a link. An unknown name falls back to the nearest station. |
| `rules` | `cycling.html?rules=<url-to-json>` | Load your own rules file instead of `cycling-rules.json`. |

Parameters can be combined, e.g. `cycling.html?station=Rotterdam&rules=my-rules.json`. The page has a "How were these scores calculated?" section showing every rule's contribution. The advice is indicative only.

Source data: [KNMI 10-minute in-situ meteorological observations](https://dataplatform.knmi.nl/dataset/10-minute-in-situ-meteorological-observations-1-0), © KNMI, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Converted to GeoParquet here; not an official KNMI product. The page footer repeats this attribution and links to the GeoParquet file (<https://bertt.github.io/knmi_zarr/obs.parquet>).

### 6. Read the latest observations from the online GeoParquet (Python)

`latest.py` shows that the published GeoParquet file can be used directly in a process, without a KNMI API key or a server. It downloads `https://bertt.github.io/knmi_zarr/obs.parquet` (one row per station, a few tens of kB), finds a station by name (default `De Bilt`, the KNMI station in Utrecht) and prints the latest measurements of that station with their units.

```powershell
uv run --with geopandas --with pyarrow python latest.py
uv run --with geopandas --with pyarrow python latest.py "Schiphol"
```

How the code works:

1. `gpd.read_parquet(...)` reads the file into a GeoDataFrame (one row per station, with a `geometry` column).
2. The station name is matched (case-insensitive, partial match) against `station_name`.
3. The variable descriptions (long name, units) come from the file metadata key `knmi:variables`.
4. The numeric variables of that row are printed with long name and units; missing values (null/NaN) are skipped.

```python
gdf = gpd.read_parquet("obs.parquet")
row = gdf[gdf["station_name"] == "De Bilt"].iloc[0]
print(row["ta"])  # air temperature
```

## Deployment

GitHub Pages serves the `web/` folder through the workflow in `.github/workflows/pages.yml` on every push to `main`, manually, and hourly (`cron`). Each run downloads the latest KNMI file, converts it to `web/obs.parquet`, and deploys. Add your API key as repository secret `KNMI_API_KEY` (Settings → Secrets and variables → Actions). Add your API key as repository secret `KNMI_API_KEY` (Settings → Secrets and variables → Actions).

### GitHub Actions

The workflow `.github/workflows/pages.yml` ("Deploy web to GitHub Pages") automates the whole pipeline, so no server is needed. It runs:

- every hour (`cron: "7 * * * *"`),
- on every push to `main`,
- manually (`workflow_dispatch`).

Steps of the single `deploy` job (Ubuntu runner):

1. **Checkout** the repository and set up [uv](https://github.com/astral-sh/uv).
2. **Download** the latest KNMI NetCDF file with `download.py`, using the `KNMI_API_KEY` repository secret. The filename is passed to the next step via `NC_FILE`.
3. **Convert** the NetCDF file to `web/obs.parquet` with `convert.py`.
4. **Publish**: `web/` is uploaded as a Pages artifact (`upload-pages-artifact`) and deployed with `deploy-pages`.

The `concurrency` group `pages` cancels a still-running deployment when a new one starts, so the site is never more than about an hour old. The workflow needs the permissions `contents: read`, `pages: write` and `id-token: write`, and GitHub Pages must be set to the source *GitHub Actions* (Settings → Pages).

## Data & license

**Source:** [KNMI](https://www.knmi.nl/) (Royal Netherlands Meteorological Institute), dataset [Near real-time 10-minute automated in-situ ground-based meteorological observations in the Netherlands](https://dataplatform.knmi.nl/dataset/10-minute-in-situ-meteorological-observations-1-0), via the KNMI Data Platform Open Data API.

**License:** the KNMI dataset is published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (verified on the dataset page). This allows use, adaptation and redistribution, also commercially, as long as KNMI is credited as the source. Please credit: *"Source: KNMI"* with a link to the dataset above.

**Modified data:** `web/obs.parquet` is derived from the KNMI NetCDF files (converted to GeoParquet, stations sorted spatially and stored in row groups). It is not an official KNMI product and may lag behind the original data by up to an hour.

The KNMI [fair use policy](https://developer.dataplatform.knmi.nl/fair-use) applies: the API key is kept in a repository secret (never published), and the workflow downloads one file per hour.

Basemap © OpenStreetMap contributors © CARTO.
