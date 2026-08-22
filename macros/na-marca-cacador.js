// Night Assassins — Marca do Caçador (Hunter Mark)
// Compatível com Foundry VTT 14+ / Custom System Builder
// Wrapper para api.slayer.openHunterMarkManager()
//
// Uso por item/CSB:
// game.macros.getName("na-marca-cacador")?.execute({
//   actorUuid: entity.parent?.uuid
// });

const moduleApi = game.modules.get("night-assassins-csb-automation")?.api;
if (!moduleApi?.slayer?.openHunterMarkManager) {
  ui.notifications.error("Night Assassins CSB Automation não está ativo ou a API de Marca do Caçador não está disponível.");
  return "";
}

const input = typeof scope !== "undefined" && scope ? scope : {};

await moduleApi.slayer.openHunterMarkManager({
  actorUuid: input.actorUuid,
});

return "";
