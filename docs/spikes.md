# GBOS Consumer Spikes

This repository implements the source-neutral TypeScript consumer described in
the GBOS consumer and visualization library specification.

The work is intentionally split into independently reviewable spikes:

1. Establish the package, schema assets, registry loading, and cross-runtime CI.
2. Define canonical observations, provenance, diagnostics, and dataset identity.
3. Reconstruct Develocity custom values, including repeated names and fragments.
4. Add report, NDJSON, and direct-observation adapters with conformance fixtures.
5. Validate structure and semantic conventions in browser-safe code.
6. Add query, derivation, grouping, and unit-formatting primitives.
7. Plan semantic views and renderer-neutral `ViewSpec` profiles.
8. Prototype DOM/SVG rendering and Chrome Manifest V3 integration boundaries.
9. Exercise compatibility, fuzzing, performance, and package-release constraints.

The GBOS schema repository remains the language-neutral contract. This package
must consume released schema and registry assets rather than redefining them.
