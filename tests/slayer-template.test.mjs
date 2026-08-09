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
  assert.equal(buttons.length, 35);
  for (const button of buttons) {
    assert.match(button.rollMessage, /actorUuid:entity\.uuid/);
    if (button.key === "respiracao_slayer_usar") {
      assert.match(button.rollMessage, /linkedEntity\.uuid/);
      assert.match(button.rollMessage, /Macro\.NARespFormUse001/);
    } else {
      assert.match(button.rollMessage, /fromUuid\('Compendium\.night-assassins-csb-automation\.night-assassins-macros\.Macro\./);
    }
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
  assert.match(source, /Macro\.NAActionManage01[^\n]+return '';/);
  assert.match(source, /Macro\.NARestManage0001[^\n]+return '';/);
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
  assert.match(source, /"acoes_slayer_dados"/);
  assert.match(source, /"acoes_slayer_resumo"/);
  assert.match(source, /"descanso_slayer_dados"/);
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

test("Marca despertada é exibida como estado textual", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const source = JSON.stringify(template.system.body);
  assert.match(source, /marca_despertada > 0 \? 'ATIVADA' : 'NÃO DESPERTADA'/);
  assert.doesNotMatch(source, /Despertada: \$\{marca_despertada\}\$/);
});

test("template Slayer mostra deslocamento base como 7m mais DEX atual", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const movement = template.system.hidden.find((entry) => entry.name === "deslocamento_slayer");
  assert.deepEqual(movement, { name: "deslocamento_slayer", value: "${7+dex_display}$" });
  const source = JSON.stringify(template.system.body);
  assert.match(source, /"deslocamento_slayer_display"/);
  assert.match(source, /\$\{deslocamento_slayer\}\$m \(7m \+ DEX\)/);
});

test("template Slayer possui Fôlego de Combate calculado por FDV", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const maximum = template.system.hidden.find((entry) => entry.name === "folego_slayer_maximo");
  assert.deepEqual(maximum, { name: "folego_slayer_maximo", value: "${2+fdv_display}$" });
  const source = JSON.stringify(template.system.body);
  assert.match(source, /"folego_slayer_titulo"/);
  assert.match(source, /"folego_slayer_atual"/);
  assert.match(source, /"defaultValue":"\$\{folego_slayer_maximo\}\$"/);
  assert.match(source, /"maxVal":"\$\{folego_slayer_maximo\}\$"/);
  assert.match(source, /font-size: 16px/);
  assert.match(source, /"acoes_slayer_panel"/);
  assert.match(source, /"title":"Economia de Ações"/);
});

test("template Slayer possui estado completo de Respiração organizado", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const source = JSON.stringify(template.system.body);
  const hidden = new Map(template.system.hidden.map((entry) => [entry.name, entry.value]));
  const fields = [
    "resp_bonus_acerto_temp", "resp_bonus_esquiva_temp", "resp_bonus_bloqueio_temp",
    "resp_bonus_dano_dados", "resp_bonus_dano_fixo", "resp_efeito_flag", "resp_efeito_duracao",
    "resp_combo_origem", "resp_combo_turno", "resp_carga_acumulada", "resp_carga_turno_inicio",
    "resp_agua_11_usos_hoje", "resp_agua_08_recarga_turno",
  ];
  for (const key of fields) assert.match(source, new RegExp(`"${key}"`));
  for (const attribute of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
    assert.match(source, new RegExp(`"${attribute}_resp_bonus_temp_slayer"`));
    assert.match(hidden.get(`${attribute}_display`), new RegExp(`${attribute}_resp_bonus_temp_slayer`));
  }
  assert.match(source, /"resp_slayer_panel"/);
  assert.match(source, /"resp_slayer_storage_panel"/);
  assert.match(source, /RESPIRAÇÃO/);
  assert.match(source, /"key":"skills_slayer_respiracoes"/);
  assert.match(source, /"key":"respiracao_slayer_usar"/);
  assert.match(source, /linkedEntity\.uuid/);
  assert.match(source, /Macro\.NARespFormUse001/);
  assert.doesNotMatch(source, /useBreathForm/);
});

test("template Slayer possui as nove abas funcionais na ordem definida", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  let tabbedPanel = null;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (!tabbedPanel && node.type === "tabbedPanel") tabbedPanel = node;
    Object.values(node).forEach(walk);
  }
  walk(template.system.body);
  assert.ok(tabbedPanel);
  assert.deepEqual(tabbedPanel.contents.map((entry) => entry.key), [
    "perfil_slayer_tab", "pericias_tab", "combat_slayer_tab", "skills_slayer_tab",
    "inventario_slayer_tab", "interludios_slayer_tab", "notas_slayer_tab", "configs_tab", "dados_tab",
  ]);
  assert.deepEqual(tabbedPanel.contents.map((entry) => entry.name), [
    "Perfil/Bio", "Perícias", "Combate", "Skills", "Inventário",
    "Interlúdios", "Notas/Diário", "Configurações", "Dados",
  ]);
});

test("Inventário, Skills, Vida e Morte e áreas narrativas usam componentes CSB próprios", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const source = JSON.stringify(template.system.body);
  for (const key of ["inventario_slayer_armas", "inventario_slayer_equipamentos", "inventario_slayer_itens"]) {
    assert.match(source, new RegExp(`"key":"${key}"[^}]+"type":"itemContainer"`));
  }
  for (const key of ["dinheiro_slayer_atual", "moedas_honra_slayer_atual"]) assert.match(source, new RegExp(`"${key}"`));
  for (const key of [
    "skills_slayer_resp_display", "skills_slayer_hab_display", "skills_slayer_classe_display",
    "skills_marca_slayer_panel", "mundo_transparente_slayer_estado", "estado_altruista_slayer_estado",
    "lamina_carmesim_slayer_estado", "hab_origem_slayer_resumo",
  ]) assert.match(source, new RegExp(`"${key}"`));
  for (const key of ["vida_morte_slayer_panel", "perfil_slayer_bio", "interludios_slayer_registro", "notas_slayer_diario"]) {
    assert.match(source, new RegExp(`"${key}"`));
  }
  assert.match(source, /"type":"textArea"/);
});
