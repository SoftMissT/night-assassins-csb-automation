const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.oni?.regenerate) {
    return ui.notifications.error(
        'Night Assassins CSB Automation não está ativo ou precisa ser atualizado.'
    );
}
const macroArgs = typeof scope !== 'undefined' ? (scope ?? {}) : {};
await moduleApi.oni.regenerate({ actorUuid: macroArgs.actorUuid });
return '';
