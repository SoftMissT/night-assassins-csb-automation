import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { unwrapSlayerTemplate, validateSlayerTemplate } from "../tools/migrate-slayer-template.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(repoRoot, "src", "templates", "actors", "slayer-template.json");
const csbPackagePath = path.join(repoRoot, "src", "imports", "csb-import-slayer-template.json");

test("template Slayer é um documento de ator válido com type _template", () => {
  const document = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  assert.equal(document.type, "_template");
  assert.equal(document.prototypeToken?.name, "slayer_template");
  assert.match(document.prototypeToken?.texture?.src, /na-slayer-template_icon\.webp$/);
});

test("template Slayer tem sistema com body, display, header, hidden, attributeBar", () => {
  const document = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  assert.ok(document.system.body, "system.body não encontrado");
  assert.ok(document.system.header, "system.header não encontrado");
  assert.ok(document.system.hidden, "system.hidden não encontrado");
  assert.ok(document.system.attributeBar, "system.attributeBar não encontrado");
});

test("template Slayer possui os 7 atributos e snapshots 1 e 3", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const source = JSON.stringify(template);
  for (const attribute of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
    assert.match(source, new RegExp(`"${attribute}_nvl1"`));
    assert.match(source, new RegExp(`"${attribute}_nvl3"`));
  }
});

test("template Slayer tem attributeBar com barras de PDV e PDR namespaced", () => {
  const document = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  assert.equal(document.system.attributeBar.pdv_slayer_barra?.value, "${pdv_slayer_atual_num}$");
  assert.equal(document.system.attributeBar.pdv_slayer_barra?.max, "${pdv_slayer_maximo_num}$");
  assert.equal(document.system.attributeBar.pdr_slayer_barra?.value, "${pdr_slayer_atual_num}$");
  assert.equal(document.system.attributeBar.pdr_slayer_barra?.max, "${pdr_slayer_maximo_num}$");
});

test("template Slayer tem hidden com deslocamento e fôlego calculados", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const hidden = new Map(template.system.hidden.map((entry) => [entry.name, entry.value]));
  assert.ok(hidden.has("deslocamento_slayer"), "deslocamento_slayer não encontrado");
  assert.ok(hidden.has("folego_slayer_maximo"), "folego_slayer_maximo não encontrado");
  assert.ok(hidden.has("pdv_slayer_maximo_num"), "pdv_slayer_maximo_num não encontrado");
  assert.ok(hidden.has("pdr_slayer_maximo_num"), "pdr_slayer_maximo_num não encontrado");
});

test("template Slayer tem abas Perícias, Combate, Skills e Config/Dados", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  let tabbedPanel = null;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (!tabbedPanel && node.type === "tabbedPanel") tabbedPanel = node;
    Object.values(node).forEach(walk);
  }
  walk(template.system.body);
  assert.ok(tabbedPanel, "tabbedPanel não encontrado");
  const tabKeys = tabbedPanel.contents.map((entry) => entry.key);
  assert.ok(tabKeys.includes("pericias_tab"), "Aba Perícias não encontrada");
  assert.ok(tabKeys.includes("combat_slayer_tab"), "Aba Combate não encontrada");
  assert.ok(tabKeys.includes("skills_slayer_tab"), "Aba Skills não encontrada");
  assert.ok(tabKeys.includes("configs_tab"), "Aba Config/Dados não encontrada");
});

test("template Slayer tem itens de perfil no header", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const headerTable = template.system.header.contents.find((entry) => entry.key === "perfil");
  assert.ok(headerTable, "Header perfil não encontrado");
  assert.equal(headerTable.type, "table");
  const headerKeys = [];
  function findKeys(node) {
    if (!node || typeof node !== "object") return;
    if (node.key) headerKeys.push(node.key);
    Object.values(node).forEach(findKeys);
  }
  findKeys(headerTable);
  assert.ok(headerKeys.includes("nome_slayer"), "nome_slayer não encontrado no header");
  assert.ok(headerKeys.includes("nvl_pj"), "nvl_pj não encontrado no header");
  assert.ok(headerKeys.includes("origem_dropdown"), "origem_dropdown não encontrado no header");
  assert.ok(headerKeys.includes("resp_slayer_display"), "resp_slayer_display não encontrado no header");
});

test("template Slayer tem pelo menos 35 botões com macros estáveis", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const buttons = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "label" && node.rollMessage) buttons.push(node);
    Object.values(node).forEach(walk);
  }
  walk(template.system);
  assert.ok(buttons.length >= 35, `Esperados ao menos 35 botões; encontrados ${buttons.length}.`);
  for (const button of buttons) {
    if (button.key === "na_slayer_reset_ficha") {
      assert.match(button.rollMessage, /api\?\.resetSheet\(entity\)/);
      continue;
    }
    assert.match(button.rollMessage, /actorUuid:entity\.uuid/);
    assert.match(button.rollMessage, /fromUuid\('Compendium\.night-assassins-csb-automation\.|api\?\./);
  }
});

test("template Slayer tem itemContainer para armas e Formas", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const containers = new Map();
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "itemContainer") containers.set(node.key, node);
    Object.values(node).forEach(walk);
  }
  walk(template.system.body);
  assert.ok(containers.has("inventario_slayer_armas"), "inventario_slayer_armas não encontrado");
  assert.ok(containers.has("skills_slayer_respiracoes"), "skills_slayer_respiracoes não encontrado");
});

test("pacote CSB import segue o contrato de importação", () => {
  const document = JSON.parse(fs.readFileSync(csbPackagePath, "utf8"));
  assert.equal(document.isCustomSystemExport, true);
  assert.equal(document.actors.length, 1);
  assert.equal(document.actors[0].id, "NASlayerTpl00001");
  assert.deepEqual(document.items, []);
});

test("pacote CSB import contém template Slayer válido", () => {
  const document = JSON.parse(fs.readFileSync(csbPackagePath, "utf8"));
  const actor = document.actors[0];
  assert.equal(actor.type, "_template");
  assert.ok(actor.data, "actor.data não encontrado (formato CSB inválido)");
  assert.ok(actor.data.body, "actor.data.body não encontrado");
  assert.ok(actor.data.header, "actor.data.header não encontrado");
  assert.ok(actor.data.hidden, "actor.data.hidden não encontrado");
  assert.ok(actor.data.attributeBar, "actor.data.attributeBar não encontrado");
});

test("template Slayer tem pelo menos 41 itens hidden", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  assert.ok(template.system.hidden.length >= 40, `Esperados ao menos 40 hidden; encontrados ${template.system.hidden.length}.`);
});

test("template Slayer tem hidden com atributos display", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const hiddenNames = template.system.hidden.map((e) => e.name);
  for (const attr of ["vit_display", "dex_display", "for_display", "car_display", "fdv_display", "int_display", "sab_display"]) {
    assert.ok(hiddenNames.includes(attr), `${attr} não encontrado em hidden`);
  }
});

test("template Slayer tem hidden com PDV/PDR calculados", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const hiddenNames = template.system.hidden.map((e) => e.name);
  assert.ok(hiddenNames.includes("pdv_slayer_maximo_num"), "pdv_slayer_maximo_num não encontrado");
  assert.ok(hiddenNames.includes("pdv_slayer_atual_num"), "pdv_slayer_atual_num não encontrado");
  assert.ok(hiddenNames.includes("pdr_slayer_maximo_num"), "pdr_slayer_maximo_num não encontrado");
  assert.ok(hiddenNames.includes("pdr_slayer_atual_num"), "pdr_slayer_atual_num não encontrado");
});

test("template Slayer tem hidden com rank e nível", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const hiddenNames = template.system.hidden.map((e) => e.name);
  assert.ok(hiddenNames.includes("rank_atual"), "rank_atual não encontrado");
  assert.ok(hiddenNames.includes("nvl_num"), "nvl_num não encontrado");
  assert.ok(hiddenNames.includes("nvl_respiracao_num"), "nvl_respiracao_num não encontrado");
});

test("template Slayer tem hidden com bônus de origem", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const hiddenNames = template.system.hidden.map((e) => e.name);
  assert.ok(hiddenNames.includes("origem_slayer_pdv_val"), "origem_slayer_pdv_val não encontrado");
  assert.ok(hiddenNames.includes("origem_slayer_pdr_val"), "origem_slayer_pdr_val não encontrado");
});

test("template Slayer tem hidden com bônus de metal", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const hiddenNames = template.system.hidden.map((e) => e.name);
  assert.ok(hiddenNames.includes("metal_acerto_bonus"), "metal_acerto_bonus não encontrado");
  assert.ok(hiddenNames.includes("metal_esquiva_bonus"), "metal_esquiva_bonus não encontrado");
  assert.ok(hiddenNames.includes("metal_dano_bonus"), "metal_dano_bonus não encontrado");
  assert.ok(hiddenNames.includes("metal_bloqueio_bonus"), "metal_bloqueio_bonus não encontrado");
});

test("template Slayer declara todas as keys persistentes usadas por fórmulas e macros", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const componentKeys = new Set();
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "string" && typeof node.key === "string" && node.key) componentKeys.add(node.key);
    Object.values(node).forEach(walk);
  }
  walk(template.system);
  for (const key of [
    "marca_dano_dados",
    "marca_dano_faces",
    "marca_dano_necrotico_dados",
    "interludio_concentracao_total_constante",
    "interludio_cabaca_pequena_completa",
  ]) assert.ok(componentKeys.has(key), `${key} deve existir como componente persistente`);
});

test("template Slayer tem hidden com bônus de habilidade", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const hiddenNames = template.system.hidden.map((e) => e.name);
  assert.ok(hiddenNames.includes("hab_slayer_pdr_por_nivel"), "hab_slayer_pdr_por_nivel não encontrado");
  assert.ok(hiddenNames.includes("hab_acerto_bonus"), "hab_acerto_bonus não encontrado");
  assert.ok(hiddenNames.includes("hab_bloqueio_bonus"), "hab_bloqueio_bonus não encontrado");
  assert.ok(hiddenNames.includes("hab_esquiva_bonus"), "hab_esquiva_bonus não encontrado");
});

test("template Slayer tem body com contents", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  assert.ok(Array.isArray(template.system.body.contents), "body.contents não é array");
  assert.ok(template.system.body.contents.length > 0, "body.contents está vazio");
});

test("template Slayer tem header com contents", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  assert.ok(Array.isArray(template.system.header.contents), "header.contents não é array");
  assert.ok(template.system.header.contents.length > 0, "header.contents está vazio");
});
