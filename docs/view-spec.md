# Semantic view planning

The view layer is the boundary between normalized GBOS observations and a
renderer. It is intentionally JSON-like and browser-neutral.

## Profiles

A `ViewProfile` has an `id`, title, priority, and semantic `match` predicate.
The predicate can require a scope, aggregation scope, attribute values,
measurement names, or histogram names. All specified conditions must match;
`anyMeasurements` and `anyHistograms` express alternatives. Profile matching is
deterministic: highest priority wins, then profile ID lexicographically. The
built-in `generic` profile always matches. Registration rejects duplicate IDs.

Profiles must not inspect producer names. A compatible producer therefore gets
the same profile when it emits the same semantic shape.

## ViewSpec

Each normalized observation produces one `ViewSpec` with a stable ID, an
explicit `state` (`ready`, `empty`, `partial`, `diagnostic`, or `unknown`), and
semantic panels (`metric`, `table`, or `histogram`). Panels contain data names,
units, aggregations, and attribute dimensions. The specification contains no
HTML, CSS, DOM, SVG, Vega-Lite, or Chrome types.

The planner selects a metric panel for one measurement, a table for multiple
measurements, and a histogram panel for histograms. It does not create a time
series from observation order, sum gauges, merge histogram buckets, or infer a
missing denominator. Those operations remain explicit query-layer operations
with their existing safety checks.

An empty dataset receives a generic empty spec. A populated observation not
recognized by a specific profile uses the generic profile and is marked
`unknown`, preserving future data without pretending that its semantics are
known.
