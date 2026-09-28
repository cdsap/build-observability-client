import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseDirectObservation } from "@cdsap/gbos/adapters/direct";
import { parseDevelocityProjection } from "@cdsap/gbos/adapters/develocity";
import { parseNdjson } from "@cdsap/gbos/adapters/ndjson";
import { parseReport } from "@cdsap/gbos/adapters/report";
import { validateObservation } from "@cdsap/gbos/validate";

const corpus = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/conformance.json", import.meta.url)), "utf8"));
const parsers = { direct: (input) => parseDirectObservation(input), report: (input) => parseReport(input), ndjson: (input) => parseNdjson(input), develocity: (input) => parseDevelocityProjection(input) };

describe("cross-producer conformance corpus", () => {
  it("normalizes every producer fixture and validates the resulting observation", () => {
    assert.equal(corpus.version, 1);
    for (const fixture of corpus.cases) {
      const result = parsers[fixture.transport](fixture.input);
      const observations = fixture.transport === "develocity" ? result.observations : result.records.map(({ observation }) => observation);
      assert.equal(observations.length, 1, fixture.producer);
      assert.equal(observations[0].producer.name, fixture.producer);
      assert.equal(validateObservation(observations[0]).accepted, true, fixture.producer);
    }
  });

  it("keeps the corpus independent of transport headers and ordering", () => {
    const fixture = corpus.cases[0].input;
    const reordered = { ...fixture, attributes: { ...fixture.attributes }, measurements: [...fixture.measurements] };
    assert.deepEqual(parseDirectObservation(fixture).records[0].observation, parseDirectObservation(reordered).records[0].observation);
  });
});
