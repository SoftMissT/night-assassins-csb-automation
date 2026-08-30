import { MODULE_ID } from '../constants.mjs';
import { actorKind } from '../actor-kind.mjs';
import { consumeOniActions, parseActionState } from '../action-service.mjs';
import {
    buildActiveRegenerationPatch,
    buildAutomaticRegenerationPatch,
    canActiveRegenerate,
    canAutomaticRegenerate,
    resetTurnRegeneration,
    rollActiveRegeneration,
    tickBlockingFlags,
} from './regeneration-service.mjs';
import { oniRegenerationProfile, normalizeOniLevel } from './progression-service.mjs';

function oniLevel(props = {}) {
    return normalizeOniLevel(props.nvl_oni ?? props.nvl_num ?? props.nvl_pj);
}

function oniVitality(props = {}) {
    return Math.max(0, Math.trunc(Number(props.vit_display ?? props.atr_vit_valor_config) || 0));
}

async function resolveActor(options = {}) {
    if (options.actor?.system?.props) return options.actor;
    if (options.actorUuid) {
        const document = await fromUuid(options.actorUuid);
        return document?.actor ?? document;
    }
    return canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
}

async function showRoll3d(roll) {
    const show = game.dice3d?.showForRoll;
    if (typeof show !== 'function') return false;
    await show.call(game.dice3d, roll, game.user, true);
    return true;
}

export async function useOniRegeneration(options = {}) {
    const actor = await resolveActor(options);
    if (!actor || actorKind(actor) !== 'oni')
        return ui.notifications?.warn?.('Selecione uma ficha Oni válida.');
    if (!actor.isOwner && !game.user?.isGM)
        return ui.notifications?.error?.('Você não pode regenerar este Oni.');

    const props = actor.system?.props ?? {};
    const level = oniLevel(props);
    const actionState = parseActionState(props.acoes_oni_dados);
    const allowed = canActiveRegenerate(level, props, actionState);
    if (!allowed.ok) return ui.notifications?.warn?.(`Regeneração Oni: ${allowed.reason}`);

    const profile = oniRegenerationProfile(level);
    const vitality = oniVitality(props);
    const test = await Roll.create(`1d20 + ${vitality}`).evaluate();
    const shown = await showRoll3d(test);
    await test.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<strong>Regeneração Oni</strong> · Teste de VIT CD 12`,
        ...(shown ? { flags: { 'dice-so-nice': { skip: true } } } : {}),
    });

    const consumed = await consumeOniActions(actor, allowed.action, { update: false });
    if (!consumed.ok) return ui.notifications?.warn?.(consumed.reason);
    const patch = { ...consumed.patch };
    let healing = 0;
    if (test.total >= 12) {
        const plan = rollActiveRegeneration(profile, vitality);
        const healRoll = await Roll.create(plan.formula).evaluate();
        const healShown = await showRoll3d(healRoll);
        await healRoll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: '<strong>Regeneração Oni</strong> · PDV recuperado',
            ...(healShown ? { flags: { 'dice-so-nice': { skip: true } } } : {}),
        });
        healing = Math.max(0, Math.trunc(Number(healRoll.total) || 0));
        Object.assign(patch, buildActiveRegenerationPatch(healing, props.pdv_oni_curado));
    } else {
        Object.assign(patch, { 'system.props.oni_regeneracao_usada_turno': true });
    }
    await actor.update(patch, { naCsbAutomation: true, naOniRegeneration: true });
    ui.notifications?.info?.(
        test.total >= 12
            ? `${actor.name} recuperou ${healing} PDV.`
            : `${actor.name} falhou no teste de Regeneração Oni.`
    );
    return { ok: true, success: test.total >= 12, healing, action: allowed.action };
}

async function processOniTurn(actor) {
    if (!actor || actorKind(actor) !== 'oni') return;
    const props = actor.system?.props ?? {};
    const level = oniLevel(props);
    const blockerPatch = tickBlockingFlags(props) ?? {};
    const projected = { ...props };
    for (const [key, value] of Object.entries(blockerPatch))
        projected[key.replace('system.props.', '')] = value;
    const patch = { ...blockerPatch, ...resetTurnRegeneration() };
    const automatic = canAutomaticRegenerate(level, projected);
    if (automatic.ok) {
        Object.assign(
            patch,
            buildAutomaticRegenerationPatch(level, oniVitality(props), props.pdv_oni_curado)
        );
    }
    await actor.update(patch, { naCsbAutomation: true, naOniRegeneration: true });
    if (automatic.ok)
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<p><strong>Regeneração Monstruosa:</strong> ${oniVitality(props)} PDV recuperado no início do turno.</p>`,
        });
}

function primaryGm() {
    return game.users
        ?.filter((user) => user.active && user.isGM)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
}

export function registerOniRegenerationEngine() {
    Hooks.on('updateCombat', (combat, changes) => {
        if (!game.user?.isGM || primaryGm()?.id !== game.user.id) return;
        if (!Object.hasOwn(changes, 'turn') || !combat?.started) return;
        void processOniTurn(combat.combatant?.actor).catch((error) =>
            console.error(`[${MODULE_ID}] Falha na regeneração automática Oni`, error)
        );
    });
}
