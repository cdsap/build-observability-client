import { readCustomValuesFromDocument } from "./page-source.mjs";

if (globalThis.__gbosViewerContent !== true) {
  globalThis.__gbosViewerContent = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "request-custom-values") return undefined;
    readCustomValuesFromDocument(document).then((values) => {
      sendResponse({ type: "custom-values", values });
    });
    return true;
  });
}
