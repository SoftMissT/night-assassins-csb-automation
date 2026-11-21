import { MODULE_ID } from '../constants.mjs';
import { ruleVariant } from '../rules-profile.mjs';

export const MASTER_BATTLE_TACTICAL_INJURY = 'masterBattleTacticalInjury';

export function activeMasterBattleInjury(actor, combat = globalThis.game?.combat) {
    if (ruleVariant('classes') !== 'homebrew' || !combat?.started) return null;
    const injury = actor.getFlag?.(MODULE_ID, MASTER_BATTLE_TACTICAL_INJURY);
    if (!injury || injury.combatKey !== (combat.uuid ?? combat.id)) return null;
    if (injury.id === 'open-guard') return injury;
    if (injury.id !== 'tendon' || !injury.expiresAt) return null;
    const expiry = injury.expiresAt;
    if (combat.round > expiry.round || (combat.round === expiry.round && combat.turn > expiry.turn)) return null;
    return injury;
}

export function masterBattleTendonPenalty(actor) {
    return activeMasterBattleInjury(actor)?.id === 'tendon' ? 1.5 : 0;
}
