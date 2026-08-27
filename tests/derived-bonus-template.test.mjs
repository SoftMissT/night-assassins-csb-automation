import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = JSON.parse(fs.readFileSync(
  path.join(repoRoot, "src", "templates", "actors", "slayer-template.json"),
  "utf8",
));

function findByKey(node, key) {
  if (!node || typeof node !== "object") return null;
  if (node.key === key) return node;
  const children = Array.isArray(node) ? node : Object.values(node);
  for (const child of children) {
    const found = findByKey(child, key);
    if (found) return found;
  }
  return null;
}

function hidden(name) {
  return template.system.hidden.find((entry) => entry.name === name);
}

test("painel de bônus derivados é exclusivo do GM e abre a API sem publicar chat", () => {
  const summary = findByKey(template.system, "bonus_derivados_slayer_resumo");
  const audit = findByKey(template.system, "bonus_derivados_slayer_auditar");

  assert.ok(summary, "bonus_derivados_slayer_resumo deve existir");
  assert.ok(audit, "bonus_derivados_slayer_auditar deve existir");
  assert.ok(audit?.rollMessage.includes("openDerivedBonusAudit"));
  assert.equal(audit?.rollMessageToChat, false);
});

test("Metal Preto concede Esquiva", () => {
  const dodge = hidden("metal_esquiva_bonus");

  assert.ok(dodge?.value.includes("metal_azul"), "metal_esquiva_bonus deve conter metal_azul");
});
