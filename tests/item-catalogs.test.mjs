import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { BREATHING_CATALOG, BREATHING_FOLDER_NAMES, PUBLISHED_BREATHINGS } from "../tools/build-breathing-sources.mjs";
import { BREATHING_ICONS } from "../scripts/breathing-icons.mjs";
import "../tools/build-weapon-sources.mjs";

async function sourceDocuments(directory) {
  const files = (await readdir(new URL(directory, import.meta.url))).filter((file) => file.endsWith(".json"));
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(new URL(`${directory}${file}`, import.meta.url), "utf8"))));
}

describe("catálogo de Respirações", () => {
  it("o catálogo de fonte conhece as 44 Respirações do sistema, mas só publica as 6 com motor real", async () => {
    const documents = await sourceDocuments("../build/compendium/respiracoes/");
    const folders = documents.filter((document) => String(document._key).startsWith("!folders!"));
    const items = documents.filter((document) => document.type === "equippableItem");
    assert.equal(BREATHING_CATALOG.length, 44, "catálogo de fonte continua completo, mesmo sem publicar tudo");
    assert.equal(BREATHING_FOLDER_NAMES.length, 44);
    assert.equal(PUBLISHED_BREATHINGS.length, 6, "só Chamas/Metal/Neve/Névoa/Pedra/Vento têm motor de estado/combate real");
    assert.equal(folders.length, PUBLISHED_BREATHINGS.length, "build final publica só as Respirações com motor real");
    assert.deepEqual(folders.map((folder) => folder.name.replace(/^Respiração d[ao]s? /u, "")).sort(), [...PUBLISHED_BREATHINGS].sort());
    assert.ok(items.every((item) => PUBLISHED_BREATHINGS.includes(item.system?.props?.respiracao_nome ?? "")), "nenhuma Respiração sem motor real deve vazar para o pack");
    assert.ok(items.every((item) => item.folder && item.system?.props?.inventario_categoria === "respiracao"));
    assert.ok(items.every((item) => /^<(?:p|h[1-6]|ul|ol|blockquote|table|hr)/u.test(item.system.props.descricao)), "descrições publicadas devem ser HTML do Foundry");
  });

  it("Água não é publicada no pack Foundry (sem motor de estado dedicado ainda)", async () => {
    const documents = await sourceDocuments("../build/compendium/respiracoes/");
    const water = documents.filter((document) => document.type === "equippableItem" && document.system?.props?.respiracao_nome === "Água");
    assert.equal(water.length, 0, "Água fica de fora até receber o mesmo tratamento de auditoria/motor das 6 publicadas");
  });

  it("publica Chamas com ações e níveis mecânicos canônicos", async () => {
    const documents = await sourceDocuments("../build/compendium/respiracoes/");
    const flames = documents.filter((document) => document.type === "equippableItem" && document.system?.props?.respiracao_nome === "Chamas");
    assert.equal(flames.length, 9);
    assert.equal(flames.find((item) => item.system.props.forma_id === "chamas_01").system.props.tipo_manobra, "Passiva");
    const passive = flames.find((item) => item.system.props.forma_id === "chamas_01");
    assert.equal(passive.system.props.forma_passiva, 1);
    assert.equal(passive.system.props.nvl1_dano, "", "Esquentar não pode herdar 1d6 falso do catálogo legado");
    assert.equal(passive.system.props.nvl1_tipos_dano, "");
    assert.ok(flames.filter((item) => item.system.props.forma_id !== "chamas_01").every((item) => item.system.props.forma_passiva === 0));
    assert.equal(flames.find((item) => item.system.props.forma_id === "chamas_04").system.props.tipo_manobra, "Reação");
    const storm = flames.find((item) => item.system.props.forma_id === "chamas_06");
    assert.equal(storm.system.props.nome_forma, "Roku no Kata Hono Arashi");
    assert.equal(storm.system.props.nome_jp, "Tormenta de Chamas");
    assert.equal(storm.system.props.tem_nvl2, 0);
    assert.equal(storm.system.props.tem_nvl3, 1);
    assert.equal(storm.system.props.nvl3_dano, "8d8");
  });

  it("publica as seis Respirações prioritárias como Items mecânicos e nomenclatura canônica", async () => {
    const documents = await sourceDocuments("../build/compendium/respiracoes/");
    const items = documents.filter((document) => document.type === "equippableItem");
    const expected = new Map([
      ["Chamas", { count: 9, passive: "chamas_01" }],
      ["Pedra", { count: 5, passive: null }],
      ["Metal", { count: 6, passive: "metal_05" }],
      ["Neve", { count: 8, passive: "neve_08" }],
      ["Névoa", { count: 8, passive: null }],
      ["Vento", { count: 10, passive: "vento_01" }],
    ]);

    for (const [breathing, contract] of expected) {
      const forms = items.filter((item) => item.system?.props?.respiracao_nome === breathing);
      assert.equal(forms.length, contract.count, `${breathing} deve publicar todas as Formas e passivas`);
      assert.ok(forms.every((item) => item.system.props.forma_id), `${breathing} deve ter IDs mecânicos`);
      assert.ok(forms.every((item) => item.system.props.descricao.startsWith("<")), `${breathing} deve publicar descrição HTML`);
      const passives = forms.filter((item) => item.system.props.forma_passiva === 1);
      assert.deepEqual(passives.map((item) => item.system.props.forma_id), contract.passive ? [contract.passive] : []);
      assert.ok(forms.filter((item) => item.system.props.forma_passiva !== 1).every((item) => Number(item.system.props.nvl1_custo) >= 0));
    }
    const prefixes = new Map([
      ["Chamas", "Honoo no Kokyu — "], ["Pedra", "Iwa no Kokyu — "],
      ["Metal", "Kinzoku no Kokyu — "], ["Neve", "Yuki no Kokyu — "],
      ["Névoa", "Kasumi no Kokyu — "], ["Vento", "Kaze no Kokyu — "],
    ]);
    for (const [breathing, prefix] of prefixes) {
      const forms = items.filter((item) => item.system?.props?.respiracao_nome === breathing);
      assert.ok(forms.every((item) => item.name.startsWith(prefix)), `${breathing} deve usar o prefixo ${prefix}`);
    }
    const stone = items.filter((item) => item.system?.props?.respiracao_nome === "Pedra");
    assert.ok(stone.some((item) => item.system.props.nome_forma.includes("Tenmen Kudaki")));
  });

  it("usa os ícones locais disponíveis sem fabricar assets ausentes", async () => {
    const documents = await sourceDocuments("../build/compendium/respiracoes/");
    const items = documents.filter((document) => document.type === "equippableItem");
    for (const [breathing, file] of Object.entries(BREATHING_ICONS)) {
      if (!PUBLISHED_BREATHINGS.includes(breathing)) continue;
      const forms = items.filter((item) => item.system?.props?.respiracao_nome === breathing);
      assert.ok(forms.length > 0, `a Respiração ${breathing} deve possuir Formas catalogadas`);
      assert.ok(forms.every((item) => item.img === `modules/night-assassins-csb-automation/assets/icons/breathing/${file}`));
    }
    const { fileURLToPath } = await import("node:url");
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    for (const item of items) {
      const relative = String(item.img ?? "").replace("modules/night-assassins-csb-automation/", "");
      assert.ok(relative.startsWith("assets/") && existsSync(path.join(repoRoot, relative)), `img inexistente no disco: ${item.img}`);
    }
  });
});

describe("catálogo de armas Slayer", () => {
  it("separa as 26 armas básicas e as 17 armas especiais", async () => {
    const documents = await sourceDocuments("../build/compendium/armas-slayer/");
    assert.equal(documents.filter((document) => String(document._key).startsWith("!folders!")).length, 2);
    assert.equal(documents.filter((document) => document.type === "_equippableItemTemplate").length, 1);
    const weapons = documents.filter((document) => document.type === "equippableItem");
    assert.equal(weapons.length, 43);
    assert.ok(weapons.every((item) => item.system?.props?.inventario_categoria === "arma"));
    assert.ok(weapons.every((item) => /^<(?:p|h[1-6]|ul|ol|blockquote|table|hr)/u.test(item.system.props.descricao)), "descrições de armas devem ser HTML do Foundry");
    assert.ok(weapons.every((item) => item.system?.template === "NAWeaponTpl00001"));
    assert.ok(weapons.every((item) => Array.isArray(item.system.props.arma_perfis_ataque) && item.system.props.arma_perfis_ataque.length > 0));
    assert.ok(weapons.every((item) => Array.isArray(item.system.props.arma_tipos_dano)));
    const special = weapons.filter((item) => item.system.props.arma_categoria === "especial");
    assert.equal(special.length, 17);
    assert.ok(special.every((item) => item.system.props.arma_entidade && item.system.props.arma_demonio));
    assert.ok(special.every((item) => Array.isArray(item.system.props.arma_perfis_ataque)));
    assert.ok(special.every((item) => Object.keys(item.system.props.arma_dano_por_rank).length >= 6));
    assert.ok(special.every((item) => item.system.props.arma_regra_completa.length > 1000));
    assert.ok(special.every((item) => ["D", "C", "B", "A", "S", "SS"].every((rank) => item.system.props.arma_formulas_por_rank[rank]?.length > 0)));
    assert.ok(special.every((item) => item.system.props.arma_rank_ss_formula));
  });

  it("usa um template exclusivo de arma com rolagem pelo Item portado", async () => {
    const documents = await sourceDocuments("../build/compendium/armas-slayer/");
    const template = documents.find((document) => document.type === "_equippableItemTemplate");
    const serialized = JSON.stringify(template.system);
    assert.match(serialized, /rollWeaponItem/);
    assert.match(serialized, /linkedEntity/);
    assert.doesNotMatch(serialized, /itemUuid:entity\.uuid/);
    assert.match(serialized, /ROLAR DANO DA ARMA/);
    assert.doesNotMatch(serialized, /na-sheet-text|custom-orbitron-wrapper|<style|style=/i);
    assert.match(serialized, /arma_perfis_resumo/);
    assert.match(serialized, /arma_rank_ss_formula/);
    assert.doesNotMatch(serialized, /arma_imagem_vertical|fetchFromParent/);
    assert.doesNotMatch(serialized, /respiracao_nome|tipo_manobra|Usar Forma/);
  });

  it("publica passivas sem botão de ativação manual", async () => {
    const documents = await sourceDocuments("../build/compendium/respiracoes/");
    const template = documents.find((document) => document.type === "_equippableItemTemplate");
    const serialized = JSON.stringify(template.system);
    assert.match(serialized, /"key":"tab_usar"[^}]+"visibilityFormula":"forma_passiva != 1"/);
  });

  it("publica ícones de compêndio sem o campo vertical legado", async () => {
    const documents = await sourceDocuments("../build/compendium/armas-slayer/");
    const weapons = documents.filter((document) => document.type === "equippableItem");
    const legacyVerticalArtwork = weapons.filter((item) => item.system?.props?.arma_imagem_vertical);
    const customIcons = weapons.filter((item) => item.img?.startsWith("modules/night-assassins-csb-automation/assets/icons/weapons/"));
    assert.equal(legacyVerticalArtwork.length, 0);
    assert.equal(customIcons.length, 39);
    for (const item of customIcons) {
      const relativePath = item.img.replace("modules/night-assassins-csb-automation/", "../");
      await access(new URL(relativePath, import.meta.url));
    }
  });
});
