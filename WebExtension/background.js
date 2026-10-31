import { normalizeSettings } from "./src/settings.js";

const NATIVE_APP = "ceo.nerd.hush";
// The app cannot push changes into Safari, so re-read settings from the
// native side at most this often.
const SETTINGS_TTL_MS = 5000;

let cache = null;

const readSettings = async () => {
  if (cache && Date.now() - cache.readAt < SETTINGS_TTL_MS) {
    return cache.settings;
  }
  let settings;
  try {
    const response = await browser.runtime.sendNativeMessage(NATIVE_APP, {
      type: "getSettings",
    });
    settings = normalizeSettings(response?.settings);
    await browser.storage.local.set({ settings });
  } catch (error) {
    console.error("Hush: reading settings from the app failed", error);
    const stored = await browser.storage.local.get("settings");
    settings = normalizeSettings(stored.settings);
  }
  cache = { settings, readAt: Date.now() };
  return settings;
};

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Consent-O-Matic's engine asks for the top frame URL from inside iframes.
  if (message === "GetTabUrl") {
    sendResponse(sender.tab?.url);
    return;
  }
  switch (message?.type) {
    case "getSettings":
      return readSettings();
    case "report":
      return browser.runtime.sendNativeMessage(NATIVE_APP, message)
        .catch(() => {});
  }
});
