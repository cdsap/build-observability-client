import { formatFromFileName } from "../../shared/detect-transport.mjs";
import { loadView } from "../../shared/load.mjs";

/**
 * @param {string} name
 * @param {string} text
 */
export function loadFile(name, text) {
  const loaded = loadView(text, { format: formatFromFileName(name) });
  return {
    ...loaded,
    source: "file",
    name,
  };
}
