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

  it("possui os sete atributos display", () => {
    const hidden = new Map(source.system.hidden.map(({ name, value }) => [name, value]));
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
      const formula = hidden.get(`${attr}_display`);
      assert.ok(formula, `${attr}_display deve existir`);
    }
  });

  it("possui barras PDV/PDK", () => {
    assert.ok(source.system.attributeBar?.pdv_oni_barra, "pdv_oni_barra deve existir");
    assert.ok(source.system.attributeBar?.pdk_oni_barra, "pdk_oni_barra deve existir");
  });

  it("possui hidden com rank, nível e deslocamento", () => {
    const hidden = new Map(source.system.hidden.map(({ name, value }) => [name, value]));
    assert.ok(hidden.get("rank_atual"), "rank_atual deve existir");
    assert.ok(hidden.get("nvl_num"), "nvl_num deve existir");
    assert.ok(hidden.get("deslocamento_oni"), "deslocamento_oni deve existir");
  });

  it("possui hidden com PDV/PDK calculados", () => {
    const hidden = new Map(source.system.hidden.map(({ name, value }) => [name, value]));
    assert.ok(hidden.get("pdv_oni_atual_num"), "pdv_oni_atual_num deve existir");
    assert.ok(hidden.get("pdk_oni_atual_num"), "pdk_oni_atual_num deve existir");
    assert.ok(hidden.get("pdv_oni_total_conta"), "pdv_oni_total_conta deve existir");
    assert.ok(hidden.get("pdk_oni_total_conta"), "pdk_oni_total_conta deve existir");
  });

  it("usa somente as keys canônicas de origem", () => {
    const hidden = new Map(source.system.hidden.map(({ name, value }) => [name, value]));
    assert.ok(hidden.get("origem_oni_pdv_val"), "origem_oni_pdv_val deve existir");
    assert.ok(hidden.get("origem_oni_pdk_val"), "origem_oni_pdk_val deve existir");
    assert.ok(!hidden.has("origem_pdv_fixo"), "alias legado origem_pdv_fixo não deve existir");
    assert.ok(!hidden.has("origem_pdk_fixo"), "alias legado origem_pdk_fixo não deve existir");
  });

  it("possui rank de especialização", () => {
    const hidden = new Map(source.system.hidden.map(({ name, value }) => [name, value]));
    assert.ok(hidden.get("rank_especializacao_oni"), "rank_especializacao_oni deve existir");
  });
});
