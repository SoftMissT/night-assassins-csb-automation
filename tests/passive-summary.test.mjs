import test from 'node:test';
import assert from 'node:assert/strict';

function flattenObject(object, prefix = '', out = {}) {
    for (const [key, value] of Object.entries(object ?? {})) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) flattenObject(value, path, out);
        else out[path] = value;
    }
    return out;
}

function setProperty(object, path, value) {
    const parts = path.split('.');
    let node = object;
    for (const part of parts.slice(0, -1)) node = node[part] ??= {};
    node[parts.at(-1)] = value;
}

globalThis.foundry = { utils: { flattenObject, setProperty } };

const {
    buildPassiveSummary,
    injectPassiveSummary,
    EMPTY_PASSIVE_SUMMARY,
    PASSIVE_SUMMARY_KEY,
} = await import('../scripts/passive-summary-service.mjs');
const MODULE_ID = 'night-assassins-csb-automation';

test('sem acúmulo nenhum mostra o texto vazio', () => {
    assert.equal(buildPassiveSummary({}), EMPTY_PASSIVE_SUMMARY);
});

test('resume Fogo Fátuo, Cicatrizes, Corrente, BPM, Véus e Forja em texto puro', () => {
    const summary = buildPassiveSummary({
        resp_chamas_estado: JSON.stringify({ weaponHeat: 12 }),
        resp_chamas_resumo: 'Fogo Fátuo 12/60 · Katana · Acerto +2 · Dano +0',
        resp_vento_cicatrizes: 3,
        resp_vento_estado: JSON.stringify({ battleDamage: { cortante: 20, perfurante: 5, sangramento: 40 } }),
        resp_vento_corrente_estado: JSON.stringify({ current: 4, mode: 'uncontrolled' }),
        resp_som_partitura: JSON.stringify({ bpm: 80 }),
        resp_raposa_passiva: JSON.stringify({ veils: 6 }),
        resp_metal_forja_passiva: JSON.stringify({ temperature: 2 }),
    });
    assert.equal(
        summary,
        'Fogo Fátuo 12/60 · Katana · Acerto +2 · Dano +0 · Cicatrizes 3 · Dano para Cicatrizes 25 · ' +
            'Corrente do Vendaval 4 (Descontrolado) · BPM 80/200 · Véus 6/9 · Temperatura da Forja 2'
    );
    assert.ok(!summary.includes('<'), 'resumo não pode carregar HTML');
});

test('Brasas recebidas usam o maior patamar e marcam Queimando a partir de 5', () => {
    assert.equal(buildPassiveSummary({}, { a: { heat: 3 } }), 'Brasas Ardentes 3');
    assert.equal(
        buildPassiveSummary({}, { a: { heat: 7 }, b: { heat: 2 } }),
        'Brasas Ardentes 7 de 2 fontes (Queimando)'
    );
});

test('preUpdateActor injeta o resumo na mesma gravação do acúmulo', () => {
    const actor = { system: { props: { [PASSIVE_SUMMARY_KEY]: EMPTY_PASSIVE_SUMMARY } }, getFlag: () => ({}) };
    const changes = { system: { props: { resp_raposa_passiva: JSON.stringify({ veils: 2 }) } } };
    injectPassiveSummary(actor, changes);
    assert.equal(changes.system.props[PASSIVE_SUMMARY_KEY], 'Véus 2/9');
});

test('preUpdateActor ignora gravações que não mexem em acúmulo', () => {
    const actor = { system: { props: {} }, getFlag: () => ({}) };
    const changes = { system: { props: { pdv_slayer_dano_tomado: 4 } } };
    injectPassiveSummary(actor, changes);
    assert.equal(changes.system.props[PASSIVE_SUMMARY_KEY], undefined);
});

test('preUpdateActor recalcula quando as Brasas do alvo mudam ou são limpas', () => {
    const actor = {
        system: { props: { [PASSIVE_SUMMARY_KEY]: 'Brasas Ardentes 3' } },
        getFlag: () => ({ a: { heat: 3 } }),
    };
    const added = { flags: { [MODULE_ID]: { flameHeat: { a: { heat: 6 } } } } };
    injectPassiveSummary(actor, added);
    assert.equal(added.system.props[PASSIVE_SUMMARY_KEY], 'Brasas Ardentes 6 (Queimando)');

    const cleared = { flags: { [MODULE_ID]: { '-=flameHeat': null } } };
    injectPassiveSummary(actor, cleared);
    assert.equal(cleared.system.props[PASSIVE_SUMMARY_KEY], EMPTY_PASSIVE_SUMMARY);
});

import { readFile } from 'node:fs/promises';

function findByKey(node, key) {
    if (!node || typeof node !== 'object') return null;
    if (node.key === key && node.type) return node;
    for (const child of Object.values(node)) {
        const hit = findByKey(child, key);
        if (hit) return hit;
    }
    return null;
}

for (const [file, displayKey] of [['slayer', 'resp_chamas_display'], ['npc', 'npc_acumulos_display']]) {
    test(`${file}: ficha mostra o resumo de acúmulos e guarda o campo oculto`, async () => {
        const template = JSON.parse(
            await readFile(new URL(`../src/templates/actors/${file}-template.json`, import.meta.url), 'utf8')
        );
        const display = findByKey(template, displayKey);
        assert.ok(display, `${displayKey} ausente`);
        assert.equal(display.role, 0, 'jogador vê os acúmulos');
        assert.match(display.value, /ref\('resp_acumulos_resumo', 'Nenhum acúmulo ativo'\)/);
        const hidden = findByKey(template, PASSIVE_SUMMARY_KEY);
        assert.equal(hidden?.type, 'textField');
        assert.equal(hidden.role, 4, 'campo de armazenamento só para GM');
    });
}

test('mostra os contadores da Respiração do personagem mesmo zerados (Vento com 6 Cicatrizes)', async () => {
    const { breathingFamilies } = await import('../scripts/passive-summary-service.mjs');
    const families = breathingFamilies([
        { name: 'Vento: 1º Estilo Redemoinho Poeirento', system: { props: { inventario_categoria: 'respiracao' } } },
        { name: 'Katana', system: { props: { inventario_categoria: 'arma' } } },
    ]);
    assert.deepEqual([...families], ['vento']);
    assert.equal(
        buildPassiveSummary({ resp_vento_cicatrizes: 6 }, {}, families),
        'Cicatrizes 6 · Corrente do Vendaval 0 (Controlado)'
    );
    assert.equal(buildPassiveSummary({}, {}, new Set(['som', 'raposa'])), 'BPM 0/200 · Véus 0/9');
});

test('Respirações em Vanilla: só os acúmulos do livro base (sem BPM, Véus, Corrente e Forja)', () => {
    const props = {
        resp_vento_cicatrizes: 6,
        resp_som_partitura: JSON.stringify({ bpm: 80 }),
        resp_raposa_passiva: JSON.stringify({ veils: 6 }),
        resp_metal_forja_passiva: JSON.stringify({ temperature: 2 }),
    };
    const families = new Set(['vento', 'som', 'raposa', 'metal', 'chamas']);
    assert.equal(buildPassiveSummary(props, {}, families, { homebrew: false }), 'Fogo Fátuo 0/60 · Cicatrizes 6');
});
