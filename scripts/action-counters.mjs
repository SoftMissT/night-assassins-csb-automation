// Contadores de ação compartilhados entre Slayer e Oni. As chaves de rodada diferem
// (Oni tem 'lendaria'), então cada serviço passa as suas.

export function emptyUses(keys) {
    return Object.fromEntries(keys.map((key) => [key, 0]));
}

export function createRequiredCounters(turnKeys, roundKeys) {
    return function requiredCounters(types) {
        const required = { turn: emptyUses(turnKeys), round: emptyUses(roundKeys) };
        for (const key of new Set(types.filter(Boolean))) {
            if (key === 'completa') {
                required.turn.movimento += 1;
                required.turn.ataque += 1;
            } else if (turnKeys.includes(key)) required.turn[key] += 1;
            else if (roundKeys.includes(key)) required.round[key] += 1;
        }
        return required;
    };
}
