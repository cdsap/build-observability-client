#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadView } from "../../shared/load.mjs";
import { printViewSpec } from "../../shared/print-view.mjs";
import { FORMATS, formatFromFileName, isKnownFormat } from "../../shared/detect-transport.mjs";

const HELP = `GBOS command-line viewer

Usage:
  gbos view [options] <file|->

Read a GBOS report, NDJSON stream, observation, observation batch, or
custom-value projection from a file or stdin.

Options:
  --format ${FORMATS.join("|")}   Override transport detection
  --help                          Show this help
`;

export function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args[0] === "help") {
    return { help: true };
  }
  if (args[0] !== "view") {
    return { error: `Unknown command: ${args[0]}. Try gbos view --help.` };
  }
  let format;
  const positionals = [];
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") return { help: true };
    if (arg === "--format") {
      format = args[index + 1];
      index += 1;
      if (!isKnownFormat(format ?? "")) return { error: `Unknown format: ${format ?? "(missing)"}.` };
      continue;
    }
    positionals.push(arg);
  }
  if (positionals.length !== 1) return { error: "gbos view expects a file path or - for stdin." };
  return { file: positionals[0], format };
}

export function runView(text, options, io = { stdout: process.stdout, stderr: process.stderr }) {
  const loaded = loadView(text, options);
  printViewSpec(loaded.view, io);
  return loaded.ok ? 0 : 1;
}

function readInput(file) {
  if (file === "-") return readFileSync(0, "utf8");
  return readFileSync(file, "utf8");
}

export function main(argv = process.argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    return 1;
  }
  try {
    return runView(readInput(parsed.file), {
      format: parsed.format ?? formatFromFileName(parsed.file),
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
