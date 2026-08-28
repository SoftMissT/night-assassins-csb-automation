import classCatalog from '../../catalogs/slayer/classes.json' with { type: 'json' };

const RANK_ORDER = Object.freeze(['C', 'B', 'A', 'S', 'SS']);

function classDefinition(key) {
    const definition = classCatalog.classes[String(key ?? '')];
    if (!definition) throw new RangeError(`Classe Slayer desconhecida: ${String(key ?? '')}`);
    return definition;
}

export function slayerClassContract(key) {
    return structuredClone(classDefinition(key));
}

export function classUnlocksAtLevel(key, rawLevel) {
    const level = Math.max(0, Math.trunc(Number(rawLevel)) || 0);
    const definition = classDefinition(key);
    return RANK_ORDER.filter((rank) => classCatalog.rankLevels[rank] <= level).map((rank) => ({
        rank,
        level: classCatalog.rankLevels[rank],
        ...structuredClone(definition.ranks[rank]),
    }));
}

export function classRankAtLevel(rawLevel) {
    const level = Math.max(0, Math.trunc(Number(rawLevel)) || 0);
    return RANK_ORDER.filter((rank) => classCatalog.rankLevels[rank] <= level).at(-1) ?? null;
}

export function allSlayerClassKeys() {
    return Object.keys(classCatalog.classes);
}

export function masterBattleLevelElevenPlan(props = {}) {
    const alreadyApplied = Number(props.slayer_class_mb_corpo_guerra_applied) > 0;
    const rankS = classDefinition('classe_mb').ranks.S;
    return {
        eligible:
            Math.trunc(Number(props.nvl_num ?? props.level)) >= 11 &&
            String(props.classe_escolhida ?? props.classKey) === 'classe_mb',
        permanentPdv: alreadyApplied
            ? null
            : {
                  formula: rankS.permanent.pdvMaximumFormula,
                  once: true,
                  stateKey: rankS.permanent.stateKey,
              },
        parry: structuredClone(rankS.parry),
    };
}

export function validateClassContract(key) {
    const definition = classDefinition(key);
    const present = RANK_ORDER.filter((rank) => definition.ranks[rank]?.id);
    return { valid: present.length === RANK_ORDER.length, ranks: present };
}
