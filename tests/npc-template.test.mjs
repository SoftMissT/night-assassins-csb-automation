import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const npc = JSON.parse(readFileSync(new URL("../src/templates/actors/npc-template.json", import.meta.url), "utf8"));

function findInTree(node, predicate, results = []) {
  if (!node || typeof node !== "object") return results;
  if (Array.isArray(node)) {
    for (const child of node) findInTree(child, predicate, results);
  } else {
    if (predicate(node)) results.push(node);
    for (const child of Object.values(node)) findInTree(child, predicate, results);
  }
  return results;
}

describe("NPC template - atributos e rolagens", () => {
  it("tem 7 campos de atributo (numberField)", () => {
    const attrFields = npc.system.body.contents.filter(
      (c) => c.type === "panel" && c.key === "npc_bonus_temp"
    );
    assert.equal(attrFields.length, 1, "Painel npc_bonus_temp deve existir");
    const fields = attrFields[0].contents;
    assert.equal(fields.length, 7, "Devem existir 7 campos de atributo");
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
      assert.ok(fields.find((f) => f.key === `bonus_atr_${attr}_valor_temp`), `Campo bonus_atr_${attr}_valor_temp deve existir`);
    }
  });

  it("tem 7 botoes de rolagem de atributo", () => {
    const btnPanel = npc.system.body.contents.find(
      (c) => c.type === "panel" && c.key === "npc_atributos_botoes"
    );
    assert.ok(btnPanel, "Painel npc_atributos_botoes deve existir");
    assert.equal(btnPanel.contents.length, 7, "Devem existir 7 botoes");
    for (const btn of btnPanel.contents) {
      assert.match(btn.rollMessage, /NARollMode000001/, `${btn.key} deve chamar NARollMode000001`);
      assert.match(btn.rollMessage, /actorUuid:entity\.uuid/, `${btn.key} deve passar actorUuid`);
    }
  });

  it("tem 7 labels de display de atributo", () => {
    const displayPanel = npc.system.body.contents.find(
      (c) => c.type === "panel" && c.key === "npc_atributos_display"
    );
    assert.ok(displayPanel, "Painel npc_atributos_display deve existir");
    assert.equal(displayPanel.contents.length, 7, "Devem existir 7 displays");
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
      const label = displayPanel.contents.find((c) => c.key === `atr_${attr}_valor`);
      assert.ok(label, `Label atr_${attr}_valor deve existir`);
      assert.match(label.value, new RegExp(`\\$\\{${attr}_display\\}\\$`), `Display deve usar ${attr}_display`);
    }
  });

  it("tem 14 hidden formulas (7 display + 7 config)", () => {
    assert.ok(npc.system.hidden.length >= 14, `Devem existir ao menos 14 hidden formulas; encontrados ${npc.system.hidden.length}`);
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
      const display = npc.system.hidden.find((h) => h.name === `${attr}_display`);
      assert.ok(display, `Hidden ${attr}_display deve existir`);
      assert.match(display.formula, new RegExp(`atr_${attr}_valor_config`), `Formula deve usar atr_${attr}_valor_config`);
      const config = npc.system.hidden.find((h) => h.name === `atr_${attr}_valor_config`);
      assert.ok(config, `Hidden atr_${attr}_valor_config deve existir`);
    }
  });

  it("preserva dados basicos do NPC", () => {
    assert.equal(npc.name, "npc_template");
    assert.equal(npc.system.body.contents[0].key, "npc_bonus_temp");
    assert.equal(npc.system.body.contents[1].key, "npc_atributos_display");
    assert.equal(npc.system.body.contents[2].key, "npc_atributos_botoes");
    assert.equal(npc.system.body.contents[3].key, "npc_atributos_titulo");
    const fields = findInTree(npc.system.body, (n) => n.key === "npc_papel");
    assert.ok(fields.length > 0, "Campo npc_papel deve existir");
  });
});
