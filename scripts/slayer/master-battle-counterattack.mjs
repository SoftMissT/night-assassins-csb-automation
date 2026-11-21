import { consumeSlayerActions } from '../action-service.mjs';
import { actorKind } from '../actor-kind.mjs';
import { actorWeapons } from '../breath-passives.mjs';
import { MODULE_ID } from '../constants.mjs';
import { parseNumber } from '../parsing.mjs';
import { ruleVariant, vanillaRuleSelection } from '../rules-profile.mjs';
import { getDamageStatusEffects, isReactionBlocked } from '../status-effects.mjs';
import { parseStatusState, statusKeysForProps } from '../status-service.mjs';
import { masterBattleBenefits, masterBattleCounterattackPlan } from './master-battle-rules.mjs';

export const MASTER_BATTLE_COUNTERATTACK = Symbol('Mestre de Batalha: Contra-ataque');
const USED = 'masterBattleCounterattackRound';
const pending = new WeakSet();
const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function distanceBetween(actor, attacker) {
    const source = actor.token?.object ?? actor.getActiveTokens?.()[0];
    const target = attacker.token?.object ?? attacker.getActiveTokens?.()[0];
    return source?.center && target?.center
        ? globalThis.canvas?.grid?.measurePath?.([source.center, target.center])?.distance : null;
}

function weaponChoices(actor, attacker) {
    const distance = distanceBetween(actor, attacker);
    if (!Number.isFinite(distance)) return [];
    const items = [...(actor.items ?? [])];
    const reachBonus = ruleVariant('metal') === 'vanilla'
        ? vanillaRuleSelection(actor.system.props, 'metal')?.weaponReach ?? 0 : 0;
    return [...new Map(actorWeapons(actor)
        .filter(weapon => {
            const item = items.find(entry => entry.id === weapon.id);
            const reach = parseNumber(item?.system?.props?.arma_alcance);
            return weapon.proficient && reach > 0 && distance <= reach + reachBonus;
        })
        .map(weapon => [weapon.id, weapon])).values()];
}

function counterattackContext(actor, attacker, weapons, { enemyMissed, melee }) {
    const props = actor.system.props;
    const combat = globalThis.game?.combat;
    const combatId = combat?.uuid ?? combat?.id;
    if (!combat?.started || !combatId || combat.combatant?.actor?.uuid !== attacker?.uuid) return null;
    const benefits = masterBattleBenefits(props);
    return masterBattleCounterattackPlan(benefits, {
        roundKey: `${combatId}:${combat.round}`, usedRoundKey: actor.getFlag?.(MODULE_ID, USED),
        enemyMissed, isMelee: melee, inReach: weapons.length > 0, isProficient: weapons.length > 0,
        canReact: benefits?.profile === 'vanilla' || !isReactionBlocked(props),
        canAttack: !getDamageStatusEffects(props).blocked,
        statuses: parseStatusState(props[statusKeysForProps(props).data]).active,
    });
}

export async function offerMasterBattleCounterattack(actor, attacker, trigger = {}) {
    if (actorKind(actor) !== 'slayer' || !attacker || actor.uuid === attacker.uuid ||
        (!actor.isOwner && !globalThis.game?.user?.isGM) || pending.has(actor) ||
        !trigger.enemyMissed || !trigger.melee || !masterBattleBenefits(actor.system?.props)?.counterattack)
        return null;
    const weapons = weaponChoices(actor, attacker);
    const plan = counterattackContext(actor, attacker, weapons, trigger);
    if (!plan) return null;
    if (plan.action && !(await consumeSlayerActions(actor, [plan.action], { update: false })).ok) return null;
    pending.add(actor);
    try {
        const weaponId = await foundry.applications.api.DialogV2.wait({
            window: { title: 'Contra-ataque · Mestre de Batalha' },
            content: `<p>O atacante errou em alcance corpo a corpo. O contra-ataque acerta com 17+ ${plan.roll === 'natural' ? 'no dado' : 'no resultado'}.</p>
                <label>Arma proficiente <select name="weapon">${weapons.map(weapon =>
                `<option value="${escapeHtml(weapon.id)}">${escapeHtml(weapon.name)}</option>`).join('')}</select></label>`,
            buttons: [
                { action: 'counter', label: 'Contra-atacar', callback: (_event, button) => button.form.elements.weapon.value },
                { action: 'cancel', label: 'Dispensar', callback: () => null },
            ],
            rejectClose: false,
        });
        const available = weaponChoices(actor, attacker);
        if (!weaponId || !available.some(weapon => weapon.id === weaponId)) return null;
        const livePlan = counterattackContext(actor, attacker, available, trigger);
        if (!livePlan || livePlan.roundKey !== plan.roundKey) return null;
        const targets = new Set([{ actor: attacker }]);
        const { rollHit } = await import('../hit-service.mjs');
        const hit = await rollHit({ actor, targets, forceRollCount: 1, requiredWeaponId: weaponId,
            forceActionType: livePlan.action ?? 'ataque', skipActionConsumption: true,
            noPassiveGeneration: true, autoDamage: false, [MASTER_BATTLE_COUNTERATTACK]: livePlan });
        if (!hit?.attempts?.length) return null;
        const action = livePlan.action ? await consumeSlayerActions(actor, [livePlan.action], { update: false }) : { ok: true, patch: {} };
        if (!action.ok) return null;
        await actor.update({ ...action.patch, [`flags.${MODULE_ID}.${USED}`]: livePlan.roundKey }, { naCsbAutomation: true });
        if (hit.hits > 0) {
            const { resolveAutoDamage } = await import('../attack-follow-up.mjs');
            await resolveAutoDamage({ actor, hitResult: hit, techniqueLabel: 'Contra-ataque',
                classBasicAttack: true, skipBreathingInjection: true, targets });
        }
        return hit;
    } finally {
        pending.delete(actor);
    }
}
