import { actorKind } from '../actor-kind.mjs';
import { MODULE_ID } from '../constants.mjs';
import { resolveSheetAttribute } from '../sheet-attributes.mjs';
import { ruleVariant } from '../rules-profile.mjs';
import { isReactionBlocked } from '../status-effects.mjs';
import { parseStatusState } from '../status-service.mjs';
import { masterBattleBenefits, masterBattleParryPlan, resolveMasterBattleParry } from './master-battle-rules.mjs';

const USED = 'masterBattleParryRound';
export const MASTER_BATTLE_PARRY_GUARD = 'masterBattleParryGuard';
const physicalTypes = new Set(['cortante', 'perfurante', 'concussao']);
const pending = new WeakSet();

export function prepareMasterBattleParry(actor, damage, context) {
    if (actorKind(actor) !== 'slayer' || (!actor.isOwner && !globalThis.game?.user?.isGM) ||
        context.isAttack !== true || !context.sourceActorUuid || context.isArea === true || pending.has(actor) || damage <= 0)
        return null;
    const benefits = masterBattleBenefits(actor.system?.props);
    if (!benefits?.parry) return null;
    const types = new Set([...(context.damageTypes ?? []), ...(context.components ?? []).flatMap(entry => entry.types ?? [])]);
    if (types.size === 0 || [...types].some(type => !physicalTypes.has(type))) return null;
    const combat = globalThis.game?.combat;
    const combatKey = combat?.uuid ?? combat?.id;
    const attackerIndex = combat?.turns?.findIndex(entry => entry.actor?.uuid === context.sourceActorUuid) ?? -1;
    const attacker = combat?.turns?.[attackerIndex]?.actor;
    if (!combat?.started || !combatKey || !attacker || attacker.uuid === actor.uuid) return null;
    const roundKey = `${combatKey}:${combat.round}`;
    const resolve = attribute => {
        const props = actor.system.props;
        return masterBattleParryPlan(masterBattleBenefits(props), {
            roundKey, usedRoundKey: actor.getFlag?.(MODULE_ID, USED),
            isPhysical: true, isMelee: true, canReact: !isReactionBlocked(props), damage,
            statuses: parseStatusState(props.status_slayer_dados).active, attribute,
            attributeValue: resolveSheetAttribute(actor, attribute.toLowerCase()),
        });
    };
    if (!resolve('FOR') && !resolve('DEX')) return null;

    pending.add(actor);
    return (async () => {
      try {
        const attribute = await foundry.applications.api.DialogV2.wait({
            window: { title: 'Aparar Instintivo' },
            content: '<p>O golpe físico foi corpo a corpo, sem área? Aplique 1d6 + FOR ou DEX, conforme a arma ou defesa. Uso único nesta rodada e sem gastar Reação.</p>',
            buttons: [
                { action: 'strength', label: 'Aparar com FOR', callback: () => 'FOR' },
                { action: 'dexterity', label: 'Aparar com DEX', callback: () => 'DEX' },
                { action: 'cancel', label: 'Não aparar', callback: () => null },
            ],
            rejectClose: false,
        });
        const liveCombat = globalThis.game?.combat;
        if (!['FOR', 'DEX'].includes(attribute) || (liveCombat?.uuid ?? liveCombat?.id) !== combatKey ||
            `${combatKey}:${liveCombat.round}` !== roundKey) return null;
        const plan = resolve(attribute);
        if (!plan) return null;
        const roll = await Roll.create(plan.formula).evaluate();
        const guard = attacker.setFlag && (attacker.isOwner || globalThis.game?.user?.isGM)
            ? { attacker, combatKey, expiresAt: { round: combat.round + Number(attackerIndex <= combat.turn), turn: attackerIndex } }
            : null;
        return { roll, attribute, plan, roundKey, guard };
      } finally {
        pending.delete(actor);
      }
    })();
}

export function resolvePreparedMasterBattleParry(prepared, damage) {
    if (!prepared) return null;
    const result = resolveMasterBattleParry(prepared.plan, damage, Number(prepared.roll.total));
    if (!result) return null;
    return { ...result, roll: prepared.roll, attribute: prepared.attribute,
        patch: { [`flags.${MODULE_ID}.${USED}`]: prepared.roundKey },
        guard: result.perfectParry ? prepared.guard : null };
}

export function activeMasterBattleParryGuard(actor) {
    if (ruleVariant('classes') !== 'homebrew') return null;
    const combat = globalThis.game?.combat;
    const state = actor.getFlag?.(MODULE_ID, MASTER_BATTLE_PARRY_GUARD);
    if (!combat?.started || !state?.expiresAt || state.combatKey !== (combat.uuid ?? combat.id)) return null;
    const expiry = state.expiresAt;
    if (combat.round > expiry.round || (combat.round === expiry.round && combat.turn >= expiry.turn)) return null;
    return state;
}
