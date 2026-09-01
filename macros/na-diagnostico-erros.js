const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.openDiagnosticManager) {
    ui.notifications.error(
        'Night Assassins CSB Automation não está ativo ou precisa ser atualizado.'
    );
    return '';
}
if (!game.user?.isGM) {
    ui.notifications.warn('O Journal de diagnóstico é exclusivo do GM.');
    return '';
}
try {
    await moduleApi.openDiagnosticManager();
} catch (error) {
    console.error('[NA-DIAGNOSTIC] Falha ao abrir ou exportar o Journal.', error);
    ui.notifications.error(error?.message || 'Falha no Journal de diagnóstico.');
}
return '';
