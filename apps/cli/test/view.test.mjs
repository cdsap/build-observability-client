import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseReport } from "@cdsap/gbos/adapters/report";
import { loadView } from "../../shared/load.mjs";
import { parseArgs, runView } from "../src/main.mjs";

const root = new URL("../../../", import.meta.url);
const fixtures = new URL("../../../test/fixtures/", import.meta.url);
const conformance = JSON.parse(readFileSync(new URL("conformance.json", fixtures), "utf8"));
const reportCase = conformance.cases.find((entry) => entry.transport === "report");
const ndjsonCase = conformance.cases.find((entry) => entry.transport === "ndjson");
const bin = fileURLToPath(new URL("../src/main.mjs", import.meta.url));

function capture(fn) {
  let stdout = "";
  let stderr = "";
  const code = fn({
    stdout: { write(chunk) { stdout += chunk; } },
    stderr: { write(chunk) { stderr += chunk; } },
  });
  return { code, stdout, stderr };
}

describe("gbos view", () => {
  it("prints a report with the same observation count as parseReport", () => {
    const text = JSON.stringify(reportCase.input);
    const expected = parseReport(reportCase.input, { mode: "compatible" }).records.length;
    const loaded = loadView(text);
    const printed = capture((io) => runView(text, {}, io));
    assert.equal(loaded.observationCount, expected);
    assert.equal(printed.code, 0);
    assert.match(printed.stdout, new RegExp(`Observations: ${expected}`));
  });

  it("prints one NDJSON row per valid line and keeps malformed lines as diagnostics", () => {
    const text = `${ndjsonCase.input}\n{not json}\n`;
    const printed = capture((io) => runView(text, {}, io));
    assert.equal(printed.code, 0);
    assert.match(printed.stdout, /Observations: 1/);
    assert.match(printed.stderr, /malformed|not valid JSON/i);
  });

  it("exits non-zero for empty JSON objects", () => {
    const printed = capture((io) => runView("{}", {}, io));
    assert.equal(printed.code, 1);
    assert.match(printed.stderr, /not a recognized GBOS transport/);
  });

  it("rejects --format report on NDJSON", () => {
    const printed = capture((io) => runView(ndjsonCase.input, { format: "report" }, io));
    assert.equal(printed.code, 1);
  });

  it("help text is GBOS-branded", () => {
    const parsed = parseArgs(["node", "gbos", "--help"]);
    assert.equal(parsed.help, true);
    const help = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /GBOS command-line viewer/);
    assert.doesNotMatch(help.stdout, /Develocity/);
  });

  it("reads stdin when the path is -", () => {
    const child = spawnSync(process.execPath, [bin, "view", "-"], {
      input: JSON.stringify(reportCase.input),
      encoding: "utf8",
      cwd: fileURLToPath(root),
    });
    assert.equal(child.status, 0);
    assert.match(child.stdout, /Observations: 1/);
  });

  it("exits non-zero for a missing file", () => {
    const child = spawnSync(process.execPath, [bin, "view", "no-such-gbos.json"], {
      encoding: "utf8",
      cwd: fileURLToPath(root),
    });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /ENOENT|no such file/i);
  });
});

describe("parseArgs", () => {
  it("requires the view command", () => {
    assert.equal(parseArgs(["node", "gbos", "nope"]).error.includes("Unknown command"), true);
  });
});

