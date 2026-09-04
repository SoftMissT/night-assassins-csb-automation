const MODULE_ID = 'night-assassins-csb-automation';
const api = game.modules.get(MODULE_ID)?.api;

if (!api?.awakenSpecialWeapon) {
    ui.notifications.error(
        'Night Assassins: Primeiro Despertar das Armas de Dupla Alma não está disponível.'
    );
    return;
}

const controlled = canvas?.ready ? (canvas.tokens?.controlled ?? []) : [];
if (controlled.length > 1) {
    ui.notifications.warn('Selecione somente um token.');
    return;
}

const actor = controlled[0]?.actor ?? game.user?.character ?? null;
if (!actor) {
    ui.notifications.warn(
        'Selecione o portador da Arma de Dupla Alma ou defina um personagem.'
    );
    return;
}

await api.awakenSpecialWeapon({ actor, actorUuid: actor.uuid });
