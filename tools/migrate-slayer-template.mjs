import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultTemplate = path.join(repoRoot, 'src', 'templates', 'actors', 'slayer-template.json');
const csbPackagePath = path.join(repoRoot, 'src', 'imports', 'csb-import-slayer-template.json');
const oniShellPath = path.join(repoRoot, 'src', 'templates', 'actors', 'oni-template.json');

const directRenames = new Map([
    ['nome_cacador', 'nome_slayer'],
    ['pdv_total_valor', 'pdv_slayer_total_valor'],
    ['pdv_atual_valor_display', 'pdv_slayer_atual_valor_display'],
    ['pdv_dano', 'pdv_slayer_dano_tomado'],
    ['pdv_slayer_dano', 'pdv_slayer_dano_tomado'],
    ['pdv_curado', 'pdv_slayer_curado'],
    ['pdv_extra', 'pdv_slayer_extra'],
    ['pdv_total_conta', 'pdv_slayer_total_conta'],
    ['pdv_conta_atual', 'pdv_slayer_conta_atual'],
    ['pdr_total_valor', 'pdr_slayer_total_valor'],
    ['pdr_atual_valor_display', 'pdr_slayer_atual_valor_display'],
    ['pdr_gasto_valor', 'pdr_slayer_gasto_valor'],
    ['pdr_curado', 'pdr_slayer_curado'],
    ['pdr_extra', 'pdr_slayer_extra'],
    ['pdr_total_conta', 'pdr_slayer_total_conta'],
    ['pdr_conta_atual', 'pdr_slayer_conta_atual'],
    ['origem_val', 'origem_slayer_pdv_val'],
    ['origem_pdr_val', 'origem_slayer_pdr_val'],
    ['hab_pdv_bonus', 'hab_slayer_pdv_bonus'],
    ['hab_pdr_bonus', 'hab_slayer_pdr_bonus'],
    ['hab_pdr_por_nivel', 'hab_slayer_pdr_por_nivel'],
    ['metal_pdr_bonus', 'metal_slayer_pdr_bonus'],
    ['dex_nvl7dex_nvl7', 'dex_nvl7'],
    ['car_nvl6', 'car_nvl7'],
]);

for (let level = 1; level <= 14; level += 1) {
    directRenames.set(`pdv_nvl${level}`, `pdv_slayer_nvl${level}`);
    directRenames.set(`pdr_nvl${level}`, `pdr_slayer_nvl${level}`);
}

const tokenRenames = [...directRenames.entries()].sort((a, b) => b[0].length - a[0].length);

function renameString(value) {
    let result = value;
    for (const [from, to] of tokenRenames) {
        result = result.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
    }
    result = result.replace(
        /\borigem_(?!slayer_)([a-z_]+)_(pdv|pdr)_ini\b/g,
        'origem_slayer_$1_$2_ini'
    );
    return result;
}

function visit(node) {
    if (typeof node === 'string') return renameString(node);
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(visit);

    for (const [key, value] of Object.entries(node)) {
        node[key] = visit(value);
    }

    if (typeof node.key === 'string') node.key = node.key.trim();
    return node;
}

function walk(node, callback) {
    if (!node || typeof node !== 'object') return;
    callback(node);
    if (Array.isArray(node)) node.forEach((entry) => walk(entry, callback));
    else Object.values(node).forEach((entry) => walk(entry, callback));
}

function removeComponentsByKey(node, keys) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (let index = node.length - 1; index >= 0; index -= 1) {
            const entry = node[index];
            if (entry && typeof entry === 'object' && keys.has(entry.key)) node.splice(index, 1);
            else removeComponentsByKey(entry, keys);
        }
        return;
    }
    for (const value of Object.values(node)) removeComponentsByKey(value, keys);
}

function extractComponentsByKey(node, keys, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) {
        for (let index = node.length - 1; index >= 0; index -= 1) {
            const entry = node[index];
            if (entry && typeof entry === 'object' && keys.has(entry.key)) {
                out.push(entry);
                node.splice(index, 1);
            } else {
                extractComponentsByKey(entry, keys, out);
            }
        }
        return out;
    }
    for (const value of Object.values(node)) extractComponentsByKey(value, keys, out);
    return out;
}

function fixCurrentPdvLabel(template) {
    let title = null;
    let numeric = null;
    walk(template.system, (node) => {
        if (node.type !== 'label') return;
        const value = String(node.value ?? '');
        if (node.key === 'pdv_slayer_atual_titulo' || value.includes('>PDV Atual<')) title = node;
        if (
            node.key === 'pdv_slayer_atual_valor_display' ||
            value.includes('${pdv_slayer_conta_atual}$')
        )
            numeric = node;
    });
    if (!title || !numeric) throw new Error('Labels de PDV atual não encontrados.');
    title.key = 'pdv_slayer_atual_titulo';
    numeric.key = 'pdv_slayer_atual_valor_display';
}

function fixKnownAttributeErrors(template) {
    walk(template, (node) => {
        if (node.key === 'bonus_atr_fdv_valor') node.key = 'atr_fdv_valor';
        if (node.name === 'vit_display') {
            node.value = String(node.value).replace(
                /hab_tsuyoi_for_bonus/g,
                'hab_tsuyoi_vit_bonus'
            );
        }
    });

    const hidden = template.system?.hidden;
    if (!Array.isArray(hidden)) throw new Error('system.hidden não é uma lista.');
    const seen = new Set();
    template.system.hidden = hidden.filter((entry) => {
        if (!entry?.name) return true;
        if (seen.has(entry.name)) return false;
        seen.add(entry.name);
        return true;
    });
}

function fixBars(template) {
    const bars = template.system?.attributeBar;
    const pdv = bars?.pdv_slayer_barra ?? bars?.pdv_barra;
    const pdr = bars?.pdr_slayer_barra ?? bars?.pdr_barra;
    if (!pdv || !pdr) throw new Error('Barras de PDV/PDR do Slayer não encontradas.');
    bars.pdv_slayer_barra = {
        ...pdv,
        value: '${pdv_slayer_atual_num}$',
        max: '${pdv_slayer_maximo_num}$',
        editable: false,
    };
    bars.pdr_slayer_barra = {
        ...pdr,
        value: '${pdr_slayer_atual_num}$',
        max: '${pdr_slayer_maximo_num}$',
        editable: false,
    };
    delete bars.pdv_barra;
    delete bars.pdr_barra;

    const hidden = template.system?.hidden;
    if (!Array.isArray(hidden)) throw new Error('system.hidden não é uma lista.');
    const formulas = new Map([
        ['interludio_pdv_permanente', '${interludio_cabaca_pequena_completa ? 2 : 0}$'],
        [
            'pdv_slayer_maximo_num',
            '${max(0,pdv_slayer_total_conta+interludio_pdv_permanente-pdv_slayer_dano_ferida+pdv_slayer_extra)}$',
        ],
        [
            'pdv_slayer_atual_num',
            '${min(pdv_slayer_maximo_num,max(0,pdv_slayer_total_conta+interludio_pdv_permanente-pdv_slayer_dano_ferida+pdv_slayer_curado+pdv_slayer_extra-pdv_slayer_dano_tomado))}$',
        ],
        [
            'pdr_slayer_maximo_num',
            '${max(0,pdr_slayer_total_conta+metal_slayer_pdr_bonus+pdr_slayer_extra)}$',
        ],
        [
            'pdr_slayer_atual_num',
            '${min(pdr_slayer_maximo_num,max(0,pdr_slayer_total_conta+metal_slayer_pdr_bonus+pdr_slayer_curado+pdr_slayer_extra-pdr_slayer_gasto_valor))}$',
        ],
        [
            'metal_bloqueio_bonus',
            "${switchCase(metal_escolhido,'metal_azul',3,'metal_preta',4,0)}$",
        ],
    ]);
    for (const [name, value] of formulas) {
        const existing = hidden.find((entry) => entry.name === name);
        if (existing) existing.value = value;
        else hidden.push({ name, value });
    }

    walk(template.system, (node) => {
        if (node.type !== 'label') return;
        if (node.key === 'pdv_slayer_total_valor')
            node.value = orbitron('${pdv_slayer_maximo_num}$', '#C1000C', 18);
        if (node.key === 'pdv_slayer_atual_valor_display')
            node.value = orbitron('${pdv_slayer_atual_num}$', '#C1000C', 18);
        if (node.key === 'pdr_slayer_total_valor')
            node.value = orbitron('${pdr_slayer_maximo_num}$', '#0EF5FF', 18);
        if (node.key === 'pdr_slayer_atual_valor_display')
            node.value = orbitron('${pdr_slayer_atual_num}$', '#0EF5FF', 18);
    });
}

const attributeButtons = new Map([
    ['VIT', ['TESTE DE VITALIDADE', 'VIT', '#36D67A']],
    ['DEX', ['TESTE DE DESTREZA', 'DEX', '#28D7FF']],
    ['FOR', ['TESTE DE FORÇA', 'FOR', '#C1000C']],
    ['CAR', ['TESTE DE CARISMA', 'CAR', '#FF9100']],
    ['FDV', ['TESTE DE FORÇA DE VONTADE', 'FDV', '#BB97F9']],
    ['INT', ['TESTE DE INTELIGÊNCIA', 'INT', '#F8EB4D']],
    ['SAB', ['TESTE DE SABEDORIA', 'SAB', '#D45CA4']],
    ['Arremesso', ['Arremesso', 'FOR', '#C1000C']],
    ['Foco', ['Concentração', 'FDV', '#BB97F9']],
    ['Adestramento', ['Adestramento', 'CAR', '#FF9100']],
    ['Atletismo', ['Atletismo', 'FOR', '#C1000C']],
    ['Bloqueio', ['Bloqueio', 'FOR', '#C1000C']],
    ['Esquiva', ['Esquiva', 'DEX', '#28D7FF']],
    ['Linguística', ['Linguística', 'INT', '#F8EB4D']],
    ['Arrombamento', ['Arrombamento', 'FOR', '#C1000C']],
    ['História', ['História', 'INT', '#F8EB4D']],
    ['Percepção', ['Percepção', 'SAB', '#D45CA4']],
    ['Sobrevivência', ['Sobrevivência', 'SAB', '#D45CA4']],
    ['Acrobacia', ['Acrobacia', 'DEX', '#28D7FF']],
    ['Intuição', ['Intuição', 'SAB', '#D45CA4']],
    ['Enganação', ['Enganação', 'CAR', '#FF9100']],
    ['Investigação', ['Investigação', 'INT', '#F8EB4D']],
    ['Corrida', ['Corrida', 'DEX', '#28D7FF']],
    ['Religião', ['Religião', 'FDV', '#BB97F9']],
    ['Presença', ['Presença', 'CAR', '#FF9100']],
    ['Etiqueta', ['Etiqueta', 'CAR', '#FF9100']],
]);

function labelText(value) {
    return String(value ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^@import url\([^)]*\);\s*/i, '');
}

function orbitron(text, color = '#D45CA4', size = 16) {
    return `<div class="custom-orbitron-wrapper"> \n  <style>\n    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap');\n  </style>\n  <span style="font-family: 'Orbitron', 'Times New Roman', serif; font-size: ${size}px; font-weight: 700; color:${color}; text-transform: uppercase; letter-spacing: .12em;">${text}</span>\n</div>`;
}

function attributeRoll(test, attr, color) {
    return `%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NARollMode000001'))?.execute({actorUuid:entity.uuid,test:'${test}',attr:'${attr}',color:'${color}'});}%`;
}

function fixRollButtons(template) {
    walk(template.system, (node) => {
        if (node.type !== 'label' || !node.rollMessage) return;
        const text = labelText(node.value);
        const attribute = attributeButtons.get(text);
        if (attribute) {
            node.rollMessage = attributeRoll(...attribute);
            return;
        }
        if (text === 'Acerto') {
            node.rollMessage =
                "%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAHitRoll0000001'))?.execute({actorUuid:entity.uuid});}%";
        } else if (text === 'Rolagem de dano') {
            node.rollMessage =
                "%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NADamageRoll0001'))?.execute({actorUuid:entity.uuid});}%";
        } else if (text === 'Marca do Caçador') {
            node.rollMessage =
                "%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAHunterMark0001'))?.execute({actorUuid:entity.uuid});}%";
        } else if (text === 'Atributos') {
            node.rollMessage =
                "%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAAttrLevel00001'))?.execute({actorUuid:entity.uuid,level:entity.system.props.nvl_pj});}%";
        }
    });
}

function normalizeRollMessageResults(template) {
    walk(template.system, (node) => {
        if (typeof node.rollMessage !== 'string' || !node.rollMessage) return;
        node.rollMessage = node.rollMessage.replace(
            /return await ([\s\S]*?);}%$/,
            "await $1; return '';}%"
        );
    });
}

function fixRollButtonTypography(template) {
    const attributeRoles = {
        VIT: 'vit',
        DEX: 'dex',
        FOR: 'for',
        CAR: 'car',
        FDV: 'fdv',
        INT: 'int',
        SAB: 'sab',
    };
    walk(template.system, (node) => {
        if (node.type !== 'label' || !node.rollMessage) return;
        const text = labelText(node.value);
        if (!text) return;
        const attribute = node.rollMessage.match(/attr:'(VIT|DEX|FOR|CAR|FDV|INT|SAB)'/)?.[1];
        const role = attributeRoles[attribute] ?? 'dex';
        node.value = `<span class="na-sheet-text na-sheet-label na-sheet-size-md na-sheet-role-${role}">${text}</span>`;
    });
}

function fixRuntimeStorageKeys(template) {
    let configTab = null;
    walk(template.system?.body, (node) => {
        if (node.key === 'configs_tab' && node.type === 'tab') configTab = node;
    });
    if (!configTab) throw new Error('Aba Configurações do Slayer não encontrada.');

    const storageKeys = new Set([
        'marca_dano_dados',
        'marca_dano_faces',
        'marca_dano_necrotico_dados',
        'interludio_concentracao_total_constante',
        'interludio_cabaca_pequena_completa',
    ]);
    removeComponentsByKey(template.system, storageKeys);
    removeComponentsByKey(configTab, new Set(['runtime_slayer_storage_panel']));
    configTab.contents.push(
        panel(
            'runtime_slayer_storage_panel',
            'Dados de Marca e Interlúdio',
            [
                numberField('marca_dano_dados', 'Dados de dano da Marca', 0, 0),
                numberField('marca_dano_faces', 'Faces do dano da Marca', 0, 0),
                numberField('marca_dano_necrotico_dados', 'Dados de dano necrótico da Marca', 0, 0),
                checkboxField(
                    'interludio_concentracao_total_constante',
                    'Concentração Total Constante desbloqueada'
                ),
                checkboxField(
                    'interludio_cabaca_pequena_completa',
                    'Cabaça Pequena completa (+2 PDV máximo)'
                ),
            ],
            'grid-2'
        )
    );
}

function removeDuplicateAttributeButton(template) {
    let foundSab = false;
    function prune(node) {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) {
            return node
                .filter((entry) => {
                    if (
                        entry?.type !== 'label' ||
                        !entry?.rollMessage ||
                        labelText(entry.value) !== 'SAB'
                    )
                        return true;
                    if (foundSab) return false;
                    foundSab = true;
                    return true;
                })
                .map(prune);
        }
        for (const [key, value] of Object.entries(node)) node[key] = prune(value);
        return node;
    }
    prune(template.system?.body);
}

function textField(key, label, defaultValue = '') {
    return {
        key,
        colSpan: 1,
        rowSpan: 1,
        cssClass: '',
        role: 4,
        editRole: 4,
        permission: 0,
        tooltip: 'Gerenciado automaticamente pelo módulo Night Assassins.',
        visibilityFormula: '',
        editableFormula: '',
        escapeHTML: false,
        type: 'textField',
        size: 'full-size',
        label,
        defaultValue,
        charList: '',
        maxLength: null,
        autocomplete: '',
    };
}

function numberField(key, label, defaultValue = 0, minVal = 0, maxVal = null) {
    return {
        key,
        colSpan: 1,
        rowSpan: 1,
        cssClass: '',
        role: 4,
        editRole: 4,
        permission: 0,
        tooltip: 'Gerenciado automaticamente pelo módulo Night Assassins.',
        visibilityFormula: '',
        editableFormula: '',
        escapeHTML: false,
        type: 'numberField',
        size: 'full-size',
        label,
        defaultValue: String(defaultValue),
        allowDecimal: false,
        minVal: String(minVal),
        maxVal: maxVal === null ? '' : String(maxVal),
        allowRelative: false,
        showControls: false,
        controlsStyle: 'hover',
    };
}

function playerNumberField(key, label, defaultValue = 0, minVal = 0, maxVal = null) {
    return {
        ...numberField(key, label, defaultValue, minVal, maxVal),
        role: 0,
        editRole: 0,
        tooltip: 'Valor persistente do personagem.',
    };
}

function playerTextField(key, label, defaultValue = '') {
    return {
        ...textField(key, label, defaultValue),
        role: 0,
        editRole: 0,
        tooltip: 'Valor persistente do personagem.',
    };
}

function checkboxField(key, label, defaultValue = false, tooltip = '') {
    return {
        key,
        colSpan: 1,
        rowSpan: 1,
        cssClass: '',
        role: 0,
        editRole: 0,
        permission: 0,
        tooltip,
        visibilityFormula: '',
        editableFormula: '',
        escapeHTML: false,
        type: 'checkbox',
        size: 'full-size',
        label,
        defaultValue,
    };
}

function displayLabel(key, value, tooltip = '') {
    return {
        key,
        colSpan: 1,
        rowSpan: 1,
        cssClass: '',
        role: 0,
        editRole: 0,
        permission: 0,
        tooltip,
        visibilityFormula: '',
        editableFormula: '',
        escapeHTML: false,
        type: 'label',
        size: 'full-size',
        icon: '',
        value,
        prefix: '',
        suffix: '',
        rollMessage: '',
        altRollMessage: '',
        rollMessageToChat: false,
        altRollMessageToChat: false,
        style: 'label',
    };
}

function richTextArea(key, label, defaultValue = '') {
    return {
        key,
        colSpan: 1,
        rowSpan: 4,
        cssClass: '',
        role: 0,
        editRole: 0,
        permission: 0,
        tooltip: '',
        visibilityFormula: '',
        editableFormula: '',
        escapeHTML: false,
        type: 'textArea',
        size: 'full-size',
        label,
        defaultValue,
        style: 'sheet',
    };
}

function panel(key, title, contents, flow = 'grid-1') {
    return {
        key,
        colSpan: 1,
        rowSpan: 1,
        cssClass: '',
        role: 0,
        editRole: 0,
        permission: 0,
        tooltip: '',
        visibilityFormula: '',
        editableFormula: '',
        escapeHTML: false,
        type: 'panel',
        contents,
        flow,
        align: 'center',
        verticalAlign: 'top',
        collapsible: true,
        defaultCollapsed: false,
        title,
        titleStyle: 'default',
    };
}

function tab(key, name, contents) {
    return {
        key,
        type: 'tab',
        name,
        tooltip: '',
        role: 0,
        permission: 0,
        visibilityFormula: '',
        contents,
    };
}

function itemContainer(key, title, category, templateId = '') {
    return {
        key,
        colSpan: 1,
        rowSpan: 3,
        cssClass: '',
        role: 0,
        editRole: 0,
        permission: 0,
        tooltip: `Itens classificados como ${category}.`,
        visibilityFormula: '',
        editableFormula: '',
        escapeHTML: false,
        type: 'itemContainer',
        contents: [],
        rowLayout: [],
        title,
        hideEmpty: false,
        hiddenColumns: [],
        sortOption: 'manual',
        headDisplay: true,
        showCreate: false,
        defaultTemplate: '',
        createItemDialogTitle: '',
        createItemDialogShowTemplateList: false,
        createItemDialogButton: '',
        newItemDefaultName: '',
        showDelete: true,
        statusIcon: true,
        nameAlign: 'left',
        nameLabel: 'Nome',
        templateFilter: templateId ? [templateId] : [],
        itemFilterFormula: `equalText(item.inventario_categoria, '${category}')`,
        sortPredicates: [],
    };
}

function weaponItemContainer() {
    const container = itemContainer(
        'inventario_slayer_armas',
        orbitron('ARMAS', '#C1000C'),
        'arma',
        'NAWeaponTpl00001'
    );
    container.nameLabel = 'Arma';
    container.tooltip =
        'Arraste uma arma para o inventário e use Rolar para abrir o dano com os dados do Item.';
    const rollButton = displayLabel(
        'arma_slayer_rolar',
        orbitron('ROLAR', '#C1000C', 11),
        'Rola o dano desta arma.'
    );
    rollButton.style = 'button';
    rollButton.icon = 'fa-solid fa-khanda';
    rollButton.rollMessage =
        "%{const weapon=(typeof linkedEntity!=='undefined'&&linkedEntity)?linkedEntity:null;if(!weapon)return ui.notifications.warn('Arma não encontrada nesta linha.');return await game.modules.get('night-assassins-csb-automation')?.api?.rollWeaponItem({item:weapon,actor:entity,actorUuid:entity.uuid});}%";
    const reloadButton = displayLabel(
        'arma_slayer_recarregar',
        orbitron('RECARREGAR', '#F8EB4D', 11),
        'Gasta uma Ação Única e restaura a munição da arma.'
    );
    reloadButton.style = 'button';
    reloadButton.icon = 'fa-solid fa-rotate-right';
    reloadButton.rollMessage =
        "%{const weapon=(typeof linkedEntity!=='undefined'&&linkedEntity)?linkedEntity:null;if(!weapon)return ui.notifications.warn('Arma não encontrada nesta linha.');return await game.modules.get('night-assassins-csb-automation')?.api?.reloadWeaponItem({item:weapon,actor:entity,actorUuid:entity.uuid});}%";
    const profileSummary = displayLabel(
        'arma_perfis_resumo',
        '${arma_perfis_resumo}$',
        'Perfil, fórmula e dano base da arma.'
    );
    profileSummary.colSpan = 2;
    profileSummary.align = 'left';
    profileSummary.colName = 'Dano / Perfil';
    const damageTypes = displayLabel(
        'arma_tipos_dano_resumo',
        '${arma_tipos_dano_resumo}$',
        'Tipos de dano causados pela arma.'
    );
    damageTypes.align = 'left';
    damageTypes.colName = 'Tipo de dano';
    const range = displayLabel('arma_alcance', '${arma_alcance}$', 'Alcance da arma.');
    range.align = 'center';
    range.colName = 'Alcance';
    const properties = displayLabel(
        'arma_propriedades',
        '${arma_propriedades}$',
        'Propriedades da arma.'
    );
    properties.colSpan = 2;
    properties.align = 'left';
    properties.colName = 'Propriedades';
    container.rowLayout = [
        { ...profileSummary },
        { ...damageTypes },
        { ...range },
        { ...properties },
        { ...rollButton, align: 'center', colName: 'Rolar' },
        { ...reloadButton, align: 'center', colName: 'Recarga' },
    ];
    return container;
}

function fixTextVisibilityFormulas(template) {
    walk(template.system, (node) => {
        if (typeof node.visibilityFormula !== 'string') return;
        node.visibilityFormula = node.visibilityFormula.replace(
            /^\s*classe_escolhida\s*==\s*'classe_usuario_de_duas_resp'\s*$/,
            "equalText(classe_escolhida, 'classe_usuario_de_duas_resp')"
        );
    });
}

function breathingItemContainer() {
    const container = itemContainer(
        'skills_slayer_respiracoes',
        orbitron('FORMAS DE RESPIRAÇÃO', '#28D7FF'),
        'respiracao',
        'NABreathTpl00001'
    );
    container.headDisplay = true;
    container.hideEmpty = false;
    container.nameLabel = 'Forma';
    container.templateFilter = ['NABreathTpl00001'];
    container.tooltip = 'Espaço para organizar as Formas de Respiração do personagem.';
    const useButton = displayLabel(
        'respiracao_slayer_usar',
        orbitron('USAR', '#28D7FF', 11),
        'Rola a Forma de Respiração usando o Actor e o Item portados.'
    );
    useButton.style = 'button';
    useButton.icon = 'fa-solid fa-fire-flame-curved';
    useButton.rollMessage =
        "%{const form=(typeof linkedEntity!=='undefined'&&linkedEntity)?linkedEntity:null;if(!form)return ui.notifications.warn('Forma de Respiração não encontrada nesta linha.');return await game.modules.get('night-assassins-csb-automation')?.api?.useBreathForm({actorUuid:entity.uuid,itemUuid:form.uuid});}%";
    container.rowLayout = [{ ...useButton, align: 'center', colName: 'Usar' }];
    return container;
}

function hunterMarkPanel() {
    const status = displayLabel(
        'marca_despertada_display',
        orbitron(
            "Despertada: ${marca_despertada > 0 ? 'ATIVADA' : 'NÃO DESPERTADA'}$",
            '#28D7FF',
            12
        )
    );
    const button = displayLabel(
        'marca_slayer_gerenciar',
        orbitron('MARCA DO CAÇADOR', '#FF9100', 14),
        'Despertar, ativar, consultar ou encerrar a Marca do Caçador.'
    );
    button.style = 'button';
    button.rollMessage =
        "%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAHunterMark0001'))?.execute({actorUuid:entity.uuid});}%";
    return panel('skills_marca_slayer_panel', 'Marca do Caçador', [status, button], 'grid-2');
}

function interludePanels() {
    const manager = displayLabel(
        'interludio_slayer_gerenciar',
        orbitron('GERENCIAR TREINO', '#28D7FF', 14),
        'Realiza o teste, atualiza o progresso e desbloqueia o beneficio automaticamente.'
    );
    manager.style = 'button';
    manager.icon = 'fa-solid fa-dumbbell';
    manager.rollMessage =
        "%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAInterlude00001'))?.execute({actorUuid:entity.uuid});}%";
    return [
        panel(
            'interludio_semana_panel',
            'Semana de Interlúdio',
            [
                manager,
                playerNumberField('interludio_semana_atual', 'Semana', 0, 0),
                playerTextField('interludio_atividade_principal', 'Atividade Principal', ''),
                playerTextField('interludio_atividade_secundaria', 'Atividade Secundária leve', ''),
                playerTextField('interludio_resultado', 'Resultado / Recompensa', ''),
                playerNumberField('interludio_ecos', 'Ecos', 0, 0),
                playerNumberField('interludio_pdis_gastos', 'PDis gastos', 0, 0),
                richTextArea('interludios_slayer_registro', 'Registro das semanas'),
            ],
            'grid-2'
        ),
        panel(
            'interludio_cabacas_panel',
            'Mansão Borboleta Cabaças',
            [
                playerNumberField(
                    'interludio_cabaca_pequena_sucessos',
                    'Pequena sucessos consecutivos (VIT CD 14)',
                    0,
                    0,
                    3
                ),
                checkboxField(
                    'interludio_cabaca_pequena_completa',
                    'Cabaça Pequena completa (+2 PDV máximo)'
                ),
                playerNumberField(
                    'interludio_cabaca_media_sucessos',
                    'Média sucessos consecutivos (VIT+FDV CD 16)',
                    0,
                    0,
                    3
                ),
                checkboxField(
                    'interludio_cabaca_media_completa',
                    'Cabaça Média completa (+2 PDR em descanso)'
                ),
                playerNumberField(
                    'interludio_cabaca_gigante_sucessos',
                    'Gigante sucessos consecutivos (VIT+FDV CD 18)',
                    0,
                    0,
                    3
                ),
                checkboxField('interludio_cabaca_gigante_completa', 'Cabaça Gigante completa'),
                checkboxField(
                    'interludio_concentracao_total_constante',
                    'Concentração Total Constante desbloqueada'
                ),
                checkboxField(
                    'interludio_respiracao_repouso',
                    'Respiração em Repouso desbloqueada'
                ),
            ],
            'grid-2'
        ),
        panel(
            'interludio_reflexo_panel',
            'Copo de Chá Medicinal',
            [
                playerNumberField(
                    'interludio_copo_cha_vitorias',
                    'Vitórias totais (DEX CD 20)',
                    0,
                    0,
                    3
                ),
                checkboxField(
                    'interludio_olhos_falcao',
                    'Olhos de Falcão desbloqueado (+2 Iniciativa)'
                ),
                checkboxField('interludio_tokito_consolidado', 'Treino de Tokito consolidado'),
            ],
            'grid-2'
        ),
    ];
}

function blankTableCell() {
    return displayLabel('', '');
}

function detachTableComponent(node, key) {
    let detached = null;
    const visitNode = (current) => {
        if (!current || typeof current !== 'object' || detached) return;
        if (Array.isArray(current)) {
            for (let index = 0; index < current.length; index += 1) {
                const entry = current[index];
                if (entry?.key === key) {
                    detached = entry;
                    current[index] = blankTableCell();
                    return;
                }
                visitNode(entry);
                if (detached) return;
            }
            return;
        }
        for (const value of Object.values(current)) {
            visitNode(value);
            if (detached) return;
        }
    };
    visitNode(node);
    return detached;
}

function csbTable(key, rows, layout = '') {
    const cols = Math.max(1, ...rows.map((row) => row.length));
    return {
        key,
        colSpan: 1,
        rowSpan: 1,
        cssClass: '',
        role: 0,
        editRole: 0,
        permission: 0,
        tooltip: '',
        visibilityFormula: '',
        editableFormula: '',
        escapeHTML: false,
        type: 'table',
        contents: rows.map((row) => [
            ...row,
            ...Array.from({ length: cols - row.length }, blankTableCell),
        ]),
        cols,
        rows: rows.length,
        layout: layout || 'c'.repeat(cols),
    };
}

function configureBreathingAccumulations(accumulations) {
    if (!accumulations?.contents) return;
    const breathingKeys = new Map([
        ['Água:', 'resp_slayer_agua'],
        ['Chamas:', 'resp_slayer_chamas'],
        ['Pedra:', 'resp_slayer_pedra'],
        ['Névoa:', 'resp_slayer_nevoa'],
        ['Metal:', 'resp_slayer_metal'],
        ['Neve:', 'resp_slayer_neve'],
    ]);
    for (const component of accumulations.contents) {
        const source = String(component?.value ?? '');
        const match = [...breathingKeys.entries()].find(([label]) => source.includes(label));
        if (!match) continue;
        const breathingKey = match[1];
        component.visibilityFormula = `equalText(resp_slayer_display, '${breathingKey}') ? 1 : (equalText(resp_slayer_display_2, '${breathingKey}') ? 1 : 0)`;
    }
    accumulations.flow = 'vertical';
    accumulations.collapsible = false;
    accumulations.defaultCollapsed = false;
}

function organizeSlayerTabs(template) {
    let tabs = null;
    walk(template.system?.body, (node) => {
        if (node.type === 'tabbedPanel' && !tabs) tabs = node;
    });
    if (!tabs || !Array.isArray(tabs.contents))
        throw new Error('Painel de abas principal do Slayer não encontrado.');

    const byKey = new Map(tabs.contents.map((entry) => [entry?.key, entry]));
    const pericias = byKey.get('pericias_tab');
    const combate = byKey.get('combat_slayer_tab');
    const configuracoes = byKey.get('configs_tab');
    const dados = byKey.get('dados_tab');
    const currentSkills = byKey.get('skills_slayer_tab');
    const currentInventario = byKey.get('inventario_slayer_tab');
    const currentNotas = byKey.get('notas_slayer_tab');
    const currentPerfil = byKey.get('perfil_slayer_tab');
    const currentInterludios = byKey.get('interludios_slayer_tab');
    if (
        !dados &&
        pericias &&
        combate &&
        currentSkills &&
        configuracoes &&
        tabs.contents.length === 4
    ) {
        pericias.name = 'Perícias';
        combate.name = 'Combate';
        currentSkills.name = 'Skills';
        configuracoes.name = 'Config / Dados';
        tabs.contents = [pericias, combate, currentSkills, configuracoes];
        const accumulations = combate.contents.find(
            (entry) =>
                entry?.key === 'combate_acumulos_slayer_panel' ||
                (entry?.key === 'armas_acumulos_slayer_table' &&
                    JSON.stringify(entry).includes('combate_acumulos_slayer_panel'))
        );
        if (accumulations?.key === 'armas_acumulos_slayer_table') {
            const panel = accumulations.contents
                .flat()
                .find((entry) => entry?.key === 'combate_acumulos_slayer_panel');
            configureBreathingAccumulations(panel);
        } else configureBreathingAccumulations(accumulations);
        walk(template.system, (node) => {
            if (node && typeof node === 'object') delete node._slayerRemainingControls;
        });
        return;
    }
    if (!dados && pericias && combate && configuracoes && tabs.contents.length === 3) {
        const legacySkills = configuracoes.contents.find(
            (entry) => entry?.key === 'skills_slayer_legado_panel'
        );
        if (!legacySkills?.contents?.length)
            throw new Error('Conteúdo da aba Skills não encontrado no painel legado.');

        const headerTable = template.system?.header?.contents?.find(
            (entry) => entry?.type === 'table' && entry?.key === 'perfil'
        );
        if (!headerTable) throw new Error('Table perfil do cabeçalho Slayer não encontrada.');

        const damageTaken = detachTableComponent(combate, 'pdv_slayer_dano_tomado');
        const pdrSpent = detachTableComponent(combate, 'pdr_slayer_gasto_valor');
        const currentBreath = detachTableComponent(combate, 'folego_slayer_atual');
        const restButton = extractComponentsByKey(
            combate,
            new Set(['descanso_slayer_gerenciar'])
        ).at(-1);
        const movement = extractComponentsByKey(
            combate,
            new Set(['deslocamento_slayer_display'])
        ).at(-1);
        removeComponentsByKey(
            combate,
            new Set(['deslocamento_slayer_titulo', 'perfil_slayer_recursos_runtime_panel'])
        );
        if (!damageTaken || !pdrSpent || !currentBreath || !restButton || !movement) {
            throw new Error(
                'Recursos administrativos ou controles do cabeçalho Slayer não encontrados.'
            );
        }

        headerTable.contents = headerTable.contents.filter(
            (row) =>
                !row?.some?.((entry) =>
                    [
                        'descanso_slayer_gerenciar',
                        'deslocamento_slayer_display',
                        'folego_slayer_atual',
                    ].includes(entry?.key)
                )
        );
        const headerBreath = displayLabel(
            'folego_slayer_header_display',
            '<span class="na-sheet-text na-sheet-label na-sheet-size-md na-sheet-role-sab">FÔLEGO: ${folego_slayer_atual}$ / ${folego_slayer_maximo}$</span>'
        );
        headerTable.contents.push([restButton, movement, headerBreath]);
        headerTable.rows = headerTable.contents.length;

        const resourceTable = combate.contents.find(
            (entry) =>
                entry?.type === 'table' && JSON.stringify(entry).includes('pdv_slayer_total_valor')
        );
        const breathRow = resourceTable?.contents?.find((row) =>
            row?.some?.((entry) => entry?.key === 'folego_slayer_titulo')
        );
        if (!resourceTable || !breathRow)
            throw new Error('Table de recursos ou linha de Fôlego não encontrada.');
        breathRow[1] = displayLabel(
            'folego_slayer_combate_display',
            '<span class="na-sheet-text na-sheet-stat na-sheet-size-lg na-sheet-role-sab">${folego_slayer_atual}$ / ${folego_slayer_maximo}$</span>'
        );

        const dataTable = configuracoes.contents.find(
            (entry) =>
                entry?.type === 'table' &&
                entry?.cols === 3 &&
                JSON.stringify(entry).includes('hab_slayer_pdr_por_nivel')
        );
        if (!dataTable)
            throw new Error('Table administrativa pronta de Config / Dados não encontrada.');
        dataTable.key = 'dados_slayer_runtime_table';
        dataTable.contents[0][0] = damageTaken;
        dataTable.contents[1][0] = currentBreath;
        dataTable.contents[3][0] = pdrSpent;

        const combatControls = combate.contents.find(
            (entry) => entry?.key === 'combat_slayer_table'
        );
        const statusButton =
            combatControls &&
            extractComponentsByKey(combatControls, new Set(['status_slayer_gerenciar'])).at(-1);
        const statusDisplay =
            combatControls &&
            extractComponentsByKey(combatControls, new Set(['status_slayer_display'])).at(-1);
        const resistancePanel = combate.contents.find(
            (entry) => entry?.key === 'resistencias_slayer_panel'
        );
        const resistanceButton =
            resistancePanel &&
            extractComponentsByKey(resistancePanel, new Set(['resistencia_slayer_gerenciar'])).at(
                -1
            );
        const resistanceDisplay =
            resistancePanel &&
            extractComponentsByKey(
                resistancePanel,
                new Set(['status_slayer_resistencias_display'])
            ).at(-1);
        if (!statusButton || !statusDisplay || !resistanceButton || !resistanceDisplay) {
            throw new Error('Controles de Status/Resistências do Slayer incompletos.');
        }
        removeComponentsByKey(
            combate,
            new Set(['resistencias_slayer_panel', 'status_slayer_panel'])
        );
        combate.contents = combate.contents.filter((entry) => {
            if (entry?.key) return true;
            return !(
                entry?.type === 'panel' && JSON.stringify(entry).includes('Status e Resistências')
            );
        });
        const statusTable = csbTable(
            'status_resistencias_slayer_table',
            [
                [resistanceButton, statusButton],
                [resistanceDisplay, statusDisplay],
            ],
            'cc'
        );

        const weaponContainer = combate.contents.find(
            (entry) => entry?.key === 'inventario_slayer_armas'
        );
        const breathingForms = combate.contents.find(
            (entry) => entry?.key === 'skills_slayer_respiracoes'
        );
        const accumulations = combate.contents.find(
            (entry) => entry?.key === 'combate_acumulos_slayer_panel'
        );
        const trainingBonus = combate.contents.find(
            (entry) => entry?.key === 'combat_slayer_bonus_interludio_panel'
        );
        if (!weaponContainer || !breathingForms || !accumulations || !trainingBonus) {
            throw new Error(
                'Arma, Formas, acúmulos ou bônus de treino não encontrados em Combate.'
            );
        }
        configureBreathingAccumulations(accumulations);
        combate.contents = combate.contents.filter(
            (entry) =>
                ![weaponContainer, breathingForms, accumulations, trainingBonus].includes(entry)
        );
        const weaponBreathingTable = csbTable(
            'armas_acumulos_slayer_table',
            [[weaponContainer, accumulations]],
            'cc'
        );

        const skills = tab('skills_slayer_tab', 'Skills', legacySkills.contents.filter(Boolean));
        configuracoes.contents = configuracoes.contents.filter((entry) => entry !== legacySkills);
        configuracoes.contents.splice(1, 0, trainingBonus);

        pericias.name = 'Perícias';
        combate.name = 'Combate';
        configuracoes.name = 'Config / Dados';
        combate.contents.push(statusTable, weaponBreathingTable, breathingForms);
        tabs.contents = [pericias, combate, skills, configuracoes];
        return;
    }
    if (
        !dados &&
        pericias &&
        combate &&
        configuracoes &&
        currentSkills &&
        currentInventario &&
        currentNotas
    ) {
        const take = (key) => extractComponentsByKey(tabs.contents, new Set([key])).at(-1) ?? null;
        const profileRuntime =
            take('perfil_slayer_recursos_runtime_panel') ??
            panel(
                'perfil_slayer_recursos_runtime_panel',
                'Mesa',
                [take('descanso_slayer_gerenciar'), take('deslocamento_slayer_display')].filter(
                    Boolean
                ),
                'grid-2'
            );
        const breathingForms = take('skills_slayer_respiracoes');
        const weaponContainer = take('inventario_slayer_armas');
        const accumulations = take('combate_acumulos_slayer_panel');
        const derivedBonuses =
            take('bonus_derivados_slayer_panel') ??
            panel(
                'bonus_derivados_slayer_panel',
                'Bônus Derivados',
                [
                    Object.assign(
                        displayLabel(
                            'bonus_derivados_slayer_resumo',
                            '<span class="na-sheet-text na-sheet-label na-sheet-size-sm">ACERTO +${hab_acerto_bonus+metal_acerto_bonus}$ · BLOQUEIO +${hab_bloqueio_bonus+metal_bloqueio_bonus}$ · ESQUIVA +${hab_esquiva_bonus+metal_esquiva_bonus}$ · DANO +${hab_dano_bonus+metal_dano_bonus}$ · PERCEPÇÃO +${metal_percepcao_visual_bonus}$ · INICIATIVA +${metal_iniciativa_bonus}$</span>'
                        ),
                        {
                            role: 4,
                            tooltip:
                                'Totais permanentes atuais; Respirações e Status temporários entram no momento da rolagem.',
                        }
                    ),
                    Object.assign(
                        displayLabel(
                            'bonus_derivados_slayer_auditar',
                            '<span class="na-sheet-text na-sheet-label na-sheet-size-sm">AUDITAR BÔNUS</span>'
                        ),
                        {
                            role: 4,
                            tooltip: 'Abre a decomposição por fonte. Somente GM.',
                            style: 'button',
                            rollMessage:
                                "%{await game.modules.get('night-assassins-csb-automation')?.api?.openDerivedBonusAudit({actorUuid:entity.uuid}); return '';}%",
                        }
                    ),
                ],
                'grid-4'
            );
        derivedBonuses.role = 4;
        derivedBonuses.tooltip =
            'Resumo calculado das fontes permanentes. Efeitos condicionais são detalhados na auditoria.';
        const smallBottle = take('interludio_cabaca_pequena_completa');
        const constantConcentration = take('interludio_concentracao_total_constante');

        if (!profileRuntime || !breathingForms || !weaponContainer || !accumulations) {
            throw new Error('Componentes obrigatórios da aba Combate do Slayer não encontrados.');
        }

        for (const field of [smallBottle, constantConcentration].filter(Boolean)) {
            field.role = 0;
            field.editRole = 4;
            field.tooltip = 'Estado persistente visível ao jogador e editável somente pelo GM.';
        }
        const interludeBonus = panel(
            'combat_slayer_bonus_interludio_panel',
            'Bônus de Treino',
            [...[smallBottle, constantConcentration].filter(Boolean)],
            'grid-2'
        );

        const skillPanel = pericias.contents.find((entry) => entry?.type === 'panel' && !entry.key);
        if (!skillPanel || !Array.isArray(skillPanel.contents))
            throw new Error('Matriz de Perícias do Slayer não encontrada.');
        const skillTable = structuredClone(skillPanel);
        skillTable.type = 'table';
        skillTable.cols = 3;
        skillTable.rows = Math.ceil(skillPanel.contents.length / 3);
        skillTable.layout = 'ccc';
        skillTable.contents = Array.from({ length: skillTable.rows }, (_, index) =>
            skillPanel.contents.slice(index * 3, index * 3 + 3)
        );
        delete skillTable.flow;
        delete skillTable.align;
        delete skillTable.verticalAlign;
        delete skillTable.collapsible;
        delete skillTable.defaultCollapsed;
        delete skillTable.title;
        delete skillTable.titleStyle;
        pericias.contents = [
            skillTable,
            ...pericias.contents.filter(
                (entry) => entry !== skillPanel && entry !== derivedBonuses
            ),
        ];

        const legacySkills = panel(
            'skills_slayer_legado_panel',
            'Habilidades do Caçador',
            currentSkills.contents.filter(Boolean),
            'vertical'
        );
        legacySkills.collapsible = true;
        legacySkills.defaultCollapsed = true;
        configuracoes.contents.unshift(...[derivedBonuses, legacySkills].filter(Boolean));

        pericias.name = 'Perícias';
        combate.name = 'Combate';
        configuracoes.name = 'Config / Dados';
        combate.contents = [
            profileRuntime,
            ...combate.contents.filter(
                (entry) => ![weaponContainer, accumulations].includes(entry)
            ),
            weaponContainer,
            breathingForms,
            interludeBonus,
            accumulations,
        ];
        tabs.contents = [pericias, combate, configuracoes];
        return;
    }
    if (!pericias || !combate || !configuracoes || !dados) {
        throw new Error('Abas canônicas Perícias/Combate/Configurações/Dados não encontradas.');
    }

    let existingMarkPanel = null;
    let resistanceButton = null;
    let resistanceDisplay = null;
    let statusButton = null;
    let statusDisplay = null;
    walk(tabs, (node) => {
        if (
            !existingMarkPanel &&
            (node.key === 'skills_marca_slayer_panel' || node.title === 'Marca do Caçador')
        ) {
            existingMarkPanel = structuredClone(node);
        }
        if (node.key === 'resistencia_slayer_gerenciar') resistanceButton = structuredClone(node);
        if (node.key === 'status_slayer_resistencias_display')
            resistanceDisplay = structuredClone(node);
        if (node.key === 'status_slayer_gerenciar') statusButton = structuredClone(node);
        if (node.key === 'status_slayer_display') statusDisplay = structuredClone(node);
    });

    removeComponentsByKey(
        template.system,
        new Set([
            'perfil_slayer_tab',
            'skills_slayer_tab',
            'inventario_slayer_tab',
            'interludios_slayer_tab',
            'notas_slayer_tab',
            'vida_morte_slayer_panel',
            'skills_marca_slayer_panel',
            'skills_slayer_respiracoes',
            'respiracao_slayer_usar',
            'skills_slayer_hab_display',
            'skills_slayer_classe_display',
            'skills_slayer_origem_display',
            'mundo_transparente_slayer_estado',
            'estado_altruista_slayer_estado',
            'lamina_carmesim_slayer_estado',
            'resistencia_slayer_gerenciar',
            'status_slayer_resistencias_display',
            'status_slayer_gerenciar',
            'status_slayer_display',
        ])
    );

    pericias.name = 'Perícias';
    pericias.contents.push(
        panel(
            'vida_morte_slayer_panel',
            'Vida e Morte',
            [
                displayLabel('vida_morte_slayer_titulo', orbitron('VIDA E MORTE', '#C1000C')),
                displayLabel('vida_morte_slayer_estado_display', '${vida_morte_slayer_resumo}$'),
                displayLabel(
                    'vida_morte_slayer_marcas_display',
                    'Marcas de Morte: ${vida_morte_slayer_marcas}$/3'
                ),
                displayLabel(
                    'vida_morte_slayer_quedas_display',
                    'Quedas neste combate: ${vida_morte_slayer_quedas}$'
                ),
                Object.assign(
                    displayLabel(
                        'vida_morte_slayer_gerenciar',
                        orbitron('GERENCIAR VIDA E MORTE', '#C1000C', 16)
                    ),
                    {
                        style: 'button',
                        icon: '',
                        rollMessage:
                            "%{await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NALifeDeath00001'))?.execute({actorUuid:entity.uuid}); return '';}%",
                    }
                ),
            ],
            'grid-2'
        )
    );

    const markIndex = combate.contents.findIndex(
        (entry) =>
            entry?.title === 'Marca do Caçador' ||
            JSON.stringify(entry).includes('marca_despertada_display')
    );
    const markPanel =
        markIndex >= 0
            ? combate.contents.splice(markIndex, 1)[0]
            : (existingMarkPanel ?? hunterMarkPanel());
    markPanel.key = 'skills_marca_slayer_panel';
    if (!JSON.stringify(markPanel).includes('marca_despertada_display')) {
        markPanel.contents ??= [];
        markPanel.contents.unshift(...hunterMarkPanel().contents);
    }

    const perfil = tab('perfil_slayer_tab', 'Perfil/Bio', [
        displayLabel('perfil_slayer_titulo', orbitron('PERFIL DO CAÇADOR', '#D45CA4', 18)),
        panel(
            'perfil_slayer_resumo_panel',
            'Identidade',
            [
                textField('perfil_slayer_nome_social', 'Nome / Apelido', ''),
                textField('perfil_slayer_pronomes', 'Pronomes', ''),
                textField('perfil_slayer_aparencia', 'Aparência', ''),
                textField('perfil_slayer_personalidade', 'Personalidade', ''),
            ],
            'grid-2'
        ),
        richTextArea('perfil_slayer_bio', 'Biografia'),
    ]);

    const skills = tab('skills_slayer_tab', 'Skills', [
        displayLabel('skills_slayer_titulo', orbitron('SKILLS', '#FF9100', 18)),
        panel(
            'skills_slayer_escolhas_panel',
            'Escolhas do Caçador',
            [
                displayLabel('skills_slayer_resp_display', 'Respiração: ${resp}$'),
                displayLabel('skills_slayer_hab_display', 'Habilidade Especial: ${hab_escolhida}$'),
                displayLabel('skills_slayer_classe_display', 'Classe: ${classe_escolhida}$'),
                displayLabel(
                    'skills_slayer_origem_display',
                    'Habilidade de Origem: ${origem_dropdown}$'
                ),
                playerTextField(
                    'armas_proficientes',
                    'Armas Proficientes (separadas por vírgula)',
                    ''
                ),
            ],
            'grid-2'
        ),
        breathingItemContainer(),
        markPanel,
        panel('skills_slayer_origem_panel', 'Habilidade de Origem', [
            textField('hab_origem_slayer_resumo', 'Resumo', ''),
        ]),
    ]);

    const inventario = tab('inventario_slayer_tab', 'Inventário', [
        displayLabel('inventario_slayer_titulo', orbitron('INVENTÁRIO', '#F8EB4D', 18)),
        panel(
            'inventario_slayer_moedas_panel',
            'Recursos',
            [
                numberField('dinheiro_slayer_atual', 'Dinheiro atual', 0, 0),
                numberField('moedas_honra_slayer_atual', 'Moedas de Honra atual', 0, 0),
            ],
            'grid-2'
        ),
        weaponItemContainer(),
        itemContainer(
            'inventario_slayer_equipamentos',
            'Equipamentos',
            'equipamento',
            'NAEquipmentTpl01'
        ),
        itemContainer('inventario_slayer_itens', 'Itens', 'item', 'NAInventoryTpl001'),
    ]);

    combat.contents.push(
        panel(
            'status_resistencias_slayer_panel',
            'Status e Resistências',
            [
                displayLabel(
                    'status_slayer_titulo',
                    orbitron('STATUS E RESISTÊNCIAS', '#D45CA4', 18)
                ),
                panel(
                    'resistencias_slayer_panel',
                    'Resistências',
                    [
                        resistanceButton ??
                            displayLabel(
                                'resistencia_slayer_indisponivel',
                                'Gerenciador de Resistências indisponível'
                            ),
                        resistanceDisplay ??
                            displayLabel(
                                'status_slayer_resistencias_display',
                                '${status_slayer_resistencias_resumo}$'
                            ),
                    ],
                    'grid-2'
                ),
                panel(
                    'status_slayer_panel',
                    'Status',
                    [
                        statusButton ??
                            displayLabel(
                                'status_slayer_indisponivel',
                                'Gerenciador de Status indisponível'
                            ),
                        statusDisplay ??
                            displayLabel('status_slayer_display', '${status_slayer_resumo}$'),
                    ],
                    'grid-2'
                ),
            ],
            'vertical'
        )
    );

    const interludios = tab('interludios_slayer_tab', 'Interlúdios', [
        displayLabel(
            'interludios_slayer_titulo',
            orbitron('INTERLÚDIO, TREINO & REABILITAÇÃO', '#28D7FF', 18)
        ),
        ...interludePanels(),
    ]);
    const notas = tab('notas_slayer_tab', 'Notas/Diário', [
        displayLabel('notas_slayer_titulo', orbitron('NOTAS & DIÁRIO', '#D45CA4', 18)),
        richTextArea('notas_slayer_diario', 'Diário'),
        richTextArea('notas_slayer_anotacoes', 'Anotações'),
    ]);

    combate.name = 'Combate';
    configuracoes.name = 'Configurações';
    dados.name = 'Dados';
    const profileRuntimeKeys = new Set([
        'descanso_slayer_gerenciar',
        'deslocamento_slayer_titulo',
        'deslocamento_slayer_display',
    ]);
    const profileRuntime = extractComponentsByKey(combat.contents, profileRuntimeKeys).reverse();
    if (profileRuntime.length > 0) {
        perfil.contents.splice(
            2,
            0,
            panel('perfil_slayer_recursos_runtime_panel', 'Mesa', profileRuntime, 'grid-2')
        );
    }
    tabs.contents = [
        perfil,
        pericias,
        combate,
        skills,
        inventario,
        interludios,
        notas,
        configuracoes,
        dados,
    ];
}

function fixBreathingState(template) {
    const hidden = template.system?.hidden;
    if (!Array.isArray(hidden)) throw new Error('system.hidden não é uma lista.');

    const attributes = ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab'];
    for (const attribute of attributes) {
        const display = hidden.find((entry) => entry.name === `${attribute}_display`);
        if (!display) throw new Error(`Hidden Attribute ${attribute}_display não encontrado.`);
        const bonus = `${attribute}_resp_bonus_temp_slayer`;
        if (!String(display.value).includes(bonus)) {
            display.value = String(display.value).replace(/}\$$/, `+${bonus}}$`);
        }
    }
    const vitDisplay = hidden.find((entry) => entry.name === 'vit_display');
    if (
        vitDisplay &&
        !String(vitDisplay.value).includes('interludio_concentracao_total_constante')
    ) {
        vitDisplay.value = String(vitDisplay.value).replace(
            /}\$$/,
            '+(interludio_concentracao_total_constante ? 1 : 0)}$'
        );
    }

    let combatTab = null;
    let configTab = null;
    walk(template.system?.body, (node) => {
        if (node.key === 'combat_slayer_tab' && node.type === 'tab') combatTab = node;
        if (node.key === 'configs_tab' && node.type === 'tab') configTab = node;
    });
    if (!combatTab || !configTab)
        throw new Error('Abas Combate/Configurações do Slayer não encontradas.');

    const numericFields = [
        ['resp_bonus_acerto_temp', 'Bônus de Acerto', 0],
        ['resp_bonus_esquiva_temp', 'Bônus de Esquiva', 0],
        ['resp_bonus_bloqueio_temp', 'Bônus de Bloqueio', 0],
        ['resp_bonus_dano_fixo', 'Dano fixo adicional', 0],
        ['resp_efeito_duracao', 'Duração do efeito', 0],
        ['resp_combo_turno', 'Turno do combo', 0],
        ['resp_carga_acumulada', 'Carga acumulada', 0],
        ['resp_carga_turno_inicio', 'Início do carregamento', 0],
        ['resp_agua_11_usos_hoje', 'Água 11 usos hoje', 0],
        ['resp_agua_08_recarga_turno', 'Água 8 turno de recarga', 0],
        ['resp_chamas_calor_arma', 'Chamas Fogo Fátuo', 0],
        ['resp_chamas_bonus_acerto', 'Chamas bônus de Acerto', 0],
        ['resp_chamas_bonus_dano', 'Chamas bônus de dano da arma', 0],
        ['resp_metal_bloqueio_bonus', 'Metal bônus de Bloqueio', 0],
        ['resp_metal_for_temp', 'Metal FOR temporário', 0],
        ['resp_metal_fdv_temp', 'Metal FDV temporário', 0],
        ...attributes.map((attribute) => [
            `${attribute}_resp_bonus_temp_slayer`,
            `${attribute.toUpperCase()} temporário de Respiração`,
            0,
        ]),
    ];
    const textFields = [
        ['resp_agua_estado', 'Estado mecânico da Respiração da Água', '{"version":1}'],
        [
            'resp_chamas_estado',
            'Estado mecânico da Respiração das Chamas',
            '{"version":1,"weaponHeat":0}',
        ],
        ['resp_pedra_estado', 'Estado mecânico da Respiração da Pedra', '{"version":1}'],
        [
            'resp_nevoa_estado',
            'Estado mecânico da Respiração da Névoa',
            '{"version":1,"patterns":{}}',
        ],
        ['resp_metal_estado', 'Estado mecânico da Respiração do Metal', '{"version":1}'],
        ['resp_neve_estado', 'Estado mecânico da Respiração da Neve', '{"version":1}'],
        ['resp_chamas_bonus_dado', 'Chamas dado adicional de técnica', ''],
        ['resp_chamas_resumo', 'Chamas resumo', 'Fogo Fátuo 0/60'],
        ['resp_pedra_resumo', 'Pedra resumo', 'Pedra · sem efeito ativo'],
        ['resp_nevoa_resumo', 'Névoa resumo', 'Padrões 0/3'],
        ['resp_metal_resumo', 'Metal resumo', 'Metal · sem efeito ativo'],
        ['resp_neve_resumo', 'Neve resumo', 'Neve · sem efeito ativo'],
        ['resp_bonus_dano_dados', 'Dados adicionais', ''],
        ['resp_efeito_flag', 'Efeito ativo', ''],
        ['resp_combo_origem', 'Origem do combo', ''],
    ];

    removeComponentsByKey(
        template.system,
        new Set(['resp_slayer_panel', 'resp_slayer_storage_panel'])
    );

    configTab.contents.push({
        key: 'resp_slayer_storage_panel',
        colSpan: 1,
        rowSpan: 1,
        cssClass: '',
        role: 4,
        editRole: 4,
        permission: 0,
        tooltip: 'Estado persistente gerenciado pelo motor de Respirações.',
        visibilityFormula: '',
        editableFormula: '',
        escapeHTML: false,
        type: 'panel',
        flow: 'grid-3',
        align: 'center',
        verticalAlign: 'top',
        collapsible: true,
        defaultCollapsed: true,
        title: 'Dados de Respiração',
        titleStyle: 'default',
        contents: [
            ...textFields.map(([key, label, value]) => textField(key, label, value)),
            ...numericFields.map(([key, label, value]) => numberField(key, label, value, 0)),
        ],
    });
}

function fixLifeDeathStorage(template) {
    let configTab = null;
    walk(template.system?.body, (node) => {
        if (node.key === 'configs_tab' && node.type === 'tab') configTab = node;
    });
    if (!configTab) throw new Error('Aba Configurações do Slayer não encontrada.');
    removeComponentsByKey(configTab, new Set(['vida_morte_slayer_storage_panel']));
    configTab.contents.push(
        panel(
            'vida_morte_slayer_storage_panel',
            'Dados de Vida e Morte',
            [
                textField(
                    'vida_morte_slayer_dados',
                    'Estado persistente',
                    '{"version":1,"dying":false,"stabilized":false,"dead":false,"deathMarks":0,"fallsThisCombat":0,"finalDeterminationUsed":false,"bondHelpUsed":false}'
                ),
                textField('vida_morte_slayer_resumo', 'Resumo', 'Estável'),
                numberField('vida_morte_slayer_marcas', 'Marcas de Morte', 0, 0, 3),
                numberField('vida_morte_slayer_quedas', 'Quedas neste combate', 0, 0, 4),
            ],
            'grid-2'
        )
    );
}

function fixResistanceAndWoundContract(template) {
    let resistanceButton = null;
    let resistanceDisplay = null;
    let combatTable = null;
    let configTab = null;
    let woundField = null;
    let totalLabel = null;

    walk(template.system, (node) => {
        const text = labelText(node.value);
        if (node.type === 'label' && text === 'GERENCIAR RESISTÊNCIAS') resistanceButton = node;
        if (node.key === 'status_slayer_resistencias_display') resistanceDisplay = node;
        if (
            (node.key === 'tes' || node.key === 'combat_slayer_table') &&
            ['table', 'panel'].includes(node.type)
        )
            combatTable = node;
        if (node.key === 'configs_tab' && node.type === 'tab') configTab = node;
        if (node.key === 'pdv_slayer_dano_ferida') woundField = node;
        if (node.key === 'pdv_slayer_total_valor') totalLabel = node;
    });

    if (
        !resistanceButton ||
        !resistanceDisplay ||
        !combatTable ||
        !configTab ||
        !woundField ||
        !totalLabel
    ) {
        const missing = Object.entries({
            resistanceButton,
            resistanceDisplay,
            combatTable,
            configTab,
            woundField,
            totalLabel,
        })
            .filter(([, value]) => !value)
            .map(([key]) => key);
        throw new Error(
            `Componentes novos de Resistências/Ferida não encontrados no export Slayer: ${missing.join(', ')}.`
        );
    }

    combatTable.key = 'combat_slayer_table';
    resistanceButton.style = 'button';
    resistanceButton.key = 'resistencia_slayer_gerenciar';
    resistanceButton.rollMessageToChat = false;
    resistanceButton.altRollMessageToChat = false;
    resistanceButton.rollMessage =
        "%{await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAResistance0001'))?.execute({actorUuid:entity.uuid,kind:'slayer'}); return '';}%";
    resistanceDisplay.value = '${status_slayer_resistencias_resumo}$';
    woundField.defaultValue = '0';
    woundField.minVal = '0';

    totalLabel.value = String(totalLabel.value).replace(
        '${pdv_slayer_total_conta}$',
        '${pdv_slayer_total_conta-pdv_slayer_dano_ferida}$'
    );

    const current = template.system.hidden?.find(
        (entry) => entry.name === 'pdv_slayer_conta_atual'
    );
    if (!current) throw new Error('Hidden Attribute pdv_slayer_conta_atual não encontrado.');
    current.value =
        '${pdv_slayer_total_conta-pdv_slayer_dano_ferida+pdv_slayer_curado+pdv_slayer_extra-pdv_slayer_dano_tomado}$';

    let existingStatusButton = null;
    let existingStatusDisplay = null;
    let existingRestButton = null;
    walk(template.system, (node) => {
        if (node.key === 'status_slayer_gerenciar') existingStatusButton = node;
        if (node.key === 'status_slayer_display') existingStatusDisplay = node;
        if (node.key === 'descanso_slayer_gerenciar') existingRestButton = node;
    });

    const statusButton = existingStatusButton ?? structuredClone(resistanceButton);
    statusButton.key = 'status_slayer_gerenciar';
    statusButton.value = 'GERENCIAR STATUS';
    statusButton.rollMessage =
        "%{await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAStatusManage01'))?.execute({actorUuid:entity.uuid}); return '';}%";
    const statusDisplay = existingStatusDisplay ?? structuredClone(resistanceDisplay);
    statusDisplay.key = 'status_slayer_display';
    statusDisplay.value = '${status_slayer_resumo}$';
    const restButton = existingRestButton ?? structuredClone(statusButton);
    restButton.key = 'descanso_slayer_gerenciar';
    restButton.value = 'DESCANSO';
    restButton.icon = '';
    restButton.tooltip =
        'Solicitar Descanso de Campo, Descanso Completo ou Recuperação Profunda ao GM.';
    restButton.rollMessage =
        "%{await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NARestManage0001'))?.execute({actorUuid:entity.uuid}); return '';}%";

    let statusTable = null;
    let headerTable = null;
    walk(template.system, (node) => {
        if (node.key === 'status_resistencias_slayer_table' && node.type === 'table')
            statusTable = node;
        if (node.key === 'perfil' && node.type === 'table') headerTable = node;
    });
    if (statusTable && headerTable) {
        const movement = headerTable.contents
            .flat()
            .find((entry) => entry?.key === 'deslocamento_slayer_display');
        const breath = headerTable.contents
            .flat()
            .find((entry) => entry?.key === 'folego_slayer_header_display');
        headerTable.contents = headerTable.contents.filter(
            (row) =>
                !row?.some?.((entry) =>
                    [
                        'descanso_slayer_gerenciar',
                        'deslocamento_slayer_display',
                        'folego_slayer_header_display',
                    ].includes(entry?.key)
                )
        );
        headerTable.contents.push([
            restButton,
            movement ?? blankTableCell(),
            breath ?? blankTableCell(),
        ]);
        headerTable.rows = headerTable.contents.length;
        statusTable.contents = [
            [resistanceButton, statusButton],
            [resistanceDisplay, statusDisplay],
        ];
        statusTable.cols = 2;
        statusTable.rows = 2;
    } else {
        if (!existingStatusButton) combatTable.contents.push(statusButton);
        if (!existingStatusDisplay) combatTable.contents.push(statusDisplay);
        if (!existingRestButton) combatTable.contents.push(restButton);
    }

    const storageKeys = new Set();
    let storagePanel = null;
    walk(configTab, (node) => {
        if (node.key) storageKeys.add(node.key);
        if (node.key === 'status_slayer_storage_panel' && node.type === 'panel')
            storagePanel = node;
    });
    const storage = [];
    if (!storageKeys.has('status_slayer_resistencias_dados')) {
        storage.push(textField('status_slayer_resistencias_dados', 'Resistências (dados)', ''));
    }
    if (!storageKeys.has('status_slayer_resistencias_resumo')) {
        storage.push(
            textField(
                'status_slayer_resistencias_resumo',
                'Resistências (resumo)',
                'Nenhuma resistência'
            )
        );
    }
    if (!storageKeys.has('status_slayer_dados')) {
        storage.push(
            textField(
                'status_slayer_dados',
                'Status (dados)',
                '{"version":1,"active":[],"exhaustion":0}'
            )
        );
    }
    if (!storageKeys.has('status_slayer_resumo')) {
        storage.push(textField('status_slayer_resumo', 'Status (resumo)', 'Nenhum status'));
    }
    if (!storageKeys.has('status_slayer_exaustao')) {
        storage.push(numberField('status_slayer_exaustao', 'Exaustão', 0, 0, 8));
    }
    if (!storageKeys.has('descanso_slayer_dados')) {
        storage.push(textField('descanso_slayer_dados', 'Último descanso (dados)', ''));
    }
    if (storage.length > 0 && storagePanel) {
        storagePanel.contents.push(...storage);
    } else if (storage.length > 0) {
        configTab.contents.push({
            key: 'status_slayer_storage_panel',
            colSpan: 1,
            rowSpan: 1,
            cssClass: '',
            role: 4,
            editRole: 4,
            permission: 0,
            tooltip: '',
            visibilityFormula: '',
            editableFormula: '',
            escapeHTML: false,
            type: 'panel',
            contents: storage,
            flow: 'grid-2',
            align: 'center',
            verticalAlign: 'top',
            collapsible: true,
            defaultCollapsed: true,
            title: 'Dados de Combate',
            titleStyle: 'default',
        });
    }
}

function fixMovementDisplay(template) {
    const hidden = template.system?.hidden;
    if (!Array.isArray(hidden)) throw new Error('system.hidden não é uma lista.');
    const hiddenMovement = hidden.find((entry) => entry.name === 'deslocamento_slayer');
    if (hiddenMovement)
        hiddenMovement.value =
            '${7+dex_display+(interludio_concentracao_total_constante ? 1.5 : 0)}$';
    else
        hidden.push({
            name: 'deslocamento_slayer',
            value: '${7+dex_display+(interludio_concentracao_total_constante ? 1.5 : 0)}$',
        });

    let headerTable = null;
    walk(template.system?.header, (node) => {
        if (node.key === 'perfil' && node.type === 'table') headerTable = node;
    });
    if (!headerTable) throw new Error('Table perfil do cabeçalho Slayer não encontrada.');
    removeComponentsByKey(
        template.system,
        new Set(['deslocamento_slayer_titulo', 'deslocamento_slayer_display'])
    );
    const movement = displayLabel(
        'deslocamento_slayer_display',
        'Deslocamento: ${deslocamento_slayer}$m (7m + DEX)'
    );
    movement.tooltip = 'Deslocamento base calculado automaticamente.';

    const runtimeRow = headerTable.contents.find((row) =>
        row?.some?.((entry) =>
            ['descanso_slayer_gerenciar', 'folego_slayer_header_display'].includes(entry?.key)
        )
    );
    if (runtimeRow) {
        const rest =
            runtimeRow.find((entry) => entry?.key === 'descanso_slayer_gerenciar') ??
            blankTableCell();
        const breath =
            runtimeRow.find((entry) => entry?.key === 'folego_slayer_header_display') ??
            blankTableCell();
        runtimeRow.splice(0, runtimeRow.length, rest, movement, breath);
    } else {
        headerTable.contents.push([blankTableCell(), movement, blankTableCell()]);
    }
    headerTable.rows = headerTable.contents.length;
}

function fixFolegoDisplay(template) {
    const hidden = template.system?.hidden;
    if (!Array.isArray(hidden)) throw new Error('system.hidden não é uma lista.');
    const maximum = hidden.find((entry) => entry.name === 'folego_slayer_maximo');
    if (maximum) maximum.value = '${2+fdv_display}$';
    else hidden.push({ name: 'folego_slayer_maximo', value: '${2+fdv_display}$' });

    let attributeTable = null;
    walk(template.system?.body, (node) => {
        if (!['table', 'panel'].includes(node.type) || attributeTable) return;
        const source = JSON.stringify(node.contents ?? []);
        if (source.includes('folego_slayer_titulo') || source.includes('>Fôlego</span>'))
            attributeTable = node;
    });
    if (!attributeTable) throw new Error('Tabela principal de atributos do Slayer não encontrada.');

    const flatContents = attributeTable.contents.flat?.() ?? attributeTable.contents;
    let title = null;
    walk(attributeTable, (node) => {
        if (title || node.type !== 'label') return;
        if (
            node.key === 'folego_slayer_titulo' ||
            node.value?.includes?.('>Fôlego</span>') ||
            node.value?.includes?.('>FÔLEGO</span>')
        )
            title = node;
    });
    if (!title) throw new Error('Título de Fôlego não encontrado.');
    title.key = 'folego_slayer_titulo';
    title.value = orbitron('FÔLEGO', '#D45CA4');
    title.tooltip = 'Fôlego de Combate máximo: 2 + FDV atual.';

    let valueRow = attributeTable.contents.find((row) =>
        row?.some?.((entry) => entry?.key === 'folego_slayer_atual')
    );
    let current =
        valueRow?.find?.((entry) => entry?.key === 'folego_slayer_atual') ??
        flatContents.find((entry) => entry?.key === 'folego_slayer_atual');
    if (!current) {
        walk(attributeTable, (node) => {
            if (!current && node.key === 'folego_slayer_atual') current = node;
        });
    }
    if (!current) {
        valueRow = attributeTable.contents.find((row) =>
            row?.some?.((entry) => entry?.key === 'bonus_atr_sab_valor_temp')
        );
        if (!valueRow) throw new Error('Linha de recursos dos atributos não encontrada.');
        current = numberField('folego_slayer_atual', '', '${folego_slayer_maximo}$', 0);
        valueRow.push(current);
    }
    current.defaultValue = '${folego_slayer_maximo}$';
    current.minVal = '0';
    current.maxVal = '${folego_slayer_maximo}$';
    current.tooltip = 'Fôlego atual. Recupera 1 no início do turno e em crítico positivo.';

    if (attributeTable.cols >= 8) attributeTable.layout = 'c'.repeat(attributeTable.cols);
}

function organizeSlayerCombatLayout(template) {
    let combatTab = null;
    let actionButton = null;
    let combatControls = null;
    walk(template.system?.body, (node) => {
        if (node.key === 'combat_slayer_tab' && node.type === 'tab') combatTab = node;
        if (node.key === 'acoes_slayer_gerenciar' && node.type === 'label')
            actionButton = structuredClone(node);
        if (node.key === 'combat_slayer_table' && ['panel', 'table'].includes(node.type))
            combatControls = node;
    });
    if (!combatTab || !actionButton || !combatControls)
        throw new Error('Aba Combate, controles ou botão Gerenciar Ações não encontrado.');

    const existingTestsTable =
        combatControls.contents.find(
            (entry) => entry?.type === 'table' && entry?.key === 'combat_slayer_testes_table'
        ) ??
        combatControls.contents.find(
            (entry) =>
                entry?.type === 'table' &&
                entry?.contents
                    ?.flat?.()
                    .some?.((component) => labelText(component?.value) === 'Acerto')
        );
    const directTests = (
        combatControls.type === 'table' ? combatControls.contents.flat() : combatControls.contents
    ).filter((entry) => {
        const text = labelText(entry?.value);
        return ['Acerto', 'Bloqueio', 'Esquiva', 'Dano', 'Rolagem de dano'].includes(text);
    });
    const combatTests = (existingTestsTable?.contents?.flat?.() ?? directTests)
        .filter((entry) => {
            const text = labelText(entry?.value);
            return ['Acerto', 'Bloqueio', 'Esquiva', 'Dano', 'Rolagem de dano'].includes(text);
        })
        .slice(0, 4);
    if (combatTests.length !== 4)
        throw new Error('Matriz Acerto/Bloqueio/Esquiva/Dano incompleta.');
    const remainingControls = combatControls.contents.filter(
        (entry) => entry !== existingTestsTable && !combatTests.includes(entry)
    );
    combatControls.type = 'table';
    combatControls.contents = [combatTests];
    combatControls.cols = 4;
    combatControls.rows = 1;
    combatControls.layout = 'cccc';
    delete combatControls.flow;
    delete combatControls.align;
    delete combatControls.verticalAlign;
    delete combatControls.collapsible;
    delete combatControls.defaultCollapsed;
    delete combatControls.title;
    delete combatControls.titleStyle;
    if (remainingControls.length > 0) combatControls._slayerRemainingControls = remainingControls;
    else delete combatControls._slayerRemainingControls;

    removeComponentsByKey(
        template.system,
        new Set(['acoes_slayer_gerenciar', 'acoes_slayer_display', 'acoes_slayer_panel'])
    );
    actionButton.value = orbitron('GERENCIAR AÇÕES', '#FF9100');
    actionButton.style = 'button';
    actionButton.rollMessageToChat = false;
    actionButton.rollMessage =
        "%{await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAActionManage01'))?.execute({actorUuid:entity.uuid}); return '';}%";
    const summary = structuredClone(actionButton);
    summary.key = 'acoes_slayer_display';
    summary.value = '${acoes_slayer_resumo}$';
    summary.style = 'label';
    summary.icon = '';
    summary.rollMessage = '';
    combatTab.contents.splice(Math.min(3, combatTab.contents.length), 0, {
        key: 'acoes_slayer_panel',
        colSpan: 1,
        rowSpan: 1,
        cssClass: '',
        role: 0,
        editRole: 0,
        permission: 0,
        tooltip: '',
        visibilityFormula: '',
        editableFormula: '',
        escapeHTML: false,
        type: 'panel',
        contents: [actionButton, summary],
        flow: 'grid-2',
        align: 'center',
        verticalAlign: 'top',
        collapsible: false,
        defaultCollapsed: false,
        title: 'Economia de Ações',
        titleStyle: 'default',
    });
}

function flattenNestedPanelContents(template) {
    walk(template.system?.body, (node) => {
        if (node.type !== 'panel') return;
        if (!Array.isArray(node.contents?.[0])) return;
        if (node.contents.every((entry) => Array.isArray(entry)))
            node.contents = node.contents.flat();
    });
}

function trimAttributeCardValues(template) {
    const keys = new Set([
        'atr_vit_valor',
        'atr_dex_valor',
        'atr_for_valor',
        'atr_car_valor',
        'atr_fdv_valor',
        'atr_int_valor',
        'atr_sab_valor',
    ]);
    walk(template.system?.body, (node) => {
        if (node.type === 'label' && keys.has(node.key))
            node.value = String(node.value ?? '').trim();
    });
}

export function migrateSlayerTemplate(template) {
    const migrated = visit(structuredClone(template));
    migrated.name = 'slayer_template';
    migrated.type = '_template';
    if (migrated.flags?.['custom-system-builder']) {
        delete migrated.flags['custom-system-builder'].templateHistory;
        delete migrated.flags['custom-system-builder'].templateHistoryRedo;
    }
    fixCurrentPdvLabel(migrated);
    fixKnownAttributeErrors(migrated);
    fixBars(migrated);
    fixRollButtons(migrated);
    removeDuplicateAttributeButton(migrated);
    fixResistanceAndWoundContract(migrated);
    fixMovementDisplay(migrated);
    fixFolegoDisplay(migrated);
    organizeSlayerCombatLayout(migrated);
    fixBreathingState(migrated);
    organizeSlayerTabs(migrated);
    flattenNestedPanelContents(migrated);
    fixLifeDeathStorage(migrated);
    fixRuntimeStorageKeys(migrated);
    fixRollButtonTypography(migrated);
    trimAttributeCardValues(migrated);
    fixTextVisibilityFormulas(migrated);
    normalizeRollMessageResults(migrated);
    return migrated;
}

export function unwrapSlayerTemplate(document) {
    if (document?.isCustomSystemExport === true) {
        const actor = document.actors?.[0];
        if (!actor?.data) throw new Error('Pacote CSB sem template Slayer em actors[0].');
        return {
            _id: actor.id,
            name: actor.name,
            type: actor.type,
            system: actor.data,
            flags: actor.flags ?? {},
        };
    }
    return document;
}

export function wrapSlayerTemplate(template) {
    const system = structuredClone(template.system ?? {});
    delete system.props;
    const flags = structuredClone(template.flags ?? {});
    if (flags['custom-system-builder']) {
        delete flags['custom-system-builder'].templateHistory;
        delete flags['custom-system-builder'].templateHistoryRedo;
    }
    return {
        isCustomSystemExport: true,
        actors: [
            {
                id: 'NASlayerTpl00001',
                type: template.type,
                name: template.name,
                data: system,
                flags,
            },
        ],
        items: [],
    };
}

export function buildActorExport(template, shell) {
    const slayerIcon =
        'modules/night-assassins-csb-automation/assets/icons/templates/na-slayer-template_icon.webp';
    return {
        ...structuredClone(shell),
        name: template.name,
        type: template.type,
        img: slayerIcon,
        system: structuredClone(template.system),
        prototypeToken: {
            ...structuredClone(shell.prototypeToken),
            name: template.name,
            texture: {
                ...structuredClone(shell.prototypeToken?.texture),
                src: slayerIcon,
            },
        },
        items: structuredClone(template.items ?? []),
        effects: structuredClone(template.effects ?? []),
        folder: null,
        ownership: structuredClone(template.ownership ?? { default: 0 }),
        flags: structuredClone(template.flags ?? {}),
        _id: 'NASlayerTpl00001',
    };
}

export function validateSlayerTemplate(template) {
    const componentKeys = [];
    walk(template, (node) => {
        // Dropdown option keys are values, not component identifiers. The two
        // respiration selectors intentionally share the same option keys.
        if (typeof node.type === 'string' && typeof node.key === 'string' && node.key) {
            componentKeys.push(node.key);
        }
    });
    const hiddenNames = (template.system?.hidden ?? []).map((entry) => entry.name).filter(Boolean);
    const duplicates = [...componentKeys, ...hiddenNames].filter(
        (key, index, all) => all.indexOf(key) !== index
    );
    const source = JSON.stringify(template);
    const forbidden = [
        'nome_cacador',
        'pdv_total_valor',
        'pdv_atual_valor_display',
        'pdv_dano',
        'pdv_slayer_dano',
        'pdv_curado',
        'pdv_extra',
        'pdr_total_valor',
        'pdr_atual_valor_display',
        'pdr_gasto_valor',
        'pdr_curado',
        'pdr_extra',
        'dex_nvl7dex_nvl7',
        'car_nvl6',
    ].filter((token) => new RegExp(`\\b${token}\\b`).test(source));
    return { duplicates: [...new Set(duplicates)], forbidden };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const sourcePath = path.resolve(process.argv[2] ?? defaultTemplate);
    const target = path.resolve(process.argv[3] ?? sourcePath);
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const template = unwrapSlayerTemplate(source);
    const migrated = migrateSlayerTemplate(template);
    const validation = validateSlayerTemplate(migrated);
    if (validation.duplicates.length || validation.forbidden.length) {
        throw new Error(`Migração inválida: ${JSON.stringify(validation)}`);
    }
    const shell = JSON.parse(fs.readFileSync(oniShellPath, 'utf8'));
    fs.writeFileSync(
        target,
        `${JSON.stringify(buildActorExport(migrated, shell), null, 2)}\n`,
        'utf8'
    );
    fs.writeFileSync(
        csbPackagePath,
        `${JSON.stringify(wrapSlayerTemplate(migrated), null, 2)}\n`,
        'utf8'
    );
    console.log(`Export de Actor Slayer: ${target}`);
    console.log(`Pacote global CSB: ${csbPackagePath}`);
}
