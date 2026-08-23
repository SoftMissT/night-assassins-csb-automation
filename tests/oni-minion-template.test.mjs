import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tpl = JSON.parse(readFileSync(new URL("../src/templates/actors/oni-minion-template.json", import.meta.url), "utf8"));

describe("Oni Minion template - atributos e rolagens", () => {
  it("tem 7 botoes de rolagem de atributo dentro de oni_minion_attributes", () => {
    const attrPanel = tpl.system.body.contents.find((c) => c.key === "oni_minion_attributes");
    assert.ok(attrPanel, "Painel oni_minion_attributes deve existir");
    const rollBtns = attrPanel.contents.filter((c) => c.rollMessage && c.rollMessage.includes("NARollMode"));
    assert.equal(rollBtns.length, 7, "Devem existir 7 botoes de rolagem");
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
      const btn = rollBtns.find((b) => b.key === `oni_minion_${attr}_rolar`);
      assert.ok(btn, `Botao oni_minion_${attr}_rolar deve existir`);
      assert.match(btn.rollMessage, /actorUuid:entity\.uuid/, `${btn.key} deve passar actorUuid`);
    }
  });

  it("preserva 7 numberFields de base e 7 labels de display", () => {
    const attrPanel = tpl.system.body.contents.find((c) => c.key === "oni_minion_attributes");
    const bases = attrPanel.contents.filter((c) => c.type === "numberField");
    const displays = attrPanel.contents.filter((c) => c.key && c.key.includes("display_label"));
    assert.equal(bases.length, 7, "Devem existir 7 campos base");
    assert.equal(displays.length, 7, "Devem existir 7 labels de display");
  });

  it("tem flow grid-7 no painel de atributos", () => {
    const attrPanel = tpl.system.body.contents.find((c) => c.key === "oni_minion_attributes");
    assert.equal(attrPanel.flow, "grid-7");
  });

  it("preserva dados basicos do template", () => {
    assert.equal(tpl.name, "oni_minion_template");
    assert.equal(tpl.type, "_template");
    const rollBtns = tpl.system.body.contents.filter((c) => c.key === "oni_minion_combat");
    assert.equal(rollBtns.length, 1, "Painel de combate deve existir");
  });
});
