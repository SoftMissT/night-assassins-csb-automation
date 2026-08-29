import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function unwrapSlayerTemplate(document) {
    if (document?.isCustomSystemExport === true) {
        const actor = document.actors?.[0];
        if (!actor?.data) throw new Error('Pacote CSB sem template Slayer em actors[0].');
        return { _id: actor.id, name: actor.name, type: actor.type, system: actor.data, flags: actor.flags ?? {} };
    }
    return document;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(repoRoot, 'src', 'templates', 'actors', 'slayer-template.json');
const csbPackagePath = path.join(repoRoot, 'src', 'imports', 'csb-import-slayer-template.json');
const officialTemplatePath = path.resolve(
    repoRoot,
    '..',
    'MACRO-NA-FOUNDRY',
    'TEMPLATE_SLAYER_ATUALIZADO.json'
);

function officialWithoutProvisionalButton() {
    const document = JSON.parse(fs.readFileSync(officialTemplatePath, 'utf8'));
    function prune(node) {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) {
            return node
                .filter((entry) => !String(entry?.rollMessage ?? '').includes('NAAttrLevel00001'))
                .map(prune);
        }
        for (const [key, value] of Object.entries(node)) node[key] = prune(value);
        return node;
    }
    return prune(document);
}

test('template Slayer reproduz integralmente o export atualizado, exceto botão provisório', () => {
    const actual = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    assert.doesNotMatch(JSON.stringify(actual), /NAAttrLevel00001/);
    if (fs.existsSync(officialTemplatePath)) {
        const expected = officialWithoutProvisionalButton();
        expected._id = 'NASlayerTpl00001';
        assert.deepEqual(actual, expected);
    }
});

test('template Slayer é um documento de ator válido com type _template', () => {
    const document = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    assert.equal(document.type, '_template');
    assert.equal(document.prototypeToken?.name, 'slayer_template');
    assert.match(document.prototypeToken?.texture?.src, /na-slayer-template_icon\.webp$/);
});

test('template Slayer tem sistema com body, display, header, hidden, attributeBar', () => {
    const document = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    assert.ok(document.system.body, 'system.body não encontrado');
    assert.ok(document.system.header, 'system.header não encontrado');
    assert.ok(document.system.hidden, 'system.hidden não encontrado');
    assert.ok(document.system.attributeBar, 'system.attributeBar não encontrado');
});

test('template Slayer possui os 7 atributos e snapshots 1 e 3', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const source = JSON.stringify(template);
    for (const attribute of ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab']) {
        assert.match(source, new RegExp(`"${attribute}_nvl1"`));
        assert.match(source, new RegExp(`"${attribute}_nvl3"`));
    }
});

test('template Slayer não expõe o botão de snapshot Atributos', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const source = JSON.stringify(template.system.body);
    assert.doesNotMatch(source, /NAAttrLevel00001/);
    assert.match(source, /atr_vit_valor/);
});

test('template Slayer tem attributeBar com barras de PDV e PDR namespaced', () => {
    const document = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    assert.equal(document.system.attributeBar.pdv_slayer_barra?.value, '${pdv_slayer_atual_num}$');
    assert.equal(document.system.attributeBar.pdv_slayer_barra?.max, '${pdv_slayer_maximo_num}$');
    assert.equal(document.system.attributeBar.pdr_slayer_barra?.value, '${pdr_slayer_atual_num}$');
    assert.equal(document.system.attributeBar.pdr_slayer_barra?.max, '${pdr_slayer_maximo_num}$');
});

test('template Slayer oficial tem hidden com deslocamento e fôlego calculados', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const hidden = new Map(template.system.hidden.map((entry) => [entry.name, entry.value]));
    assert.ok(hidden.has('deslocamento_slayer'), 'deslocamento_slayer não encontrado');
    assert.ok(hidden.has('folego_slayer_maximo'), 'folego_slayer_maximo não encontrado');
});

test('template Slayer preserva as abas oficiais Combate e Config/Dados', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    let tabbedPanel = null;
    function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (!tabbedPanel && node.type === 'tabbedPanel') tabbedPanel = node;
        Object.values(node).forEach(walk);
    }
    walk(template.system.body);
    assert.ok(tabbedPanel, 'tabbedPanel não encontrado');
    const tabKeys = tabbedPanel.contents.map((entry) => entry.key);
    assert.ok(tabKeys.includes('combat_slayer_tab'), 'Aba Combate não encontrada');
    assert.ok(tabKeys.includes('configs_tab'), 'Aba Config/Dados não encontrada');
});

test('template Slayer preserva o dropdown que escolhe DEX ou FOR para Acerto', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    let acerto = null;
    function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (node.key === 'acerto_label') acerto = node;
        Object.values(node).forEach(walk);
    }
    walk(template.system);

    assert.ok(acerto, 'Dropdown acerto_label não encontrado');
    assert.equal(acerto.type, 'select');
    assert.equal(acerto.label, 'Escolha como Acerta');
    assert.equal(acerto.defaultValue, 'acerto_label_escolha');
    assert.deepEqual(
        acerto.options.map(({ key, value }) => ({ key, value })),
        [
            { key: 'acerto_label_escolha', value: 'Escolha' },
            { key: 'acerto_label_dex', value: 'DEX' },
            { key: 'acerto_label_for', value: 'FOR' },
        ]
    );
});

test('template Slayer tem itens oficiais de perfil no header', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const headerKeys = [];
    function findKeys(node) {
        if (!node || typeof node !== 'object') return;
        if (node.key) headerKeys.push(node.key);
        Object.values(node).forEach(findKeys);
    }
    findKeys(template.system.header);
    assert.ok(headerKeys.includes('nvl_pj'), 'nvl_pj não encontrado no header');
    assert.ok(headerKeys.includes('idade'), 'idade não encontrada no header');
    assert.ok(headerKeys.includes('origem_dropdown'), 'origem_dropdown não encontrado no header');
    assert.ok(
        headerKeys.includes('resp_slayer_display'),
        'resp_slayer_display não encontrado no header'
    );
});

test('template Slayer tem pelo menos 35 botões com macros estáveis', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const buttons = [];
    function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'label' && node.rollMessage) buttons.push(node);
        Object.values(node).forEach(walk);
    }
    walk(template.system);
    assert.ok(buttons.length >= 35, `Esperados ao menos 35 botões; encontrados ${buttons.length}.`);
    for (const button of buttons) {
        assert.doesNotMatch(button.rollMessage, /return await/);
        assert.match(button.rollMessage, /return '';}%$/);
        assert.match(button.rollMessage, /actorUuid:entity\.uuid/);
        assert.match(
            button.rollMessage,
            /fromUuid\('Compendium\.night-assassins-csb-automation\.|api\?\./
        );
    }
});

test('template Slayer não expõe RESETAR FICHA nem chama resetSheet', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const serialized = JSON.stringify(template.system);
    assert.doesNotMatch(serialized, /na_slayer_reset_ficha|RESETAR FICHA|resetSheet/);
});

test('template Slayer tem itemContainer para armas e Formas', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const containers = new Map();
    function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'itemContainer') containers.set(node.key, node);
        Object.values(node).forEach(walk);
    }
    walk(template.system.body);
    assert.ok(containers.has('inventario_slayer_armas'), 'inventario_slayer_armas não encontrado');
    assert.ok(
        containers.has('skills_slayer_respiracoes'),
        'skills_slayer_respiracoes não encontrado'
    );
    assert.deepEqual(containers.get('inventario_slayer_armas').templateFilter, [
        'NAWeaponTpl00001',
    ]);
    assert.equal(containers.get('inventario_slayer_armas').itemFilterFormula, '');
    assert.deepEqual(containers.get('skills_slayer_respiracoes').templateFilter, [
        'NABreathTpl00001',
    ]);
    assert.equal(containers.get('skills_slayer_respiracoes').itemFilterFormula, '');
});

test('pacote CSB import segue o contrato de importação', () => {
    const document = JSON.parse(fs.readFileSync(csbPackagePath, 'utf8'));
    assert.equal(document.isCustomSystemExport, true);
    assert.equal(document.actors.length, 1);
    assert.equal(document.actors[0].id, 'NASlayerTpl00001');
    assert.deepEqual(document.items, []);
});

test('pacote CSB import contém template Slayer válido', () => {
    const document = JSON.parse(fs.readFileSync(csbPackagePath, 'utf8'));
    const actor = document.actors[0];
    assert.equal(actor.type, '_template');
    assert.ok(actor.data, 'actor.data não encontrado (formato CSB inválido)');
    assert.ok(actor.data.body, 'actor.data.body não encontrado');
    assert.ok(actor.data.header, 'actor.data.header não encontrado');
    assert.ok(actor.data.hidden, 'actor.data.hidden não encontrado');
    assert.ok(actor.data.attributeBar, 'actor.data.attributeBar não encontrado');
});

test('template Slayer preserva os 39 itens hidden oficiais', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    assert.equal(template.system.hidden.length, 39);
});

test('template Slayer tem hidden com atributos display', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const hiddenNames = template.system.hidden.map((e) => e.name);
    for (const attr of [
        'vit_display',
        'dex_display',
        'for_display',
        'car_display',
        'fdv_display',
        'int_display',
        'sab_display',
    ]) {
        assert.ok(hiddenNames.includes(attr), `${attr} não encontrado em hidden`);
    }
});

test('template Slayer tem hidden oficiais com PDV/PDR calculados', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const hiddenNames = template.system.hidden.map((e) => e.name);
    assert.ok(
        hiddenNames.includes('pdv_slayer_total_conta'),
        'pdv_slayer_total_conta não encontrado'
    );
    assert.ok(hiddenNames.includes('pdv_slayer_atual'), 'pdv_slayer_atual não encontrado');
    assert.ok(
        hiddenNames.includes('pdr_slayer_total_conta'),
        'pdr_slayer_total_conta não encontrado'
    );
    assert.ok(hiddenNames.includes('pdr_slayer_atual'), 'pdr_slayer_atual não encontrado');
});

test('template Slayer tem hidden com rank e nível', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const hiddenNames = template.system.hidden.map((e) => e.name);
    assert.ok(hiddenNames.includes('rank_atual'), 'rank_atual não encontrado');
    assert.ok(hiddenNames.includes('nvl_num'), 'nvl_num não encontrado');
    assert.ok(hiddenNames.includes('nvl_respiracao_num'), 'nvl_respiracao_num não encontrado');
});

test('template Slayer tem hidden com bônus de origem', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const hiddenNames = template.system.hidden.map((e) => e.name);
    assert.ok(
        hiddenNames.includes('origem_slayer_pdv_val'),
        'origem_slayer_pdv_val não encontrado'
    );
    assert.ok(
        hiddenNames.includes('origem_slayer_pdr_val'),
        'origem_slayer_pdr_val não encontrado'
    );
});

test('template Slayer tem hidden com bônus de metal', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const hiddenNames = template.system.hidden.map((e) => e.name);
    assert.ok(hiddenNames.includes('metal_acerto_bonus'), 'metal_acerto_bonus não encontrado');
    assert.ok(hiddenNames.includes('metal_esquiva_bonus'), 'metal_esquiva_bonus não encontrado');
    assert.ok(hiddenNames.includes('metal_dano_bonus'), 'metal_dano_bonus não encontrado');
    assert.ok(hiddenNames.includes('metal_bloqueio_bonus'), 'metal_bloqueio_bonus não encontrado');
});

test('template Slayer declara as keys persistentes oficiais de Marca', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const componentKeys = new Set();
    function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (typeof node.type === 'string' && typeof node.key === 'string' && node.key)
            componentKeys.add(node.key);
        Object.values(node).forEach(walk);
    }
    walk(template.system);
    for (const key of ['marca_dano_dados', 'marca_dano_faces', 'marca_dano_necrotico_dados'])
        assert.ok(componentKeys.has(key), `${key} deve existir como componente persistente`);
});

test('template Slayer tem hidden com bônus de habilidade', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    const hiddenNames = template.system.hidden.map((e) => e.name);
    assert.ok(
        hiddenNames.includes('hab_slayer_pdr_por_nivel'),
        'hab_slayer_pdr_por_nivel não encontrado'
    );
    assert.ok(hiddenNames.includes('hab_acerto_bonus'), 'hab_acerto_bonus não encontrado');
    assert.ok(hiddenNames.includes('hab_bloqueio_bonus'), 'hab_bloqueio_bonus não encontrado');
    assert.ok(hiddenNames.includes('hab_esquiva_bonus'), 'hab_esquiva_bonus não encontrado');
});

test('template Slayer tem body com contents', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    assert.ok(Array.isArray(template.system.body.contents), 'body.contents não é array');
    assert.ok(template.system.body.contents.length > 0, 'body.contents está vazio');
});

test('template Slayer tem header com contents', () => {
    const template = unwrapSlayerTemplate(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
    assert.ok(Array.isArray(template.system.header.contents), 'header.contents não é array');
    assert.ok(template.system.header.contents.length > 0, 'header.contents está vazio');
});
