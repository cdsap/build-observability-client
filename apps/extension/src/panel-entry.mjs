import { openFileInPanel, readPageInPanel } from "./panel.mjs";

const host = document.querySelector("#host");
const fileInput = document.querySelector("#file");
const pageButton = document.querySelector("#page");

fileInput?.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (file === undefined || host === null) return;
  openFileInPanel(file.name, await file.text(), document, host);
});

pageButton?.addEventListener("click", async () => {
  if (host === null) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const origin = tab?.url === undefined ? undefined : new URL(tab.url).origin;
  if (origin !== undefined && origin.startsWith("http")) {
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) {
      await readPageInPanel({
        async send() {
          return { type: "diagnostic", message: "Page access was not granted." };
        },
      }, document, host);
      return;
    }
  }
  await readPageInPanel({
    async send(message) {
      return chrome.runtime.sendMessage(message);
    },
  }, document, host);
});
