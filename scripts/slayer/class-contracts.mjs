import classCatalog from '../../catalogs/slayer/classes.json' with { type: 'json' };
import { actorKind } from '../actor-kind.mjs';
import { parseLevel } from '../parsing.mjs';
import { ruleVariant, vanillaClassRank, vanillaRuleCatalog, vanillaRuleSelection } from '../rules-profile.mjs';

const RANK_ORDER = Object.freeze(['C', 'B', 'A', 'S', 'SS']);

function classDefinition(key, profile) {
    const classes = profile === 'vanilla' ? vanillaRuleCatalog('class') : classCatalog.classes;
    const definition = Object.hasOwn(classes, key) ? classes[key] : null;
    if (!definition) throw new RangeError(`Classe Slayer desconhecida: ${String(key ?? '')}`);
    return definition;
}

export function selectedSlayerClassKey(props = {}, profile = ruleVariant('classes')) {
    if (profile === 'vanilla') return vanillaRuleSelection(props, 'class', 'slayer')?.key ?? null;
    const key = String(props.classe_escolhida ?? props.classKey ?? '');
    return Object.hasOwn(classCatalog.classes, key) ? key : null;
}

export function slayerClassContract(key, profile = ruleVariant('classes')) {
    return structuredClone(classDefinition(key, profile));
}

export function classUnlocksAtLevel(key, rawLevel, profile = ruleVariant('classes')) {
    const level = Math.max(0, parseLevel(rawLevel));
    const definition = classDefinition(key, profile);
    return RANK_ORDER.filter((rank) => definition.ranks?.[rank] && classCatalog.rankLevels[rank] <= level).map((rank) => ({
        rank,
        level: classCatalog.rankLevels[rank],
        ...structuredClone(definition.ranks[rank]),
    }));
}

/** Nível de classe da ficha: NPC prefere npc_nivel; Slayer usa nvl_num/nvl_pj. */
export function classLevel(props = {}) {
    if (actorKind({ system: { props } }) === 'npc')
        return props.npc_nivel ?? props.nvl_num ?? props.nvl_pj;
    return props.nvl_num ?? props.npc_nivel ?? props.nvl_pj;
}

export function classRankAtLevel(rawLevel, profile = ruleVariant('classes')) {
    if (profile === 'vanilla') return vanillaClassRank(rawLevel);
    const level = Math.max(0, parseLevel(rawLevel));
    return RANK_ORDER.filter((rank) => classCatalog.rankLevels[rank] <= level).at(-1) ?? null;
}

export function allSlayerClassKeys(profile = ruleVariant('classes')) {
    return Object.keys(profile === 'vanilla' ? vanillaRuleCatalog('class') : classCatalog.classes);
}

export function masterBattleLevelElevenPlan(props = {}, profile = ruleVariant('classes')) {
    const alreadyApplied = Number(props.slayer_class_mb_corpo_guerra_applied) > 0;
    const rankS = classDefinition('classe_mb', profile).ranks.S;
    return {
        eligible:
            parseLevel(props.nvl_num ?? props.npc_nivel ?? props.nvl_pj ?? props.level) >= 11 &&
            selectedSlayerClassKey(props, profile) === 'classe_mb',
        permanentPdv: alreadyApplied
            ? null
            : {
                  formula: rankS.pdvMaximumFormula ?? rankS.permanent?.pdvMaximumFormula,
                  once: true,
                  stateKey: 'slayer_class_mb_corpo_guerra_applied',
              },
        parry: structuredClone(rankS.parry),
    };
}

export function validateClassContract(key, profile = ruleVariant('classes')) {
    const definition = classDefinition(key, profile);
    if (profile === 'vanilla') {
        const ranks = RANK_ORDER.filter(rank => definition.ranks?.[rank]);
        return { valid: definition.secondaryLevels?.length === 4 || ranks.length === RANK_ORDER.length, ranks };
    }
    const present = RANK_ORDER.filter((rank) => definition.ranks[rank]?.id);
    return { valid: present.length === RANK_ORDER.length, ranks: present };
}
