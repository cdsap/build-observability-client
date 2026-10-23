import { readCustomValuesFromDocument } from "./page-source.mjs";

export async function handleMessage(message, collect) {
  if (message?.type !== "request-custom-values") {
    return { type: "diagnostic", message: "Unknown extension message." };
  }
  try {
    const values = await collect();
    return { type: "custom-values", values };
  } catch (error) {
    return {
      type: "diagnostic",
      message: error instanceof Error ? error.message : "Could not read this page.",
    };
  }
}

export function collectFromPageDocument(document) {
  return readCustomValuesFromDocument(document);
}
