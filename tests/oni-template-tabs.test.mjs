import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tpl = JSON.parse(readFileSync(new URL("../src/templates/actors/oni-template.json", import.meta.url), "utf8"));

describe("Oni template - abas consolidadas", () => {
  it("tem exatamente 3 abas (Combate, Skills, Configs)", () => {
    const tabbed = tpl.system.body.contents.find((c) => c.type === "tabbedPanel");
    assert.ok(tabbed, "Tabbed panel deve existir");
    assert.equal(tabbed.contents.length, 3, "Devem existir 3 abas: Combate, Skills, Configs");
  });

  it("aba 0 = Combate com resumo, tabela e acoes", () => {
    const tabbed = tpl.system.body.contents.find((c) => c.type === "tabbedPanel");
    const combat = tabbed.contents[0];
    assert.equal(combat.key, "combat_oni_tab");
    assert.ok(combat.contents.find((c) => c.key === "perfil_oni_resumo_panel"), "Deve ter resumo do perfil");
    assert.ok(combat.contents.find((c) => c.key === "combat_oni_table"), "Deve ter tabela de combate");
    assert.ok(combat.contents.find((c) => c.key === "acoes_oni_panel"), "Deve ter painel de acoes");
  });

  it("aba 1 = Skills com kekkijutsu", () => {
    const tabbed = tpl.system.body.contents.find((c) => c.type === "tabbedPanel");
    const skills = tabbed.contents[1];
    assert.equal(skills.key, "skills_oni_tab");
    assert.equal(skills.name, "Skills");
    assert.ok(skills.contents.find((c) => c.key === "skills_oni_titulo"), "Deve ter titulo SKILLS");
    assert.ok(skills.contents.find((c) => c.key === "inventario_oni_kekkijutsus"), "Kekkijutsus devem estar na aba Skills");
  });

  it("aba 2 = Configuracoes preservada", () => {
    const tabbed = tpl.system.body.contents.find((c) => c.type === "tabbedPanel");
    const configs = tabbed.contents[2];
    assert.equal(configs.key, "configs_tab");
    assert.ok(configs.contents.find((c) => c.key === "status_oni_storage_panel"), "Deve ter painel de status");
  });

  it("Biografia foi removida", () => {
    const serialized = JSON.stringify(tpl);
    assert.ok(!serialized.includes("perfil_oni_bio"), "TextArea de biografia nao deve existir");
    assert.ok(!serialized.includes("oni_secao_biografia"), "Secao de biografia nao deve existir");
  });

  it("Inventario foi removido", () => {
    const serialized = JSON.stringify(tpl);
    for (const key of ["inventario_oni_armas", "inventario_oni_equipamentos", "inventario_oni_itens", "inventario_oni_moedas_panel", "oni_secao_inventario"]) {
      assert.ok(!serialized.includes(key), `${key} nao deve existir`);
    }
  });

  it("aba Kekkijutsu separada nao existe mais", () => {
    const tabbed = tpl.system.body.contents.find((c) => c.type === "tabbedPanel");
    const kekki = tabbed.contents.find((c) => c.key === "kekki_oni_tab");
    assert.ok(!kekki, "Aba separada de Kekkijutsu nao deve existir");
  });

  it("aba de Notas foi removida", () => {
    const tabbed = tpl.system.body.contents.find((c) => c.type === "tabbedPanel");
    const notes = tabbed.contents.find((c) => c.key === "notas_oni_tab");
    assert.ok(!notes, "Aba de Notas nao deve existir");
  });
});
