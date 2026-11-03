# knmi_zarr

KNMI 10-minute weather observations → **Zarr** → interactive **MapLibre** map.

🌍 **Live demo: https://bertt.github.io/knmi_zarr/**

The demo reads the Zarr store directly in the browser (via [zarrita.js](https://github.com/manzt/zarrita.js)) and shows all KNMI automatic weather stations (including the Caribbean Netherlands) on a map. The Zarr store contains 90 numeric `station × time` variables (a description of every variable is in [VARIABLES.md](VARIABLES.md)); the demo currently shows 21 of them, grouped by category: temperature, precipitation, wind, humidity & pressure, and sun, clouds & visibility.

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

`convert.py` writes `web/obs.zarr`: a Zarr v3 store with all numeric variables (`station × time`, see [VARIABLES.md](VARIABLES.md) for the variable names), uncompressed (the data is tiny). Zarr v3 is used because it has no dot-files, which GitHub Pages artifacts would otherwise drop. There is no separate stations file: everything is in this one store.

The stations are stored as coordinates on the `station` dimension, next to the observations:

- `station_id` (string, the KNMI station code) and `station_name` (string) as variable-length UTF-8 strings (`vlen-utf8`; read with zarrita.js ≥ 0.7, xarray and zarr-python),
- `lat`, `lon` and `height` (station height in m),
- `station` is a numeric index (the position in the store). **Use `station_id` as the stable identity**: the position can change when stations are added.
- `time` is stored as seconds since 1970-01-01; the long name and units of every variable are attributes of that variable (also in the consolidated metadata in the root `zarr.json`).

#### Spatial indexing (latitude/longitude)

Stations can be added worldwide, while a user usually wants only a small area. Zarr has no built-in spatial index, so `convert.py` builds one from the `lat`/`lon` values:

1. **Z-order (Morton) sort:** lon/lat are quantized to a 16-bit grid (about 0.0055° in longitude, 0.0027° in latitude) and their bits are interleaved into one key. Sorting the stations by this key puts stations that are close together next to each other along the `station` dimension.
2. **Chunking:** every array along `station` (`station_id`, `station_name`, `lat`, `lon`, `height` and all `station × time` variables) is chunked in blocks of 512 stations. Because of the sort, a chunk covers a compact area.
3. **Chunk index:** the root attributes of `obs.zarr/zarr.json` hold `station_chunk_size` (512) and `station_chunk_bbox`, a list with `[west, south, east, north]` per chunk.

A client reads a region like this:

1. Read `zarr.json` (consolidated metadata and the chunk index) and the small `lat`/`lon` arrays.
2. Select the chunks whose bbox intersects the area of interest.
3. Read only those chunks of `station_id`, `station_name`, `height` and the wanted variables (`zarr.get(arr, [zarr.slice(start, end), 0])`).

In `web/stations.js` this is `loadStations({ bbox: [west, south, east, north] })`. Stations outside the selected chunks keep their `lon`/`lat` but have `id`, `name` and `height` set to `null`. Without a bbox all stations are read; the pages do this now, since there are fewer than 512 stations (one chunk).

Notes: a Z-order chunk can span a larger area than the stations in it suggest (the curve jumps), so the chunk bboxes may overlap and a query can read a few extra chunks. The `station` index is the position after sorting and can change when stations are added, so always identify a station by `station_id`.

### 2b. Download + convert in one go

To fetch the most recent observations and convert them to `web/obs.zarr` in one command (the API key is only set for this PowerShell session and never committed):

```powershell
$env:KNMI_API_KEY = "<your key>"
$nc = uv run --with requests python download.py | Select-Object -Last 1
uv run --with xarray --with netcdf4 --with zarr --with numpy python convert.py $nc
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
- To read another store, use its URL, e.g. `{ "zarr": "https://bertt.github.io/knmi_zarr/obs.zarr" }` (a store on another origin must allow CORS).
- Another config file can be used per page with the URL parameter `?config=<file or url>` (relative to the page), e.g. `cycling.html?config=my-config.json&station=De%20Bilt`. The parameter is passed on automatically in the links between the pages, so you stay on the same data while navigating.
- **Errors:** if the config file or the Zarr store (`<zarr>/zarr.json`) cannot be found, the page shows a message such as `Zarr store not found at http://localhost:8765/obs.zarr (HTTP 404). Check the "zarr" URL in the config file ... or create the data with convert.py.` instead of an empty page.

### 4. Weather near you (`web/nearby.html`)

🌦️ **Live: <https://bertt.github.io/knmi_zarr/nearby.html>**

A second static page that shows the weather at your location as a card with a weather icon. It uses the same Zarr store (`obs.zarr`) as the map, including the stations, read in the browser with zarrita.js (via the shared module `web/stations.js`). There is no server and no API key.

How it works:

1. The browser location (`navigator.geolocation`) is requested. It never leaves the browser.
2. The data is read from the Zarr URL in `web/config.json` (default `obs.zarr`, i.e. the store next to the page).
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

`latest.py` shows that the published Zarr store can be used directly in a process, without a KNMI API key or a server. It reads the station names from the Zarr store (`station_name`) to find a station by name (default `De Bilt`, the KNMI station in Utrecht), opens `https://bertt.github.io/knmi_zarr/obs.zarr` with xarray and prints the latest measurements of that station with their units.

```powershell
uv run --with xarray --with zarr --with fsspec --with aiohttp python latest.py
uv run --with xarray --with zarr --with fsspec --with aiohttp python latest.py "Schiphol"
```

How the code works:

1. `xr.open_zarr(".../obs.zarr", consolidated=True, zarr_format=3)` opens the store lazily over HTTP, so only the needed chunks are downloaded.
2. The station name is matched (case-insensitive, partial match) against `ds["station_name"]` to get its index.
3. `ds.isel(station=idx, time=-1)` selects the station and the latest time step.
4. The numeric `station × time` variables are printed with the long name and units from their attributes; missing values (NaN) are skipped.

```python
ds = xr.open_zarr(f"{BASE}/obs.zarr", consolidated=True, zarr_format=3)
row = ds.isel(station=idx, time=-1)
print(row["ta"].values)  # air temperature
```
## Deployment

GitHub Pages serves the `web/` folder through the workflow in `.github/workflows/pages.yml` on every push to `main`, manually, and hourly (`cron`). Each run downloads the latest KNMI file, converts it to `web/obs.zarr`, and deploys. Add your API key as repository secret `KNMI_API_KEY` (Settings → Secrets and variables → Actions).

### GitHub Actions

The workflow `.github/workflows/pages.yml` ("Deploy web to GitHub Pages") automates the whole pipeline, so no server is needed. It runs:

- every hour (`cron: "7 * * * *"`),
- on every push to `main`,
- manually (`workflow_dispatch`).

Steps of the single `deploy` job (Ubuntu runner):

1. **Checkout** the repository and set up [uv](https://github.com/astral-sh/uv).
2. **Download** the latest KNMI NetCDF file with `download.py`, using the `KNMI_API_KEY` repository secret. The filename is passed to the next step via `NC_FILE`.
3. **Convert** the NetCDF file to `web/obs.zarr` with `convert.py`.
4. **Publish**: `web/` is uploaded as a Pages artifact (`upload-pages-artifact`) and deployed with `deploy-pages`.

The `concurrency` group `pages` cancels a still-running deployment when a new one starts, so the site is never more than about an hour old. The workflow needs the permissions `contents: read`, `pages: write` and `id-token: write`, and GitHub Pages must be set to the source *GitHub Actions* (Settings → Pages).

## Data & license

**Source:** [KNMI](https://www.knmi.nl/) (Royal Netherlands Meteorological Institute), dataset [Near real-time 10-minute automated in-situ ground-based meteorological observations in the Netherlands](https://dataplatform.knmi.nl/dataset/10-minute-in-situ-meteorological-observations-1-0), via the KNMI Data Platform Open Data API.

**License:** the KNMI dataset is published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (verified on the dataset page). This allows use, adaptation and redistribution, also commercially, as long as KNMI is credited as the source. Please credit: *"Source: KNMI"* with a link to the dataset above.

**Modified data:** `web/obs.zarr` is derived from the KNMI NetCDF files (converted to Zarr, stations sorted spatially and chunked). It is not an official KNMI product and may lag behind the original data by up to an hour.

The KNMI [fair use policy](https://developer.dataplatform.knmi.nl/fair-use) applies: the API key is kept in a repository secret (never published), and the workflow downloads one file per hour.

Basemap © OpenStreetMap contributors © CARTO.
