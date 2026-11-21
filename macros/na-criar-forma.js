// Night Assassins Criar Forma de Respiração
(async () => {
    if (!game.user?.isGM)
        return ui.notifications.warn('O criador de Formas é exclusivo do GM.');

    const automation = game.modules.get('night-assassins-csb-automation');
    if (!automation?.active || typeof automation.api?.openFormCreator !== 'function') {
        return ui.notifications.error(
            'Ative ou atualize o módulo Night Assassins CSB Automation e recarregue o mundo.'
        );
    }

    return automation.api.openFormCreator();
})();
