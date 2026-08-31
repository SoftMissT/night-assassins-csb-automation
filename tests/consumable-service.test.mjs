import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    consumableEffectPlan,
    honmoonSceneTestBonus,
    slayersPresentInScene,
} from '../scripts/consumable-service.mjs';

describe('consumíveis HonMoon', () => {
    it('Kkoedori cura o dado e reduz somente um nível de Exaustão', () => {
        assert.deepEqual(
            consumableEffectPlan('kkoedori', {
                rollTotal: 3,
                props: { status_slayer_exaustao: 2 },
                narrative: 'Esqueceu a cor da porta.',
            }),
            { ok: true, heal: 3, damage: 0, exhaustion: 1, narrative: 'Esqueceu a cor da porta.' }
        );
    });

    it('Kimbap usa o resultado CD 10 e nunca cura na falha', () => {
        assert.deepEqual(
            consumableEffectPlan('kimbap', {
                checkTotal: 9,
                rollTotal: 6,
                props: { status_slayer_exaustao: 3 },
            }),
            { ok: true, heal: 0, damage: 1, exhaustion: 3, success: false }
        );
        assert.deepEqual(
            consumableEffectPlan('kimbap', {
                checkTotal: 10,
                rollTotal: 5,
                props: { status_slayer_exaustao: 3 },
            }),
            { ok: true, heal: 5, damage: 0, exhaustion: 2, success: true }
        );
    });

    it('Energético e Água não inventam bônus mecânico', () => {
        assert.deepEqual(consumableEffectPlan('mundano', {}), {
            ok: true,
            heal: 0,
            damage: 0,
            exhaustion: null,
        });
    });

    it('Dalgona concede +2 somente em SAB/Vontade e apenas na mesma cena', () => {
        const actor = {
            getFlag: () => ({ sceneId: 'scene-a', bonus: 2 }),
        };
        assert.equal(honmoonSceneTestBonus(actor, { attr: 'SAB', test: 'Percepção', sceneId: 'scene-a' }), 2);
        assert.equal(honmoonSceneTestBonus(actor, { attr: 'FDV', test: 'Vontade', sceneId: 'scene-a' }), 2);
        assert.equal(honmoonSceneTestBonus(actor, { attr: 'FOR', test: 'Força', sceneId: 'scene-a' }), 0);
        assert.equal(honmoonSceneTestBonus(actor, { attr: 'SAB', test: 'Percepção', sceneId: 'scene-b' }), 0);
    });

    it('Choco Pie deduplica Slayers presentes mesmo com múltiplos tokens', () => {
        const a = { id: 'a', system: { props: { nome_slayer: 'A' } } };
        const b = { id: 'b', system: { props: { pdv_slayer_total_conta: 20 } } };
        const oni = { id: 'o', system: { props: { nome_oni: 'O' } } };
        const scene = { tokens: [{ actor: a }, { actor: a }, { actor: b }, { actor: oni }] };
        assert.deepEqual(slayersPresentInScene(scene), [a, b]);
    });
});
