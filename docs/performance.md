# Performance gate

Run `npm run benchmark` after building. The command measures validation,
parsing, normalization, query planning, and renderer-input serialization on a fixed
100-observation fixture and prints JSON containing p50, p95, total time, Node,
platform, and architecture. Save that JSON with the issue or release evidence;
the benchmark intentionally does not fail on a guessed machine-dependent limit.

The initial review targets are p95 budgets of 1 ms for one observation
validation, 25 ms for parsing 100 NDJSON observations, 25 ms for normalizing
100 observations, 10 ms for querying those observations, and 10 ms for
serializing a renderer input. These are targets to
investigate against recorded results, not CI assertions; update them only with
new measured evidence.

The packed npm artifact has a 250,000-byte upper bound in `pack:verify`. The
current corpus produces a 26,950-byte tarball; the bound protects browser and
install costs while leaving room for schema assets and declarations.

The corpus and workload are versioned in `scripts/benchmark.mjs`, so results
from different machines remain comparable. `GBOS_BENCHMARK_ITERATIONS` can be
set for a longer run.
