// Resolução de ator compartilhada. Duas políticas distintas, de propósito:
//  - resolveActorLoose: aceita qualquer ator com update() e usa o primeiro token controlado.
//  - resolveActorStrict: exige documentName === 'Actor' e devolve null com mais de um token controlado.
// Os globais (fromUuid, canvas, game) são lidos em tempo de chamada, para os mocks dos testes funcionarem.

export async function resolveActorLoose(options) {
    if (options.actor && typeof options.actor.update === 'function') return options.actor;
    if (options.actorUuid) {
        const doc = await fromUuid(options.actorUuid);
        return doc?.actor ?? doc ?? null;
    }
    const controlled = canvas?.tokens?.controlled;
    if (controlled?.length > 0) return controlled[0].actor;
    return game?.user?.character ?? null;
}

export async function resolveActorStrict(options = {}) {
    if (options.actor?.documentName === 'Actor') {
        return options.actor;
    }
    if (options.actorUuid) {
        const document = await fromUuid(options.actorUuid);
        const actor = document?.actor ?? document;
        if (actor?.documentName === 'Actor') {
            return actor;
        }
    }
    const controlled = canvas?.tokens?.controlled ?? [];
    if (controlled.length === 1) {
        return controlled[0]?.actor ?? null;
    }
    if (controlled.length > 1) {
        return null;
    }
    return game.user?.character ?? null;
}
