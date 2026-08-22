/**
 * @fileoverview Settings do HUD Telefone/Chat (Specs §3.1).
 *
 * Registra apenas o toggle de habilitação como setting world. O limite de
 * histórico e o wallpaper global vivem em `state.settings` (fonte única de
 * verdade no snapshot), gerenciados pelo fluxo administrativo do GM.
 */

import { MODULE_ID } from "../constants.mjs";

export const PHONE_CHAT_SETTINGS = Object.freeze({
  enable: "enablePhoneChat",
});

export function registerPhoneChatSettings() {
  game.settings.register(MODULE_ID, PHONE_CHAT_SETTINGS.enable, {
    name: "NA.Settings.EnablePhoneChat.Name",
    hint: "NA.Settings.EnablePhoneChat.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  });
}
