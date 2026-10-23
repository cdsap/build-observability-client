import { handleMessage } from "./background.mjs";

async function collectFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error("No active tab to read.");
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
  const response = await chrome.tabs.sendMessage(tab.id, { type: "request-custom-values" });
  return response?.values ?? [];
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message, collectFromActiveTab).then(sendResponse);
  return true;
});
