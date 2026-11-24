// Night Assassins Vento — Cicatrizes
// Uso: arraste do Compêndio para a hotbar e execute com a ficha selecionada.
// Adaptador fino: o diálogo mora em scripts/slayer/wind-scars-dialog.mjs.
const moduleApi = game.modules.get('night-assassins-csb-automation')?.api;
if (!moduleApi?.openWindScarsDialog)
    return ui.notifications.error('Night Assassins CSB Automation não está ativo ou precisa ser atualizado.');
await moduleApi.openWindScarsDialog(typeof scope !== 'undefined' ? (scope ?? {}) : {});
