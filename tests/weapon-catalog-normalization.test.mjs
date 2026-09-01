import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    cleanWeaponScalar,
    normalizeNormalWeaponProps,
    splitWeaponPresentation,
} from '../scripts/weapon-catalog-normalization.mjs';

describe('normalização visual de armas normais', () => {
    it('remove somente marcadores Markdown das bordas dos campos escalares', () => {
        assert.equal(cleanWeaponScalar('** 1,5m'), '1,5m');
        assert.equal(cleanWeaponScalar('** Acuidade / Morote **'), 'Acuidade / Morote');
    });

    it('separa primeiro parágrafo e habilidade sem repetir a ficha técnica', () => {
        const value = `Descrição narrativa.\n\n- Propriedades: Acuidade\n- Alcance: 1,5m\n- Crítico: 20\n- Dano: 4\n\nHabilidade\n> Regra especial.\n\n---`;
        assert.deepEqual(splitWeaponPresentation(value), {
            description: 'Descrição narrativa.',
            ability: 'Regra especial.',
        });
        const props = normalizeNormalWeaponProps({ descricao: value });
        assert.equal(props.descricao, 'Descrição narrativa.');
        assert.equal(props.arma_regra_completa, 'Regra especial.');
    });
});
