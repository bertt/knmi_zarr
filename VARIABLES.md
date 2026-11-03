# Variables in `obs.zarr`

← Back to the [README](README.md)

`web/obs.zarr` holds 90 numeric variables with dimensions `station × time` (one 10-minute time step, one value per station). The names, long names and units come from the KNMI NetCDF file ([dataset](https://dataplatform.knmi.nl/dataset/10-minute-in-situ-meteorological-observations-1-0), © KNMI, CC BY 4.0). The same long names and units are stored in `web/stations.parquet` (file-level metadata key `knmi`), together with the observation time.

Naming: `T`/`t` temperature, `R`/`r` rain, `S`/`f`/`d` wind speed/gust/direction, `Q`/`q` solar radiation, `n` cloud cover, `h` cloud base, `p` pressure. A suffix such as `1H`, `6`, `12` or `24` is the period in hours. "with MD" is part of the original KNMI long names.

Coordinates: `station` (numeric index; the row order of `stations.parquet`), `time`, `lat`, `lon`, `height` (station height in m).

## Air temperature

| Name | Description | Unit |
|---|---|---|
| `ta` | Air temperature, 1 min mean | °C |
| `tn`, `tx` | Air temperature minimum, maximum | °C |
| `tsd` | Air temperature standard deviation | °C |
| `tg` | Air temperature at 10 cm, mean | °C |
| `tgn` | Air temperature at 10 cm, minimum | °C |
| `Tn6`, `Tn12`, `Tn14` | Air temperature minimum, last 6 / 12 / 14 hours | °C |
| `Tx6`, `Tx12`, `Tx24` | Air temperature maximum, last 6 / 12 / 24 hours | °C |
| `Tgn6`, `Tgn12`, `Tgn14` | Air temperature at 10 cm, minimum last 6 / 12 / 14 hours | °C |
| `td` | Dew point temperature, 1 min mean | °C |
| `tb` | Wet bulb temperature, mean | °C |

## Soil temperature

| Name | Description | Unit |
|---|---|---|
| `tb1`, `tb2`, `tb3`, `tb4`, `tb5` | Soil temperature at −5 / −10 / −20 / −50 / −100 cm, mean | °C |
| `Tb1n6`, `Tb1x6` | Soil temperature at −5 cm, minimum / maximum last 6 hours | °C |
| `Tb2n6`, `Tb2x6` | Soil temperature at −10 cm, minimum / maximum last 6 hours | °C |

## Precipitation

| Name | Description | Unit |
|---|---|---|
| `rg` | Precipitation intensity (rain gauge), mean | mm/h |
| `pg` | Precipitation intensity (present weather sensor), mean | mm/h |
| `R1H`, `R6H`, `R12H`, `R24H` | Rainfall in the last 1 / 6 / 12 / 24 hours | mm |
| `D1H` | Rainfall duration in the last hour | min |
| `dr` | Precipitation duration (rain gauge) | s |
| `pr` | Precipitation duration (present weather sensor) | s |
| `pwc` | Corrected precipitation type, maximum | code |

## Wind

| Name | Description | Unit |
|---|---|---|
| `dd` | Wind direction, mean | ° |
| `dn`, `dx` | Wind direction, minimum / maximum | ° |
| `dsd` | Wind direction standard deviation | ° |
| `ff` | Wind speed at 10 m, mean | m/s |
| `ffs` | Wind speed (sensor), mean | m/s |
| `fsd` | Wind speed standard deviation | m/s |
| `fx` | Wind gust at 10 m, maximum in the last interval | m/s |
| `fxs` | Wind gust (sensor), maximum in the last interval | m/s |
| `gff` | Wind gust at 10 m, maximum | m/s |
| `gffs` | Wind gust (sensor), maximum | m/s |
| `Sav1H` | Wind speed, mean last hour | m/s |
| `Sax1H`, `Sax3H`, `Sax6H` | Wind speed, maximum last 1 / 3 / 6 hours | m/s |
| `Sx1H`, `Sx3H`, `Sx6H` | Wind gust, maximum last 1 / 3 / 6 hours | m/s |
| `sq` | Squall indicator | code |

## Air pressure and humidity

| Name | Description | Unit |
|---|---|---|
| `p0` | Air pressure at station level, 1 min mean | hPa |
| `pp` | Air pressure at mean sea level, 1 min mean | hPa |
| `ps` | Air pressure at sensor level, mean | hPa |
| `qnh` | QNH, 1 min mean | hPa |
| `rh` | Relative humidity, 1 min mean | % |

## Sun and radiation

| Name | Description | Unit |
|---|---|---|
| `qg` | Global solar radiation, mean | W/m² |
| `qgn`, `qgx` | Global solar radiation, minimum / maximum | W/m² |
| `Q1H`, `Q24H` | Global solar radiation, sum over 1 / 24 hours | J/cm² |
| `ss` | Sunshine duration | min |
| `za` | Background luminance, mean | cd/m² |

## Clouds

| Name | Description | Unit |
|---|---|---|
| `n` | Total cloud cover | okta |
| `n1`, `n2`, `n3` | Cloud amount, first / second / third layer | okta |
| `nc` | Total cloud cover (ceilometer) | okta |
| `nc1`, `nc2`, `nc3` | Cloud amount (ceilometer), first / second / third layer | okta |
| `nhc` | Low and middle cloud amount (ceilometer) | okta |
| `h` | Cloud base | ft |
| `h1`, `h2`, `h3` | Cloud base, first / second / third layer | ft |
| `hc` | Cloud base (ceilometer) | ft |
| `hc1`, `hc2`, `hc3` | Cloud base (ceilometer), first / second / third layer | ft |

## Visibility and weather codes

| Name | Description | Unit |
|---|---|---|
| `vv` | Horizontal visibility, mean | m |
| `zm` | Meteorological optical range, mean | m |
| `ww` | WaWa weather code | code |
| `ww-10` | WaWa weather code for the previous 10 min interval | code |
| `W10` | Past weather indicator | code |
| `W10-10` | Past weather indicator for the previous 10 min interval | code |

The web pages currently show 21 of these variables (see the [README](README.md)). The complete list with long names and units for the latest data is in the `knmi` metadata of `web/stations.parquet`.
