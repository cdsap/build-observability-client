import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outdir = join(root, "dist");
mkdirSync(outdir, { recursive: true });

await build({
  absWorkingDir: root,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  entryPoints: {
    panel: join(root, "src/panel-entry.mjs"),
    background: join(root, "src/background-entry.mjs"),
    content: join(root, "src/content.mjs"),
  },
  outdir,
});

copyFileSync(join(root, "panel.html"), join(outdir, "panel.html"));
copyFileSync(join(root, "manifest.json"), join(outdir, "manifest.json"));
