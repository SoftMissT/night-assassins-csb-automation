import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

/**
 * Contrato dos campos estruturados das Respirações Vento, Água, Chamas, Raposa, Eclipse, Som e
 * Sonhos contra a referência V25.1 e as revisões do operador em `data/breathing-truth-pdf-v251.json`.
 * Antes desta correção
 * o catálogo repetia o custo do nível 1 nos quatro níveis, deixava `tipo_manobra` como
 * "Não informada" e não bloqueava os níveis indisponíveis, então a ficha cobrava PDR errado.
 */

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const truth = await read('../data/breathing-truth-pdf-v251.json');
const catalog = await read('../catalogs/breathing.json');
const items = (catalog.documents ?? catalog).filter((doc) => doc.system?.props?.forma_id);

const norm = (value) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, ' ')
        .trim();

// Para estas quatro o runtime lê tipo_manobra direto do catálogo; nas outras três os dados em
// scripts/*-breathing-data.mjs já definem a ação.
const TIPO_FROM_CATALOG = new Set(['Som', 'Sonhos', 'Raposa', 'Eclipse']);

function catalogFor(breath, form) {
    return items.find(
        (doc) =>
            doc.system.props.respiracao_nome === breath &&
            (norm(doc.system.props.nome_forma) === norm(form.name) ||
                norm(doc.system.props.nome_forma).includes(norm(form.name)) ||
                norm(form.name).includes(norm(doc.system.props.nome_forma)))
    )?.system.props;
}

describe('Respirações do PDF V25.1: dados estruturados do catálogo', () => {
    it('a fixture cobre as 7 Respirações e 58 formas', () => {
        assert.deepEqual(Object.keys(truth.respiracoes).sort(), ['Chamas', 'Eclipse', 'Raposa', 'Som', 'Sonhos', 'Vento', 'Água'].sort());
        assert.equal(Object.values(truth.respiracoes).reduce((sum, forms) => sum + forms.length, 0), 58);
    });

    for (const [breath, forms] of Object.entries(truth.respiracoes)) {
        describe(breath, () => {
            for (const form of forms) {
                it(`${form.ord}. ${form.name}: custo por nível e níveis bloqueados`, () => {
                    const props = catalogFor(breath, form);
                    assert.ok(props, `forma "${form.name}" ausente do catálogo`);
                    form.costs.forEach((expected, index) => {
                        if (expected === null) return;
                        const level = index + 1;
                        if (expected === 'X') {
                            assert.equal(Number(props[`tem_nvl${level}`]), 0, `nível ${level} deveria estar bloqueado`);
                        } else {
                            assert.equal(Number(props[`tem_nvl${level}`]), 1, `nível ${level} deveria estar liberado`);
                            assert.equal(Number(props[`nvl${level}_custo`]), expected, `custo do nível ${level}`);
                        }
                    });
                });

                if (TIPO_FROM_CATALOG.has(breath)) {
                    it(`${form.ord}. ${form.name}: tipo de manobra "${form.tipo}"`, () => {
                        assert.equal(catalogFor(breath, form).tipo_manobra, form.tipo);
                    });
                }
            }
        });
    }

    it('nivel_req é o primeiro nível liberado de cada forma com bloqueio', () => {
        for (const [breath, forms] of Object.entries(truth.respiracoes)) {
            for (const form of forms) {
                const first = form.costs.findIndex((cost) => cost !== 'X' && cost !== null);
                if (!form.costs.includes('X') || first < 0) continue;
                assert.equal(Number(catalogFor(breath, form).nivel_req), first + 1, `${breath} ${form.name}`);
            }
        }
    });
});
