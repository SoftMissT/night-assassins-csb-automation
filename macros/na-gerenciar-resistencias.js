const moduleApi = game.modules.get("night-assassins-csb-automation")?.api;
if (!moduleApi?.openResistanceManager) {
  return ui.notifications.error("Night Assassins CSB Automation não está ativo ou precisa ser atualizado.");
}
const macroArgs = typeof args === "object" && args ? args : {};
return moduleApi.openResistanceManager({
  actorUuid: macroArgs.actorUuid,
  kind: macroArgs.kind ?? "slayer",
});
