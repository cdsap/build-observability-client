/**
 * @param {import("@cdsap/gbos/presentation").ViewSpec} spec
 * @param {{ stdout: { write(chunk: string): void }, stderr: { write(chunk: string): void } }} io
 */
export function printViewSpec(spec, io) {
  io.stdout.write(`${spec.title}\n`);
  for (const diagnostic of spec.diagnostics) {
    io.stderr.write(`${diagnostic.severity}: ${diagnostic.message}\n`);
  }
  for (const section of spec.sections) {
    io.stdout.write(`\n${section.title}\n`);
    if (section.kind === "summary") {
      for (const item of section.items) io.stdout.write(`${item.label}: ${item.value}\n`);
      continue;
    }
    if (section.kind === "table") {
      io.stdout.write(`${section.columns.join("\t")}\n`);
      for (const row of section.rows) io.stdout.write(`${row.join("\t")}\n`);
      continue;
    }
    section.labels.forEach((label, index) => {
      const unit = section.unit === "" ? "" : ` ${section.unit}`;
      io.stdout.write(`${label}: ${section.values[index]}${unit}\n`);
    });
  }
}
