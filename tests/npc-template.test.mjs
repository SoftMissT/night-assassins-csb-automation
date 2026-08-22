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

  it("tem painel de vida com PDV base, label, dano e cura", () => {
    const vida = npc.system.body.contents.find((c) => c.type === "panel" && c.key === "npc_vida");
    assert.ok(vida, "Painel npc_vida deve existir");
    assert.equal(vida.contents.length, 4);
    for (const key of ["npc_pdv_base", "npc_pdv_total_label", "npc_pdv_dano", "npc_pdv_curado"]) {
      assert.ok(vida.contents.find((f) => f.key === key), `${key} deve existir`);
    }
    const base = vida.contents.find((f) => f.key === "npc_pdv_base");
    assert.equal(base.type, "numberField", "PDV base deve ser editavel");
    const dano = vida.contents.find((f) => f.key === "npc_pdv_dano");
    assert.equal(dano.type, "numberField", "Dano tomado deve ser editavel");
    assert.match(vida.contents.find((f) => f.key === "npc_pdv_total_label").value, /npc_pdv_atual/);
  });

  it("painel npc_vida vem depois dos atributos e antes dos dados basicos", () => {
    const keys = npc.system.body.contents.map((c) => c.key);
    assert.ok(keys.indexOf("npc_atributos_botoes") < keys.indexOf("npc_vida"));
    assert.ok(keys.indexOf("npc_vida") < keys.indexOf("npc_dados_basicos"));
  });

  it("tem hidden formulas de pdv total e atual", () => {
    const total = npc.system.hidden.find((h) => h.name === "npc_pdv_total");
    const atual = npc.system.hidden.find((h) => h.name === "npc_pdv_atual");
    assert.ok(total, "Hidden npc_pdv_total deve existir");
    assert.match(total.value, /fallback\(npc_pdv_base,0\)/);
    assert.ok(atual, "Hidden npc_pdv_atual deve existir");
    assert.match(atual.value, /npc_pdv_total-fallback\(npc_pdv_dano,0\)\+fallback\(npc_pdv_curado,0\)/);
    assert.match(atual.value, /max\(0,/);
  });

  it("tem barra de pdv no attributeBar", () => {
    const barra = npc.system.attributeBar?.npc_pdv_barra;
    assert.ok(barra, "attributeBar.npc_pdv_barra deve existir");
    assert.equal(barra.value, "${npc_pdv_atual}$");
    assert.equal(barra.max, "${npc_pdv_total}$");
    assert.equal(barra.editable, false);
  });

  it("preserva dados basicos do NPC", () => {
    assert.equal(npc.name, "npc_template");
    assert.equal(npc.system.body.contents[0].key, "npc_bonus_temp");
    assert.equal(npc.system.body.contents[1].key, "npc_atributos_display");
    assert.equal(npc.system.body.contents[2].key, "npc_atributos_botoes");
    assert.equal(npc.system.body.contents[3].key, "npc_vida");
    assert.equal(npc.system.body.contents[4].key, "npc_atributos_titulo");
    const fields = findInTree(npc.system.body, (n) => n.key === "npc_papel");
    assert.ok(fields.length > 0, "Campo npc_papel deve existir");
  });
});
