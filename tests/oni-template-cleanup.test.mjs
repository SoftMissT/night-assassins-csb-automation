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

describe("limpeza do template Oni", () => {
  it("mantém somente abas próprias do Oni", () => {
    const cleaned = cleanOniTemplate(source);
    const tabs = collect(cleaned.system.body, (entry) => entry.type === "tab").map(({ key }) => key);
    assert.deepEqual(tabs, ["perfil_oni_tab", "pericias_tab", "combat_oni_tab", "inventario_oni_tab", "notas_oni_tab", "configs_tab"]);
  });

  it("remove Respiração, Marca, Metal e Skills Slayer", () => {
    const cleaned = cleanOniTemplate(source);
    const serialized = JSON.stringify(cleaned);
    for (const key of ["skills_oni_respiracoes", "resp_oni_panel", "resp_oni_display", "skills_marca_oni_panel", "metal_escolhido"]) {
      assert.doesNotMatch(serialized, new RegExp(`\\\"key\\\":\\\"${key}\\\"`));
    }
    assert.doesNotMatch(JSON.stringify(cleaned.system.hidden), /"name":"(?:hab_|marca_|metal_|resp_)/);
    assert.doesNotMatch(serialized, /Marca do Caçador|Bônus Temporários de Marca/);
    assert.equal(cleaned.system.header.contents.length, 1);
  });

  it("preserva os sete atributos Oni e o FOR visível", () => {
    const cleaned = cleanOniTemplate(source);
    const keys = new Set(collect(cleaned.system.body, (entry) => typeof entry.key === "string").map(({ key }) => key));
    for (const attr of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) assert.ok(keys.has(`atr_${attr}_valor`));
    const hidden = new Map(cleaned.system.hidden.map(({ name, value }) => [name, value]));
    assert.match(hidden.get("for_display"), /fallback\(atr_for_valor_config,0\)/);
  });
});
