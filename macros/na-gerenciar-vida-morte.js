// Night Assassins — Vida e Morte Slayer
const moduleApi = game.modules.get("night-assassins-csb-automation")?.api;
if (!moduleApi?.openLifeDeathManager) {
  ui.notifications.error("Night Assassins CSB Automation não está ativo ou precisa ser atualizado.");
  return "";
}

const input = typeof scope !== "undefined" && scope ? scope : {};
await moduleApi.openLifeDeathManager({ actorUuid: input.actorUuid });
return "";

