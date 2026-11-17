#!/usr/bin/env node
// Layer-boundary lint (mirrors the spec's .oxlintrc intent):
//   model must not import view/viewmodel/app and must stay pure
//   viewmodel may import model + viewmodel only
//   view may import viewmodel + view only (never model)
//   app may import anything
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const errors = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts") || p.endsWith(".json")) check(p);
  }
}

function layerOf(p) {
  const rel = relative(root, p);
  return rel.split(/[\\/]/)[0];
}

function check(p) {
  if (p.endsWith(".json")) return;
  const layer = layerOf(p);
  const src = readFileSync(p, "utf8");
  const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map(m => m[1]);
  for (const imp of imports) {
    const m = imp.match(/(?:\.\.\/)+((model|viewmodel|view|app))((?:[\\/].*)?$)/);
    if (!m) continue;
    const target = m[1];
    const rest = m[3] ?? "";
    // view may touch pure model data (palette/content/schema) but never sim logic
    const pureModel = /^\/(data|palette|schema|content)\b/.test(rest.replace(/\\/g, "/").replace(/^\//, "/"));
    const ok =
      (layer === "model" && target === "model") ||
      (layer === "viewmodel" && (target === "model" || target === "viewmodel")) ||
      (layer === "view" &&
        ((target === "viewmodel" || target === "view") ||
          (target === "model" && pureModel))) ||
      layer === "app";
    if (!ok) errors.push(`${relative(root, p)}: ${layer} -> ${imp}`);
  }
  if (layer === "model") {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // strip comments
    if (/\bMath\.random\b/.test(code)) errors.push(`${relative(root, p)}: Math.random in model`);
    if (/\bDate\.now\b/.test(code)) errors.push(`${relative(root, p)}: Date.now in model`);
    if (/\bdocument\b|\bwindow\b|\blocalStorage\b/.test(code) && !p.includes("schema")) {
      errors.push(`${relative(root, p)}: DOM access in model`);
    }
  }
}

walk(root);
if (errors.length) {
  console.error("Layer violations:\n" + errors.map(e => "  " + e).join("\n"));
  process.exit(1);
}
console.log("layers ok");
