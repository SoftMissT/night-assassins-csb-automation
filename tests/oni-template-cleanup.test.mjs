import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = JSON.parse(await readFile(new URL("../src/templates/actors/oni-template.json", import.meta.url), "utf8"));

function collect(value, predicate, result = []) {
  if (Array.isArray(value)) for (const entry of value) collect(entry, predicate, result);
  else if (value && typeof value === "object") {
    if (predicate(value)) result.push(value);
    for (const child of Object.values(value)) collect(child, predicate, result);
  }
  return result;
}

describe("oni-template (estrutura validada pelo operador)", () => {
  it("possui aba configs_tab", () => {
    const tabs = collect(source.system.body, (entry) => entry.type === "tab").map(({ key }) => key);
    assert.ok(tabs.includes("configs_tab"), "aba configs_tab deve existir");
  });

  it("possui os sete atributos display com chaves _oni_", () => {
    const hidden = new Map(source.system.hidden.map(({ name, value }) => [name, value]));
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
      const formula = hidden.get(`${attr}_display`);
      assert.ok(formula, `${attr}_display deve existir`);
      assert.match(formula, new RegExp(`atr_${attr}_oni_valor_config`), `${attr}_display deve usar chaves _oni_`);
    }
  });

  it("possui barras PDV/PDK", () => {
    assert.ok(source.system.attributeBar?.pdv_oni_barra, "pdv_oni_barra deve existir");
    assert.ok(source.system.attributeBar?.pdk_oni_barra, "pdk_oni_barra deve existir");
  });

  it("possui computed attributes pdv_oni_maximo_num e pdk_oni_maximo_num", () => {
    const hidden = new Map(source.system.hidden.map(({ name, value }) => [name, value]));
    assert.ok(hidden.get("pdv_oni_maximo_num"), "pdv_oni_maximo_num deve existir");
    assert.ok(hidden.get("pdk_oni_maximo_num"), "pdk_oni_maximo_num deve existir");
  });

  it("não usa chaves Slayer (atr_*_valor_config sem _oni_)", () => {
    const hidden = new Map(source.system.hidden.map(({ name, value }) => [name, value]));
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
      const configKey = `atr_${attr}_valor_config`;
      assert.ok(!hidden.has(configKey), `chave Slayer ${configKey} não deve existir no Oni`);
    }
  });

  it("não possui origem_oni_pdr_val", () => {
    const names = source.system.hidden.map((h) => h.name);
    assert.ok(!names.includes("origem_oni_pdr_val"), "origem_oni_pdr_val não deve existir");
  });

  it("usa Especialização Oni (não Classe Slayer)", () => {
    const serialized = JSON.stringify(source);
    assert.doesNotMatch(serialized, /"key":"classe_escolhida"/);
    assert.match(serialized, /"key":"oni_especializacao_id"/);
  });
});
