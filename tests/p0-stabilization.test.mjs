import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actorKind } from "../scripts/actor-kind.mjs";
import { weaponRepairChanges as weaponRepairChangesRef } from "../scripts/weapon-migration.mjs";
import { breathingItemPatch } from "../scripts/breath-migration.mjs";

describe("P0 estabilização", () => {
  describe("blockPenalty — crash do dano padrão (usuário de Chamas sem técnica armada)", () => {
    it("damage-service normaliza o contexto de chamas no boundary (flameDamage?.*)", () => {
      const source = readFileSync(new URL("../scripts/damage-service.mjs", import.meta.url), "utf8");
      assert.match(source, /blockPenalty:\s*Number\(flameDamage\?\.blockPenalty\)/);
      assert.match(source, /exhaustionOnHit:\s*Number\(flameDamage\?\.exhaustionOnHit\)/);
      assert.doesNotMatch(source, /Number\(flameDamage\.blockPenalty\)/);
    });

    it("roteamento de alvos inclui oni_minion e npc no relay", () => {
      const source = readFileSync(new URL("../scripts/damage-service.mjs", import.meta.url), "utf8");
      assert.match(source, /targetKind === "oni" \|\| targetKind === "oni_minion" \|\| targetKind === "npc"/);
    });
  });

  describe("actorKind — identificação de NPC", () => {
    it("reconhece NPC por props e marcador de template", () => {
      assert.equal(actorKind({ system: { props: { npc_nome: "Aldeão" } } }), "npc");
      assert.equal(actorKind({ system: { template: "npc_template" } }), "npc");
      assert.equal(actorKind({ system: { props: {} } }), null);
    });

    it("mantém oni_minion, oni e slayer", () => {
      assert.equal(actorKind({ system: { props: { oni_minion_pdv_base: 8 } } }), "oni_minion");
      assert.equal(actorKind({ system: { props: { pdv_oni_total_conta: 30 } } }), "oni");
      assert.equal(actorKind({ system: { template: "slayer_template" } }), "slayer");
    });
  });

  describe("chat — spam da descrição da Forma", () => {
    it("form_resumo no template-fonte não envia para o chat", () => {
      const template = JSON.parse(readFileSync(new URL("../src/templates/items/breathing-form-template.json", import.meta.url), "utf8"));
      let resumo = null;
      const walk = (node) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (node.key === "form_resumo") resumo = node;
        for (const key of Object.keys(node)) walk(node[key]);
      };
      walk(template);
      assert.ok(resumo, "form_resumo existe no template");
      assert.equal(resumo.rollMessageToChat, false);
    });

    it("breathingItemPatch desliga o flag em itens já importados (idempotente)", () => {
      const item = {
        id: "item-1",
        name: "Rengoku",
        ownership: { default: 2 },
        system: {
          template: "NABreathTpl00001",
          body: { contents: [{ key: "form_resumo", value: "<div>${descricao}$</div>", rollMessageToChat: true }] },
          props: { inventario_categoria: "respiracao", forma_id: "chamas_09", respiracao_nome: "Chamas" },
        },
      };
      const first = breathingItemPatch(item, null);
      assert.ok(first, "gera patch na primeira passagem");
      assert.equal(first["system.body"].contents[0].rollMessageToChat, false);
      // Simula o item já corrigido → idempotente
      item.system.body.contents[0].rollMessageToChat = false;
      assert.equal(breathingItemPatch(item, null), null);
    });
  });

  describe("ownership — player abre arma/forma na ficha (P0)", () => {
    it("templates de item não nascem mais com ownership NONE", () => {
      for (const file of ["slayer-weapon-template.json", "breathing-form-template.json"]) {
        const template = JSON.parse(readFileSync(new URL(`../src/templates/items/${file}`, import.meta.url), "utf8"));
        assert.equal(template.ownership?.default, 2, `${file} deve ser Observer`);
      }
    });

    it("repair promove armas importadas de NONE para Observer", () => {
      const changes = weaponRepairChangesRef({ id: "w1", name: "Katana", system: { props: { inventario_categoria: "arma" } } });
      assert.equal(changes.ownership.default, 2);
    });

    it("catálogo de armas inteiro com ownership Observer", () => {
      const catalog = JSON.parse(readFileSync(new URL("../catalogs/slayer-weapons.json", import.meta.url), "utf8"));
      const weapons = catalog.documents.filter((d) => d.type === "equippableItem");
      assert.ok(weapons.length > 0);
      for (const weapon of weapons) assert.equal(weapon.ownership?.default, 2, weapon.name);
    });
  });
});