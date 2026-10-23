import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { detectTransport, formatFromFileName } from "./detect-transport.mjs";

const fixtures = new URL("../../test/fixtures/", import.meta.url);
const conformance = JSON.parse(readFileSync(new URL("conformance.json", fixtures), "utf8"));
const projection = readFileSync(new URL("develocity-transports.json", fixtures), "utf8");

const reportCase = conformance.cases.find((entry) => entry.transport === "report");
const directCase = conformance.cases.find((entry) => entry.transport === "direct");
const ndjsonCase = conformance.cases.find((entry) => entry.transport === "ndjson");

describe("detectTransport", () => {
  it("classifies a report envelope", () => {
    assert.equal(detectTransport(JSON.stringify(reportCase.input)), "report");
  });

  it("classifies two JSON observation lines as ndjson", () => {
    const line = ndjsonCase.input;
    assert.equal(detectTransport(`${line}\n${line}\n`), "ndjson");
  });

  it("classifies a single observation object as observation, not ndjson", () => {
    assert.equal(detectTransport(JSON.stringify(directCase.input)), "observation");
  });

  it("classifies empty input as unknown", () => {
    assert.equal(detectTransport(""), "unknown");
    assert.equal(detectTransport("   \n"), "unknown");
  });

  it("classifies a custom-value projection", () => {
    assert.equal(detectTransport(projection), "projection");
  });

  it("classifies an empty JSON object as unknown", () => {
    assert.equal(detectTransport("{}"), "unknown");
  });

  it("treats .ndjson filenames as an ndjson hint", () => {
    assert.equal(formatFromFileName("gbos.ndjson"), "ndjson");
    assert.equal(formatFromFileName("gbos.json"), undefined);
  });
});
