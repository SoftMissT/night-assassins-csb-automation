import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * O redesenho dos templates de Item só pode mexer em ordem, agrupamento e texto.
 * Item do mundo guarda `props` por `key`, e a pele (CSS) mira a `key` de cada
 * painel. Remover ou renomear uma chave apaga dado ou desliga a pele em silêncio.
 * `tests/fixtures/item-template-keys.json` é o conjunto de chaves antes do
 * redesenho: pode crescer (painel novo), nunca encolher.
 */
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const baseline = read('./fixtures/item-template-keys.json');

function systemOf(file) {
    const template = read(`../src/templates/items/${file}`);
    if (!file.startsWith('breathing'))
        return template.system;
    const form = template.items.find(
        (item) => item.type === '_equippableItemTemplate' && item.id === 'NABreathTpl00001'
    );
    assert.ok(form, 'template de Forma NABreathTpl00001 ausente');
    return form.data;
}

function collectKeys(node, out = new Set()) {
    if (Array.isArray(node)) node.forEach((child) => collectKeys(child, out));
    else if (node && typeof node === 'object') {
        if (typeof node.key === 'string') out.add(node.key);
        Object.values(node).forEach((child) => collectKeys(child, out));
    }
    return out;
}

function findByKey(node, key) {
    if (Array.isArray(node)) {
        for (const child of node) {
            const hit = findByKey(child, key);
            if (hit) return hit;
        }
    } else if (node && typeof node === 'object') {
        if (node.key === key) return node;
        for (const child of Object.values(node)) {
            const hit = findByKey(child, key);
            if (hit) return hit;
        }
    }
    return null;
}

function collectTitles(node, out = []) {
    if (Array.isArray(node)) node.forEach((child) => collectTitles(child, out));
    else if (node && typeof node === 'object') {
        if (typeof node.title === 'string' && node.title) out.push(node.title);
        Object.values(node).forEach((child) => collectTitles(child, out));
    }
    return out;
}

describe('templates de Item: chaves preservadas', () => {
    for (const [file, expected] of Object.entries(baseline))
        it(`${file} mantém todas as chaves`, () => {
            const current = collectKeys(systemOf(file));
            const missing = expected.filter((key) => !current.has(key));
            assert.deepEqual(missing, []);
        });
});

describe('templates de Item: redesenho', () => {
    it('nenhum título de painel está em caixa-alta', () => {
        for (const file of Object.keys(baseline)) {
            const shouting = collectTitles(systemOf(file)).filter(
                (title) => /\p{L}{4}/u.test(title) && title === title.toUpperCase()
            );
            assert.deepEqual(shouting, [], file);
        }
    });

    it('Kekkijutsu abre com o dano, que o jogador consulta no combate', () => {
        const order = systemOf('kekkijutsu-item-template.json').body.contents.map((c) => c.key);
        assert.equal(order[0], 'kekki_dano_panel');
        assert.ok(order.indexOf('kekki_dano_panel') < order.indexOf('kekki_custo_panel'));
        assert.equal(order.at(-1), 'kekki_usar_botao');
    });

    it('Forma esconde custo, dano e status do nível desligado, mas nunca a caixa nem o efeito', () => {
        const system = systemOf('breathing-form-template.json');
        for (let level = 1; level <= 4; level++) {
            for (const field of ['custo', 'dano', 'status'])
                assert.equal(
                    findByKey(system, `nvl${level}_${field}`).visibilityFormula,
                    `tem_nvl${level} == 1`
                );
            // A caixa vive dentro do painel do nível: escondê-la trancaria o nível desligado.
            assert.equal(findByKey(system, `tem_nvl${level}`).visibilityFormula, '');
            assert.equal(findByKey(system, `nvl${level}_efeito`).visibilityFormula, '');
            assert.equal(findByKey(system, `nvl${level}_panel`).visibilityFormula ?? '', '');
        }
    });

    it('Dupla Alma: ações de um botão não recolhem (viram fileira) e o Despertar segue só da Yamato', () => {
        const system = systemOf('special-slayer-weapon-template.json');
        for (const key of [
            'dupla_alma_cerimonia_ui',
            'dupla_alma_resistencia_ui',
            'dupla_alma_consequencia_ui',
            'arma_especial_despertar_ui',
            'arma_especial_habilidades_ui',
        ])
            assert.equal(findByKey(system, key).collapsible, false, key);
        for (const key of ['arma_especial_dupla_alma', 'arma_especial_estado', 'arma_especial_regras'])
            assert.equal(findByKey(system, key).collapsible, true, key);
        assert.equal(
            findByKey(system, 'arma_especial_despertar_ui').visibilityFormula,
            'equalText(arma_nome, "Yamato The Rift-Walker\'s Legacy")'
        );
    });

    it('slayer-weapon-template.json: nome no cabeçalho e campos longos com largura integral', () => {
        const system = systemOf('slayer-weapon-template.json');
        assert.deepEqual(system.header.contents.map((component) => component.key), ['arma_nome']);
        const details = system.body.contents[0];
        assert.equal(details.key, 'arma_ficha_dados');
        assert.equal(details.flow, 'grid-2');
        assert.deepEqual(
            details.contents.map((c) => [c.key, c.colSpan]),
            [
                ['arma_critico', 1],
                ['arma_tipo', 1],
                ['arma_alcance', 2],
                ['arma_propriedades', 2],
                ['arma_categoria', 1],
                ['arma_modo_uso', 1],
                ['arma_requisito', 2],
            ]
        );
        assert.ok(details.contents.every((component) =>
            component.cssClass === 'flexcol' && component.size === 'full-size'
        ));
        const context = JSON.stringify(findByKey(system, 'arma_contexto'));
        assert.match(context, /\$\{arma_perfis_resumo\}\$/);
        assert.match(context, /\$\{arma_tipos_dano_resumo\}\$/);
        assert.ok(!/for_display|dex_display/.test(context), 'sem FOR/DEX do portador na ficha do item');
        const runtime = findByKey(system, 'arma_runtime_data');
        assert.equal(runtime.visibilityFormula, 'false');
        for (const key of ['arma_perfis_resumo', 'arma_tipos_dano_resumo'])
            assert.ok(findByKey(runtime, key), `${key} guardado fora da vista`);
    });

    for (const file of ['special-slayer-weapon-template.json'])
        it(`${file}: cabeçalho em 4 colunas com nome, faixa de combate e detalhes`, () => {
            const system = systemOf(file);
            const header = system.header.contents.find((panel) =>
                panel.contents?.some((c) => c.key === 'arma_nome')
            );
            assert.equal(header.flow, 'grid-4');
            assert.deepEqual(
                header.contents.map((c) => c.key),
                [
                    'arma_nome',
                    'arma_perfis_resumo',
                    'arma_critico',
                    'arma_alcance',
                    'arma_tipos_dano_resumo',
                    'arma_tipo',
                    'arma_categoria',
                    'arma_modo_uso',
                    'arma_propriedades',
                    'arma_requisito',
                ]
            );
            const span = Object.fromEntries(header.contents.map((c) => [c.key, c.colSpan ?? 1]));
            // Cada linha soma 4 colunas: 4 | 2+1+1 | 1+1+1+1 | 2+2.
            assert.deepEqual(
                [span.arma_nome, span.arma_perfis_resumo, span.arma_propriedades, span.arma_requisito],
                [4, 2, 2, 2]
            );
        });

    it('Item Genérico: nome/categoria/uso no cabeçalho e inventário com efeito', () => {
        const system = systemOf('generic-item-template.json');
        assert.deepEqual(
            system.header.contents.map((component) => component.key),
            ['item_nome', 'item_categoria', 'item_uso']
        );
        assert.deepEqual(
            system.body.contents.map((component) => component.key),
            ['item_inventario_panel', 'item_efeito_panel', 'item_descricao_panel']
        );
        assert.deepEqual(system.hidden, [{ name: 'inventario_categoria', value: 'item' }]);
        assert.equal(system.uniqueId, 'NAGenericItem001');
        assert.deepEqual(
            findByKey(system, 'item_categoria').options.map((option) => option.key),
            ['consumivel', 'armadura', 'veneno', 'talisma', 'ferramenta', 'outro']
        );
        assert.equal(findByKey(system, 'item_quantidade').defaultValue, 1);
        assert.equal(findByKey(system, 'item_efeito').type, 'textArea');
    });

    it('Kekkijutsu: cabeçalho em 4 colunas e Potenciação recolhida', () => {
        const system = systemOf('kekkijutsu-item-template.json');
        assert.equal(system.header.flow, 'grid-4');
        assert.deepEqual(
            system.header.contents.map((c) => c.key),
            ['kekki_nome', 'kekki_rank', 'kekki_acao', 'kekki_origem', 'kekki_nivel_desbloqueio', 'kekki_id']
        );
        assert.equal(system.header.contents[0].colSpan, 4);
        const potenciacao = findByKey(system, 'kekki_potenciacao_panel');
        assert.equal(potenciacao.collapsible, true);
        assert.equal(potenciacao.defaultCollapsed, true);
    });
});
