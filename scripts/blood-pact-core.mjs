import { awakeningBloodCost } from './special-weapon-awakening-core.mjs';

function finiteField(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

// The CSB hidden total is authoritative, including N14 and the user's formulas.
// Do not reconstruct it with a second, potentially divergent HP formula.
export function bloodPactPayment(props = {}) {
    const current = finiteField(props.pdv_slayer_atual);
    const taken = finiteField(props.pdv_slayer_dano_tomado);
    if (current === null || taken === null) {
        throw new Error('PDV atual ou dano tomado não calculado. Reabra a ficha antes de realizar o pacto.');
    }
    const cost = awakeningBloodCost(current);
    return { ...cost, damageBefore: taken, damageAfter: taken + cost.cost };
}
