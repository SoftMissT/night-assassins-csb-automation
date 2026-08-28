const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.openStatusManager) {
    return ui.notifications.error(
        'Night Assassins CSB Automation não está ativo ou precisa ser atualizado.'
    );
}
const macroArgs = typeof scope !== 'undefined' ? (scope ?? {}) : {};
await moduleApi.openStatusManager({ actorUuid: macroArgs.actorUuid });
return '';
