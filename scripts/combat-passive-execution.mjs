import { MODULE_ID } from './constants.mjs';
import { actorWeapons } from './breath-passives.mjs';
import { actorKind } from './actor-kind.mjs';
import { resolveSheetAttribute } from './sheet-attributes.mjs';
import { parseStatusState } from './status-service.mjs';

export function maximizeDamageDice(formula, limit = Infinity) {
    let remaining = limit;
    // shortcut: canonical damage uses plain NdM; modified dice need native term splitting before support.
    return String(formula).replace(/\b(\d*)d(\d+)([a-zA-Z][a-zA-Z0-9<>=!]*)?/g, (match, count, faces, modifiers) => {
        if (remaining <= 0) return match;
        if (modifiers) throw new Error('Maximização automática exige dados simples, como 2d8.');
        const quantity = Number(count || 1);
        const maximum = Math.min(quantity, remaining);
        remaining -= maximum;
        const rest = quantity - maximum;
        return `(${maximum * Number(faces)}${rest ? ` + ${rest}d${faces}` : ''})`;
    });
}

async function resolveTarget(uuid) {
    const document = uuid ? await fromUuid(uuid) : null;
    return document?.actor ?? document ?? null;
}

async function showRoll(actor, formula, flavor) {
    const roll = await Roll.create(formula).evaluate();
    const message = await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
    const wait = globalThis.game?.dice3d?.waitFor3DAnimationByMessageID;
    if (message?.id && typeof wait === 'function') await wait.call(game.dice3d, message.id);
    return roll;
}

export async function executePassiveDamage(actor, plan) {
    if (!actor?.update || (!actor.isOwner && !game.user?.isGM)) return { executed: false };
    const target = await resolveTarget(plan.targetUuid);
    if (!target?.update) return { executed: false };
    const formula = String(plan.formula ?? plan.dado ?? '');
    if (!formula) return { executed: false };
    const label = plan.source ?? plan.label ?? 'Passiva de Respiração';
    const roll = await showRoll(actor, formula, label);
    let amount = Math.max(0, Math.trunc(Number(roll.total) || 0));
    let saved = false;
    if (plan.saveAttr && plan.saveDc > 0) {
        const value = resolveSheetAttribute(target, plan.saveAttr);
        if (value === null) throw new Error(`A ficha do alvo precisa de ${plan.saveAttr} para resistir.`);
        const save = await showRoll(target, `1d20 + (${value})`, `${label} · ${plan.saveAttr} CD ${plan.saveDc}`);
        saved = save.total >= plan.saveDc;
        if (saved && plan.halfOnSave !== false) amount = Math.floor(amount / 2);
    }
    const types = plan.types ?? plan.tiposDano ?? [];
    let damage;
    if (amount > 0) {
        const { applyOniDamage, applySlayerDamageAuto } = await import('./damage-relay.mjs');
        damage = await (actorKind(target) === 'slayer' ? applySlayerDamageAuto : applyOniDamage)(target, amount, {
            isAttack: plan.isAttack === true, attackName: label, sourceActorUuid: actor.uuid,
            damageTypes: types, components: [{ label, types, subtotal: amount }],
        });
    }
    if (!saved && plan.failedSaveCondition) {
        const { applyBreathingStatus } = await import('./breath-service.mjs');
        await applyBreathingStatus(target, plan.failedSaveCondition, { remainingTurns: 1, tick: 'end', sourceName: label });
    }
    return { executed: true, amount, saved, damage };
}

export async function executeCombatPassive(actor, plan = {}) {
    if (!actor?.update || (!actor.isOwner && !game.user?.isGM)) return { executed: false };
    const target = await resolveTarget(plan.targetUuid);
    if (plan.saveAttr === 'SAB' && Number.isFinite(plan.saveDc) && !plan.damageEntries) {
        const { rollTest } = await import('./roll-service.mjs');
        const result = await rollTest({ actor, attr: 'SAB', test: plan.label ?? 'Antecipação Cinestésica', forceDc: plan.saveDc });
        return result ? { executed: true, success: result.success } : { executed: false };
    }
    if (plan.cancelAdvantage) {
        if (!target) return { executed: false };
        await actor.setFlag(MODULE_ID, 'soundCancelAdvantage', { attackerUuid: target.uuid });
        return { executed: true };
    }
    if (plan.weaponRequired || plan.maximizeWeaponDice) {
        if (!actorWeapons(actor).length) {
            ui.notifications.warn('Escolha uma arma com perfil de ataque antes de usar esta técnica.');
            return { executed: false };
        }
    }
    const targets = target ? [{ actor: target }] : [...(game.user?.targets ?? [])].filter(token => token.actor);
    if (!targets.length) { ui.notifications.warn('Marque o alvo da técnica.'); return { executed: false }; }
    const { rollHit } = await import('./hit-service.mjs');
    const { resolveAutoDamage } = await import('./attack-follow-up.mjs');
    let executed = false;
    try {
        for (const token of targets) {
            const enemy = token.actor;
            const status = parseStatusState(enemy.system?.props?.status_slayer_dados ?? enemy.system?.props?.status_oni_dados);
            const blockReaction = plan.blockDefensiveReactionsWhen?.some(condition => status.active.includes(condition));
            if (blockReaction) await enemy.setFlag(MODULE_ID, 'passiveDefensiveReactionBlocked', { sourceUuid: actor.uuid });
            try {
                const hit = await rollHit({ actor, targets: new Set([token]), autoDamage: false,
                    skipActionConsumption: true, forceActionType: plan.actionType || 'ataque',
                    forceRollCount: plan.rollCount ?? 1, isTechnique: plan.kind !== 'nightcore',
                    advantage: plan.advantage === true, bonus: plan.hitBonus ?? 0,
                    noPassiveGeneration: plan.noPassiveGeneration === true, noContactEffects: plan.noContactEffects === true });
                if (!hit?.attempts?.length) return { executed, cancelled: !executed };
                executed = true;
                const entries = plan.damageEntries?.filter(entry => entry.requiresHit !== false) ?? [];
                await resolveAutoDamage({ actor, hitResult: hit, techniqueLabel: plan.label ?? 'A Última Mentira é a Verdade',
                    techniqueEntradas: entries, forceAttackDamage: true, passivePlan: plan,
                    targets: new Set([token]),
                    skipBreathingInjection: plan.noContactEffects === true || entries.length > 0 });
                for (const entry of plan.damageEntries?.filter(item => item.requiresHit === false) ?? [])
                    await executePassiveDamage(actor, { ...entry, targetUuid: enemy.uuid, label: plan.label,
                        failedSaveCondition: plan.failedSaveCondition });
                if (plan.extraDamage && typeof plan.extraDamage === 'object')
                    await executePassiveDamage(actor, { ...plan.extraDamage, targetUuid: enemy.uuid, label: plan.label });
            } finally {
                if (blockReaction) await enemy.unsetFlag(MODULE_ID, 'passiveDefensiveReactionBlocked');
            }
            if (plan.singleTarget) break;
        }
        return { executed };
    } catch (error) {
        if (!executed) throw error;
        ui.notifications.error(`A execução começou e houve uma falha. Os custos foram mantidos. ${error.message}`);
        return { executed: true, partial: true, error: error.message };
    }
}
