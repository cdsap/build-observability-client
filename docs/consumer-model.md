# Canonical consumer model

Issue 2 establishes the source-neutral TypeScript model. `Observation` mirrors
the released GBOS observation schema: attributes are string, number, or boolean
values; measurements and histograms remain ordered arrays; and scope and metric
names are not limited to the current registry.

`parseObservations` returns an immutable `ObservationDataset`. Compatible mode
(the default) keeps valid records when another record is malformed and records
the malformed record in `rejectedRecords` with its ordinal and diagnostics.
Strict mode throws on the first malformed record. Unknown scopes and metrics are
warnings when caller-supplied registries are provided; they do not make a
record unqueryable. Dataset construction never deduplicates observations.

## Identity and provenance

`observationFingerprint` is `sha256:` followed by SHA-256 of a canonical JSON
form of the schema observation. Object keys are sorted recursively, while array
order and repeated array entries are retained. Producer, scope, attributes,
measurements, histograms, and schema fields therefore contribute to identity.
Consumer-only `provenance`, `raw`, and dataset diagnostics do not. Equivalent
records from different transports can consequently share an identity, while
different orderings or repeated values cannot. SHA-256 collisions are treated
as cryptographic failures; the API does not collapse records based on a
fingerprint, so even an accidental collision cannot discard data.

Every source record receives a zero-based `provenance.ordinal`. The ordinal is
the position in the input transport, including rejected records, and is never
part of the fingerprint. Raw records are retained by default for diagnostics
and source reconstruction. Set `retainRawData: false` to omit raw records from
both normalized and rejected entries; the schema-faithful normalized model and
diagnostics remain available.
