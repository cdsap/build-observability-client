# GBOS Viewer

Chrome Manifest V3 host for `@cdsap/gbos`. The store name, toolbar tooltip, and
panel title are **GBOS Viewer**. This is not a Develocity product.

## File source

Open a local `.json` or `.ndjson` file from the panel. The viewer auto-detects
report envelopes, NDJSON, standalone observations, observation batches, and
custom-value projections.

## Optional page source

On a Build Scan page that already exposes GBOS custom values, choose **Read this
page**. Selectors and Chrome APIs stay in this host. Parsing still goes through
`parseDevelocityProjection`. If permission is denied or the page has no GBOS
keys, the panel shows a diagnostic and file viewing still works.

## Load unpacked

```bash
npm run build --workspace @cdsap/gbos-extension
```

Then load `apps/extension/dist` as an unpacked extension in Chrome.
