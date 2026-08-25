import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { unwrapSlayerTemplate, validateSlayerTemplate } from "../tools/migrate-slayer-template.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(repoRoot, "src", "templates", "actors", "slayer-template.json");
const csbPackagePath = path.join(repoRoot, "src", "imports", "csb-import-slayer-template.json");

test("template Slayer usa somente o contrato de recursos namespaced", () => {
  const document = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  assert.equal(document.name, "slayer_template");
  assert.equal(document.type, "_template");
  assert.equal(document.prototypeToken.name, "slayer_template");
  assert.match(document.prototypeToken.texture.src, /na-slayer-template_icon\.webp$/);
  const template = unwrapSlayerTemplate(document);
  assert.deepEqual(validateSlayerTemplate(template), { duplicates: [], forbidden: [] });
  assert.equal(template.system.attributeBar.pdv_slayer_barra.value, "${pdv_slayer_atual_num}$");
  assert.equal(template.system.attributeBar.pdv_slayer_barra.max, "${pdv_slayer_maximo_num}$");
  assert.equal(template.system.attributeBar.pdr_slayer_barra.value, "${pdr_slayer_atual_num}$");
  assert.equal(template.system.attributeBar.pdr_slayer_barra.max, "${pdr_slayer_maximo_num}$");
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
  assert.ok(buttons.length >= 35, `Esperados ao menos 35 botões funcionais; encontrados ${buttons.length}.`);
  for (const button of buttons) {
    assert.match(button.rollMessage, /actorUuid:entity\.uuid/);
    assert.match(button.rollMessage, /fromUuid\('Compendium\.night-assassins-csb-automation\.night-assassins-macros\.Macro\.|api\?\.(rollWeaponItem|reloadWeaponItem|useBreathForm|openDerivedBonusAudit)/);
    assert.match(String(button.value), /na-sheet-text|custom-orbitron-wrapper/);
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
  assert.match(source, /Macro\.NALifeDeath00001[^\n]+return '';/);
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
  assert.match(source, /pdv_slayer_maximo_num/);
  assert.match(source, /max\(0,pdv_slayer_total_conta\+interludio_pdv_permanente-pdv_slayer_dano_ferida\+pdv_slayer_extra\)/);
  assert.match(source, /pdv_slayer_total_conta\+interludio_pdv_permanente-pdv_slayer_dano_ferida\+pdv_slayer_curado\+pdv_slayer_extra-pdv_slayer_dano_tomado/);
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

test("cards dos atributos finais usam a cor semântica de cada característica", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const packageTemplate = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(csbPackagePath, "utf8")));
  const findAttributePanel = (document) => document.system.body.contents.find((entry) =>
    entry?.type === "panel"
      && entry?.flow === "grid-7"
      && entry?.contents?.some?.((component) => component?.key === "atr_vit_valor")
  );
  const panels = [findAttributePanel(template), findAttributePanel(packageTemplate)];
  for (const panel of panels) assert.ok(panel, "Painel principal dos sete atributos não encontrado.");

  const attributes = ["vit", "dex", "for", "car", "fdv", "int", "sab"];
  for (const attributePanel of panels) {
    for (const [index, attribute] of attributes.entries()) {
      const label = attributePanel.contents[index];
      const value = attributePanel.contents[index + attributes.length];
      assert.equal(
        label.value,
        `<span class="na-sheet-text na-sheet-label na-sheet-size-md na-sheet-role-${attribute}">${attribute.toUpperCase()}</span>`,
      );
      assert.equal(value.key, `atr_${attribute}_valor`);
      assert.equal(
        value.value,
        `<span class="na-sheet-text na-sheet-stat na-sheet-size-xl na-sheet-role-${attribute}">\${${attribute}_display}$</span>`,
      );
    }
  }
});

test("Marca despertada é exibida como estado textual", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const source = JSON.stringify(template.system.body);
  assert.match(source, /marca_despertada > 0 \? 'ATIVADA' : 'NÃO DESPERTADA'/);
  assert.doesNotMatch(source, /Despertada: \$\{marca_despertada\}\$/);
});

test("template Slayer mostra deslocamento e bonus da Concentracao Total Constante", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const movement = template.system.hidden.find((entry) => entry.name === "deslocamento_slayer");
  assert.deepEqual(movement, { name: "deslocamento_slayer", value: "${7+dex_display+(interludio_concentracao_total_constante ? 1.5 : 0)}$" });
  const source = JSON.stringify(template.system.body);
  assert.match(source, /"deslocamento_slayer_display"/);
  assert.match(source, /Deslocamento: \$\{deslocamento_slayer\}\$m \(7m \+ DEX\)/);
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
  assert.match(source, /na-sheet-size-md|na-sheet-label/);
  assert.match(source, /"acoes_slayer_panel"/);
  assert.match(source, /"title":"Economia de Ações"/);
});

test("template Slayer preserva armazenamento de Respiração e expõe automação rolável", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const source = JSON.stringify(template.system.body);
  const hidden = new Map(template.system.hidden.map((entry) => [entry.name, entry.value]));
  const fields = [
    "resp_bonus_acerto_temp", "resp_bonus_esquiva_temp", "resp_bonus_bloqueio_temp",
    "resp_bonus_dano_dados", "resp_bonus_dano_fixo", "resp_efeito_flag", "resp_efeito_duracao",
    "resp_combo_origem", "resp_combo_turno", "resp_carga_acumulada", "resp_carga_turno_inicio",
    "resp_agua_11_usos_hoje", "resp_agua_08_recarga_turno",
    "resp_chamas_calor_arma", "resp_chamas_bonus_acerto", "resp_chamas_bonus_dano",
    "resp_chamas_estado", "resp_chamas_bonus_dado", "resp_chamas_resumo",
  ];
  for (const key of fields) assert.match(source, new RegExp(`"${key}"`));
  for (const attribute of ["vit", "dex", "for", "car", "fdv", "int", "sab"]) {
    assert.match(source, new RegExp(`"${attribute}_resp_bonus_temp_slayer"`));
    assert.match(hidden.get(`${attribute}_display`), new RegExp(`${attribute}_resp_bonus_temp_slayer`));
  }
  assert.match(source, /"resp_slayer_storage_panel"/);
  assert.match(source, /"key":"skills_slayer_respiracoes"/);
  assert.doesNotMatch(source, /"resp_slayer_panel"/);
  assert.match(source, /"key":"respiracao_slayer_usar"/);
  assert.match(source, /useBreathForm/);
});

test("template Slayer organiza as abas canônicas em três abas enxutas", () => {
  // Perfil/Bio, Notas/Diário, Inventário, Interlúdios e Skills foram removidas
  // como abas dedicadas (decisão do operador, 2026-08-25): Descanso, Deslocamento,
  // as Formas de Respiração e o bônus de Concentração Total/Cabaça Pequena foram
  // realocados para dentro de COMBATE antes da remoção; o restante de Skills virou
  // um painel colapsável dentro de Config/Dados. Perfil/Notas/Interlúdios/Inventário
  // não tinham dependências externas (confirmado por auditoria + grep) e foram
  // descartadas junto com a aba.
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
    "pericias_tab", "combat_slayer_tab", "configs_tab",
  ]);
  assert.deepEqual(tabbedPanel.contents.map((entry) => entry.name), [
    "Perícias", "Combate", "Config / Dados",
  ]);
  const combat = tabbedPanel.contents.find((entry) => entry.key === "combat_slayer_tab");
  const combatSource = JSON.stringify(combat);
  // Descanso e Deslocamento agora abrem a aba Combate (movidos da extinta Perfil/Bio).
  assert.match(combatSource, /descanso_slayer_gerenciar/);
  assert.match(combatSource, /deslocamento_slayer_display/);
  assert.match(combatSource, /Deslocamento: \$\{deslocamento_slayer\}\$m \(7m \+ DEX\)/);
  const combatKeys = combat.contents.map((entry) => entry.key || entry.type);
  assert.deepEqual(combatKeys, [
    "perfil_slayer_recursos_runtime_panel", "table", "label", "combat_slayer_table",
    "acoes_slayer_panel", "panel", "resistencias_slayer_panel", "status_slayer_panel",
    "inventario_slayer_armas", "skills_slayer_respiracoes", "combat_slayer_bonus_interludio_panel",
    "combate_acumulos_slayer_panel",
  ]);
  // Condições (Resistências + Status) vivem dentro de COMBATE
  assert.match(combatSource, /status_slayer_gerenciar/);
  assert.match(combatSource, /resistencia_slayer_gerenciar/);
  // Painel de Acúmulos das Respirações em COMBATE
  assert.match(combatSource, /combate_acumulos_slayer_panel/);
  // Formas de Respiração (movidas da extinta aba Skills)
  assert.match(combatSource, /"key":"skills_slayer_respiracoes"/);
  // Bônus de Interlúdio (movido da extinta aba Interlúdios; único conteúdo salvo dela)
  assert.match(combatSource, /interludio_concentracao_total_constante/);
  assert.match(combatSource, /interludio_cabaca_pequena_completa/);
  for (const key of ["resp_agua_estado", "resp_chamas_estado", "resp_pedra_estado", "resp_nevoa_estado", "resp_metal_estado", "resp_neve_estado"]) {
    assert.match(combatSource, new RegExp(`\\$\{${key}\}\\$`));
  }
});

test("Perfil/Bio, Interlúdios, Notas e Inventário deixaram de existir como abas", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  let tabbedPanel = null;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (!tabbedPanel && node.type === "tabbedPanel") tabbedPanel = node;
    Object.values(node).forEach(walk);
  }
  walk(template.system.body);
  for (const key of ["perfil_slayer_tab", "interludios_slayer_tab", "notas_slayer_tab", "inventario_slayer_tab", "skills_slayer_tab"]) {
    assert.equal(tabbedPanel.contents.find((entry) => entry.key === key), undefined, `Aba ${key} deveria ter sido removida.`);
  }
  const serialized = JSON.stringify(template.system.body);
  // Conteúdo narrativo/administrativo sem dependência externa foi descartado com a aba.
  for (const key of [
    "perfil_slayer_nome_social", "perfil_slayer_pronomes", "perfil_slayer_aparencia",
    "perfil_slayer_personalidade", "perfil_slayer_bio",
    "notas_slayer_diario", "notas_slayer_anotacoes", "notas_slayer_livres",
    "interludio_semana_panel", "interludio_semana_atual", "interludio_reflexo_panel",
    "interludio_slayer_gerenciar",
    "dinheiro_slayer_atual", "moedas_honra_slayer_atual",
    "inventario_slayer_equipamentos", "inventario_slayer_itens",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(`"${key}"`), `${key} deveria ter sido removido com a aba.`);
  }
  assert.doesNotMatch(serialized, /Macro\.NAInterlude00001/);
  assert.doesNotMatch(serialized, /"key":"status_slayer_tab"|"key":"dados_tab"/);
});

test("Marca do Caçador (antiga aba Skills) fica em painel colapsável dentro de Config/Dados", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  let tabbedPanel = null;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (!tabbedPanel && node.type === "tabbedPanel") tabbedPanel = node;
    Object.values(node).forEach(walk);
  }
  walk(template.system.body);
  const configs = tabbedPanel.contents.find((entry) => entry.key === "configs_tab");
  const legacyPanel = configs.contents.find((entry) => entry.key === "skills_slayer_legado_panel");
  assert.ok(legacyPanel, "Painel legado da aba Skills não encontrado em Config/Dados.");
  assert.equal(legacyPanel.type, "panel");
  assert.equal(legacyPanel.collapsible, true);
  const skills = JSON.stringify(legacyPanel);
  for (const key of ["skills_slayer_origem_panel", "estados_avancados_slayer_panel", "alma_lamina_slayer_panel", "alma_lamina_slayer_notas"]) {
    assert.match(skills, new RegExp(key));
  }
  // Formas de Respiração NÃO ficam aqui: foram movidas para Combate, não para Config.
  assert.doesNotMatch(skills, /"key":"skills_slayer_respiracoes"/);
});

test("Vida e Morte e áreas remanescentes usam componentes CSB próprios", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const source = JSON.stringify(template.system.body);
  assert.match(source, new RegExp(`"key":"inventario_slayer_armas"[^}]+"type":"itemContainer"`));
  // Equipamentos e Itens genéricos foram removidos junto com a aba Inventário
  // (decisão explícita do operador — não havia relocação pedida para esses containers).
  assert.doesNotMatch(source, /"inventario_slayer_equipamentos"|"inventario_slayer_itens"/);
  for (const key of [
    "skills_slayer_resp_display", "skills_slayer_hab_display", "skills_slayer_classe_display",
    "skills_marca_slayer_panel", "hab_origem_slayer_resumo", "armas_proficientes",
  ]) assert.match(source, new RegExp(`"${key}"`));
  for (const key of ["vida_morte_slayer_panel", "estados_avancados_slayer_panel"]) {
    assert.match(source, new RegExp(`"${key}"`));
  }
  assert.match(source, /"estados_slayer_dados"/);
  assert.match(source, /"estados_slayer_resumo"/);
  assert.match(source, /"estados_avancados_slayer_gerenciar"/);
  assert.match(source, /Macro\.NAAdvStates00001/);
  for (const key of ["vida_morte_slayer_dados", "vida_morte_slayer_resumo", "vida_morte_slayer_marcas", "vida_morte_slayer_quedas", "vida_morte_slayer_gerenciar"]) {
    assert.match(source, new RegExp(`"${key}"`));
  }
  assert.match(source, /"type":"textArea"/);
});

test("botão de arma envia o Item vinculado ao motor próprio", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const serialized = JSON.stringify(template.system);
  assert.match(serialized, /rollWeaponItem/);
  assert.match(serialized, /reloadWeaponItem/);
  assert.match(serialized, /item:weapon/);
  assert.doesNotMatch(serialized, /formulaBase:linkedEntity/);
  assert.match(serialized, /arma_perfis_resumo/);
  assert.match(serialized, /arma_tipos_dano_resumo/);
  assert.match(serialized, /arma_propriedades/);
});

test("itemContainers restantes (arma e Formas) filtram por template exclusivo", () => {
  // inventario_slayer_equipamentos e inventario_slayer_itens foram removidos junto
  // com a aba Inventário (decisão explícita do operador); skills_slayer_respiracoes
  // agora vive dentro de COMBATE, não mais em Skills.
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const containers = new Map();
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "itemContainer") containers.set(node.key, node);
    Object.values(node).forEach(walk);
  }
  walk(template.system.body);
  assert.deepEqual(containers.get("skills_slayer_respiracoes")?.templateFilter, ["NABreathTpl00001"]);
  assert.equal(containers.get("skills_slayer_respiracoes")?.headDisplay, true);
  assert.match(JSON.stringify(containers.get("skills_slayer_respiracoes")?.rowLayout), /useBreathForm/);
  assert.deepEqual(containers.get("inventario_slayer_armas")?.templateFilter, ["NAWeaponTpl00001"]);
  assert.equal(containers.get("inventario_slayer_equipamentos"), undefined);
  assert.equal(containers.get("inventario_slayer_itens"), undefined);
});

test("armas e Formas de Respiração ficam acessíveis exclusivamente na aba COMBATE", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  let tabs = null;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (!tabs && node.type === "tabbedPanel") tabs = node;
    Object.values(node).forEach(walk);
  }
  walk(template.system.body);
  const combat = tabs.contents.find((entry) => entry.key === "combat_slayer_tab");
  const pericias = tabs.contents.find((entry) => entry.key === "pericias_tab");
  const configs = tabs.contents.find((entry) => entry.key === "configs_tab");
  assert.doesNotMatch(JSON.stringify(pericias), /inventario_slayer_armas|skills_slayer_respiracoes/);
  assert.doesNotMatch(JSON.stringify(configs), /"key":"inventario_slayer_armas"|"key":"skills_slayer_respiracoes"/);
  assert.match(JSON.stringify(combat), /inventario_slayer_armas/);
  assert.match(JSON.stringify(combat), /arma_slayer_rolar/);
  assert.match(JSON.stringify(combat), /"key":"skills_slayer_respiracoes"/);
});

test("template persiste estados das cinco Respirações prioritárias", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const source = JSON.stringify(template.system);
  for (const key of ["resp_chamas_estado", "resp_pedra_estado", "resp_metal_estado", "resp_neve_estado", "resp_nevoa_estado"]) {
    assert.match(source, new RegExp(`"key":"${key}"`));
  }
  for (const key of ["resp_metal_bloqueio_bonus", "resp_metal_for_temp", "resp_metal_fdv_temp"]) {
    assert.match(source, new RegExp(`"key":"${key}"`));
  }
});

test("botões de perícia usam a classe CSS da cor do atributo real, não sempre DEX", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  let periciasTable = null;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "tabbedPanel") {
      const pericias = node.contents.find((entry) => entry.key === "pericias_tab");
      periciasTable = pericias.contents[0];
    }
    Object.values(node).forEach(walk);
  }
  walk(template.system.body);
  assert.ok(periciasTable, "Tabela de perícias não encontrada.");
  assert.equal(periciasTable.type, "table");
  assert.ok(Array.isArray(periciasTable.contents[0]), "contents da tabela deve ser array-de-arrays, não array flat.");
  const attrToRole = { FOR: "for", DEX: "dex", VIT: "vit", CAR: "car", FDV: "fdv", INT: "int", SAB: "sab" };
  let checked = 0;
  for (const row of periciasTable.contents) {
    for (const button of row) {
      const attrMatch = button.rollMessage?.match(/attr:'([^']+)'/);
      if (!attrMatch) continue;
      const expectedRole = attrToRole[attrMatch[1]];
      assert.match(button.value, new RegExp(`na-sheet-role-${expectedRole}`), `Botão ${button.value} deveria usar na-sheet-role-${expectedRole}.`);
      checked += 1;
    }
  }
  assert.equal(checked, 18, "Esperadas 18 perícias verificadas.");
});

test("painéis convertidos em Perícias e Combate usam contents como array-de-arrays", () => {
  const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, "utf8")));
  const source = template.system.body;
  let tabbedPanel = null;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (!tabbedPanel && node.type === "tabbedPanel") tabbedPanel = node;
    Object.values(node).forEach(walk);
  }
  walk(source);
  const combat = tabbedPanel.contents.find((entry) => entry.key === "combat_slayer_tab");
  const combatSlayerTable = combat.contents.find((entry) => entry.key === "combat_slayer_table");
  const nestedTable = combatSlayerTable.contents.find((entry) => entry.type === "table");
  assert.ok(nestedTable, "Tabela de Acerto/Bloqueio/Esquiva/Dano não encontrada dentro de combat_slayer_table.");
  assert.ok(Array.isArray(nestedTable.contents[0]), "Table.fromJSON exige array-de-arrays, não array flat.");
  assert.equal(nestedTable.contents[0].length, 4);
  assert.match(nestedTable.contents[0][0].value, /Acerto/);
  assert.match(nestedTable.contents[0][1].value, /Bloqueio/);
  assert.match(nestedTable.contents[0][2].value, /Esquiva/);
  assert.match(nestedTable.contents[0][3].value, /Dano/);
});
