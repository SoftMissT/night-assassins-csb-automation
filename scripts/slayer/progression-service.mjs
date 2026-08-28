import progressionCatalog from '../../catalogs/slayer/progression.json' with { type: 'json' };

const CLASS_RANK_ORDER = Object.freeze(['C', 'B', 'A', 'S', 'SS']);

function boundedLevel(raw) {
    const level = Math.trunc(Number(raw));
    if (!Number.isFinite(level) || level < 1 || level > 14)
        throw new RangeError('O nível Slayer deve estar entre 1 e 14.');
    return level;
}

function clone(value) {
    return structuredClone(value);
}

export function slayerProgressionAtLevel(rawLevel) {
    const level = boundedLevel(rawLevel);
    return { level, ...clone(progressionCatalog.levels[String(level)]) };
}

export function resolveSlayerProgression(rawLevel) {
    const level = boundedLevel(rawLevel);
    const milestones = [];
    for (let current = 1; current <= level; current += 1)
        milestones.push(slayerProgressionAtLevel(current));
    const current = milestones.at(-1);
    const unlockedEvents = milestones.flatMap((entry) =>
        entry.events.map((event) => ({ level: entry.level, event }))
    );
    const unlockedClassRanks = CLASS_RANK_ORDER.filter((rank) =>
        milestones.some((entry) => entry.classRank === rank)
    );
    return {
        level,
        rank: current.rank,
        breathingLevel: current.breathingLevel,
        classRank: unlockedClassRanks.at(-1) ?? null,
        unlockedClassRanks,
        unlockedEvents,
        milestones,
    };
}

export function progressionEventsBetween(fromRaw, toRaw) {
    const from = boundedLevel(fromRaw);
    const to = boundedLevel(toRaw);
    if (to <= from) return [];
    return resolveSlayerProgression(to).unlockedEvents.filter(({ level }) => level > from);
}
