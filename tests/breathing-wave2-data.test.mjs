import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { isMigrated, resolveForm, resolveLevel } from '../scripts/breathing-contract.mjs';

/**
 * Leva 2: Som, Sonhos, Raposa e Eclipse no pipeline canônico. O dado de cada Forma precisa
 * bater com o PDF V25.1 (`data/breathing-truth-pdf-v251.json`) em custo e níveis bloqueados, e
 * cada item do catálogo precisa ter Forma canônica (senão o botão cairia em "Forma desconhecida").
 */

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const truth = await read('../data/breathing-truth-pdf-v251.json');
const catalog = await read('../catalogs/breathing.json');
const items = (catalog.documents ?? catalog).filter((doc) => doc.system?.props?.forma_id);

const WAVE = ['Som', 'Sonhos', 'Raposa', 'Eclipse'];
const norm = (value) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, ' ')
        .trim();

describe('Leva 2: as quatro Respirações estão migradas', () => {
    for (const breath of WAVE) {
        it(`${breath} usa o pipeline canônico`, () => assert.equal(isMigrated(breath), true));
    }
});

for (const breath of WAVE) {
    describe(`${breath}: Formas canônicas × catálogo × PDF`, () => {
        const usable = items.filter(
            (doc) => doc.system.props.respiracao_nome === breath && Number(doc.system.props.tem_nvl1) + Number(doc.system.props.tem_nvl2) + Number(doc.system.props.tem_nvl3) + Number(doc.system.props.tem_nvl4) > 0
        );

        it('toda Forma de uso do catálogo resolve no contrato', () => {
            assert.ok(usable.length > 0);
            for (const doc of usable) {
                const form = resolveForm(breath, doc.system.props.forma_id);
                assert.ok(form, `${doc.system.props.forma_id} ${doc.system.props.nome_forma} sem Forma canônica`);
                assert.ok(Array.isArray(form.niveis) && form.niveis.length === 4);
            }
        });

        for (const doc of usable) {
            const props = doc.system.props;
            const pdf = truth.respiracoes[breath].find((form) => norm(form.name) === norm(props.nome_forma) || norm(props.nome_forma).includes(norm(form.name)));

            it(`${props.forma_id} ${props.nome_forma}: custo e bloqueio por nível batem com o catálogo`, () => {
                const form = resolveForm(breath, props.forma_id);
                for (let level = 1; level <= 4; level += 1) {
                    const resolved = resolveLevel(form, level);
                    const available = Number(props[`tem_nvl${level}`]) === 1;
                    assert.equal(resolved.ok, available, `nível ${level}: disponibilidade`);
                    if (available) assert.equal(resolved.dados.custo, Number(props[`nvl${level}_custo`]), `nível ${level}: custo`);
                }
            });

            if (resolveForm(breath, props.forma_id)?.passiva) {
                it(`${props.forma_id}: passiva, sem custo e marcada como passiva`, () => {
                    const form = resolveForm(breath, props.forma_id);
                    assert.equal(form.passiva, true);
                    for (let level = 1; level <= 4; level += 1) assert.equal(resolveLevel(form, level).dados.custo, 0);
                });
                continue;
            }

            it(`${props.forma_id}: bate com o PDF onde o PDF define o custo`, () => {
                assert.ok(pdf, `forma "${props.nome_forma}" ausente da tabela do PDF`);
                const form = resolveForm(breath, props.forma_id);
                pdf.costs.forEach((expected, index) => {
                    if (expected === null) return;
                    const resolved = resolveLevel(form, index + 1);
                    if (expected === 'X') assert.equal(resolved.ok, false, `nível ${index + 1} deveria estar bloqueado`);
                    else assert.equal(resolved.dados?.custo, expected, `nível ${index + 1}`);
                });
            });
        }

        it('ação e tipo de dano são válidos', () => {
            for (const doc of usable) {
                const form = resolveForm(breath, doc.system.props.forma_id);
                assert.ok(form.acao === null || ['ataque', 'especial', 'unica', 'completa', 'reacao', 'movimento'].includes(form.acao), `${form.id}: ação ${form.acao}`);
                for (const level of form.niveis.filter(Boolean)) {
                    assert.ok(level.texto.length > 0, `${form.id}: nível sem texto`);
                    if (level.dano) assert.match(level.dano, /^[a-zA-Z0-9_\s+\-*/().,@]+$/u);
                }
            }
        });
    });
}

describe('automações que o dado promete', () => {
    const level = (breath, id, n) => resolveLevel(resolveForm(breath, id), n).dados;

    it('Som 2 (Silêncio) grava buff de +N em Acerto, Esquiva e Bloqueio por 3 turnos', () => {
        const buff = level('Som', 'som_02', 3).primitivas[0];
        assert.equal(buff.tipo, 'buff');
        assert.deepEqual(buff.mods, { acerto: 3, esquiva: 3, bloqueio: 3 });
        assert.equal(buff.turnos, 3);
    });

    it('Sonhos 4 (Mar de Memórias) usa SAB e SAB + CAR nos níveis 3 e 4', () => {
        assert.equal(level('Sonhos', 'sonhos_05', 3).primitivas[0].mods.acerto, '@sab');
        assert.equal(level('Sonhos', 'sonhos_05', 4).primitivas[0].mods.esquiva, '@sab + @car');
    });

    it('Raposa 2 (Cauda Solar) cura com a fórmula do nível', () => {
        assert.equal(level('Raposa', 'raposa_03', 1).primitivas[0].formula, '1d4');
        assert.equal(level('Raposa', 'raposa_03', 4).primitivas[0].formula, '1d4 + @fdv + 2');
    });

    it('Som 4 (Sinos) rola Dano Sonoro sem Acerto; Som 6 não paga PDR dobrado no uso normal', () => {
        const sinos = resolveForm('Som', 'som_04');
        assert.equal(sinos.semAcerto, true);
        assert.equal(level('Som', 'som_04', 2).dano, '4d6');
        assert.deepEqual(level('Som', 'som_04', 2).tiposDano, ['sonoro']);
        assert.equal(level('Som', 'som_06', 1).custo, 4);
    });

    it('Raposa 7 (Profeta) aplica Restrição de Movimentos no acerto', () => {
        const primitive = level('Raposa', 'raposa_08', 2).primitivas[0];
        assert.equal(primitive.tipo, 'aplicaStatus');
        assert.equal(primitive.status, 'restricao_movimentos');
    });
});
