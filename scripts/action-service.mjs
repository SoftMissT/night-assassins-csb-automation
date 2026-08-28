/**
 * @fileoverview Economia de ações do Slayer, persistência e gerenciador DialogV2.
 */

import { MODULE_ID, TIPOS_ACAO } from './constants.mjs';
import { parseNumber } from './parsing.mjs';
import { getDamageStatusEffects, getStatusCapabilities } from './status-effects.mjs';

const TURN_KEYS = Object.freeze(['movimento', 'ataque', 'especial']);
const ROUND_KEYS = Object.freeze(['unica', 'reacao']);
const ACTION_FLAG = 'lastActionReset';

function isSlayerActor(actor) {
    const props = actor?.system?.props ?? {};
    return props.nome_slayer !== undefined || props.pdv_slayer_total_valor !== undefined;
}

function isOniActor(actor) {
    const props = actor?.system?.props ?? {};
    return (
        props.nome_oni !== undefined ||
        props.acoes_oni_dados !== undefined ||
        props.pdk_oni_gasto_valor !== undefined
    );
}

function emptyUses(keys) {
    return Object.fromEntries(keys.map((key) => [key, 0]));
}

export function defaultActionState() {
    return { version: 1, turn: emptyUses(TURN_KEYS), round: emptyUses(ROUND_KEYS) };
}

export function parseActionState(value) {
    if (!value) return defaultActionState();
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
            return defaultActionState();
        }
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultActionState();
    const state = defaultActionState();
    for (const key of TURN_KEYS)
        state.turn[key] = Math.max(0, Math.trunc(Number(raw.turn?.[key]) || 0));
    for (const key of ROUND_KEYS)
        state.round[key] = Math.max(0, Math.trunc(Number(raw.round?.[key]) || 0));
    return state;
}

export function actionMaximums(props = {}) {
    const withBonus = (key) =>
        Math.max(0, 1 + Math.trunc(parseNumber(props[`acoes_slayer_${key}_bonus`])));
    return {
        movimento: withBonus('movimento'),
        ataque: withBonus('ataque'),
        especial: withBonus('especial'),
        unica: 1,
        reacao: withBonus('reacao'),
    };
}

export function oniActionMaximums(props = {}) {
    const withBonus = (key) =>
        Math.max(0, 1 + Math.trunc(parseNumber(props[`acoes_oni_${key}_bonus`])));
    return {
        movimento: withBonus('movimento'),
        ataque: withBonus('ataque'),
        especial: withBonus('especial'),
        unica: 1,
        reacao: withBonus('reacao'),
    };
}

export function slayerMovementMeters(props = {}, { extraPenaltyMeters = 0 } = {}) {
    const capabilities = getStatusCapabilities(props);
    if (!capabilities.movementAllowed) return 0;
    const dex = parseNumber(props.dex_display);
    const penalty =
        capabilities.movementPenaltyMeters +
        Math.max(0, Math.trunc(parseNumber(extraPenaltyMeters)));
    return Math.max(0, (7 + dex) * capabilities.movementMultiplier - penalty);
}

export function slayerFolegoMaximum(props = {}) {
    return Math.max(0, 2 + Math.trunc(parseNumber(props.fdv_display)));
}

export function slayerFolegoPatch(props = {}, { full = false } = {}) {
    const maximum = slayerFolegoMaximum(props);
    const stored =
        props.folego_slayer_atual === undefined || props.folego_slayer_atual === ''
            ? maximum
            : Math.max(0, Math.trunc(parseNumber(props.folego_slayer_atual)));
    return { 'system.props.folego_slayer_atual': full ? maximum : Math.min(maximum, stored + 1) };
}

export async function recoverSlayerFolego(actor, amount = 1) {
    if (!actor?.update || !isSlayerActor(actor)) return { changed: false, current: 0, maximum: 0 };
    const props = actor.system?.props ?? {};
    const maximum = slayerFolegoMaximum(props);
    const current =
        props.folego_slayer_atual === undefined || props.folego_slayer_atual === ''
            ? maximum
            : Math.max(0, Math.trunc(parseNumber(props.folego_slayer_atual)));
    const next = Math.min(maximum, current + Math.max(0, Math.trunc(parseNumber(amount))));
    if (next === current) return { changed: false, current, maximum };
    await actor.update(
        { 'system.props.folego_slayer_atual': next },
        { naCsbAutomation: true, naFolego: true }
    );
    return { changed: true, current: next, maximum };
}

export function actionSummary(state, props = {}) {
    const maximums = actionMaximums(props);
    return [...TURN_KEYS, ...ROUND_KEYS]
        .map(
            (key) =>
                `${key.toUpperCase()} ${Math.max(0, maximums[key] - state[key === 'unica' || key === 'reacao' ? 'round' : 'turn'][key])}/${maximums[key]}`
        )
        .join(' · ');
}

function actionPatch(state, props = {}) {
    return {
        'system.props.acoes_slayer_dados': JSON.stringify(state),
        'system.props.acoes_slayer_resumo': actionSummary(state, props),
    };
}

function oniActionSummary(state, props = {}) {
    const maximums = oniActionMaximums(props);
    return [...TURN_KEYS, ...ROUND_KEYS]
        .map(
            (key) =>
                `${key.toUpperCase()} ${Math.max(0, maximums[key] - state[ROUND_KEYS.includes(key) ? 'round' : 'turn'][key])}/${maximums[key]}`
        )
        .join(' · ');
}

function oniActionPatch(state, props = {}) {
    return {
        'system.props.acoes_oni_dados': JSON.stringify(state),
        'system.props.acoes_oni_resumo': oniActionSummary(state, props),
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

function blockedReason(props, types) {
    const unique = new Set(types);
    const capabilities = getStatusCapabilities(props);
    if (unique.has('movimento') || unique.has('completa')) {
        if (!capabilities.movementAllowed) return 'Os status atuais impedem Ação de Movimento.';
    }
    if (unique.has('reacao') && !capabilities.reactionsAllowed)
        return 'Os status atuais impedem Reações.';
    const mechanical = [...unique].some((key) =>
        ['ataque', 'especial', 'unica', 'completa'].includes(key)
    );
    if (mechanical && getDamageStatusEffects(props).blocked)
        return 'Este personagem está incapacitado e não pode usar esta ação.';
    return null;
}

export async function consumeSlayerActions(actor, types, { update = true } = {}) {
    if (!actor?.update) throw new Error('Slayer inválido para consumir ações.');
    if (!isSlayerActor(actor))
        return { ok: true, state: defaultActionState(), patch: {}, skipped: 'not-slayer' };
    const normalized = [...new Set((Array.isArray(types) ? types : [types]).filter(Boolean))];
    if (normalized.length === 0)
        return {
            ok: true,
            state: parseActionState(actor.system?.props?.acoes_slayer_dados),
            patch: {},
        };
    if (normalized.includes('epica'))
        return { ok: false, reason: 'A Ação Épica exige o fluxo próprio do Mestre.' };
    const props = actor.system?.props ?? {};
    const blocked = blockedReason(props, normalized);
    if (blocked) return { ok: false, reason: blocked };
    const state = parseActionState(props.acoes_slayer_dados);
    const maximums = actionMaximums(props);
    const required = requiredCounters(normalized);
    for (const key of TURN_KEYS) {
        if (state.turn[key] + required.turn[key] > maximums[key])
            return {
                ok: false,
                reason: `${TIPOS_ACAO.find((entry) => entry.key === key)?.label ?? key} indisponível.`,
            };
    }
    for (const key of ROUND_KEYS) {
        if (state.round[key] + required.round[key] > maximums[key])
            return {
                ok: false,
                reason: `${TIPOS_ACAO.find((entry) => entry.key === key)?.label ?? key} indisponível.`,
            };
    }
    for (const key of TURN_KEYS) state.turn[key] += required.turn[key];
    for (const key of ROUND_KEYS) state.round[key] += required.round[key];
    const patch = actionPatch(state, props);
    if (update) await actor.update(patch, { naCsbAutomation: true, naActionEconomy: true });
    return { ok: true, state, patch, summary: actionSummary(state, props) };
}

export async function resetSlayerActions(actor, scope = 'all') {
    if (!actor?.update) return null;
    const props = actor.system?.props ?? {};
    const state = parseActionState(props.acoes_slayer_dados);
    if (scope === 'turn' || scope === 'all') state.turn = emptyUses(TURN_KEYS);
    if (scope === 'round' || scope === 'all') state.round = emptyUses(ROUND_KEYS);
    await actor.update(actionPatch(state, props), { naCsbAutomation: true, naActionEconomy: true });
    return state;
}

export async function consumeOniActions(actor, types, { update = true } = {}) {
    if (!actor?.update) throw new Error('Oni inválido para consumir ações.');
    if (!isOniActor(actor)) return { ok: false, reason: 'Este gerenciador pertence à ficha Oni.' };
    const normalized = [...new Set((Array.isArray(types) ? types : [types]).filter(Boolean))];
    const props = actor.system?.props ?? {};
    const state = parseActionState(props.acoes_oni_dados);
    if (normalized.length === 0) return { ok: true, state, patch: {} };
    const blocked = blockedReason(props, normalized);
    if (blocked) return { ok: false, reason: blocked };
    const maximums = oniActionMaximums(props);
    const required = requiredCounters(normalized);
    for (const key of TURN_KEYS) {
        if (state.turn[key] + required.turn[key] > maximums[key])
            return {
                ok: false,
                reason: `${TIPOS_ACAO.find((entry) => entry.key === key)?.label ?? key} indisponível.`,
            };
    }
    for (const key of ROUND_KEYS) {
        if (state.round[key] + required.round[key] > maximums[key])
            return {
                ok: false,
                reason: `${TIPOS_ACAO.find((entry) => entry.key === key)?.label ?? key} indisponível.`,
            };
    }
    for (const key of TURN_KEYS) state.turn[key] += required.turn[key];
    for (const key of ROUND_KEYS) state.round[key] += required.round[key];
    const patch = oniActionPatch(state, props);
    if (update) await actor.update(patch, { naCsbAutomation: true, naActionEconomy: true });
    return { ok: true, state, patch, summary: oniActionSummary(state, props) };
}

export async function resetOniActions(actor, scope = 'all') {
    if (!actor?.update || !isOniActor(actor)) return null;
    const props = actor.system?.props ?? {};
    const state = parseActionState(props.acoes_oni_dados);
    if (scope === 'turn' || scope === 'all') state.turn = emptyUses(TURN_KEYS);
    if (scope === 'round' || scope === 'all') state.round = emptyUses(ROUND_KEYS);
    await actor.update(oniActionPatch(state, props), {
        naCsbAutomation: true,
        naActionEconomy: true,
    });
    return state;
}

function primaryActiveGm() {
    return (
        game.users
            ?.filter((user) => user.active && user.isGM)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null
    );
}

function isPrimaryGm() {
    return game.user?.isGM && primaryActiveGm()?.id === game.user.id;
}

export function registerActionEngine() {
    Hooks.on(
        'combatStart',
        (combat) => void resetCombatActions(combat, { resetRound: true, fillFolego: true })
    );
    Hooks.on('updateCombat', (combat, changes) => {
        if (!isPrimaryGm()) return;
        if (Object.hasOwn(changes, 'round')) void resetCombatActions(combat, { resetRound: true });
        else if (Object.hasOwn(changes, 'turn')) void resetCombatActions(combat);
    });
}

async function resetCombatActions(combat, { resetRound = false, fillFolego = false } = {}) {
    if (!isPrimaryGm() || !combat?.started) return;
    const actor = combat.combatant?.actor;
    const key = `${combat.id}:${combat.round}:${combat.turn}:${actor?.id ?? 'none'}:${resetRound}:${fillFolego}`;
    if (combat.getFlag?.(MODULE_ID, ACTION_FLAG) === key) return;
    await combat.setFlag?.(MODULE_ID, ACTION_FLAG, key);
    const actors = [...(combat.combatants ?? [])]
        .map((combatant) => combatant.actor)
        .filter((candidate) => isSlayerActor(candidate) || isOniActor(candidate));
    const jobs = actors.map(async (candidate) => {
        const props = candidate.system?.props ?? {};
        const oni = isOniActor(candidate) && !isSlayerActor(candidate);
        const state = parseActionState(props[oni ? 'acoes_oni_dados' : 'acoes_slayer_dados']);
        let changed = false;
        if (resetRound) {
            state.round = emptyUses(ROUND_KEYS);
            changed = true;
        }
        if (candidate === actor) {
            state.turn = emptyUses(TURN_KEYS);
            changed = true;
        }
        const patch = changed
            ? oni
                ? oniActionPatch(state, props)
                : actionPatch(state, props)
            : {};
        if (!oni && (fillFolego || candidate === actor))
            Object.assign(patch, slayerFolegoPatch(props, { full: fillFolego }));
        if (Object.keys(patch).length > 0)
            await candidate.update(patch, { naCsbAutomation: true, naActionEconomy: true });
    });
    await Promise.allSettled(jobs);
}

async function resolveActor(options = {}) {
    if (options.actor?.system?.props) return options.actor;
    if (options.actorUuid) {
        const document = await fromUuid(options.actorUuid);
        if (document?.actor?.system?.props) return document.actor;
        if (document?.system?.props) return document;
    }
    return canvas.tokens.controlled[0]?.actor ?? game.user?.character ?? null;
}

export async function openActionManager(options = {}) {
    const actor = await resolveActor(options);
    if (!actor) return ui.notifications.warn('Não há personagem ativo.');
    if (!actor.isOwner) return ui.notifications.error('Você não pode alterar este personagem.');
    const props = actor.system?.props ?? {};
    if (isOniActor(actor) && !isSlayerActor(actor)) return openOniActionManager(actor);
    if (!isSlayerActor(actor))
        return ui.notifications.warn('Este gerenciador pertence às fichas Slayer e Oni.');
    const state = parseActionState(props.acoes_slayer_dados);
    const maximums = actionMaximums(props);
    const keys = [...TURN_KEYS, ...ROUND_KEYS];
    const rows = keys
        .map((key) => {
            const used = state[ROUND_KEYS.includes(key) ? 'round' : 'turn'][key];
            const remaining = Math.max(0, maximums[key] - used);
            const meta = TIPOS_ACAO.find((entry) => entry.key === key);
            return `<div class="na-action-row"><strong>${meta?.label ?? key}</strong><span>${remaining} / ${maximums[key]}</span></div>`;
        })
        .join('');
    const optionsHtml = keys
        .map(
            (key) =>
                `<option value="${key}">${TIPOS_ACAO.find((entry) => entry.key === key)?.label ?? key}</option>`
        )
        .join('');
    const informational = TIPOS_ACAO.filter((entry) => ['free', 'special'].includes(entry.scope))
        .map(
            (entry) =>
                `<div class="na-action-note"><strong>${entry.label}</strong><span>${entry.desc}</span></div>`
        )
        .join('');
    // Avalanche Negativa (Neve) + sinergia com Nevasca: reduz o deslocamento
    // máximo do alvo pelo mesmo valor da rolagem de 1d4, por 2 turnos.
    const snowMovementPenalty = actor.getFlag?.(MODULE_ID, 'snowMovementPenalty');
    const movementPenaltyMeters =
        Number(snowMovementPenalty?.turns) > 0 ? Number(snowMovementPenalty.value) || 0 : 0;
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: `Ações ${actor.name}` },
        content: `<div class="na-action-manager"><p><strong>Fôlego:</strong> ${Math.max(0, parseNumber(props.folego_slayer_atual))} / ${slayerFolegoMaximum(props)} · <strong>Deslocamento:</strong> ${slayerMovementMeters(props, { extraPenaltyMeters: movementPenaltyMeters })}m${movementPenaltyMeters > 0 ? ` (−${movementPenaltyMeters}m Avalanche Negativa)` : ''}</p>${rows}<label>Consumir ação <select name="na-action-use">${optionsHtml}<option value="completa">Ação Completa</option></select></label><p>Ação Completa consome Movimento + Ataque.</p><div class="na-action-reference">${informational}</div></div>`,
        buttons: [
            {
                action: 'use',
                label: 'Usar ação',
                callback: (_event, _button, dialog) =>
                    `use:${dialog.element.querySelector('[name="na-action-use"]')?.value ?? ''}`,
            },
            { action: 'reset-turn', label: 'Restaurar turno', callback: () => 'turn' },
            { action: 'reset-round', label: 'Restaurar rodada', callback: () => 'round' },
            { action: 'close', label: 'Fechar', default: true, callback: () => null },
        ],
    });
    if (result?.startsWith?.('use:')) {
        const consumed = await consumeSlayerActions(actor, result.slice(4));
        if (!consumed.ok) ui.notifications.warn(consumed.reason);
    } else if (result) await resetSlayerActions(actor, result);
    return result;
}

async function openOniActionManager(actor) {
    const props = actor.system?.props ?? {};
    const state = parseActionState(props.acoes_oni_dados);
    const maximums = oniActionMaximums(props);
    const keys = [...TURN_KEYS, ...ROUND_KEYS];
    const rows = keys
        .map((key) => {
            const used = state[ROUND_KEYS.includes(key) ? 'round' : 'turn'][key];
            const remaining = Math.max(0, maximums[key] - used);
            const meta = TIPOS_ACAO.find((entry) => entry.key === key);
            return `<div class="na-action-row"><strong>${meta?.label ?? key}</strong><span>${remaining} / ${maximums[key]}</span></div>`;
        })
        .join('');
    const optionsHtml = keys
        .map(
            (key) =>
                `<option value="${key}">${TIPOS_ACAO.find((entry) => entry.key === key)?.label ?? key}</option>`
        )
        .join('');
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: `Ações Oni ${actor.name}` },
        content: `<div class="na-action-manager"><p><strong>Deslocamento:</strong> ${Math.max(0, parseNumber(props.deslocamento_oni))}m</p>${rows}<label>Consumir ação <select name="na-action-use">${optionsHtml}<option value="completa">Ação Completa</option></select></label><p>Ação Completa consome Movimento + Ataque.</p></div>`,
        buttons: [
            {
                action: 'use',
                label: 'Usar ação',
                callback: (_event, _button, dialog) =>
                    `use:${dialog.element.querySelector('[name="na-action-use"]')?.value ?? ''}`,
            },
            { action: 'reset-turn', label: 'Restaurar turno', callback: () => 'turn' },
            { action: 'reset-round', label: 'Restaurar rodada', callback: () => 'round' },
            { action: 'close', label: 'Fechar', default: true, callback: () => null },
        ],
    });
    if (result?.startsWith?.('use:')) {
        const consumed = await consumeOniActions(actor, result.slice(4));
        if (!consumed.ok) ui.notifications.warn(consumed.reason);
    } else if (result) await resetOniActions(actor, result);
    return result;
}
