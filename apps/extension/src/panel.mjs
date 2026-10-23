import { createExtensionAdapter } from "@cdsap/gbos/adapters/extension";
import { createDevelocityViewSpec } from "@cdsap/gbos/presentation";
import { renderViewSpec } from "@cdsap/gbos/render-dom";
import { loadFile } from "./load-file.mjs";
import { readCustomValuesFromDocument } from "./page-source.mjs";

/**
 * @param {Document} document
 * @param {Element} host
 * @param {import("@cdsap/gbos/presentation").ViewSpec} spec
 */
export function renderPanel(document, host, spec) {
  return renderViewSpec(document, host, spec);
}

/**
 * @param {string} name
 * @param {string} text
 * @param {Document} document
 * @param {Element} host
 */
export function openFileInPanel(name, text, document, host) {
  const loaded = loadFile(name, text);
  return { loaded, render: renderPanel(document, host, loaded.view) };
}

/**
 * @param {{ send(message: unknown): Promise<unknown> }} port
 * @param {Document} document
 * @param {Element} host
 */
export async function readPageInPanel(port, document, host) {
  const adapter = createExtensionAdapter(
    { readCustomValues: async () => readCustomValuesFromDocument(document) },
    {
      async send(message) {
        const response = await port.send(message);
        if (response?.type === "diagnostic") {
          throw new Error(response.message ?? "Could not read this page.");
        }
        return response;
      },
    },
  );
  try {
    const result = await adapter.requestFromServiceWorker();
    const view = createDevelocityViewSpec(result);
    const diagnostics = [...view.diagnostics];
    if (result.observations.length === 0) {
      diagnostics.push({ severity: "info", message: "This page has no GBOS custom values." });
    }
    return { result, render: renderPanel(document, host, { ...view, diagnostics }) };
  } catch (error) {
    const view = {
      title: "Build observability",
      diagnostics: [{
        severity: "error",
        message: error instanceof Error ? error.message : "Could not read this page.",
      }],
      sections: [],
    };
    return { result: { observations: [] }, render: renderPanel(document, host, view) };
  }
}
