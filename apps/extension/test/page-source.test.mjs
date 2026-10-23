import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseDevelocityProjection } from "@cdsap/gbos/adapters/develocity";
import { handleMessage } from "../src/background.mjs";
import { readCustomValuesFromDocument } from "../src/page-source.mjs";
import { openFileInPanel, readPageInPanel } from "../src/panel.mjs";

const projection = JSON.parse(readFileSync(new URL("../../../test/fixtures/develocity-transports.json", import.meta.url), "utf8"));
const reportCase = JSON.parse(readFileSync(new URL("../../../test/fixtures/conformance.json", import.meta.url), "utf8"))
  .cases.find((entry) => entry.transport === "report");

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
  getAttribute(name) { return this.attributes.get(name); }
}

class FakeDocument {
  constructor() {
    this.nodes = [];
  }
  createElement(name) { return new FakeElement(name); }
  createElementNS(_namespace, name) { return new FakeElement(name); }
  querySelector(selector) {
    return this.nodes.find((node) => node.selector === selector)?.element ?? null;
  }
}

class FakeHost extends FakeElement {
  replaceChildren(...children) { this.children = children; }
}

describe("optional page source", () => {
  it("reconstructs the same observations as parseDevelocityProjection", async () => {
    const expected = parseDevelocityProjection(projection).observations.length;
    const port = {
      async send() {
        return { type: "custom-values", values: projection.customValues };
      },
    };
    const document = new FakeDocument();
    const host = new FakeHost("main");
    const opened = await readPageInPanel(port, document, host);
    assert.equal(opened.result.observations.length, expected);
  });

  it("reports when a page has no GBOS keys", async () => {
    const port = { async send() { return { type: "custom-values", values: [] }; } };
    const opened = await readPageInPanel(port, new FakeDocument(), new FakeHost("main"));
    assert.equal(opened.result.observations.length, 0);
    assert.equal(opened.render.errors.length, 0);
  });

  it("reads application/gbos+json script tags from the document", async () => {
    const document = new FakeDocument();
    const script = new FakeElement("script");
    script.textContent = JSON.stringify(projection.customValues);
    document.nodes.push({ selector: "script[type='application/gbos+json']", element: script });
    const values = await readCustomValuesFromDocument(document);
    assert.equal(values.length, projection.customValues.length);
  });

  it("keeps file viewing working alongside the page handler", () => {
    const document = new FakeDocument();
    const host = new FakeHost("main");
    const opened = openFileInPanel("gbos.json", JSON.stringify(reportCase.input), document, host);
    assert.equal(opened.loaded.ok, true);
  });

  it("maps request-custom-values through the background seam", async () => {
    const response = await handleMessage(
      { type: "request-custom-values" },
      async () => projection.customValues,
    );
    assert.equal(response.type, "custom-values");
    assert.equal(response.values.length, projection.customValues.length);
  });

  it("shows a diagnostic when page access is denied and still opens files", async () => {
    const document = new FakeDocument();
    const host = new FakeHost("main");
    const denied = await readPageInPanel({
      async send() {
        return { type: "diagnostic", message: "Page access was not granted." };
      },
    }, document, host);
    assert.equal(denied.result.observations.length, 0);
    assert.equal(denied.render.errors.length, 0);
    const opened = openFileInPanel("gbos.json", JSON.stringify(reportCase.input), document, host);
    assert.equal(opened.loaded.ok, true);
  });
});
