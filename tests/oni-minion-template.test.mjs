import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tpl = JSON.parse(readFileSync(new URL("../src/templates/actors/oni-minion-template.json", import.meta.url), "utf8"));

describe("Oni Minion template - atributos e rolagens", () => {
  it("tem 7 numberFields e 7 labels de display dentro de oni_minion_attributes", () => {
    const attrPanel = tpl.system.body.contents.find((c) => c.key === "oni_minion_attributes");
    assert.ok(attrPanel, "Painel oni_minion_attributes deve existir");
    const bases = attrPanel.contents.filter((c) => c.type === "numberField");
    assert.equal(bases.length, 7, "Devem existir 7 numberFields de atributo");
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
      const field = bases.find((b) => b.key === `oni_minion_${attr}_base`);
      assert.ok(field, `Campo oni_minion_${attr}_base deve existir`);
    }
  });

  it("preserva 7 numberFields de base e 7 labels de display", () => {
    const attrPanel = tpl.system.body.contents.find((c) => c.key === "oni_minion_attributes");
    const bases = attrPanel.contents.filter((c) => c.type === "numberField");
    const displays = attrPanel.contents.filter((c) => c.key && c.key.includes("display_label"));
    assert.equal(bases.length, 7, "Devem existir 7 campos base");
    assert.equal(displays.length, 7, "Devem existir 7 labels de display");
  });

  it("tem flow grid no painel de atributos", () => {
    const attrPanel = tpl.system.body.contents.find((c) => c.key === "oni_minion_attributes");
    assert.ok(attrPanel.flow && attrPanel.flow.startsWith("grid-"), `flow deve ser grid, obtido: ${attrPanel.flow}`);
  });

  it("preserva dados basicos do template", () => {
    assert.equal(tpl.name, "oni_minion_template");
    assert.equal(tpl.type, "_template");
    const rollBtns = tpl.system.body.contents.filter((c) => c.key === "oni_minion_combat");
    assert.equal(rollBtns.length, 1, "Painel de combate deve existir");
  });
});
