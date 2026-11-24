import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { WIND_FORMS } from '../scripts/wind-breathing-data.mjs';

// Campo que o motor usa como dano de cada nível. O catálogo mostra esse mesmo valor no cartão
// da Forma e no diálogo de dano (o campo vem pré-preenchido com ele).
const DISPLAY_DAMAGE_FIELD = {
    vento_02: 'damagePerPdr',
    vento_04: 'damage',
    vento_06: 'damage',
    vento_07: 'damage',
    vento_08: 'fallDamage',
    vento_09: 'damagePerScar',
};

async function catalogProps() {
    const catalog = JSON.parse(await readFile(new URL('../catalogs/breathing.json', import.meta.url), 'utf8'));
    return new Map(
        catalog.documents
            .filter((document) => document.system?.props?.forma_id)
            .map((document) => [document.system.props.forma_id, document.system.props])
    );
}

describe('catálogo do Vento acompanha o motor por nível', () => {
    it('o dano mostrado em cada nível é o dano que o motor rola, com "" para nível que não pode usar', async () => {
        const props = await catalogProps();
        for (const [formId, field] of Object.entries(DISPLAY_DAMAGE_FIELD)) {
            const form = WIND_FORMS.find((entry) => entry.id === formId);
            assert.ok(form, `${formId} existe no motor`);
            const item = props.get(formId);
            assert.ok(item, `${formId} existe no catálogo`);
            form.levels.forEach((level, index) => {
                const expected = level ? String(level[field] ?? '') : '';
                assert.equal(
                    item[`nvl${index + 1}_dano`],
                    expected,
                    `${formId} nível ${index + 1}: catálogo diverge do motor`
                );
            });
        }
    });

    it('vento_06 pede o dano por nível do livro, não o de nível 1 repetido', async () => {
        const props = await catalogProps();
        const item = props.get('vento_06');
        assert.deepEqual(
            [1, 2, 3, 4].map((level) => item[`nvl${level}_dano`]),
            ['2d4 + @fdv', '2d6 + @fdv', '2d8 + @fdv', '2d8 + @fdv + @dex']
        );
    });
});
