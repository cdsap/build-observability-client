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
spike issues. See `docs/spikes.md` for the planned slices and
`docs/adr/0001-package-boundary-and-schema-assets.md` for the package boundary.

## Usage

The package is ESM-only and targets Node.js 22+ and ES2022 browsers.

| Subpath | Contents |
|---|---|
| `@cdsap/gbos` | Package identity, canonical model, and source adapters. |
| `@cdsap/gbos/assets` | `SCHEMA_ASSETS`, the provenance of the bundled schema release. |
| `@cdsap/gbos/adapters/direct` | `parseDirectObservation` for self-contained observations. |
| `@cdsap/gbos/adapters/report` | `parseReport` for report envelopes and observation batches. |
| `@cdsap/gbos/adapters/ndjson` | `parseNdjson` and `parseNdjsonAsync` for complete or async NDJSON input. |
| `@cdsap/gbos/schema/*` | Canonical JSON Schemas, e.g. `schema/observation.schema.json`. |
| `@cdsap/gbos/registry/*` | Canonical registries, e.g. `registry/semantic-conventions.json`. |
| `@cdsap/gbos/package.json` | Package metadata. |

```ts
import { SCHEMA_ASSETS } from "@cdsap/gbos/assets";
import observationSchema from "@cdsap/gbos/schema/observation.schema.json" with { type: "json" };

console.log(`${SCHEMA_ASSETS.repository}@${SCHEMA_ASSETS.tag}`);
```

## Development

```bash
npm ci
npm run check         # type-check without DOM or Node.js globals
npm run build         # compile to dist/
npm test              # build, then run node:test suites
npm run pack:verify   # pack and smoke-test the tarball in a clean consumer
```

Schema and registry files in `schemas/` are copied verbatim from a pinned
[schema release](https://github.com/cdsap/build-observability-schema/releases)
and must not be edited by hand. `npm run assets:check` verifies them against the
release artifact; `npm run assets:sync` regenerates them after the pin in
`schemas/provenance.json` changes.

The canonical design is documented in the GBOS consumer and visualization
library specification. The schema repository owns the contract and registry;
this repository owns consumer behavior and presentation planning.

### Source adapters

Every adapter returns a `NormalizedDataset` containing records with the
canonical observation, consumer-only metadata, and source provenance. Report
`resource` and optional `buildContext` values stay in record metadata; they are
never injected into observation attributes. Report batches provide shared
schema and producer headers to their child observations.

Adapters are strict by default and throw `ParseError` for malformed input.
Pass `{ mode: "compatible" }` to retain valid neighboring NDJSON lines and
receive diagnostics for malformed lines. Blank NDJSON input and blank lines
produce no records or diagnostics. A report must have `schemaVersion` and
`resource`; a report without an observation collection is malformed in strict
mode, while empty collections normalize to an empty dataset.
