const scopeArgs = typeof scope === 'object' && scope ? scope : {};
const actorUuid = scopeArgs.actorUuid ?? null;
const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;

if (!moduleApi?.openRecoveryManager) {
    ui.notifications.error('Night Assassins — atualize e ative o módulo para usar a Respiração da Recuperação.');
    return '';
}

try {
    await moduleApi.openRecoveryManager({ actorUuid });
} catch (error) {
    ui.notifications.error(error?.message || 'Falha ao usar a Respiração da Recuperação.');
}
return '';
