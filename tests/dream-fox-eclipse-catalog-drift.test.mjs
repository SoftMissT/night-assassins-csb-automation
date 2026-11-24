import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { resolveForm } from '../scripts/breathing-contract.mjs';

// Formas Vanilla migradas para o contrato canônico. O catálogo mostra, por nível, o mesmo dano
// que o motor usa; a cura da Cauda Solar é a fórmula da primitiva `cura`.
const FORMS = [
    ['Sonhos', 'sonhos_02'], ['Sonhos', 'sonhos_04'], ['Sonhos', 'sonhos_08'],
    ['Sonhos', 'sonhos_09'], ['Sonhos', 'sonhos_10'],
    ['Raposa', 'raposa_02'], ['Raposa', 'raposa_03'], ['Raposa', 'raposa_08'],
    ['Eclipse', 'eclipse_01'], ['Eclipse', 'eclipse_02'],
];

function expectedDamage(level) {
    if (!level) return '';
    if (level.dano) return String(level.dano);
    const cure = (level.primitivas ?? []).find((entry) => entry.tipo === 'cura');
    return cure ? String(cure.formula) : '';
}

async function catalogProps() {
    const catalog = JSON.parse(await readFile(new URL('../catalogs/breathing.json', import.meta.url), 'utf8'));
    return new Map(
        catalog.documents
            .filter((document) => document.system?.props?.forma_id)
            .map((document) => [document.system.props.forma_id, document.system.props])
    );
}

describe('catálogo Vanilla de Sonhos, Raposa e Eclipse acompanha o motor', () => {
    it('o dano de cada nível é o que o contrato rola; nível bloqueado ou sem dano fica ""', async () => {
        const props = await catalogProps();
        for (const [respiracao, formId] of FORMS) {
            const form = resolveForm(respiracao, formId);
            assert.ok(form, `${formId} existe no contrato`);
            const item = props.get(formId);
            assert.ok(item, `${formId} existe no catálogo`);
            form.niveis.forEach((level, index) => {
                assert.equal(
                    item[`nvl${index + 1}_dano`],
                    expectedDamage(level),
                    `${formId} nível ${index + 1}: catálogo diverge do motor`
                );
            });
        }
    });

    it('Pesadelos mostra o dano por turno do livro (3d8/4d8/5d8) e o Caos mostra o roubo de vida', async () => {
        // O dano do Pesadelos é contínuo (início de cada turno dentro do domínio) e não é rolado pelo
        // contrato; por isso fica fora da comparação automática e tem valor fixo aqui.
        const props = await catalogProps();
        const pesadelos = props.get('sonhos_07');
        assert.equal(pesadelos.nvl1_dano, '');
        assert.deepEqual([2, 3, 4].map((level) => pesadelos[`nvl${level}_dano`]), ['3d8', '4d8', '5d8']);
        const caos = props.get('sonhos_08');
        assert.match(caos.nvl2_status, /25%/);
        assert.match(caos.nvl2_status, /2d4 turnos/);
    });

    it('Sonhos 9º Estilo mostra o dano do livro por nível, não o do nível 1', async () => {
        const item = (await catalogProps()).get('sonhos_09');
        assert.deepEqual(
            [1, 2, 3, 4].map((level) => item[`nvl${level}_dano`]),
            ['6d8 + @car + @sab', '10d8 + @car + @sab', '12d8 + @car + @sab', '12d10 + @car + @sab']
        );
    });
});
