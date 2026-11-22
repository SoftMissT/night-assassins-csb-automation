// Night Assassins Atualizar Fichas
// Leva os templates do Compêndio do módulo para o mundo e recarrega as fichas e itens que os usam.
(async () => {
    if (!game.user?.isGM)
        return ui.notifications.warn('Atualizar as fichas é exclusivo do GM.');

    const automation = game.modules.get('night-assassins-csb-automation');
    if (!automation?.active || typeof automation.api?.syncWorldTemplates !== 'function') {
        return ui.notifications.error(
            'Ative ou atualize o módulo Night Assassins CSB Automation e recarregue o mundo.'
        );
    }

    return automation.api.syncWorldTemplates({ confirm: true });
})();
