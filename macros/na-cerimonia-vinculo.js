const MODULE_ID =
    'night-assassins-csb-automation';

const api =
    game.modules
        .get(MODULE_ID)
        ?.api;

if (
    !api
        ?.openDualSoulCeremony
) {
    ui.notifications.error(
        'Night Assassins: Dual Soul Core não está disponível.'
    );

    return;
}

const actor =
    (
        canvas?.ready
            ? canvas
                ?.tokens
                ?.controlled
                ?.[0]
                ?.actor
            : null
    ) ??
    game.user?.character ??
    null;

if (!actor) {
    ui.notifications.warn(
        'Selecione o token do portador ou defina um personagem.'
    );

    return;
}

await api.openDualSoulCeremony({
    actor,
    actorUuid:
        actor.uuid,
});
