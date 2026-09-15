const input = typeof scope === 'object' && scope ? scope : {};
const api = game.modules.get('night-assassins-csb-automation')?.api;

if (!api?.openBreathingManager) {
    ui.notifications.error('Night Assassins — atualize e ative o módulo para usar a Respiração das Chamas.');
    return '';
}

await api.openBreathingManager({
    actorUuid: input.actorUuid ?? null,
    breathingName: 'Chamas',
});
return '';
