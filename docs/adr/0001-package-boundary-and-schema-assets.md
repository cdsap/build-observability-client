# ADR 0001: Package boundary and schema asset workflow

- Status: Accepted
- Issue: cdsap/build-observability-client#1

## Context

This repository consumes the Gradle Build Observability Schema (GBOS). The
schema repository, `cdsap/build-observability-schema`, owns the contract and
registries. This package owns consumer behavior. The first consumer is a Chrome
extension, but Node.js, CLI, and other web consumers must work from the same core
without shims.

## Decisions

### One package, `@cdsap/gbos`, with subpath exports

The first release ships as a single ESM package. Each capability is a subpath in
the `exports` map. Only files reachable through `exports` are public, and deep
imports such as `@cdsap/gbos/dist/...` are rejected.

Current subpaths:

| Subpath | Contents |
|---|---|
| `@cdsap/gbos` | Package identity. Later spikes re-export stable core APIs here. |
| `@cdsap/gbos/assets` | `SCHEMA_ASSETS`: provenance of the pinned schema/registry release. |
| `@cdsap/gbos/schema/*` | Canonical JSON Schemas, e.g. `@cdsap/gbos/schema/observation.schema.json`. |
| `@cdsap/gbos/registry/*` | Canonical registries, e.g. `@cdsap/gbos/registry/semantic-conventions.json`. |
| `@cdsap/gbos/package.json` | Package metadata. |

The following subpaths are reserved. Each is added to `exports` by the spike that
implements it, never before, so every documented subpath is importable:
`./model`, `./parse`, `./adapters/develocity`, `./adapters/report`, `./query`,
`./presentation`, `./render-dom`, and `./render-vega-lite`.

A single package is enough for now. Subpath exports plus `"sideEffects": false`
let bundlers drop unused capabilities, and one version keeps the core and
renderers in lockstep while the model is still changing. We will split into
multiple packages only if a renderer needs an independent release cadence or
heavy dependencies that cannot stay optional.

### Core boundary: ECMAScript only

Core code means everything under `src/` except `src/render/`. It:

- Type-checks with `lib: ["ES2022"]` and `types: []`. DOM, Web Worker, Node.js,
  and Chrome globals such as `document`, `window`, `fetch`, `chrome`, or
  `node:*` imports fail `npm run check`.
- Imports only relative modules and has no runtime `dependencies`. Chart
  libraries, UI frameworks, network clients, and Chrome APIs cannot enter the
  core.
- Receives input from the caller as strings or parsed values. Fetching,
  authentication, and storage belong to the host application.

Renderer subpaths (`render-dom`, `render-vega-lite`) will live under
`src/render/` with their own tsconfig that adds DOM types. Any chart library will
be an optional peer dependency. Core modules must never import renderer modules.
`test/boundary.test.mjs` enforces these rules.

### ESM-first, runtime targets

- ESM only (`"type": "module"`). There is no CommonJS build. CommonJS consumers
  on Node.js 22.12+ can `require()` the package.
- Emitted JavaScript targets ES2022. Relative imports use `.js` extensions, so
  the output runs unchanged in Node.js and browsers.
- Node.js: `>=22`. Node.js 20 reached end of life in April 2026. CI runs Node.js
  22 and 24.
- Browsers: engines with complete ES2022 support: Chrome/Edge 94+, Firefox 93+,
  and Safari 16.4+. Chrome Manifest V3 extensions are covered.
- Declarations are emitted with `isolatedDeclarations`. TypeScript consumers
  must use `moduleResolution` `NodeNext` or `Bundler`. `npm run pack:verify`
  checks both.

### Schema and registry assets are pinned, verified, and unmodified

The schema repository publishes `build-observability-schema-<version>.jar` on
each GitHub release. The jar contains `schema/*.schema.json` and
`registry/*.json`, and GitHub records its SHA-256 digest. That jar is the source
of truth.

- `schemas/provenance.json` pins `repository`, `tag`, `commit`, `artifact.name`,
  and `artifact.sha256`.
- `npm run assets:sync` downloads the jar and fails if its SHA-256 differs from
  the pin. It extracts the top-level `schema/*.json` and `registry/*.json`
  entries byte-for-byte into `schemas/`. It also copies the upstream `LICENSE`
  at the pinned commit, as MIT requires for redistribution. Then it records a
  per-file SHA-256 in `schemas/provenance.json` and regenerates
  `src/assets/provenance.ts`.
- `npm run assets:check` runs the same pipeline without writing files. It fails
  if any file, digest, or generated module differs from the release. CI runs it.
- `npm test` checks, offline, that `schemas/` contains exactly the recorded files
  and that their digests match. Hand edits to canonical assets therefore fail
  locally.

Files under `schemas/` must never be edited by hand. Consumer-specific
extensions, fixes, or compatibility shims belong in code, with diagnostics. They
do not belong in these copies. If a canonical file is wrong, fix it upstream and
bump the pin.

To bump the pin:

1. Find the new release's jar digest with
   `gh release view <tag> -R cdsap/build-observability-schema --json assets`.
2. Update `tag`, `commit`, `artifact.name`, and `artifact.sha256` in
   `schemas/provenance.json`. URL and file entries are regenerated.
3. Run `npm run assets:sync`, review the diff, and run the full test suite.

### Build and release workflow

| Command | Purpose |
|---|---|
| `npm run check` | Type-check the core without emitting. |
| `npm run build` | Clean `dist/` and compile to ESM and declarations. |
| `npm test` | Build, then run `node:test` suites against the built package through its own exports. |
| `npm run pack:verify` | `npm pack`, check the tarball against `exports`, then install it into a throwaway consumer that imports and type-checks every subpath. |
| `npm run assets:sync` / `assets:check` | Regenerate or verify pinned schema assets (network). |

The published tarball contains only `dist/`, `schemas/`, `package.json`, and
`README.md`. `dist/` is a build output. It is ignored by git and rebuilt for
every publish. `schemas/` and `src/assets/provenance.ts` are generated but
committed, so a clean checkout builds offline and every asset change is reviewed.

Releases are published from CI with npm provenance
(`publishConfig.provenance`). `prepublishOnly` runs type-check, tests, and
package verification. Tag-triggered publishing and the release gates are handled
by the release-gates spike (#9).

## Consequences

- Consumers have a stable import surface from the first release, and later
  spikes add subpaths without breaking existing ones.
- The core stays portable across Chrome extensions, browsers, and Node.js.
  Host-specific code cannot compile inside it.
- GBOS contract changes reach this package only through an explicit, reviewable
  pin bump.
