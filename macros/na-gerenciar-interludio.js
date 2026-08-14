const scopeArgs = typeof scope === "object" && scope ? scope : {};
const moduleApi = game.modules.get("night-assassins-csb-automation")?.api;
if (!moduleApi?.openInterludeManager) {
  ui.notifications.error("Night Assassins — atualize e ative o modulo para usar Interludios.");
  return "";
}
try {
  await moduleApi.openInterludeManager({ actorUuid: scopeArgs.actorUuid ?? null });
} catch (error) {
  ui.notifications.error(error?.message || "Falha ao gerenciar o Interludio.");
}
return "";
