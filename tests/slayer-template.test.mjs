import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { unwrapSlayerTemplate, validateSlayerTemplate } from "../tools/migrate-slayer-template.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(repoRoot, "fvtt-Actor-slayer_template_atual-xif9qdBXTkeL1BXW.json");
const csbPackagePath = path.join(repoRoot, "csb-import-slayer-template.json");

test("template Slayer usa somente o contrato de recursos namespaced", () => {
  const document = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  assert.equal(document.name, "Slayer_template_atual");
  assert.equal(document.type, "_template");
  assert.equal(document.prototypeToken.name, "Slayer_template_atual");
  const template = unwrapSlayerTemplate(document);
  assert.deepEqual(validateSlayerTemplate(template), { duplicates: [], forbidden: [] });
  assert.equal(template.system.attributeBar.pdv_slayer_barra.value, "${pdv_slayer_atual_valor_display}$");
  assert.equal(template.system.attributeBar.pdv_slayer_barra.max, "${pdv_slayer_total_valor}$");
  assert.equal(template.system.attributeBar.pdr_slayer_barra.value, "${pdr_slayer_atual_valor_display}$");
  assert.equal(template.system.attributeBar.pdr_slayer_barra.max, "${pdr_slayer_total_valor}$");
  assert.equal(template.system.attributeBar.pdv_barra, undefined);
  assert.equal(template.system.attributeBar.pdr_barra, undefined);
});

test("todos os botões do Slayer usam macros estáveis e o Actor da própria ficha", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const buttons = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "label" && node.rollMessage) buttons.push(node);
    Object.values(node).forEach(walk);
  }
  walk(template.system);
  assert.equal(buttons.length, 32);
  for (const button of buttons) {
    assert.match(button.rollMessage, /actorUuid:entity\.uuid/);
    assert.match(button.rollMessage, /fromUuid\('Compendium\.night-assassins-csb-automation\.night-assassins-macros\.Macro\./);
    assert.doesNotMatch(button.rollMessage, /game\.macros\.get\('|atr_(vit|dex|for|car|fdv|int|sab)_valor|val:/);
  }
  const source = buttons.map((button) => button.rollMessage).join("\n");
  assert.match(source, /test:'Bloqueio',attr:'FOR'/);
  assert.match(source, /test:'Esquiva',attr:'DEX'/);
  assert.match(source, /Macro\.NAHitRoll0000001/);
  assert.match(source, /test:'Investigação',attr:'INT'/);
  assert.match(source, /Macro\.NAResistance0001/);
  assert.match(source, /kind:'slayer'/);
  assert.match(source, /Macro\.NAResistance0001[^\n]+return '';/);
  assert.match(source, /Macro\.NAStatusManage01[^\n]+return '';/);
});

test("template Slayer separa dano comum, Ferida e armazenamento de Resistências", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const source = JSON.stringify(template);
  assert.match(source, /"pdv_slayer_dano_tomado"/);
  assert.match(source, /"pdv_slayer_dano_ferida"/);
  assert.match(source, /"status_slayer_resistencias_dados"/);
  assert.match(source, /"status_slayer_resistencias_resumo"/);
  assert.match(source, /"status_slayer_dados"/);
  assert.match(source, /"status_slayer_resumo"/);
  assert.match(source, /"status_slayer_exaustao"/);
  assert.match(source, /\$\{pdv_slayer_total_conta-pdv_slayer_dano_ferida\}\$/);
  assert.match(source, /pdv_slayer_total_conta-pdv_slayer_dano_ferida\+pdv_slayer_curado\+pdv_slayer_extra-pdv_slayer_dano_tomado/);
  assert.doesNotMatch(source, /\bpdv_slayer_dano\b/);
});

test("pacote global segue o contrato de importação do CSB", () => {
  const document = JSON.parse(fs.readFileSync(csbPackagePath, "utf8"));
  assert.equal(document.isCustomSystemExport, true);
  assert.equal(document.actors.length, 1);
  assert.equal(document.actors[0].id, "NASlayerTpl00001");
  assert.deepEqual(document.items, []);
});

test("atributos compartilhados e snapshots 1, 3 e 7 permanecem válidos", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const source = JSON.stringify(template);
  for (const attribute of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
    assert.match(source, new RegExp(`"${attribute}_nvl1"`));
    assert.match(source, new RegExp(`"${attribute}_nvl3"`));
    assert.match(source, new RegExp(`"${attribute}_nvl7"`));
  }
  assert.match(source, /hab_tsuyoi_vit_bonus/);
  assert.doesNotMatch(source, /dex_nvl7dex_nvl7|car_nvl6/);
});
