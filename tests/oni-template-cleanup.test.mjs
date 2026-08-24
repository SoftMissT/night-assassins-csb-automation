import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cleanOniTemplate } from "../tools/clean-oni-template.mjs";

const source = JSON.parse(await readFile(new URL("../src/templates/actors/oni-template.json", import.meta.url), "utf8"));

function collect(value, predicate, result = []) {
  if (Array.isArray(value)) for (const entry of value) collect(entry, predicate, result);
  else if (value && typeof value === "object") {
    if (predicate(value)) result.push(value);
    for (const child of Object.values(value)) collect(child, predicate, result);
  }
  return result;
}

const NEW_TABS = ["combate_oni_tab", "configs_tab"];

describe("reconstrução do template Oni (estrutura de domínio aprovada)", () => {
  it("o source já publicado está na estrutura final de 2 abas Oni (Combate + Configurações/Dados)", () => {
    const tabs = collect(source.system.body, (entry) => entry.type === "tab").map(({ key }) => key);
    assert.deepEqual(tabs, NEW_TABS);
  });

  it("cleanOniTemplate é idempotente sobre um template já reconstruído", () => {
    const cleaned = cleanOniTemplate(source);
    const tabs = collect(cleaned.system.body, (entry) => entry.type === "tab").map(({ key }) => key);
    assert.deepEqual(tabs, NEW_TABS);
  });

  it("remove Fôlego, Marca Slayer, Metal e Skills Slayer completamente", () => {
    const serialized = JSON.stringify(source);
    for (const term of [
      "folego_oni_titulo", "folego_oni_atual", "folego_oni_maximo",
      "vit_marca_temp", "dex_marca_temp", "for_marca_temp", "car_marca_temp",
      "fdv_marca_temp", "int_marca_temp", "sab_marca_temp",
      "skills_oni_respiracoes", "resp_oni_panel", "resp_oni_display",
      "skills_marca_oni_panel", "metal_escolhido", "respiracao",
      "marca_slayer",
    ]) {
      assert.doesNotMatch(serialized, new RegExp(term), `contaminação encontrada: ${term}`);
    }
    assert.doesNotMatch(serialized, /PDR|oni_pdr_maximo_antes_queda/);
  });

  it("mantém somente Combate e Configurações, sem inventário, perfil ou notas", () => {
    const tabs = collect(source.system.body, (entry) => entry.type === "tab");
    assert.deepEqual(tabs.map(({ key, name }) => [key, name]), [
      ["combate_oni_tab", "COMBATE"],
      ["configs_tab", "CONFIGURAÇÕES"],
    ]);
    const configs = tabs.find(({ key }) => key === "configs_tab");
    const serialized = JSON.stringify(configs);
    for (const junk of ["perfil_oni_", "inventario_oni_", "notas_oni_", "IDENTIDADE & INVENTÁRIO", "recursos_oni_admin_panel", "progressao_oni_recursos_panel"]) {
      assert.doesNotMatch(serialized, new RegExp(junk), `configuração Oni contém bloco inútil: ${junk}`);
    }
  });

  it("não possui keys de componente duplicadas", () => {
    const keys = collect(source.system.body, (entry) => typeof entry.type === "string" && typeof entry.key === "string" && entry.key).map(({ key }) => key);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    assert.deepEqual([...new Set(duplicates)], []);
  });

  it("não usa mais a key/placeholder de Classe do Slayer — usa Especialização Oni", () => {
    const serialized = JSON.stringify(source);
    assert.doesNotMatch(serialized, /"key":"classe_escolhida"/);
    assert.doesNotMatch(serialized, /Escolha Sua Classe/);
    assert.match(serialized, /"key":"oni_especializacao_id"/);
    assert.match(serialized, /Especialização/);
  });

  it("possui o container de Kekkijutsu filtrando por categoria de item, não por nome", () => {
    const containers = collect(source.system.body, (entry) => entry.type === "itemContainer");
    const kekki = containers.find((entry) => entry.key === "inventario_oni_kekkijutsus");
    assert.ok(kekki, "container inventario_oni_kekkijutsus deve existir");
    assert.equal(kekki.itemFilterFormula, "equalText(item.inventario_categoria, 'kekkijutsu')");
  });

  it("PDV/PDK aparecem como barra e ledger operacional visível no Combate", () => {
    const barPanel = collect(source.system.body, (entry) => entry.key === "recursos_oni_barra_panel")[0];
    assert.ok(barPanel, "recursos_oni_barra_panel deve existir na aba Combate");
    const serializedBar = JSON.stringify(barPanel);
    assert.match(serializedBar, /pdv_oni_atual_num.*pdv_oni_maximo_num|PDV/);
    const ledgerPanel = collect(source.system.body, (entry) => entry.key === "recursos_oni_admin_panel")[0];
    assert.ok(ledgerPanel, "recursos_oni_admin_panel deve existir na aba Combate");
    const serializedLedger = JSON.stringify(ledgerPanel);
    for (const adminKey of ["pdv_oni_dano_tomado", "pdv_oni_curado", "pdv_oni_extra", "pdk_oni_gasto_valor", "pdk_oni_curado", "pdk_oni_extra"]) {
      assert.match(serializedLedger, new RegExp(adminKey), `campo operacional ${adminKey} deve estar visível`);
    }
  });

  it("preserva os sete atributos Oni e o FOR visível", () => {
    const keys = new Set(collect(source.system.body, (entry) => typeof entry.key === "string").map(({ key }) => key));
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) assert.ok(keys.has(`atr_${attr}_valor`));
    const hidden = new Map(source.system.hidden.map(({ name, value }) => [name, value]));
    assert.match(hidden.get("for_display"), /fallback\(atr_for_valor_config,0\)/);
  });
});
