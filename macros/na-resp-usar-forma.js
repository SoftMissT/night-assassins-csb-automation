// Night Assassins Usar Forma de Respiração
// Adaptador fino: a resolução do Item mora em scripts/breath-form-launcher.mjs.
//
// Uso por item/CSB:
// game.macros.getName("na-resp-usar-forma")?.execute({
//   actorUuid: entity.parent?.uuid,
//   itemUuid: entity.uuid,
//   formaId: entity.system?.props?.forma_id,
//   itemName: entity.name
// });
const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.launchBreathForm) {
    ui.notifications.error(
        'Night Assassins CSB Automation não está ativo ou precisa ser atualizado.'
    );
    return '';
}
await moduleApi.launchBreathForm(typeof scope !== 'undefined' && scope ? scope : {});
return '';
