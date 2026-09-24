# GBOS Consumer and Visualization Library

`@cdsap/gbos` is a source-neutral TypeScript consumer for the [Gradle Build
Observability Schema](https://github.com/cdsap/build-observability-schema).
It parses GBOS transports, validates and normalizes observations, exposes query
and derivation APIs, and plans renderer-neutral visualization models.

The core is independent of Chrome extension APIs, Develocity markup, network
access, authentication, DOM frameworks, and charting libraries. The initial
consumer is a Develocity Chrome extension, but report JSON, NDJSON, Node.js,
CLI, and other web consumers are first-class targets.

## Status

Proposed architecture; implementation is tracked through the repository's
spike issues. See `docs/spikes.md` for the planned slices.

## Development

```bash
npm install
npm run check
npm run build
```

The canonical design is documented in the GBOS consumer and visualization
library specification. The schema repository owns the contract and registry;
this repository owns consumer behavior and presentation planning.
