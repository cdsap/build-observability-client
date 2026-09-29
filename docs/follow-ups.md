# Phase 5 follow-ups

- Add an optional Vega-Lite exporter behind a separate entry point and optional
  dependency; keep renderer-neutral query and view primitives in core.
- Add a text/terminal renderer as a separate package or opt-in subpath.
- Add an OTLP exporter with explicit resource, scope, and provenance mapping;
  do not make network or OpenTelemetry dependencies part of the core package.
- Import producer-owned conformance fixtures directly from their release
  artifacts once stable fixture URLs are available; the local corpus remains a
  small regression set.
