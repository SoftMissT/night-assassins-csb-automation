import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { migrateOniTemplate } from "../tools/migrate-oni-template.mjs";

const source = JSON.parse(fs.readFileSync(new URL("../src/templates/actors/oni-template.json", import.meta.url), "utf8"));

describe("oni-template", () => {
  it("mantém as keys de dano e converte o recurso demoníaco para PDK", () => {
    const migrated = migrateOniTemplate(source);
    const serialized = JSON.stringify(migrated);
    for (const key of ["pdv_oni_dano_ferida", "pdk_oni_total_conta", "pdk_oni_atual_num"]) {
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
      assert.equal(formula, `\${fallback(atr_${attr}_oni_valor_config,0)+fallback(bonus_atr_${attr}_oni_valor_temp,0)}$`);
      assert.doesNotMatch(formula, /tsuyoi|marca|resp/);
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

  it("usa camadas de origem (fixo/mult/inicial) com valores oficiais auditados", () => {
    const migrated = migrateOniTemplate(source);
    const hidden = new Map(migrated.system.hidden.map((entry) => [entry.name, entry.value]));
    for (const name of ["origem_pdv_fixo", "origem_pdk_fixo", "origem_pdk_fdv_mult", "origem_oni_pdv_inicial", "origem_oni_pdk_inicial"]) {
      assert.ok(hidden.get(name), `${name} deve existir`);
    }
    const pdvFixo = hidden.get("origem_pdv_fixo");
    const pdkFixo = hidden.get("origem_pdk_fixo");
    assert.match(pdvFixo, /'origem_oni_transfigurado',\s*\n\s*24,/);
    assert.match(pdvFixo, /'origem_oni_chama_negra',\s*\n\s*20,/);
    assert.match(pdvFixo, /'origem_oni_corte_palida',\s*\n\s*18,/);
    assert.doesNotMatch(pdvFixo, /\b(22|28|30|32|26),\s*\n\s*'origem_oni_(transfigurado|chama_negra|corte_palida|tela_do_submundo|eco_eterno|mare_negra|realidade_distorcida|raiz_podre|oni_de_outras_terras)'/);
    assert.match(pdkFixo, /'origem_oni_tela_do_submundo',\s*\n\s*20,/);
    assert.match(pdkFixo, /'origem_oni_mare_negra',\s*\n\s*17,/);
    assert.match(pdkFixo, /'origem_oni_raiz_podre',\s*\n\s*16,/);
    assert.match(pdkFixo, /'origem_oni_adepto_das_trevas',\s*\n\s*4,/);
    const mult = hidden.get("origem_pdk_fdv_mult");
    assert.match(mult, /'origem_oni_adepto_das_trevas',\s*\n\s*4,/);
    assert.match(mult, /\n\s*3\n\)\}\$$/, "multiplicador default deve ser 3");
    const pdvInicial = hidden.get("origem_oni_pdv_inicial");
    const pdkInicial = hidden.get("origem_oni_pdk_inicial");
    assert.doesNotMatch(pdvInicial, /switchCase/, "conta final nao deve embutir switchCase");
    assert.doesNotMatch(pdkInicial, /switchCase/, "conta final nao deve embutir switchCase");
    assert.doesNotMatch(pdvInicial, /fallback/);
    assert.doesNotMatch(pdkInicial, /fallback/);
    assert.match(pdvInicial, /exterminador_corrompido.*\(30\+\(vit_oni_nvl1\*3\)\+\(10\*oni_nivel_na_queda\)\).*origem_pdv_fixo\+vit_oni_nvl1/s);
    assert.match(pdkInicial, /exterminador_corrompido.*oni_pdr_maximo_antes_queda\+\(oni_nivel_na_queda\*2\)\+\(fdv_oni_nvl1\*3\).*origem_pdk_fixo\+\(fdv_oni_nvl1\*origem_pdk_fdv_mult\)/s);
  });

  it("remove placeholders vazios e preserva somente fórmulas CSB válidas", () => {
    const migrated = migrateOniTemplate(source);
    for (const entry of migrated.system.hidden) {
      assert.notEqual(entry.value, "$", `${entry.name} não pode usar o placeholder inválido '$'`);
      assert.notEqual(entry.value, "", `${entry.name} não pode ter fórmula vazia`);
    }
  });

  it("isola componentes, recursos e ações no namespace Oni", () => {
    const migrated = migrateOniTemplate(source);
    const serialized = JSON.stringify(migrated);
    assert.doesNotMatch(serialized, /pdv_slayer|pdr_slayer|status_slayer|resistencia_slayer|combat_slayer|folego_slayer/);
    assert.match(serialized, /kind:'oni'/);
  });

  it("normaliza todas as keys de atributos Oni para o contrato canônico", () => {
    const migrated = migrateOniTemplate(source);
    const serialized = JSON.stringify(migrated);
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
      assert.match(serialized, new RegExp(`atr_${attr}_oni_valor_config`));
      assert.match(serialized, new RegExp(`bonus_atr_${attr}_oni_valor_temp`));
      assert.doesNotMatch(serialized, new RegExp(`atr_${attr}_valor_oni_config`));
    }
  });
});
