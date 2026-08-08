const scopeArgs = typeof scope === "object" && scope ? scope : {};
const actorUuid = scopeArgs.actorUuid ?? null;
const moduleApi = game.modules.get("night-assassins-csb-automation")?.api;

if (!moduleApi?.openRestManager) {
  ui.notifications.error("Night Assassins — atualize e ative o módulo para usar o Descanso.");
  return "";
}

try {
  await moduleApi.openRestManager({ actorUuid });
} catch (error) {
  ui.notifications.error(error?.message || "Falha ao gerenciar o descanso.");
}
return "";
