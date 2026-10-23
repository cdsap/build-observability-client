import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseReport } from "@cdsap/gbos/adapters/report";
import { renderViewSpec } from "@cdsap/gbos/render-dom";
import { loadFile } from "../src/load-file.mjs";
import { openFileInPanel } from "../src/panel.mjs";

const fixtures = new URL("../../../test/fixtures/", import.meta.url);
const conformance = JSON.parse(readFileSync(new URL("conformance.json", fixtures), "utf8"));
const reportCase = conformance.cases.find((entry) => entry.transport === "report");
const ndjsonCase = conformance.cases.find((entry) => entry.transport === "ndjson");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

class FakeElement {
  constructor(name) {
    this.name = name;
    this.textContent = null;
    this.children = [];
    this.attributes = new Map();
  }
  get childNodes() { return this.children; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, value); }
}

class FakeDocument {
  createElement(name) { return new FakeElement(name); }
  createElementNS(_namespace, name) { return new FakeElement(name); }
}

class FakeHost extends FakeElement {
  replaceChildren(...children) { this.children = children; }
}

describe("GBOS Viewer files", () => {
  it("matches parseReport observation count for a report file", () => {
    const text = JSON.stringify(reportCase.input);
    const loaded = loadFile("gbos.json", text);
    assert.equal(loaded.observationCount, parseReport(reportCase.input, { mode: "compatible" }).records.length);
  });

  it("renders NDJSON table rows", () => {
    const loaded = loadFile("gbos.ndjson", `${ndjsonCase.input}\n`);
    assert.equal(loaded.ok, true);
    const table = loaded.view.sections.find((section) => section.kind === "table");
    assert.equal(table.rows.length, 1);
  });

  it("shows diagnostics for unknown JSON without fabricating observations", () => {
    const loaded = loadFile("empty.json", "{}");
    assert.equal(loaded.ok, false);
    assert.equal(loaded.observationCount, 0);
    assert.equal(loaded.view.diagnostics.some((entry) => entry.severity === "error"), true);
  });

  it("keeps unsafe attribute text as textContent", () => {
    const document = new FakeDocument();
    const host = new FakeHost("main");
    const spec = loadFile("unsafe.json", JSON.stringify({
      schemaVersion: "1.0.0",
      producer: { name: "demo", version: "1.0.0" },
      scope: "jvm.process",
      aggregationScope: "entity",
      attributes: { "unsafe.label": "<img src=x onerror=alert(1)>" },
      measurements: [{ name: "demo.value", value: 4, unit: "1", aggregation: "last" }],
    })).view;
    const result = renderViewSpec(document, host, spec);
    assert.equal(result.errors.length, 0);
    const serialized = JSON.stringify(host);
    assert.equal(serialized.includes("<img src=x onerror=alert(1)>"), true);
    assert.equal(host.children.some((node) => node.name === "img"), false);
  });

  it("names the extension GBOS Viewer", () => {
    assert.equal(manifest.name, "GBOS Viewer");
    assert.equal(manifest.action.default_title, "GBOS Viewer");
    assert.equal(manifest.name.includes("Develocity"), false);
  });

  it("opens a report file into the panel host", () => {
    const document = new FakeDocument();
    const host = new FakeHost("main");
    const opened = openFileInPanel("gbos.json", JSON.stringify(reportCase.input), document, host);
    assert.equal(opened.loaded.ok, true);
    assert.ok(host.children.length > 0);
  });
});
