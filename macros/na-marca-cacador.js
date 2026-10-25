// Night Assassins Marca do Caçador, Fase 1
// CSB: %{return await game.macros.getName('na-marca-cacador')?.execute({actorUuid:entity.uuid});}%
// Adaptador fino: o fluxo mora em scripts/slayer/hunter-mark-dialog.mjs.
const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.openHuntersMarkDialog)
    return ui.notifications.error('Night Assassins CSB Automation não está ativo ou precisa ser atualizado.');
await moduleApi.openHuntersMarkDialog(typeof scope !== 'undefined' ? (scope ?? {}) : {});
