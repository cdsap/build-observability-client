/**
 * Host-owned collectors. Selectors stay here, not in @cdsap/gbos.
 * @param {ParentNode} root
 * @returns {Promise<readonly { name: string, value: string }[]>}
 */
export async function readCustomValuesFromDocument(root) {
  const script = root.querySelector?.("script[type='application/gbos+json']");
  if (script?.textContent) {
    const parsed = parseCustomValues(script.textContent);
    if (parsed.length > 0) return parsed;
  }
  const node = root.querySelector?.("[data-gbos-custom-values]");
  const attribute = node?.getAttribute?.("data-gbos-custom-values");
  if (attribute) return parseCustomValues(attribute);
  return [];
}

function parseCustomValues(text) {
  try {
    const value = JSON.parse(text);
    if (Array.isArray(value)) return value.filter(isCustomValue);
    if (Array.isArray(value?.customValues)) return value.customValues.filter(isCustomValue);
    return [];
  } catch {
    return [];
  }
}

function isCustomValue(value) {
  return value !== null && typeof value === "object" && typeof value.name === "string" && typeof value.value === "string";
}
