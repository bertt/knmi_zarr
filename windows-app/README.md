# Cycling Weather – Windows app

Electron wrapper around `web/cycling.html`, packaged as MSIX/AppX for the Microsoft Store.
The GeoParquet file is **not bundled**: `prepare-web.js` writes a `config.json` pointing to the remote file
(default `https://bertt.github.io/knmi_zarr/obs.parquet`), which the app reads via HTTP range requests (hyparquet).
Use another location with `PARQUET_URL=https://... npm run dist`.

## Build

```powershell
cd windows-app
npm install
npm start        # run locally
npm run dist     # creates dist\Cycling Weather <version>.appx
```

## Publish in the Microsoft Store

1. **Developer account**: register at <https://partner.microsoft.com/dashboard> (Windows & Xbox / App developer program; one-time fee, individual or company).
2. **Reserve the name**: Partner Center → Apps and games → *New product* → *MSIX or PWA app* → reserve "Cycling Weather" (or another free name).
3. **Copy the identity**: Product → *Product management → Product identity*. Put these in `windows-app/package.json` under `build.appx`:
   - `identityName` ← *Package/Identity/Name*
   - `publisher` ← *Package/Identity/Publisher* (e.g. `CN=XXXXXXXX-...`)
   - `publisherDisplayName` ← *Package/Properties/PublisherDisplayName*
4. **Icons** (recommended): add PNGs to `windows-app/build/appx/`: `StoreLogo.png` (50×50), `Square44x44Logo.png`, `Square150x150Logo.png`, `Wide310x150Logo.png` (electron-builder uses default images otherwise, which Store certification may reject), and `build/icon.ico` for the exe.
5. **Increase the version** in `package.json` for every submission (Store requires a higher version each time; keep format `x.y.z`).
6. **Build**: `npm run dist`. The `.appx` is unsigned on purpose: the Store signs it.
7. **Submit**: Partner Center → your app → *Start your submission*:
   - *Pricing and availability* (free, markets)
   - *Properties* (category e.g. Weather/Sports, age rating questionnaire)
   - *Store listing*: description, at least 1 screenshot (1366×768 or larger), logo
   - *Packages*: upload the `.appx`
   - Provide a **privacy policy URL** (the app uses Google Analytics via `cycling.html` and requests location) and mention KNMI data (CC BY 4.0) in the description.
8. **Certification** usually takes 1–3 days; afterwards the app is live.

Local testing of the unsigned package is not possible without signing; test with `npm start` or `dist\win-unpacked\Cycling Weather.exe`.
