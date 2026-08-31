/**
 * @fileoverview Consumidor isolado das reações declaradas por armas Slayer.
 *
 * Este serviço não abre diálogo nem cria uma segunda rolagem: ele recebe o
 * total do teste de Acerto já rolado pelo chamador, resolve a redução e cobra
 * uma única Reação. Assim o contrato dos Cutelos pode ser usado pelo fluxo de
 * defesa sem acoplar arma, ataque e dano em um novo pipeline paralelo.
 */

import { consumeSlayerActions } from './action-service.mjs';

function finiteNumber(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const value = Number(raw.trim().replace(',', '.'));
    return Number.isFinite(value) ? value : null;
}

function finiteAttribute(raw) {
    if (raw === null || raw === undefined || typeof raw === 'object') return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const text = String(raw)
        .replace(/<[^>]*>/gu, ' ')
        .replace(/&nbsp;|&#160;/giu, ' ')
        .trim()
        .replace(',', '.');
    if (!/^-?\d+(?:\.\d+)?$/u.test(text)) return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
}

function firstFiniteAttribute(...candidates) {
    for (const candidate of candidates) {
        const value = finiteAttribute(candidate);
        if (value !== null) return value;
    }
    return 0;
}

function itemsOf(actor) {
    const items = actor?.items;
    if (!items) return [];
    if (Array.isArray(items)) return items;
    if (typeof items.values === 'function') return [...items.values()];
    return [...items];
}

function mechanicsOf(item) {
    const raw = item?.system?.props?.arma_mecanicas;
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function cutelosParryForActor(actor, { weaponId = '' } = {}) {
    for (const item of itemsOf(actor)) {
        if (weaponId && item?.id !== weaponId && item?.uuid !== weaponId) continue;
        const mechanic = mechanicsOf(item).find(
            (entry) => entry?.id === 'aparar_corrente' && entry?.kind === 'reaction-parry'
        );
        if (mechanic) return { item, mechanic };
    }
    return null;
}

export function resolveCutelosParry({
    mechanic,
    hitTotal,
    incomingDamage,
    physical = false,
    targetKind,
    reductionAttribute,
    attributes = {},
} = {}) {
    if (!mechanic || mechanic.kind !== 'reaction-parry')
        return { ok: false, reason: 'missing-parry' };
    const allowedTargets = Array.isArray(mechanic.targets)
        ? mechanic.targets.map((target) => String(target).toLowerCase())
        : [];
    const normalizedTarget = String(targetKind ?? '').toLowerCase();
    if (!normalizedTarget || !allowedTargets.includes(normalizedTarget))
        return {
            ok: false,
            reason: 'invalid-parry-target',
            targetKind: normalizedTarget,
            allowedTargets,
        };
    if (mechanic.physicalOnly === true && physical !== true)
        return { ok: false, reason: 'physical-only' };

    const normalizedHitTotal = finiteNumber(hitTotal);
    if (normalizedHitTotal === null) return { ok: false, reason: 'invalid-hit-total' };
    const normalizedIncomingDamage = finiteNumber(incomingDamage);
    if (normalizedIncomingDamage === null || normalizedIncomingDamage < 0)
        return { ok: false, reason: 'invalid-incoming-damage' };

    const allowed = Array.isArray(mechanic.reduction?.attributes)
        ? mechanic.reduction.attributes.map((key) => String(key).toUpperCase())
        : [];
    const selected = String(reductionAttribute ?? '').toUpperCase();
    if (!allowed.includes(selected)) return { ok: false, reason: 'invalid-reduction-attribute' };

    const dc = Math.max(0, Math.trunc(Number(mechanic.hitDc) || 0));
    const damage = Math.trunc(normalizedIncomingDamage);
    const passed = normalizedHitTotal >= dc;
    const attributeValue = firstFiniteAttribute(
        attributes[selected.toLowerCase()],
        attributes[selected]
    );
    const multiplier = Number(mechanic.reduction?.multiplier);
    const reductionRolled = passed
        ? Math.max(
              0,
              Math.trunc(Number(mechanic.reduction?.fixed) || 0) +
                  Math.floor(attributeValue * (Number.isFinite(multiplier) ? multiplier : 1))
          )
        : 0;
    const reductionApplied = Math.min(damage, reductionRolled);
    return {
        ok: true,
        passed,
        dc,
        reductionAttribute: selected,
        reductionRolled,
        reductionApplied,
        remainingDamage: damage - reductionApplied,
    };
}

export async function useCutelosParry(
    actor,
    {
        weaponId = '',
        hitTotal,
        incomingDamage,
        physical = false,
        targetKind,
        reductionAttribute,
    } = {}
) {
    const source = cutelosParryForActor(actor, { weaponId });
    if (!source) return { ok: false, reason: 'missing-parry' };
    const allowedTargets = Array.isArray(source.mechanic.targets)
        ? source.mechanic.targets.map((target) => String(target).toLowerCase())
        : [];
    const normalizedTarget = String(targetKind ?? '').toLowerCase();
    if (!normalizedTarget || !allowedTargets.includes(normalizedTarget))
        return {
            ok: false,
            reason: 'invalid-parry-target',
            targetKind: normalizedTarget,
            allowedTargets,
        };
    if (source.mechanic.physicalOnly === true && physical !== true)
        return { ok: false, reason: 'physical-only' };

    const props = actor?.system?.props ?? {};
    const result = resolveCutelosParry({
        mechanic: source.mechanic,
        hitTotal,
        incomingDamage,
        physical,
        targetKind: normalizedTarget,
        reductionAttribute,
        attributes: {
            int: firstFiniteAttribute(
                props.int_display,
                props.atr_int_valor_config,
                props.atr_int_valor
            ),
            sab: firstFiniteAttribute(
                props.sab_display,
                props.atr_sab_valor_config,
                props.atr_sab_valor
            ),
        },
    });
    if (!result.ok) return result;

    const action = await consumeSlayerActions(actor, [source.mechanic.action || 'reacao'], {
        update: false,
    });
    if (!action.ok) return action;
    if (action.skipped === 'not-slayer' || Object.keys(action.patch ?? {}).length === 0)
        return { ok: false, reason: 'not-slayer' };

    await actor.update(action.patch, { naCsbAutomation: true, naActionEconomy: true });
    return { ...result, item: source.item, actionPatch: action.patch };
}
