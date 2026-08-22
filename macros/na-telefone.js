const moduleApi = game.modules.get("night-assassins-csb-automation")?.api;
if (!moduleApi?.openPhoneChat) {
  return ui.notifications.error("Night Assassins CSB Automation não está ativo ou precisa ser atualizado.");
}
await moduleApi.openPhoneChat({});
return "";
