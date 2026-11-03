# Variables in `obs.parquet`

← Back to the [README](README.md)

`web/obs.parquet` (GeoParquet) holds one row per station and 90 nullable numeric observation columns (one 10-minute time step). The names, long names and units come from the KNMI NetCDF file ([dataset](https://dataplatform.knmi.nl/dataset/10-minute-in-situ-meteorological-observations-1-0), © KNMI, CC BY 4.0). The same long names, units and standard names are stored as JSON in the file metadata (key `knmi:variables`).

Naming: `T`/`t` temperature, `R`/`r` rain, `S`/`f`/`d` wind speed/gust/direction, `Q`/`q` solar radiation, `n` cloud cover, `h` cloud base, `p` pressure. A suffix such as `1H`, `6`, `12` or `24` is the period in hours. "with MD" is part of the original KNMI long names.

Other columns: `station_id` (string, stable id), `station_name`, `source` (network, e.g. `KNMI`), `time` (UTC), `lat`, `lon`, `height` (station height in m), `wsi` (WMO station identifier), `geometry` (WKB point) and `bbox` (GeoParquet covering).

## CF conventions

The abbreviations above are KNMI's own codes and not an international standard. The data itself follows the [CF Metadata Conventions](https://cfconventions.org/) (`Conventions: "CF-1.12"` in the file metadata `knmi:dataset`): a community standard for self-describing climate and forecast data, used by NetCDF, Zarr and many tools (xarray, Panoply, ncview, …). In CF every variable can carry:

- `standard_name`: a name from the [CF Standard Name Table](https://cfconventions.org/Data/cf-standard-names/current/build/cf-standard-name-table.html) that says *what physical quantity* it is (e.g. `air_temperature`), independent of the local abbreviation. This is the key to compare or combine variables from different sources.
- `long_name`: a free-text description (the *Description* column).
- `units`: a [UDUNITS](https://docs.unidata.ucar.edu/udunits/current/) compatible unit.
- `cell_methods` (optional in CF): how a value was aggregated (mean, minimum, maximum, sum, …). The KNMI file does not use it, so several variables share one `standard_name` and differ only in the statistic or period: for example `ta`, `tn` and `tx` are all `air_temperature`; the long name tells which one is the mean, minimum or maximum.

The *CF `standard_name`* column shows the attribute exactly as delivered in the file metadata. 80 of the 90 variables have one; `–` means that the KNMI file has none (durations, weather codes, indicators, luminance and optical range).

¹ KNMI labels the wet bulb temperature `tb` with the standard name `soil_temperature`. This is probably an error in the source file (a CF name for wet bulb temperature would be `wet_bulb_temperature`). The value is kept as delivered.

## Air temperature

| Name | Description | Unit | CF `standard_name` |
|---|---|---|---|
| `ta` | Air temperature, 1 min mean | °C | `air_temperature` |
| `tn`, `tx` | Air temperature minimum, maximum | °C | `air_temperature` |
| `tsd` | Air temperature standard deviation | °C | `air_temperature` |
| `tg` | Air temperature at 10 cm, mean | °C | `air_temperature` |
| `tgn` | Air temperature at 10 cm, minimum | °C | `air_temperature` |
| `Tn6`, `Tn12`, `Tn14` | Air temperature minimum, last 6 / 12 / 14 hours | °C | `air_temperature` |
| `Tx6`, `Tx12`, `Tx24` | Air temperature maximum, last 6 / 12 / 24 hours | °C | `air_temperature` |
| `Tgn6`, `Tgn12`, `Tgn14` | Air temperature at 10 cm, minimum last 6 / 12 / 14 hours | °C | `air_temperature` |
| `td` | Dew point temperature, 1 min mean | °C | `dew_point_temperature` |
| `tb` | Wet bulb temperature, mean | °C | `soil_temperature` ¹ |

## Soil temperature

| Name | Description | Unit | CF `standard_name` |
|---|---|---|---|
| `tb1`, `tb2`, `tb3`, `tb4`, `tb5` | Soil temperature at −5 / −10 / −20 / −50 / −100 cm, mean | °C | `soil_temperature` |
| `Tb1n6`, `Tb1x6` | Soil temperature at −5 cm, minimum / maximum last 6 hours | °C | `soil_temperature` |
| `Tb2n6`, `Tb2x6` | Soil temperature at −10 cm, minimum / maximum last 6 hours | °C | `soil_temperature` |

## Precipitation

| Name | Description | Unit | CF `standard_name` |
|---|---|---|---|
| `rg` | Precipitation intensity (rain gauge), mean | mm/h | `lwe_precipitation_rate` |
| `pg` | Precipitation intensity (present weather sensor), mean | mm/h | `lwe_precipitation_rate` |
| `R1H`, `R6H`, `R12H`, `R24H` | Rainfall in the last 1 / 6 / 12 / 24 hours | mm | `rainfall_amount` |
| `D1H` | Rainfall duration in the last hour | min | – |
| `dr` | Precipitation duration (rain gauge) | s | – |
| `pr` | Precipitation duration (present weather sensor) | s | – |
| `pwc` | Corrected precipitation type, maximum | code | `predominant_precipitation_type_at_surface` |

## Wind

| Name | Description | Unit | CF `standard_name` |
|---|---|---|---|
| `dd` | Wind direction, mean | ° | `wind_from_direction` |
| `dn`, `dx` | Wind direction, minimum / maximum | ° | `wind_from_direction` |
| `dsd` | Wind direction standard deviation | ° | `wind_from_direction` |
| `ff` | Wind speed at 10 m, mean | m/s | `wind_speed` |
| `ffs` | Wind speed (sensor), mean | m/s | `wind_speed` |
| `fsd` | Wind speed standard deviation | m/s | `wind_speed` |
| `fx` | Wind gust at 10 m, maximum in the last interval | m/s | `wind_speed_of_gust` |
| `fxs` | Wind gust (sensor), maximum in the last interval | m/s | `wind_speed_of_gust` |
| `gff` | Wind gust at 10 m, maximum | m/s | `wind_speed_of_gust` |
| `gffs` | Wind gust (sensor), maximum | m/s | `wind_speed_of_gust` |
| `Sav1H` | Wind speed, mean last hour | m/s | `wind_speed` |
| `Sax1H`, `Sax3H`, `Sax6H` | Wind speed, maximum last 1 / 3 / 6 hours | m/s | `wind_speed` |
| `Sx1H`, `Sx3H`, `Sx6H` | Wind gust, maximum last 1 / 3 / 6 hours | m/s | `wind_speed_of_gust` |
| `sq` | Squall indicator | code | – |

## Air pressure and humidity

| Name | Description | Unit | CF `standard_name` |
|---|---|---|---|
| `p0` | Air pressure at station level, 1 min mean | hPa | `air_pressure` |
| `pp` | Air pressure at mean sea level, 1 min mean | hPa | `air_pressure_at_mean_sea_level` |
| `ps` | Air pressure at sensor level, mean | hPa | `air_pressure` |
| `qnh` | QNH, 1 min mean | hPa | `air_pressure_at_mean_sea_level` |
| `rh` | Relative humidity, 1 min mean | % | `relative_humidity` |

## Sun and radiation

| Name | Description | Unit | CF `standard_name` |
|---|---|---|---|
| `qg` | Global solar radiation, mean | W/m² | `surface_downwelling_shortwave_flux_in_air` |
| `qgn`, `qgx` | Global solar radiation, minimum / maximum | W/m² | `surface_downwelling_shortwave_flux_in_air` |
| `Q1H`, `Q24H` | Global solar radiation, sum over 1 / 24 hours | J/cm² | `integral_wrt_time_of_surface_downwelling_shortwave_flux_in_air` |
| `ss` | Sunshine duration | min | `duration_of_sunshine` |
| `za` | Background luminance, mean | cd/m² | – |

## Clouds

| Name | Description | Unit | CF `standard_name` |
|---|---|---|---|
| `n` | Total cloud cover | okta | `cloud_area_fraction` |
| `n1`, `n2`, `n3` | Cloud amount, first / second / third layer | okta | `cloud_area_fraction` |
| `nc` | Total cloud cover (ceilometer) | okta | `cloud_area_fraction` |
| `nc1`, `nc2`, `nc3` | Cloud amount (ceilometer), first / second / third layer | okta | `cloud_area_fraction` |
| `nhc` | Low and middle cloud amount (ceilometer) | okta | `cloud_area_fraction` |
| `h` | Cloud base | ft | `cloud_base_altitude` |
| `h1`, `h2`, `h3` | Cloud base, first / second / third layer | ft | `cloud_base_altitude` |
| `hc` | Cloud base (ceilometer) | ft | `cloud_base_altitude` |
| `hc1`, `hc2`, `hc3` | Cloud base (ceilometer), first / second / third layer | ft | `cloud_base_altitude` |

## Visibility and weather codes

| Name | Description | Unit | CF `standard_name` |
|---|---|---|---|
| `vv` | Horizontal visibility, mean | m | `visibility_in_air` |
| `zm` | Meteorological optical range, mean | m | – |
| `ww` | WaWa weather code | code | – |
| `ww-10` | WaWa weather code for the previous 10 min interval | code | – |
| `W10` | Past weather indicator | code | – |
| `W10-10` | Past weather indicator for the previous 10 min interval | code | – |

The web pages currently show 21 of these variables (see the [README](README.md)). The complete list with long names and units is in the file metadata (`knmi:variables`).
