/**
 * @fileoverview Consumíveis HonMoon para Actors Slayer.
 */

import { MODULE_ID } from './constants.mjs';
import { actorKind } from './actor-kind.mjs';
import { healActor } from './heal-relay.mjs';
import { slayerCurrentPdv, slayerMaxPdv } from './life-death-service.mjs';
import { parseAttributeValue, parseNumber } from './parsing.mjs';

const usingItems = new Set();

function clampExhaustion(value) {
    return Math.max(0, Math.min(8, Math.trunc(parseNumber(value))));
}

function escapeHtml(value) {
    const text = String(value ?? '');
    return globalThis.foundry?.utils?.escapeHTML?.(text) ?? text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export function consumableEffectPlan(
    kind,
    { rollTotal = 0, checkTotal = 0, props = {}, narrative = '' } = {}
) {
    const exhaustion = clampExhaustion(props.status_slayer_exaustao);
    if (kind === 'kkoedori') {
        const detail = String(narrative).trim();
        if (!detail) return { ok: false, reason: 'memory-required' };
        return {
            ok: true,
            heal: Math.max(0, Math.trunc(Number(rollTotal) || 0)),
            damage: 0,
            exhaustion: Math.max(0, exhaustion - 1),
            narrative: detail,
        };
    }
    if (kind === 'kimbap') {
        const success = Number(checkTotal) >= 10;
        return {
            ok: true,
            heal: success ? Math.max(0, Math.trunc(Number(rollTotal) || 0)) : 0,
            damage: success ? 0 : 1,
            exhaustion: success ? Math.max(0, exhaustion - 1) : exhaustion,
            success,
        };
    }
    return { ok: true, heal: 0, damage: 0, exhaustion: null };
}

export function honmoonSceneTestBonus(actor, { attr = '', test = '', sceneId = '' } = {}) {
    const state = actor?.getFlag?.(MODULE_ID, 'honmoonDalgona');
    if (!state || String(state.sceneId) !== String(sceneId)) return 0;
    const valid = String(attr).toUpperCase() === 'SAB' || /vontade/i.test(String(test));
    return valid ? Math.max(0, Math.trunc(Number(state.bonus) || 0)) : 0;
}

export function slayersPresentInScene(scene) {
    const unique = new Map();
    for (const token of scene?.tokens ?? []) {
        const actor = token?.actor;
        if (actor && actorKind(actor) === 'slayer' && !unique.has(actor.id)) unique.set(actor.id, actor);
    }
    return [...unique.values()];
}

async function rollAndPublish(actor, formula, flavor) {
    const roll = await Roll.create(formula).evaluate();
    const message = await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor,
    });
    await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
    return roll;
}

async function requestText(title, label) {
    const result = await foundry.applications.api.DialogV2.input({
        window: { title },
        content: `<div class="form-group stacked"><label>${label}</label><textarea name="value" rows="3"></textarea></div>`,
        ok: { label: 'Confirmar' },
    });
    if (!result) return '';
    const data = result instanceof FormData ? Object.fromEntries(result.entries()) : result;
    return String(data?.value ?? '').trim();
}

async function decrementItem(item, quantity) {
    await item.update(
        { 'system.props.consumivel_quantidade': quantity - 1 },
        { naCsbAutomation: true, naConsumableUse: true }
    );
}

async function applyBasicPlan(actor, plan) {
    if (plan.heal > 0) await healActor(actor, plan.heal, { source: 'honmoon-consumable' });
    const patch = {};
    if (plan.damage > 0) {
        patch['system.props.pdv_slayer_dano_tomado'] =
            parseNumber(actor.system?.props?.pdv_slayer_dano_tomado) + plan.damage;
    }
    if (plan.exhaustion !== null) {
        patch['system.props.status_slayer_exaustao'] = plan.exhaustion;
    }
    if (Object.keys(patch).length) {
        await actor.update(patch, { naCsbAutomation: true, naConsumableUse: true });
    }
}

/** Usa um Item consumível embutido em uma ficha Slayer. */
export async function useConsumableItem({
    actor,
    item,
    targetActor = null,
    narrative = '',
    wallName = '',
    scene = globalThis.canvas?.scene ?? null,
} = {}) {
    const startedAt = performance.now();
    if (!actor || actorKind(actor) !== 'slayer') return { ok: false, reason: 'slayer-required' };
    if (!item || item.parent !== actor || item.system?.template !== 'NAConsumableTpl1')
        return { ok: false, reason: 'owned-consumable-required' };
    const quantity = Math.max(0, Math.trunc(parseNumber(item.system?.props?.consumivel_quantidade)));
    if (quantity < 1) return { ok: false, reason: 'empty' };
    const lockKey = item.uuid ?? item.id;
    if (usingItems.has(lockKey)) return { ok: false, reason: 'already-using' };

    usingItems.add(lockKey);
    try {
        const kind = String(item.system?.props?.consumivel_efeito ?? 'mundano');
        let summary = 'Consumido sem efeito mecânico.';

        if (kind === 'kkoedori') {
            narrative = String(narrative).trim() || (await requestText(item.name, 'Memória curta esquecida'));
            if (!narrative) return { ok: false, cancelled: true };
            const healRoll = await rollAndPublish(actor, '1d4', `${item.name} — recuperação`);
            const plan = consumableEffectPlan(kind, {
                rollTotal: healRoll.total,
                props: actor.system.props,
                narrative,
            });
            await applyBasicPlan(actor, plan);
            summary = `Recuperou ${plan.heal} PDV, perdeu 1 nível de Exaustão e esqueceu: ${narrative}`;
        } else if (kind === 'dalgona') {
            const targeted = [...(game.user?.targets ?? [])]
                .map((token) => token.actor)
                .find((candidate) => actorKind(candidate) === 'slayer');
            const target = targetActor ?? targeted ?? actor;
            if (actorKind(target) !== 'slayer') return { ok: false, reason: 'slayer-target-required' };
            if (!game.user?.isGM && !target.isOwner) return { ok: false, reason: 'permission-required' };
            const missing = Math.max(0, slayerMaxPdv(target.system.props) - slayerCurrentPdv(target.system.props));
            if (missing > 0) await healActor(target, missing, { source: 'honmoon-dalgona' });
            await target.setFlag(MODULE_ID, 'honmoonDalgona', {
                sceneId: scene?.id ?? '',
                bonus: 2,
            });
            summary = `${target.name} recuperou todo o PDV e recebeu +2 em SAB/Vontade nesta cena.`;
        } else if (kind === 'choco_pie') {
            if (!game.user?.isGM) return { ok: false, reason: 'gm-required' };
            if (!scene?.setFlag) return { ok: false, reason: 'scene-required' };
            wallName = String(wallName).trim() || (await requestText(item.name, 'Nome escrito na parede'));
            if (!wallName) return { ok: false, cancelled: true };
            const targets = slayersPresentInScene(scene);
            if (!targets.length) return { ok: false, reason: 'no-slayers-present' };
            const healRoll = await rollAndPublish(actor, '1d6', `${item.name} — refeição do grupo`);
            await Promise.all(
                targets.map((target) => healActor(target, healRoll.total, { source: 'honmoon-choco-pie' }))
            );
            const names = [...new Set([...(scene.getFlag(MODULE_ID, 'honmoonWallNames') ?? []), wallName])];
            await scene.setFlag(MODULE_ID, 'honmoonWallNames', names);
            summary = `${targets.length} Slayer(s) recuperaram ${healRoll.total} PDV. Nome na parede: ${wallName}`;
        } else if (kind === 'kimbap') {
            const sab = parseAttributeValue(actor.system.props.sab_display);
            const check = await rollAndPublish(actor, `1d20 + ${sab}`, `${item.name} — Sobrevivência CD 10`);
            const healRoll = check.total >= 10
                ? await rollAndPublish(actor, '1d6', `${item.name} — recuperação`)
                : { total: 0 };
            const plan = consumableEffectPlan(kind, {
                checkTotal: check.total,
                rollTotal: healRoll.total,
                props: actor.system.props,
            });
            await applyBasicPlan(actor, plan);
            summary = plan.success
                ? `Sucesso: recuperou ${plan.heal} PDV e perdeu 1 nível de Exaustão.`
                : 'Falha: sofreu 1 ponto de dano e não recuperou PDV.';
        }

        await decrementItem(item, quantity);
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<strong>${escapeHtml(item.name)}</strong><br>${escapeHtml(summary)}`,
        });
        return {
            ok: true,
            kind,
            quantity: quantity - 1,
            elapsedMs: performance.now() - startedAt,
        };
    } finally {
        usingItems.delete(lockKey);
    }
}
