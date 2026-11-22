// Night Assassins Criar Arma Especial
(async () => {
    if (!game.user?.isGM)
        return ui.notifications.warn('O criador de Armas Especiais é exclusivo do GM.');

    const automation = game.modules.get('night-assassins-csb-automation');
    if (!automation?.active || typeof automation.api?.openSpecialWeaponCreator !== 'function') {
        return ui.notifications.error(
            'Ative ou atualize o módulo Night Assassins CSB Automation e recarregue o mundo.'
        );
    }

    return automation.api.openSpecialWeaponCreator();
})();
