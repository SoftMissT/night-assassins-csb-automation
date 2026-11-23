import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { npcResourceMaximums, resolveSlayerDerivedBonuses } from '../scripts/derived-bonus-service.mjs';
import { resolveSheetAttribute } from '../scripts/sheet-attributes.mjs';
import { applyInitialMark, upgradeMarkAtLevelSix } from '../scripts/ability-service.mjs';
import { SETTINGS } from '../scripts/settings.mjs';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import vanillaRules from '../catalogs/rules-vanilla.json' with { type: 'json' };

const npc = JSON.parse(fs.readFileSync(new URL('../src/templates/actors/npc-template.json', import.meta.url)));
const slayer = JSON.parse(fs.readFileSync(new URL('../src/templates/actors/slayer-template.json', import.meta.url)));
function fields(root) {
    const result = new Map();
    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.key && node.type) result.set(node.key, node);
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') visit(value);
        }
    };
    visit(root);
    return result;
}

test('NPC oferece Origem, Habilidade Especial e Metal lado a lado no cabeçalho', () => {
    const header = fields(npc.system.header);
    const combat = fields(npc.system.body.contents[0].contents[0]);
    const source = fields(slayer.system);
    const choices = header.get('npc_escolhas_habilidade_metal');
    assert.equal(choices?.flow, 'grid-3');
    // Escolhas do personagem direto na ficha: Homebrew e Vanilla, cada uma visível na variante ativa.
    assert.deepEqual(choices.contents.map((field) => field.key),
        ['origem_dropdown', 'na_vanilla_origin', 'hab_escolhida', 'na_vanilla_ability', 'metal_escolhido', 'na_vanilla_metal', 'na_vanilla_class']);
    for (const [key, visibility] of [
        ['origem_dropdown', "not ref('na_regras_origens', 0)"],
        ['hab_escolhida', "not ref('na_regras_habilidades', 0)"],
        ['metal_escolhido', "not ref('na_regras_metal', 0)"],
    ]) {
        assert.equal(combat.has(key), false);
        assert.deepEqual(header.get(key).options, source.get(key).options);
        assert.equal(header.get(key).label, source.get(key).label);
        assert.equal(header.get(key).defaultValue, source.get(key).defaultValue);
        assert.equal(header.get(key).visibilityFormula, visibility);
        assert.equal(header.get(key).role, 0);
    }
});

test('NPC exibe Habilidade Especial e Origem em blocos próprios, fora de Combate', () => {
    const tabs = npc.system.body.contents[0].contents;
    const combat = fields(tabs.find(tab => tab.key === 'npc_ficha_tab'));
    const abilities = fields(tabs.find(tab => tab.key === 'npc_habilidades_tab'));
    assert.equal(combat.has('npc_habilidades_metal'), false);
    assert.equal(combat.has('npc_origens_homebrew'), false);
    const special = abilities.get('npc_habilidades_metal');
    assert.match(special.contents[0].value, /Habilidade Especial/);
    assert.match(special.visibilityFormula, /na_regras_habilidades/);
    const source = fields(slayer.system);
    for (const level of [1, 6, 12]) {
        const descriptions = special.contents.filter((node) => new RegExp('^hab_esp_.+_lvl_' + level + '$').test(node.key));
        assert.equal(descriptions.length, 10);
        for (const node of descriptions) {
            assert.match(node.visibilityFormula, new RegExp('npc_nivel >= ' + level + '\\)$'));
            assert.equal(node.value, source.get(node.key).value);
        }
    }
    const origins = source.get('origem_dropdown').options.slice(1);
    const homebrew = abilities.get('npc_origens_homebrew');
    assert.equal(homebrew.contents.length, 1 + origins.length * 2);
    assert.match(homebrew.visibilityFormula, /not ref\('na_regras_origens', 0\)/);
    for (const { key } of origins) {
        for (const [rank, level] of [[1, 1], [2, 6]]) {
            const originCard = homebrew.contents.find(node => node.key === `${key}_hab_${rank}`);
            assert.equal(originCard.value, source.get(originCard.key).value);
            assert.equal(originCard.visibilityFormula,
                `equalText(ref('origem_dropdown', 'origem_escolha'), '${key}') and ref('npc_nivel', 0) >= ${level}`);
        }
    }
    const vanilla = abilities.get('npc_origens_vanilla');
    assert.match(vanilla.visibilityFormula, /ref\('na_regras_origens', 0\)/);
    assert.equal(vanilla.contents.length, 1 + Object.keys(vanillaRules.slayerOrigin).length);
    for (const [key, { label, effect }] of Object.entries(vanillaRules.slayerOrigin)) {
        const ruleCard = vanilla.contents.find(node => node.key === `npc_vanilla_${key}`);
        assert.ok(ruleCard.value.includes(label));
        assert.ok(ruleCard.value.includes(effect));
        assert.equal(ruleCard.visibilityFormula, `equalText(ref('na_vanilla_origin', ''), '${key}')`);
    }
});

test('Tato e Audição evoluem pelo nível do NPC', () => {
    for (const level of [1, 5, 6, 12, 14]) {
        const tato = resolveSlayerDerivedBonuses({ npc_nivel: level, hab_escolhida: 'hab_escolhida_tato' });
        assert.equal(tato.channels.bloqueio.total, level >= 6 ? 3 : 2);
        assert.equal(tato.channels.esquiva.total, level >= 6 ? 2 : 1);
        const hearing = resolveSlayerDerivedBonuses({ npc_nivel: level, hab_escolhida: 'hab_escolhida_audicao' });
        assert.equal(hearing.channels.percepcaoAuditiva.total, level >= 6 ? 3 : 2);
    }
});

test('habilidades acrescentam recursos retroativos sem alterar a base do NPC', () => {
    const base = { npc_pdv_base: 30, npc_pdr_base: 12 };
    for (const [level, life] of [[1, 32], [6, 48], [12, 66], [14, 72]]) {
        assert.deepEqual(npcResourceMaximums({ ...base, npc_nivel: level, hab_escolhida: 'hab_escolhida_tsuyoi' }), { pdvMax: life, pdrMax: 12 });
        assert.equal(npcResourceMaximums({ ...base, npc_nivel: level, hab_escolhida: 'hab_escolhida_marechi' }).pdrMax, 12 + level);
        assert.equal(npcResourceMaximums({ ...base, npc_nivel: level, hab_escolhida: 'hab_escolhida_oketsu' }).pdrMax, 12 + level * 2);
    }
    assert.deepEqual(base, { npc_pdv_base: 30, npc_pdr_base: 12 });
});

test('bônus de NPC combina variante vanilla de Habilidades com Metal Homebrew', () => {
    const previous = globalThis.game;
    try {
        const selection = JSON.stringify({ habilidades: 'vanilla', metal: 'homebrew', origens: 'homebrew' });
        globalThis.game = { settings: { get: (_module, key) => key === SETTINGS.rulesSelection ? selection : undefined } };
        const bonuses = resolveSlayerDerivedBonuses({
            npc_nivel: 5, na_vanilla_ability: 'hab_escolhida_marechi',
            hab_escolhida: 'hab_escolhida_oketsu', metal_escolhido: 'metal_roxa',
        });
        assert.equal(bonuses.channels.pdrMaximo.total, 5);
        assert.deepEqual(bonuses.typedDamage.map(({ label, value }) => [label, value]), [['Metal Roxo', 3]]);
    } finally { globalThis.game = previous; }
});

test('Rosa soma Respiração, bônus fixo e Raposa uma vez no PDR do NPC', () => {
    const props = { npc_nivel: 7, npc_pdr_base: 12, nvl_respiracao: 2, metal_escolhido: 'metal_rosa', npc_bonus_pdr_maximo: 3, resp_slayer_display: 'resp_slayer_raposa' };
    assert.equal(npcResourceMaximums(props).pdrMax, 24);
    assert.equal(npcResourceMaximums({ ...props, resp_slayer_display_2: 'resp_slayer_raposa' }).pdrMax, 24);
    assert.equal(resolveSlayerDerivedBonuses({ metal_escolhido: 'metal_preto' }).channels.bloqueio.total, 4);
    assert.equal(resolveSlayerDerivedBonuses({ metal_escolhido: 'metal_dourada' }).channels.acerto.total, 4);
    assert.equal(resolveSlayerDerivedBonuses({ metal_escolhido: 'metal_roxa' }).typedDamage[0].value, 3);
});

test('o seletor de Metal troca os bônus das oito cores e das sete opções Vanilla sem misturá-los', () => {
    const previousGame = globalThis.game;
    let metal = 'homebrew';
    let origens = 'vanilla';
    globalThis.game = { settings: { get: (_id, key) => key === SETTINGS.rulesSelection
        ? JSON.stringify({ metal, origens, habilidades: 'homebrew' }) : undefined } };
    try {
        const base = { npc_nome: 'NPC', nvl_respiracao: 2 };
        const context = { isTechnique: true, isAttack: true, dealsDamage: true,
            actionType: 'reacao', channel: 'acerto', defenseAgainstAttack: true };
        for (const [name, expected] of [
            ['dourada', { acerto: 4 }], ['preta', { bloqueio: 4 }],
            ['azul', { bloqueio: 3, esquiva: 3 }], ['branca', { percepcaoVisual: 3 }],
            ['vermelha', { danoFixo: 2 }], ['coral', { iniciativa: 4 }],
            ['rosa', { pdrMaximo: 8 }], ['roxa', {}],
        ]) {
            const bonuses = resolveSlayerDerivedBonuses({ ...base, metal_escolhido: `metal_${name}`,
                na_vanilla_metal: 'metal_alvorada' }, context);
            for (const [channel, value] of Object.entries(expected))
                assert.equal(bonuses.channels[channel].total, value, name);
            assert.equal(bonuses.channels.acerto.total, expected.acerto ?? 0, name);
            assert.equal(bonuses.typedDamage.some(entry => entry.label === 'Metal Roxo'), name === 'roxa');
        }
        metal = 'vanilla';
        for (const [name, expected] of [
            ['alvorada', { acerto: 1 }], ['despertar', {}], ['entardecer', { bloqueio: 1 }],
            ['coracao', {}], ['espirito', { acerto: 1 }], ['serenidade', { acerto: 2 }],
            ['preto', { bloqueio: 1, pdrMaximo: 1 }],
        ]) {
            const isCondition = name === 'espirito';
            const bonuses = resolveSlayerDerivedBonuses({ ...base, na_vanilla_metal: `metal_${name}`,
                na_vanilla_origin: 'origem_descendente', metal_escolhido: 'metal_roxa' },
                { ...context, appliesCondition: isCondition, dealsDamage: !isCondition });
            for (const channel of ['acerto', 'bloqueio', 'pdrMaximo'])
                assert.equal(bonuses.channels[channel].total, expected[channel] ?? 0, name);
            assert.equal(bonuses.typedDamage.some(entry => entry.label === 'Metal Roxo'), false, name);
        }
        origens = 'homebrew';
        const vanillaMetal = resolveSlayerDerivedBonuses({ ...base, na_vanilla_metal: 'metal_preto',
            na_vanilla_origin: 'origem_descendente' }, context);
        assert.equal(vanillaMetal.channels.pdrMaximo.total, 1);
        assert.equal(vanillaMetal.channels.bloqueio.total, 1);
    } finally { globalThis.game = previousGame; }
});

test('atributos combinam habilidade, Marca e Respiração sem desconto de SAB de regra antiga', () => {
    const props = { npc_nivel: 7, npc_for_base: 4, npc_sab_base: 5, hab_escolhida: 'hab_escolhida_tsuyoi', for_marca_temp: 2, for_resp_bonus_temp_slayer: 1, resp_metal_for_temp: 2, resp_sonhos_sab_perda: 3 };
    assert.equal(resolveSheetAttribute({ system: { props } }, 'FOR'), 10);
    assert.equal(resolveSheetAttribute({ system: { props } }, 'SAB'), 5);
    assert.equal(resolveSheetAttribute({ system: { props: { ...props, sab_display: '5' } } }, 'SAB'), 5);
});

test('NPC e Slayer mostram as escolhas Vanilla de Metal e Habilidade na ficha', () => {
    for (const [template, prefix, tabKey] of [
        [npc, 'npc', 'npc_habilidades_tab'],
        [slayer, 'slayer', 'habilidades_slayer_tab'],
    ]) {
        const tabs = template.system.body.contents[0].contents;
        const abilities = fields(tabs.find((tab) => tab.key === tabKey));
        for (const [panelKey, slot, rule, catalog, cardPrefix] of [
            [`${prefix}_metais_vanilla`, 'na_vanilla_metal', 'na_regras_metal', vanillaRules.metal, `${prefix}_vanilla_metal_`],
            [`${prefix}_habilidades_vanilla`, 'na_vanilla_ability', 'na_regras_habilidades', vanillaRules.ability, `${prefix}_vanilla_ability_`],
        ]) {
            const panel = abilities.get(panelKey);
            assert.ok(panel, panelKey);
            assert.match(panel.visibilityFormula, new RegExp(`ref\\('${rule}', 0\\)`));
            assert.match(panel.visibilityFormula, new RegExp(`equalText\\(ref\\('${slot}'`));
            assert.equal(panel.contents.length, 1 + Object.keys(catalog).length);
            for (const [key, entry] of Object.entries(catalog)) {
                const card = panel.contents.find((node) => node.key === `${cardPrefix}${key}`);
                assert.ok(card, `${cardPrefix}${key}`);
                assert.ok(card.value.includes(entry.label));
                assert.ok(card.value.includes(entry.effect));
                assert.equal(card.visibilityFormula, `equalText(ref('${slot}', ''), '${key}')`);
            }
        }
    }
    const npcAbilities = fields(
        npc.system.body.contents[0].contents.find((tab) => tab.key === 'npc_habilidades_tab')
    );
    // Sem modal de escolhas na ficha (pedido do operador, 2026-11-22).
    assert.equal(npcAbilities.has('npc_vanilla_choices'), false);
});

test('Marca do Destino evolui sem alterar os atributos base do NPC', async () => {
    setupFoundryMocks();
    foundry.applications.api.DialogV2.wait = async () => 'vit';
    const props = { npc_nome: 'NPC', npc_nivel: 6, npc_vit_base: 4, hab_escolhida: 'hab_escolhida_marca_destino' };
    const actor = { system: { props }, update: async (patch) => {
        for (const [path, value] of Object.entries(patch)) props[path.replace('system.props.', '')] = value;
    } };
    assert.equal(await applyInitialMark(actor), true);
    assert.equal(resolveSheetAttribute(actor, 'VIT'), 6);
    assert.equal(await upgradeMarkAtLevelSix(actor), true);
    assert.equal(resolveSheetAttribute(actor, 'VIT'), 7);
    assert.equal(await upgradeMarkAtLevelSix(actor), false);
    assert.equal(props.npc_vit_base, 4);
    assert.equal(props.vit_nvl1, undefined);
    props.hab_escolhida = 'hab_escolhida_sem';
    assert.equal(resolveSheetAttribute(actor, 'VIT'), 4);
});
