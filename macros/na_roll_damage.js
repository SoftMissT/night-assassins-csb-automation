const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.rollDamage) {
    ui.notifications.error(
        'Night Assassins CSB Automation não está ativo ou precisa ser atualizado.'
    );
    return '';
}
const macroArgs = typeof scope !== 'undefined' ? (scope ?? {}) : {};
await moduleApi.rollDamage({
    actorUuid: macroArgs.actorUuid,
    builder: true,
});
return '';
