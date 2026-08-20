import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { migrateOniTemplate } from "../tools/migrate-oni-template.mjs";

const source = JSON.parse(fs.readFileSync(new URL("../src/templates/actors/oni-template.json", import.meta.url), "utf8"));

describe("oni-template", () => {
  it("mantém as keys de dano e converte o recurso demoníaco para PDK", () => {
    const migrated = migrateOniTemplate(source);
    const serialized = JSON.stringify(migrated);
    for (const key of ["pdv_oni_dano_tomado", "pdv_oni_dano_ferida", "pdk_oni_total_valor", "pdk_oni_atual_valor_display"]) {
      assert.match(serialized, new RegExp(key));
    }
    assert.doesNotMatch(serialized, /pdr_oni/);
    assert.equal(migrated.name, "oni_template");
    assert.equal(migrated.type, "_template");
  });

  it("usa recursos numéricos nas barras e progressão Oni de 0 a 20", () => {
    const migrated = migrateOniTemplate(source);
    assert.deepEqual(migrated.system.attributeBar, {
      pdv_oni_barra: { value: "${pdv_oni_atual_num}$", max: "${pdv_oni_maximo_num}$", editable: false },
      pdk_oni_barra: { value: "${pdk_oni_atual_num}$", max: "${pdk_oni_maximo_num}$", editable: false },
    });
    const serialized = JSON.stringify(migrated);
    for (const key of [
      "origem_oni_pdv_inicial", "origem_oni_pdk_inicial", "pdv_oni_total_conta", "pdk_oni_total_conta",
      "pdv_oni_maximo_num", "pdv_oni_atual_num", "pdk_oni_maximo_num", "pdk_oni_atual_num",
      "pdv_oni_ganho_nvl2", "pdv_oni_ganho_nvl12",
    ]) assert.match(serialized, new RegExp(key));
    assert.match(serialized, /"key":"nvl_20","value":"20"/);
  });

  it("calcula os sete atributos somando bonus de origem Oni, sem depender de bonus exclusivos do Slayer", () => {
    const migrated = migrateOniTemplate(source);
    const hidden = new Map(migrated.system.hidden.map((entry) => [entry.name, entry.value]));
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
      const formula = hidden.get(`${attr}_display`);
      assert.equal(formula, `\${fallback(atr_${attr}_valor_config,0)+fallback(origem_oni_bonus_${attr},0)+fallback(bonus_atr_${attr}_valor_temp,0)}$`);
      assert.doesNotMatch(formula, /tsuyoi|marca|resp/);
    }
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
      const bonus = hidden.get(`origem_oni_bonus_${attr}`);
      assert.ok(bonus, `origem_oni_bonus_${attr} deve existir`);
      assert.match(bonus, /switchCase\(origem_dropdown/);
    }
  });

  it("pdk_oni_conta_atual nao referencia metal_oni_pdr_bonus", () => {
    const migrated = migrateOniTemplate(source);
    const hidden = new Map(migrated.system.hidden.map((entry) => [entry.name, entry.value]));
    const formula = hidden.get("pdk_oni_conta_atual");
    assert.ok(formula, "pdk_oni_conta_atual deve existir");
    assert.doesNotMatch(formula, /metal_oni_pdr_bonus/);
  });

  it("nao possui hidden attributes de Origens Slayer (origem_oni_pdv_val/origem_oni_pdr_val)", () => {
    const migrated = migrateOniTemplate(source);
    const names = migrated.system.hidden.map((h) => h.name);
    assert.ok(!names.includes("origem_oni_pdv_val"), "origem_oni_pdv_val deve ter sido removido");
    assert.ok(!names.includes("origem_oni_pdr_val"), "origem_oni_pdr_val deve ter sido removido");
  });
});
