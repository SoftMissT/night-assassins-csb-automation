import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBreathingDefense } from '../scripts/breathing-defense.mjs';

test('Resiliência da Pedra reduz somente parcelas resistidas', () => {
    const result = resolveBreathingDefense({
        amount: 15,
        components: [
            { label: 'Lâmina', types: ['cortante'], subtotal: 10 },
            { label: 'Fogo', types: ['fogo'], subtotal: 5 },
        ],
        props: {
            resp_pedra_estado: JSON.stringify({
                resilience: { turns: 3, resistances: ['cortante', 'perfurante', 'concussao'] },
            }),
        },
    });
    assert.equal(result.amount, 10);
    assert.deepEqual(
        result.components.map((entry) => entry.subtotal),
        [5, 5]
    );
});

test('Inabalável reduz Cortante e Perfurante', () => {
    const result = resolveBreathingDefense({
        amount: 9,
        damageTypes: ['perfurante'],
        props: {
            resp_metal_estado: JSON.stringify({
                unshakable: { turns: 2, resistances: ['cortante', 'perfurante'] },
            }),
        },
    });
    assert.equal(result.amount, 4);
    assert.equal(result.resisted, true);
});

test('supressão da Névoa ignora resistência sem ignorar anulação', () => {
    const resisted = {
        resp_metal_estado: JSON.stringify({ unshakable: { turns: 2, resistances: ['cortante'] } }),
    };
    assert.equal(
        resolveBreathingDefense({
            amount: 10,
            damageTypes: ['cortante'],
            props: resisted,
            suppressResistances: true,
        }).amount,
        10
    );
    const negated = { resp_metal_estado: JSON.stringify({ steelDefense: { negateAttack: true } }) };
    assert.equal(
        resolveBreathingDefense({ amount: 10, props: negated, suppressResistances: true }).amount,
        0
    );
});

test('Duro como Aço anula e consome a defesa', () => {
    const result = resolveBreathingDefense({
        amount: 40,
        props: {
            resp_metal_estado: JSON.stringify({ steelDefense: { negateAttack: true, uses: 1 } }),
        },
    });
    assert.equal(result.amount, 0);
    assert.equal(result.negated, true);
    assert.doesNotMatch(result.patches['system.props.resp_metal_estado'], /steelDefense/);
});
