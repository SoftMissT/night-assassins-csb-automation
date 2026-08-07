import { MODULE_ID } from "./constants.mjs";

export const SETTINGS = Object.freeze({
  enableSheetAutomation: "enableSheetAutomation",
  enableDamageRelay: "enableDamageRelay",
});

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.enableSheetAutomation, {
    name: "NA.Settings.EnableSheetAutomation.Name",
    hint: "NA.Settings.EnableSheetAutomation.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  game.settings.register(MODULE_ID, SETTINGS.enableDamageRelay, {
    name: "NA.Settings.EnableDamageRelay.Name",
    hint: "NA.Settings.EnableDamageRelay.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  });
}
