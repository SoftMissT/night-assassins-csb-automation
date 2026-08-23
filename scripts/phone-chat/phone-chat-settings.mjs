/**
 * @fileoverview Settings do HUD Telefone/Chat.
 */

import { MODULE_ID } from "../constants.mjs";

export const PHONE_CHAT_SETTINGS = Object.freeze({
  enable: "enablePhoneChat",
  notificationSound: "phoneChatNotificationSound",
  showToast: "phoneChatShowToast",
  allowPrivateGmLogs: "phoneChatAllowPrivateGmLogs",
  defaultWallpaper: "phoneChatDefaultWallpaper",
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
  game.settings.register(MODULE_ID, PHONE_CHAT_SETTINGS.notificationSound, {
    name: "NA.Settings.PhoneChatNotificationSound.Name",
    hint: "NA.Settings.PhoneChatNotificationSound.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, PHONE_CHAT_SETTINGS.showToast, {
    name: "NA.Settings.PhoneChatShowToast.Name",
    hint: "NA.Settings.PhoneChatShowToast.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, PHONE_CHAT_SETTINGS.allowPrivateGmLogs, {
    name: "NA.Settings.PhoneChatPrivateLogs.Name",
    hint: "NA.Settings.PhoneChatPrivateLogs.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, PHONE_CHAT_SETTINGS.defaultWallpaper, {
    name: "NA.Settings.PhoneChatDefaultWallpaper.Name",
    hint: "NA.Settings.PhoneChatDefaultWallpaper.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });
}

export function getPhoneChatSetting(key, fallback = null) {
  try {
    return game.settings.get(MODULE_ID, key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function phoneChatNotificationOptions() {
  return {
    sound: getPhoneChatSetting(PHONE_CHAT_SETTINGS.notificationSound, ""),
    showToast: getPhoneChatSetting(PHONE_CHAT_SETTINGS.showToast, true),
    allowPrivateGmLogs: getPhoneChatSetting(PHONE_CHAT_SETTINGS.allowPrivateGmLogs, false),
    defaultWallpaper: getPhoneChatSetting(PHONE_CHAT_SETTINGS.defaultWallpaper, ""),
  };
}

/**
 * @deprecated Compatibilidade com consumidores antigos que esperavam somente
 * `enable` em PHONE_CHAT_SETTINGS.
 */
export const PHONE_CHAT_ENABLED_SETTING = PHONE_CHAT_SETTINGS.enable;

(function exposeForTests() {
  // Mantém o módulo importável fora do runtime do Foundry sem executar settings.
})();

/* c8 ignore next */
void MODULE_ID;
