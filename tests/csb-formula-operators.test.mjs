import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/**
 * Campos de fórmula CSB avaliados diretamente pelo math.js (sem o wrapper
 * `${}$`). Nesses campos o operador lógico deve ser `and`/`or` (sintaxe do
 * math.js), nunca `&&`/`||` (sintaxe JS) — ver
 * wiki/concepts/foundry-vtt/csb-formula-system.md.
 *
 * `rollMessage`/`altRollMessage`/`%{ ... }%` NÃO entram aqui: são
 * Script-Expression (JavaScript legítimo) e não passam por essa validação.
 */
const FORMULA_KEYS = new Set([
  "visibilityFormula",
  "editableFormula",
  "itemFilterFormula",
  "formula",
  "valueFormula",
  "computedFormula",
  "conditionFormula",
]);

function listJsonFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsonFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function findJsOperators(node, filePath, keyPath, violations) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => findJsOperators(item, filePath, `${keyPath}[${index}]`, violations));
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    const nextPath = keyPath ? `${keyPath}.${key}` : key;
    if (FORMULA_KEYS.has(key) && typeof value === "string") {
      if (/&&|\|\|/.test(value)) {
        violations.push({ file: filePath, path: nextPath, key, formula: value });
      }
    }
    findJsOperators(value, filePath, nextPath, violations);
  }
}

const TARGET_DIRS = [
  path.join(repoRoot, "src", "templates"),
  path.join(repoRoot, "src", "imports"),
];

describe("Fórmulas CSB — sem operadores lógicos JS (&&/||)", () => {
  for (const dir of TARGET_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of listJsonFiles(dir)) {
      const relative = path.relative(repoRoot, file);
      it(`${relative} não usa && ou || em campos de fórmula CSB`, () => {
        const content = JSON.parse(fs.readFileSync(file, "utf8"));
        const violations = [];
        findJsOperators(content, relative, "", violations);
        assert.deepEqual(
          violations,
          [],
          `Operador lógico JS (&&/||) encontrado em campo de fórmula CSB. Use 'and'/'or' (sintaxe math.js). Violações: ${JSON.stringify(violations, null, 2)}`,
        );
      });
    }
  }
});
