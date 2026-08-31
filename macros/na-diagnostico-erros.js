const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.openDiagnosticManager) {
    return ui.notifications.error(
        'Night Assassins CSB Automation não está ativo ou precisa ser atualizado.'
    );
}
if (!game.user?.isGM) return ui.notifications.warn('O Journal de diagnóstico é exclusivo do GM.');
await moduleApi.openDiagnosticManager();
return '';
