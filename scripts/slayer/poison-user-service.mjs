export const USER_POISON_STATE_KEY = 'slayer_veneno_usuario_estado';

function integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function parseUserPoisonState(raw) {
    let source = raw;
    if (typeof raw === 'string' && raw.trim()) {
        try {
            source = JSON.parse(raw);
        } catch {
            source = {};
        }
    }
    const instances = Array.isArray(source?.instances)
        ? source.instances
              .map((entry) => ({
                  sourceActorUuid: String(entry?.sourceActorUuid ?? ''),
                  damage: Math.max(0, integer(entry?.damage)),
                  remainingTurns: Math.max(0, integer(entry?.remainingTurns)),
                  rank: String(entry?.rank ?? 'C'),
              }))
              .filter((entry) => entry.sourceActorUuid && entry.damage > 0 && entry.remainingTurns > 0)
        : [];
    return {
        instances,
        lastContactActionBySource:
            source?.lastContactActionBySource && typeof source.lastContactActionBySource === 'object'
                ? { ...source.lastContactActionBySource }
                : {},
        healingSuppressed: source?.healingSuppressed === true,
        toxicWound: source?.toxicWound === true,
        resistancePenalty: Math.min(0, integer(source?.resistancePenalty)),
    };
}

export function userPoisonStatePatch(state) {
    return { [`system.props.${USER_POISON_STATE_KEY}`]: JSON.stringify(state) };
}

export function applyUserPoison(rawState, options = {}) {
    const state = parseUserPoisonState(rawState);
    const sourceActorUuid = String(options.sourceActorUuid ?? '');
    const rank = String(options.rank ?? 'C');
    const actionId = String(options.actionId ?? '');
    if (!sourceActorUuid || options.immune === true)
        return { applied: false, reason: options.immune ? 'immune' : 'missing-source', state };

    const contact = !['S', 'SS'].includes(rank);
    if (contact && actionId && state.lastContactActionBySource[sourceActorUuid] === actionId)
        return { applied: false, reason: 'contact-already-applied', state };

    const damage = Math.max(0, integer(options.carisma)) + (rank === 'C' ? 0 : 2);
    const remainingTurns = rank === 'C' ? 2 : 3;
    const instance = { sourceActorUuid, damage, remainingTurns, rank };
    const own = state.instances.filter((entry) => entry.sourceActorUuid === sourceActorUuid);
    const other = state.instances.filter((entry) => entry.sourceActorUuid !== sourceActorUuid);

    if (contact) {
        state.instances = [...other, instance];
        if (actionId) state.lastContactActionBySource[sourceActorUuid] = actionId;
    } else if (own.length < 3) {
        state.instances = [...state.instances, instance];
    } else {
        const shortest = own.reduce((best, entry) =>
            entry.remainingTurns < best.remainingTurns ? entry : best
        );
        let replaced = false;
        state.instances = state.instances.map((entry) => {
            if (!replaced && entry === shortest) {
                replaced = true;
                return instance;
            }
            return entry;
        });
    }
    state.resistancePenalty = ['B', 'A', 'S', 'SS'].includes(rank) ? -1 : 0;
    return { applied: true, reason: '', state };
}

export function tickUserPoison(rawState) {
    const state = parseUserPoisonState(rawState);
    const activeAtStart = [...state.instances];
    const damage = activeAtStart.reduce((sum, entry) => sum + entry.damage, 0);
    state.healingSuppressed = activeAtStart.some((entry) => entry.rank === 'SS');
    state.toxicWound = activeAtStart.filter((entry) => entry.rank === 'SS').length >= 3;
    state.instances = activeAtStart
        .map((entry) => ({ ...entry, remainingTurns: entry.remainingTurns - 1 }))
        .filter((entry) => entry.remainingTurns > 0);
    if (state.instances.length === 0) state.resistancePenalty = 0;
    return { damage, state };
}

export function userPoisonHealingAmount(rawState, amount) {
    const state = parseUserPoisonState(rawState);
    const requested = Math.max(0, integer(amount));
    return state.healingSuppressed ? Math.ceil(requested / 2) : requested;
}
