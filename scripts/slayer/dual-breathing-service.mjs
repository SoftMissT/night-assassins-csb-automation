import { actorKind } from '../actor-kind.mjs';
import { breathingPdvInfo } from '../actor-resources.mjs';
import { chosenBreathing, formsForBreathing, RESP_CHOICE_TO_BREATHING } from '../breathing-choice.mjs';
import { canonicalBreathing } from '../breathing-contract.mjs';
import { MODULE_ID } from '../constants.mjs';
import { flameTurnKey } from '../flame-breathing-service.mjs';
import { parseNumber } from '../parsing.mjs';
import { ruleVariant } from '../rules-profile.mjs';
import { selectedSlayerClassKey } from './class-contracts.mjs';
import { dualBreathingSecondaryPlan } from './class-runtime.mjs';

const CLASS_KEY = 'classe_usuario_de_duas_resp';
const TURN_FLAG = 'dualBreathingTurn';
// Descendências e sinergias entre Respirações do módulo (Beginning Hour, p. 10–11).
const VANILLA_COMPATIBLE_PAIRS = [
    ['Água', 'Neve'],
    ['Pedra', 'Metal'],
    ['Vento', 'Névoa'],
];

function configuredSecondary(actor) {
    if (!['slayer', 'npc'].includes(actorKind(actor))) return null;
    const props = actor.system.props;
    const secondary = RESP_CHOICE_TO_BREATHING[props.resp_slayer_display_2];
    return secondary && secondary !== chosenBreathing(props) ? secondary : null;
}

export function secondaryBreathingForActor(actor) {
    return selectedSlayerClassKey(actor?.system?.props) === CLASS_KEY ? configuredSecondary(actor) : null;
}

export function formsForActorBreathings(items, actor) {
    const primary = chosenBreathing(actor?.system?.props ?? {});
    const secondary = secondaryBreathingForActor(actor);
    return secondary && primary
        ? [...formsForBreathing(items, primary), ...formsForBreathing(items, secondary)]
        : formsForBreathing(items, primary);
}

export function secondaryBreathingUse(actor, breathing, combat = globalThis.game?.combat, { deferTurnLimit = false } = {}) {
    const secondary = configuredSecondary(actor);
    if (!secondary || canonicalBreathing(breathing) !== secondary) return null;
    const props = actor.system.props;
    const profile = ruleVariant('classes');
    const fail = reason => ({ ok: false, reason });
    if (selectedSlayerClassKey(props, profile) !== CLASS_KEY)
        return fail('A Respiração Secundária exige a classe Usuário de Duas Respirações.');
    const primary = chosenBreathing(props);
    if (!primary) return fail('Escolha a Respiração Primária na ficha antes de usar a Secundária.');
    const compatibility = props.slayer_class_duas_resp_compatibility;
    const knownSynergy = profile === 'vanilla' && VANILLA_COMPATIBLE_PAIRS.some(pair =>
        pair.includes(primary) && pair.includes(secondary));
    if (profile !== 'vanilla' && !['compatible', 'incompatible'].includes(compatibility))
        return fail('O mestre precisa classificar a compatibilidade entre as duas Respirações.');
    const { level, cost } = dualBreathingSecondaryPlan(
        props.nvl_num ?? props.npc_nivel ?? props.nvl_pj,
        knownSynergy || compatibility === 'compatible',
        profile,
    );
    if (!level) return fail('A Respiração Secundária é liberada no nível 2 de personagem.');
    const turnKey = profile === 'homebrew' ? flameTurnKey(combat) : null;
    if (!deferTurnLimit && turnKey && (actor.getFlag?.(MODULE_ID, TURN_FLAG) ?? actor.flags?.[MODULE_ID]?.[TURN_FLAG]) === turnKey)
        return fail('A Respiração Secundária já foi usada neste turno.');
    if (cost.pdv && breathingPdvInfo(props).pdvCurrent < cost.pdv)
        return fail(`A Respiração Secundária exige ${cost.pdv} PDV disponíveis.`);
    const patch = {};
    if (turnKey) patch[`flags.${MODULE_ID}.${TURN_FLAG}`] = turnKey;
    if (cost.pdv) {
        const key = actorKind(actor) === 'npc' ? 'npc_pdv_dano' : 'pdv_slayer_dano_tomado';
        patch[`system.props.${key}`] = parseNumber(props[key]) + cost.pdv;
    }
    return { ok: true, level, cost, patch, turnKey, primary };
}
