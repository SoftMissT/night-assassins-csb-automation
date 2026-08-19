// Night Assassins — Estados Avançados do Slayer
const moduleApi = game.modules.get("night-assassins-csb-automation")?.api;
if (!moduleApi?.slayer?.openAdvancedStatesManager) {
  ui.notifications.error("Night Assassins CSB Automation não está ativo ou precisa ser atualizado.");
  return "";
}

const input = typeof scope !== "undefined" && scope ? scope : {};
await moduleApi.slayer.openAdvancedStatesManager({ actorUuid: input.actorUuid });
return "";