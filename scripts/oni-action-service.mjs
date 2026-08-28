import { TIPOS_ACAO } from './constants.mjs';
import { parseNumber } from './parsing.mjs';

const TURN_KEYS = Object.freeze(['movimento', 'ataque', 'especial']);
const ROUND_KEYS = Object.freeze(['unica', 'reacao', 'lendaria']);

const emptyUses = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));

export function defaultOniActionState() {
    return { version: 1, turn: emptyUses(TURN_KEYS), round: emptyUses(ROUND_KEYS) };
}

export function parseOniActionState(value) {
    if (!value) return defaultOniActionState();
    let raw = value;
    if (typeof raw === 'string') {
        const decoded = raw
            .replace(/<[^>]*>/g, '')
            .replaceAll('&quot;', '"')
            .replaceAll('&#34;', '"')
            .replaceAll('&amp;', '&')
            .trim();
        try {
            raw = JSON.parse(decoded.slice(decoded.indexOf('{'), decoded.lastIndexOf('}') + 1));
        } catch (_) {
            return defaultOniActionState();
        }
    }
    const state = defaultOniActionState();
    for (const key of TURN_KEYS)
        state.turn[key] = Math.max(0, Math.trunc(Number(raw?.turn?.[key]) || 0));
    for (const key of ROUND_KEYS)
        state.round[key] = Math.max(0, Math.trunc(Number(raw?.round?.[key]) || 0));
    return state;
}

export function oniActionMaximums(props = {}) {
    const bonus = (key) =>
        Math.max(0, 1 + Math.trunc(parseNumber(props[`acoes_oni_${key}_bonus`])));
    return {
        movimento: bonus('movimento'),
        ataque: bonus('ataque'),
        especial: bonus('especial'),
        unica: 1,
        reacao: bonus('reacao'),
        lendaria: Math.max(0, Math.trunc(parseNumber(props.acoes_oni_lendaria_maximo))),
    };
}

function requiredCounters(types) {
    const required = { turn: emptyUses(TURN_KEYS), round: emptyUses(ROUND_KEYS) };
    for (const key of new Set(types.filter(Boolean))) {
        if (key === 'completa') {
            required.turn.movimento += 1;
            required.turn.ataque += 1;
        } else if (TURN_KEYS.includes(key)) required.turn[key] += 1;
        else if (ROUND_KEYS.includes(key)) required.round[key] += 1;
    }
    return required;
}

export async function consumeOniActions(actor, types, { update = true } = {}) {
    if (!actor?.update) throw new Error('Oni invalido para consumir acoes.');
    const props = actor.system?.props ?? {};
    const normalized = [...new Set((Array.isArray(types) ? types : [types]).filter(Boolean))];
    const state = parseOniActionState(props.acoes_oni_dados);
    if (normalized.length === 0) return { ok: true, state, patch: {} };
    const maximums = oniActionMaximums(props);
    const required = requiredCounters(normalized);
    for (const key of TURN_KEYS)
        if (state.turn[key] + required.turn[key] > maximums[key])
            return {
                ok: false,
                reason: `${TIPOS_ACAO.find((entry) => entry.key === key)?.label ?? key} indisponivel.`,
            };
    for (const key of ROUND_KEYS)
        if (state.round[key] + required.round[key] > maximums[key])
            return {
                ok: false,
                reason: `${TIPOS_ACAO.find((entry) => entry.key === key)?.label ?? key} indisponivel.`,
            };
    for (const key of TURN_KEYS) state.turn[key] += required.turn[key];
    for (const key of ROUND_KEYS) state.round[key] += required.round[key];
    const summary = [...TURN_KEYS, ...ROUND_KEYS]
        .map((key) => {
            const used = state[ROUND_KEYS.includes(key) ? 'round' : 'turn'][key];
            return `${key.toUpperCase()} ${Math.max(0, maximums[key] - used)}/${maximums[key]}`;
        })
        .join(' · ');
    const patch = {
        'system.props.acoes_oni_dados': JSON.stringify(state),
        'system.props.acoes_oni_resumo': summary,
    };
    if (update) await actor.update(patch, { naCsbAutomation: true, naActionEconomy: true });
    return { ok: true, state, patch, summary };
}
