import ConsentEngine from "./vendor/consent-o-matic/ConsentEngine.js";
import rules from "../data/vendor/consent-o-matic-rules.json" with {
  type: "json",
};
import { consentTypesFor, shouldAnswer } from "./src/settings.js";

const insideIframe = window !== window.parent;

// Read back after answering to confirm what the site stored.
const CONSENT_COOKIES = ["CookieConsent", "OptanonConsent", "euconsent-v2"];

const sendMessage = (message) => browser.runtime.sendMessage(message);

const report = (fields) =>
  sendMessage({
    type: "report",
    host: location.host,
    frame: insideIframe ? "iframe" : "top",
    ...fields,
  }).catch(() => {});

const readConsentCookies = () =>
  Object.fromEntries(
    document.cookie.split("; ")
      .map((cookie) => {
        const separator = cookie.indexOf("=");
        return [cookie.slice(0, separator), cookie.slice(separator + 1)];
      })
      .filter(([name]) => CONSENT_COOKIES.includes(name)),
  );

// From Consent-O-Matic's contentScript.js: remember the page's own scroll
// styles so the engine can restore them when a banner locked scrolling.
window.consentScrollBehaviours = {};
const rememberScrollBehaviours = () => {
  ["html", "html body"].forEach((selector) => {
    const node = document.querySelector(selector);
    if (node) {
      const styles = window.getComputedStyle(node);
      window.consentScrollBehaviours[
        `${selector}.consent-scrollbehaviour-override`
      ] = ["position", "overflow", "overflow-y"].map((property) => ({
        property,
        value: styles[property],
      }));
    }
  });
};
const html = document.querySelector("html");
if (html) {
  const observer = new MutationObserver((mutations) => {
    if (
      mutations.some((mutation) =>
        [...mutation.addedNodes].some((node) => node.matches?.("body"))
      )
    ) {
      rememberScrollBehaviours();
      observer.disconnect();
    }
  });
  observer.observe(html, { childList: true });
}
window.addEventListener("message", (event) => {
  if (event.data?.enforceScrollBehaviours != null) {
    ConsentEngine.enforceScrollBehaviours(event.data.enforceScrollBehaviours);
  }
});

const run = async () => {
  if (document.contentType !== "text/html") return;

  const topUrl = insideIframe ? await sendMessage("GetTabUrl") : location.href;
  const topHost = new URL(topUrl).host;
  const settings = await sendMessage({ type: "getSettings" });
  if (!shouldAnswer(settings, topHost)) return;

  ConsentEngine.debugValues = { skipHideMethod: !settings.hideWhileAnswering };
  ConsentEngine.generalSettings = { hideInsteadOfPIP: true };
  ConsentEngine.topFrameUrl = topHost;
  ConsentEngine.singleton = new ConsentEngine(
    rules,
    consentTypesFor(settings),
    (event) => {
      if (!event.handled) {
        if (event.error) report({ outcome: "error" });
        return;
      }
      report({ outcome: "handled", cmp: event.cmpName, clicks: event.clicks });
      setTimeout(
        () => report({ outcome: "cookies", cookies: readConsentCookies() }),
        2000,
      );
    },
  );
};

run().catch((error) => console.error("Hush:", error));
