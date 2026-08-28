import specCatalog from '../../catalogs/oni-specializations.json' with { type: 'json' };

const SPECS_BY_ID = new Map(specCatalog.specializations.map((s) => [s.id, Object.freeze(s)]));
const RANK_BANDS = Object.freeze(specCatalog.rankBands);

function integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export const SPECIALIZATION_IDS = Object.freeze([...SPECS_BY_ID.keys()]);

export function getSpecialization(id) {
    return (
        SPECS_BY_ID.get(
            String(id ?? '')
                .trim()
                .toLocaleLowerCase('pt-BR')
        ) ?? null
    );
}

export function specializationRank(level) {
    const lvl = integer(level, 1);
    for (const [rank, [min, max]] of Object.entries(RANK_BANDS)) {
        if (lvl >= min && lvl <= max) return rank;
    }
    return lvl >= 20 ? 'SS' : 'D';
}

export function specializationAbilities(id, level) {
    const spec = getSpecialization(id);
    if (!spec) return [];
    const lvl = Math.max(1, Math.min(20, integer(level, 1)));
    const abilities = [];
    for (let l = 1; l <= lvl; l++) {
        const entry = spec.levels[String(l)];
        if (entry) {
            abilities.push(
                Object.freeze({
                    level: l,
                    rank: specializationRank(l),
                    name: entry.name,
                    effect: entry.effect,
                })
            );
        }
    }
    return Object.freeze(abilities);
}

export function specializationAbilityAt(id, level) {
    const spec = getSpecialization(id);
    if (!spec) return null;
    const lvl = Math.max(1, Math.min(20, integer(level, 1)));
    const entry = spec.levels[String(lvl)];
    if (!entry) return null;
    return Object.freeze({
        level: lvl,
        rank: specializationRank(lvl),
        name: entry.name,
        effect: entry.effect,
    });
}

export function specializationRankGainedAt(id, rank) {
    const spec = getSpecialization(id);
    if (!spec) return null;
    const band = RANK_BANDS[rank];
    if (!band) return null;
    return Object.freeze({ rank, minLevel: band[0], maxLevel: band[1] });
}

export function specializationSummary(id, level) {
    const spec = getSpecialization(id);
    if (!spec) return null;
    const rank = specializationRank(level);
    const abilities = specializationAbilities(id, level);
    return Object.freeze({
        id: spec.id,
        name: spec.name,
        function: spec.function,
        primaryAttributes: spec.primaryAttributes,
        rank,
        level: Math.max(1, Math.min(20, integer(level, 1))),
        abilityCount: abilities.length,
        currentAbility: abilities[abilities.length - 1] ?? null,
    });
}
