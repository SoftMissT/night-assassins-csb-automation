import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSource = path.join(root, 'oni.json');
const defaultTarget = path.join(root, 'src', 'templates', 'actors', 'oni-template.json');

const PDV_DICE_LEVELS = Object.freeze({
    2: '1d4',
    3: '1d4',
    4: '1d6',
    5: '1d6',
    6: '1d6',
    7: '2d4',
    8: '2d4',
    9: '2d4',
    10: '2d6',
    11: '2d6',
    12: '2d6',
});

function replaceOniResourceNames(value) {
    if (typeof value === 'string') {
        return value
            .replaceAll('pdv_slayer', 'pdv_oni')
            .replaceAll('pdr_slayer', 'pdk_oni')
            .replaceAll('status_slayer', 'status_oni')
            .replaceAll('resistencia_slayer', 'resistencia_oni')
            .replaceAll('combat_slayer', 'combat_oni')
            .replaceAll('pdr_oni', 'pdk_oni')
            .replaceAll('PDR / PDK', 'PDK')
            .replaceAll('PDR', 'PDK');
    }
    if (Array.isArray(value)) return value.map(replaceOniResourceNames);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
            key.replaceAll('pdr_oni', 'pdk_oni'),
            replaceOniResourceNames(child),
        ])
    );
}

const ATTRS = ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab'];

function renameOniKeys(value) {
    if (typeof value === 'string') {
        let result = value;
        for (const attr of ATTRS) {
            result = result
                .replaceAll(`atr_${attr}_valor_oni_config`, `atr_${attr}_oni_valor_config`)
                .replaceAll(`atr_${attr}_valor_config`, `atr_${attr}_oni_valor_config`)
                .replaceAll(`bonus_atr_${attr}_valor_temp`, `bonus_atr_${attr}_oni_valor_temp`)
                .replaceAll(`${attr}_nvl`, `${attr}_oni_nvl`);
        }
        return result;
    }
    if (Array.isArray(value)) return value.map(renameOniKeys);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [renameOniKeyString(key), renameOniKeys(child)])
    );
}

function renameOniKeyString(key) {
    let result = key;
    for (const attr of ATTRS) {
        result = result
            .replaceAll(`atr_${attr}_valor_oni_config`, `atr_${attr}_oni_valor_config`)
            .replaceAll(`atr_${attr}_valor_config`, `atr_${attr}_oni_valor_config`)
            .replaceAll(`bonus_atr_${attr}_valor_temp`, `bonus_atr_${attr}_oni_valor_temp`)
            .replaceAll(`${attr}_nvl`, `${attr}_oni_nvl`);
    }
    return result;
}

function walk(value, visitor) {
    if (!value || typeof value !== 'object') return;
    visitor(value);
    for (const child of Object.values(value)) walk(child, visitor);
}

function collectKeys(document) {
    const keys = new Set();
    walk(document.system, (value) => {
        if (typeof value.key === 'string') keys.add(value.key);
        if (typeof value.name === 'string' && value.value !== undefined) keys.add(value.name);
    });
    return keys;
}

function removeInvalidHiddenPlaceholders(template) {
    const hidden = template.system?.hidden;
    if (!Array.isArray(hidden)) return;
    template.system.hidden = hidden.filter((entry) => entry?.value !== '$' && entry?.value !== '');
}

function removeCircularFormulas(template) {
    const fieldKeys = new Set();
    walk(template.system, (node) => {
        if (node.key && ['numberField', 'select', 'textField'].includes(node.type)) {
            fieldKeys.add(node.key);
        }
    });
    const hidden = template.system?.hidden;
    if (Array.isArray(hidden)) {
        template.system.hidden = hidden.filter((h) => !fieldKeys.has(h.name));
    }
}

function removeSlayerOnlyComponents(template) {
    const forbiddenKeys = new Set([
        'folego_slayer_titulo',
        'armas_proficientes',
        'progressao_oni_recursos_panel',
        'origem_oni_recursos_panel',
    ]);
    function prune(value) {
        if (Array.isArray(value)) {
            for (let index = value.length - 1; index >= 0; index -= 1) {
                if (value[index]?.key && forbiddenKeys.has(value[index].key))
                    value.splice(index, 1);
                else prune(value[index]);
            }
            return;
        }
        if (!value || typeof value !== 'object') return;
        for (const child of Object.values(value)) prune(child);
    }
    prune(template.system);

    const actionPanel = findByKey(template, 'acoes_slayer_panel');
    if (actionPanel) actionPanel.key = 'acoes_oni_panel';
}

function configureOniActionButtons(template) {
    walk(template.system, (node) => {
        if (typeof node.rollMessage !== 'string') return;
        node.rollMessage = node.rollMessage
            .replace("kind:'slayer'", "kind:'oni'")
            .replace(/return await (\(await fromUuid\([\s\S]*?\)\)\?\.execute\([\s\S]*?\));}%$/, "await $1; return '';}%");
    });
}

function orbitron(text, color, size = 16) {
    return `<div class="custom-orbitron-wrapper"><span style="font-family:'Orbitron','Times New Roman',serif;font-size:${size}px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.12em;">${text}</span></div>`;
}

function upsertHidden(template, name, value) {
    const hidden = template.system?.hidden;
    if (!Array.isArray(hidden)) throw new Error('system.hidden do Oni não é uma lista.');
    const existingIndex = hidden.findIndex((entry) => entry.name === name);
    if (existingIndex < 0) hidden.push({ name, value });
    else {
        hidden[existingIndex].value = value;
        template.system.hidden = hidden.filter(
            (entry, index) => entry.name !== name || index === existingIndex
        );
    }
}

function findByKey(template, key) {
    let found = null;
    walk(template.system, (node) => {
        if (!found && node.key === key) found = node;
    });
    return found;
}

function makeNumberField(key, label, tooltip) {
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
        type: 'numberField',
        size: 'small',
        label,
        allowDecimal: false,
        minVal: '0',
        maxVal: '9999',
        defaultValue: '0',
        allowRelative: false,
        showControls: true,
        controlsStyle: 'hover',
    };
}

function makePanel(key, contents, cssClass = '') {
    return {
        key,
        colSpan: 1,
        rowSpan: 1,
        cssClass,
        role: 0,
        editRole: 0,
        permission: 0,
        tooltip: '',
        visibilityFormula: '',
        editableFormula: '',
        type: 'panel',
        flow: 'row',
        align: 'center',
        contents,
    };
}

function configureOniLevelAndRank(template) {
    const level = findByKey(template, 'nvl_pj');
    if (!level) throw new Error('Dropdown nvl_pj não encontrado no template Oni.');
    level.options = Array.from({ length: 21 }, (_, value) => ({
        key: `nvl_${value}`,
        value: String(value),
    }));
    level.defaultValue = 'nvl_0';

    const ranks = [
        'Não definido',
        'Oni Recém-Transformado',
        'Oni Faminto',
        'Oni Sanguinário',
        'Oni Predador',
        'Oni Notório',
        'Oni Aberrante',
        'Candidato às Doze Kizuki',
        'Lua Inferior Seis',
        'Lua Inferior Cinco',
        'Lua Inferior Quatro',
        'Lua Inferior Três',
        'Lua Inferior Dois',
        'Lua Inferior Um',
        'Lua Superior Seis',
        'Lua Superior Cinco',
        'Lua Superior Quatro',
        'Lua Superior Três',
        'Lua Superior Dois',
        'Lua Superior Um',
        'Rei dos Onis',
    ];
    const args = ranks.flatMap((rank, index) => [`'nvl_${index}'`, `'${rank}'`]).join(',\n  ');
    upsertHidden(
        template,
        'rank_atual',
        `\${switchCase(nvl_pj,\n  ${args},\n  'Desconhecido'\n)}$`
    );
}

// Valores oficiais auditados contra MACRO-NA-FOUNDRY/Mecânicas para fazer na ficha/Onis/Origens/
// Sessão 2026-08-25: 9 correções de PDV e 7 de PDK sobre os valores antigos.
const ONI_ORIGIN_PDV_FIXO = Object.freeze({
    passado_triste: 22,
    personalidade_maligna: 16,
    rastreador_de_sangue: 20,
    genio_do_mal: 20,
    adepto_das_trevas: 19,
    comum: 18,
    corte_palida: 18,
    mare_negra: 20,
    raiz_podre: 23,
    realidade_distorcida: 17,
    tela_do_submundo: 18,
    oni_de_outras_terras: 18,
    transfigurado: 24,
    eco_eterno: 18,
    chama_negra: 20,
    demonio_de_linhagem_infernal: 21,
    espirito_ceifador: 20,
    monarca_demoniaco: 22,
    vampiro_de_linhagem: 19,
});

const ONI_ORIGIN_PDK_FIXO = Object.freeze({
    passado_triste: 2,
    personalidade_maligna: 3,
    rastreador_de_sangue: 1,
    genio_do_mal: 2,
    adepto_das_trevas: 4,
    comum: 8,
    corte_palida: 18,
    mare_negra: 17,
    raiz_podre: 16,
    realidade_distorcida: 20,
    tela_do_submundo: 20,
    oni_de_outras_terras: 19,
    transfigurado: 16,
    eco_eterno: 19,
    chama_negra: 19,
    demonio_de_linhagem_infernal: 20,
    espirito_ceifador: 18,
    monarca_demoniaco: 20,
    vampiro_de_linhagem: 20,
});

function configureOniOrigins(template) {
    const origin =
        findByKey(template, 'origem_oni_dropdown') ?? findByKey(template, 'origem_dropdown');
    if (!origin || !Array.isArray(origin.options))
        throw new Error('Dropdown de origem Oni não encontrado.');
    origin.defaultValue = 'origem_oni_escolha';
    const keys = new Set(origin.options.map((option) => option.key));
    if ([...keys].some((key) => !String(key).startsWith('origem_oni_'))) {
        throw new Error('O dropdown Oni contém origem que não usa o namespace origem_oni_.');
    }

    const originKey = origin.key;

    const pdvArgs = Object.entries(ONI_ORIGIN_PDV_FIXO)
        .flatMap(([key, value]) => [`'origem_oni_${key}'`, value])
        .concat([
            `'origem_oni_exterminador_corrompido'`,
            `30+(vit_oni_nvl1*3)+(10*oni_nivel_na_queda)`,
        ])
        .join(',\n  ');
    const pdkArgs = Object.entries(ONI_ORIGIN_PDK_FIXO)
        .flatMap(([key, value]) => [`'origem_oni_${key}'`, value])
        .concat([
            `'origem_oni_exterminador_corrompido'`,
            `oni_pdr_maximo_antes_queda+(oni_nivel_na_queda*2)+(fdv_oni_nvl1*3)`,
        ])
        .join(',\n  ');

    upsertHidden(
        template,
        'origem_oni_pdv_val',
        `\${switchCase(${originKey},\n  ${pdvArgs},\n  0\n)}$`
    );
    upsertHidden(
        template,
        'origem_oni_pdk_val',
        `\${switchCase(${originKey},\n  ${pdkArgs},\n  0\n)}$`
    );
}

function configureOniProgression(template) {
    const inheritedVitSnapshots = {
        2: 1,
        5: 4,
        9: 8,
        10: 8,
        14: 13,
        15: 13,
        17: 16,
        18: 16,
        19: 16,
        20: 16,
    };
    for (const [level, sourceLevel] of Object.entries(inheritedVitSnapshots)) {
        upsertHidden(template, `vit_oni_nvl${level}`, `\${vit_oni_nvl${sourceLevel}}$`);
    }

    const pdvLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const pdvArgs = pdvLevels.map((level) => `'nvl_${level}', pdv_oni_nvl${level}`).join(', ');
    upsertHidden(template, 'pdv_oni_total_conta', `\${switchCase(nvl_pj, ${pdvArgs}, 0)}$`);

    const pdkLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const pdkArgs = pdkLevels.map((level) => `'nvl_${level}', pdk_oni_nvl${level}`).join(', ');
    upsertHidden(template, 'pdk_oni_total_conta', `\${switchCase(nvl_pj, ${pdkArgs}, 0)}$`);

    upsertHidden(
        template,
        'pdv_oni_atual_num',
        '${(pdv_oni_total_conta+pdv_oni_curado+pdv_oni_extra)-pdv_oni_dano_tomado}$'
    );
    upsertHidden(
        template,
        'pdk_oni_atual_num',
        '${(pdk_oni_total_conta+pdk_oni_curado+pdk_oni_extra)-pdk_oni_gasto_valor}$'
    );
}

function configureOniAttributes(template) {
  const formulas = {
    vit_display: "${atr_vit_oni_valor_config+bonus_atr_vit_oni_valor_temp}$",
    dex_display: "${atr_dex_oni_valor_config+bonus_atr_dex_oni_valor_temp}$",
    for_display: "${atr_for_oni_valor_config+bonus_atr_for_oni_valor_temp}$",
    car_display: "${atr_car_oni_valor_config+bonus_atr_car_oni_valor_temp}$",
    fdv_display: "${atr_fdv_oni_valor_config+bonus_atr_fdv_oni_valor_temp}$",
    int_display: "${atr_int_oni_valor_config+bonus_atr_int_oni_valor_temp}$",
    sab_display: "${atr_sab_oni_valor_config+bonus_atr_sab_oni_valor_temp}$",
  };
    for (const [name, formula] of Object.entries(formulas)) upsertHidden(template, name, formula);
}

function configureOniBarsAndLabels(template) {
    template.system.attributeBar = {
        pdv_oni_barra: {
            value: '${pdv_oni_atual_num}$',
            max: '${pdv_oni_total_conta}$',
            editable: false,
        },
        pdk_oni_barra: {
            value: '${pdk_oni_atual_num}$',
            max: '${pdk_oni_total_conta}$',
            editable: false,
        },
    };
    walk(template.system, (node) => {
        if (node.type !== 'label') return;
        if (node.key === 'pdv_oni_total_valor')
            node.value = orbitron('${pdv_oni_total_conta}$', '#C1000C', 18);
        if (node.key === 'pdv_oni_atual_valor_display')
            node.value = orbitron('${pdv_oni_total_conta}$', '#C1000C', 18);
        if (node.key === 'pdk_oni_total_valor')
            node.value = orbitron('${pdk_oni_total_conta}$', '#B36CFF', 18);
        if (node.key === 'pdk_oni_atual_valor_display')
            node.value = orbitron('${pdk_oni_total_conta}$', '#B36CFF', 18);
    });
}

function configureOniProgressionFields(template) {
    // O ledger de progressão é estado interno. Não deve reaparecer como painel
    // editável na ficha; o runtime persiste os resultados diretamente nas props.
    for (const name of [
        'pdv_oni_dano_tomado',
        'pdk_oni_gasto_valor',
        'vit_oni_nvl7',
        'fdv_oni_nvl7',
    ]) upsertHidden(template, name, '0');
    removeSlayerOnlyComponents(template);
}

export function migrateOniTemplate(source) {
    const migrated = renameOniKeys(replaceOniResourceNames(structuredClone(source)));
    migrated.name = 'oni_template';
    migrated.type = '_template';
    migrated._id = 'PQR15WSdSqBcN15w';
    migrated.prototypeToken = { ...(migrated.prototypeToken ?? {}), name: 'oni_template' };
    if (migrated.flags?.['custom-system-builder']) {
        delete migrated.flags['custom-system-builder'].templateHistory;
        delete migrated.flags['custom-system-builder'].templateHistoryRedo;
    }

    removeInvalidHiddenPlaceholders(migrated);
    removeCircularFormulas(migrated);
    removeSlayerOnlyComponents(migrated);
    configureOniActionButtons(migrated);

    configureOniLevelAndRank(migrated);
    configureOniOrigins(migrated);
    configureOniAttributes(migrated);
    configureOniProgression(migrated);
    configureOniBarsAndLabels(migrated);
    configureOniProgressionFields(migrated);

    // Remove aliases legados que não pertencem ao contrato Oni.
    const hidden = migrated.system?.hidden;
    if (Array.isArray(hidden)) {
        migrated.system.hidden = hidden.filter(
            (h) => h.name !== 'origem_oni_pdr_val' && !String(h.name ?? '').includes('slayer')
        );
    }

    if (JSON.stringify(migrated).includes('pdr_oni'))
        throw new Error('Migração ONI deixou referências pdr_oni.');
    return migrated;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const sourcePath = path.resolve(process.argv[2] ?? defaultSource);
    const targetPath = path.resolve(process.argv[3] ?? defaultTarget);
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    fs.writeFileSync(
        targetPath,
        `${JSON.stringify(migrateOniTemplate(source), null, 2)}\n`,
        'utf8'
    );
    console.log(`Export de Actor ONI: ${targetPath}`);
}
