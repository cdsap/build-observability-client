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

## Issue 8 boundary notes

`ViewSpec` is the renderer input: it contains formatted summary, table, and
chart values plus diagnostics, never raw GBOS JSON or Develocity custom-value
names. The DOM renderer uses `textContent` and `setAttribute`; it never assigns
`innerHTML`, evaluates strings, or creates navigable URLs from remote data.

The extension boundary is deliberately host-injected. A content script or
service worker supplies a `PageSourceAdapter` and `ExtensionPort`; selectors,
`chrome.*` calls, authentication, and acquisition remain outside this package.
The port carries a small typed message, and the adapter parses returned values
before presentation planning. Manifest V3 hosts should keep acquisition in the
content script, pass data through the service worker with bounded messages, and
load only the published package subpaths and precompiled schema assets.

Rendering builds a detached update, retains parser diagnostics, and replaces
the host only after the update is assembled. A failed update is reported as a
render diagnostic and leaves the previous valid host content intact.
Sites using a strict CSP or Trusted Types policy can mount the renderer without
additional policy exceptions because it does not inject HTML or script URLs.

The GBOS schema repository remains the language-neutral contract. This package
must consume released schema and registry assets rather than redefining them.

Accepted decisions are recorded in `docs/adr/`.
