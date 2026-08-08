(async () => {
  const t0 = performance.now();
  if (!canvas.ready) return ui.notifications.warn('Canvas não pronto.');
  if (!game.user?.isGM) return ui.notifications.error('Somente o GM pode abrir o Controle dos Caçadores.');

  const automationModule = game.modules.get('night-assassins-csb-automation');
  if (!automationModule?.active || typeof automationModule.api?.openGmDashboard !== 'function') {
    return ui.notifications.error('Ative ou atualize o módulo Night Assassins CSB Automation e recarregue o mundo.');
  }

  await automationModule.api.openGmDashboard();
  if (typeof args !== 'undefined' && args?.debug === true) console.log(`[TANG-ROU] Controle GM aberto em ${(performance.now() - t0).toFixed(2)}ms`);
})();
