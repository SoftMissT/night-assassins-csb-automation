// Night Assassins Teste de Atributo
// Integração CSB: execute({actorUuid:entity.uuid,test:'Presença',attr:'CAR',color:'#FF9100'})
// Adaptador fino: o teste roda em scripts/roll-service.mjs (rollTest), que soma
// status, bônus derivados e Respirações e mostra cada um no diálogo e no chat.
const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.rollTest) {
    ui.notifications.error(
        'Night Assassins CSB Automation não está ativo ou precisa ser atualizado.'
    );
    return '';
}
const args = typeof scope !== 'undefined' && scope ? scope : {};
await moduleApi.rollTest({
    actorUuid: args.actorUuid,
    test: args.test,
    attr: args.attr,
    color: args.color,
    modality: args.modality,
});
return '';
