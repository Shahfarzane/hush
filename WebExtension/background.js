import { evalSnippets } from "./vendor/autoconsent/autoconsent.esm.js";
import { normalizeSettings, siteKey } from "./src/settings.js";
import { siteCss } from "./src/hide-css.js";
import perSite from "../build/web-lists/per-site.json" with { type: "json" };

const NATIVE_APP = "ceo.nerd.hush";
// The app cannot push changes into Safari, so re-read settings from the
// native side at most this often.
const SETTINGS_TTL_MS = 5000;

let cache = null;

// What was answered in each tab, with the page URL it was answered on. The
// popup shows it, and the fallback stays out of answered tabs so autoconsent
// cannot overrule a more precise answer given in another frame (Sourcepoint
// answers inside an iframe). Kept in session storage too, since Safari
// unloads this background page when idle.
const answers = new Map();

const rememberAnswer = (tabId, answer) => {
  answers.set(tabId, answer);
  browser.storage.session?.set({ [`answer-${tabId}`]: answer }).catch(() => {});
};

const sameSite = (a, b) => {
  try {
    return siteKey(new URL(a).host) === siteKey(new URL(b).host);
  } catch {
    return false;
  }
};

const answerFor = async (tabId) => {
  if (answers.has(tabId)) return answers.get(tabId);
  const stored = await browser.storage.session?.get(`answer-${tabId}`)
    .catch(() => null);
  return stored?.[`answer-${tabId}`] ?? null;
};

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
  syncRulesets(settings.mode);
  return settings;
};

// Logged by the native handler in debug builds only.
const debugReport = (fields) =>
  browser.runtime.sendNativeMessage(NATIVE_APP, { type: "report", ...fields })
    .catch(() => {});

// "Only hide it" blocks the consent platforms answer mode leaves for the
// engines to answer. Safari's getEnabledRulesets kept reporting the ruleset
// off after it took effect, so this page remembers what it applied (once
// per wake-up; Safari unloads it when idle).
let appliedMode = null;
const syncRulesets = async (mode) => {
  if (appliedMode === mode) return;
  appliedMode = mode;
  try {
    await browser.declarativeNetRequest.updateEnabledRulesets(
      mode === "hide"
        ? { enableRulesetIds: ["block_hide_only"] }
        : { disableRulesetIds: ["block_hide_only"] },
    );
    debugReport({ outcome: "rulesets", mode });
  } catch (error) {
    appliedMode = null;
    debugReport({ outcome: "rulesets-error", mode, error: String(error) });
  }
};

// The mode without waiting on the app: the hide rules go in as the page
// starts. readSettings refreshes the cache behind it.
const currentMode = async () => {
  if (cache) return cache.settings.mode;
  readSettings();
  const stored = await browser.storage.local.get("settings");
  return normalizeSettings(stored.settings).mode;
};

const injectSiteCss = async (sender) => {
  let host;
  try {
    host = new URL(sender.url).hostname;
  } catch {
    return;
  }
  if (!host) return;
  const css = siteCss(perSite, host, await currentMode());
  if (!css) return;
  await browser.scripting.insertCSS({
    target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
    css,
  }).then(
    () => debugReport({ outcome: "hide-css", host, bytes: css.length }),
    (error) => debugReport({ outcome: "hide-css-error", host, error: String(error) }),
  );
};

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Consent-O-Matic's engine asks for the top frame URL from inside iframes.
  if (message === "GetTabUrl") {
    sendResponse(sender.tab?.url);
    return;
  }
  switch (message?.type) {
    // Every frame asks as it starts, in both modes.
    case "hideCss":
      return injectSiteCss(sender);
    case "getSettings":
      return readSettings();
    // Consent-O-Matic found no banner in this frame; try autoconsent there.
    case "fallback":
      return answerFor(sender.tab.id).then((answer) => {
        if (answer?.url === sender.tab.url) return false;
        return browser.scripting.executeScript({
          target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
          files: ["autoconsent.js"],
        }).then(() => true, (error) => {
          console.error("Hush: injecting autoconsent failed", error);
          return false;
        });
      });
    // Runs one of autoconsent's named snippets in the page's own world.
    case "autoconsentEval":
      if (!(message.snippetId in evalSnippets)) return Promise.resolve(false);
      return browser.scripting.executeScript({
        target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
        world: "MAIN",
        func: evalSnippets[message.snippetId],
      }).then(
        ([injection]) => ({ result: injection?.result ?? false }),
        (error) => ({ result: false, error: String(error) }),
      ).then(({ result, error }) => {
        // Logged by the native handler in debug builds only.
        browser.runtime.sendNativeMessage(NATIVE_APP, {
          type: "report",
          outcome: "eval",
          snippetId: message.snippetId,
          result: String(result),
          error,
        }).catch(() => {});
        return result;
      });
    case "popupState":
      return Promise.all([readSettings(), answerFor(message.tabId)]).then((
        [settings, answer],
      ) => ({
        settings,
        answer: answer && sameSite(answer.url, message.url) ? answer : null,
      }));
    // Pausing writes to the app's settings through the native handler, so
    // the app and every other tab see it.
    case "setPaused":
      return browser.runtime.sendNativeMessage(NATIVE_APP, message).then(
        (response) => {
          const settings = normalizeSettings(response?.settings);
          cache = { settings, readAt: Date.now() };
          return settings;
        },
      );
    case "report":
      if (message.outcome === "handled") {
        rememberAnswer(sender.tab.id, {
          url: sender.tab.url,
          cmp: message.cmp,
        });
      }
      return browser.runtime.sendNativeMessage(NATIVE_APP, message)
        .catch(() => {});
  }
});
