import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createExtensionAdapter } from "@cdsap/gbos/adapters/extension";
import { createDevelocityViewSpec } from "@cdsap/gbos/presentation";
import { renderViewSpec } from "@cdsap/gbos/render-dom";

class FakeElement {
  constructor(name) { this.name = name; this.textContent = null; this.children = []; this.attributes = new Map(); }
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

const values = [
  { name: "gbos.schema", value: "1.0.0" },
  { name: "gbos.v1.producer.demo.name", value: "demo" },
  { name: "gbos.v1.producer.demo.version", value: "1.0.0" },
  { name: "gbos.v1.producer.demo.observation", value: JSON.stringify({ scope: "jvm.process", aggregationScope: "entity", attributes: { "unsafe.label": "<img src=x onerror=alert(1)>" }, measurements: [{ name: "demo.value", value: 4, unit: "count", aggregation: "last" }] }) },
];

describe("rendering and extension boundaries", () => {
  it("connects a source adapter to summary, table, and chart ViewSpec data", async () => {
    const adapter = createExtensionAdapter({ readCustomValues: async () => values }, { send: async () => ({ type: "custom-values", values }) });
    const result = await adapter.collect();
    const view = createDevelocityViewSpec(result);
    assert.deepEqual(view.sections.map(({ kind }) => kind), ["summary", "table", "chart"]);
    assert.equal(view.sections[1].rows[0][2], "unsafe.label=<img src=x onerror=alert(1)>");
    assert.equal(result.diagnostics.length, 0);
    const fromWorker = await adapter.requestFromServiceWorker();
    assert.equal(fromWorker.observations.length, 1);
  });

  it("uses text and SVG attributes, not HTML injection, and preserves diagnostics", () => {
    const document = new FakeDocument();
    const host = new FakeHost("main");
    const result = renderViewSpec(document, host, { title: "<unsafe>", diagnostics: [{ severity: "warning", message: "parser warning" }], sections: [{ kind: "summary", title: "Summary", items: [{ label: "value", value: "<not markup>" }] }, { kind: "table", title: "Rows", columns: ["value"], rows: [["<not markup>"]] }, { kind: "chart", title: "Chart", labels: ["<label>"], values: [2], unit: "count" }] });
    assert.equal(result.renderedSections, 3);
    assert.equal(host.children[0].textContent, "<unsafe>");
    assert.equal(host.children[1].children[0].textContent, "parser warning");
    assert.equal(host.children[3].children[1].children[1].children[0].textContent, "<not markup>");
    assert.equal(host.children[4].children[1].name, "svg");
    assert.equal(host.children[4].children[1].children[0].attributes.get("data-label"), "<label>");
    result.teardown();
    assert.equal(host.children.length, 0);
  });

  it("does not replace a valid render with a failed update", () => {
    const document = new FakeDocument();
    const host = new FakeHost("main");
    renderViewSpec(document, host, { title: "old", diagnostics: [], sections: [] });
    const oldChildren = host.children;
    const brokenDocument = { createElement(name) { if (name === "section") throw new Error("renderer unavailable"); return document.createElement(name); }, createElementNS: document.createElementNS.bind(document) };
    const result = renderViewSpec(brokenDocument, host, { title: "new", diagnostics: [], sections: [{ kind: "summary", title: "broken", items: [] }] });
    assert.equal(result.errors.length, 1);
    assert.equal(host.children, oldChildren);
    assert.equal(host.children[0].textContent, "old");
  });
});
