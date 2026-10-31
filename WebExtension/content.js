import ConsentEngine from "./vendor/consent-o-matic/ConsentEngine.js";
import vendoredRules from "../data/vendor/consent-o-matic-rules.json" with {
  type: "json",
};
import overrides from "../data/consent-o-matic-overrides.json" with {
  type: "json",
};
import hushRules from "../data/consent-rules.json" with { type: "json" };
import { buildRules } from "./src/rules.js";
import { report, reportAnswered } from "./src/report.js";
import { consentTypesFor, shouldAnswer } from "./src/settings.js";

const rules = buildRules(vendoredRules, overrides, hushRules);

const insideIframe = window !== window.parent;

const sendMessage = (message) => browser.runtime.sendMessage(message);

// Ad slots are small; consent banners in frames are not.
const mayHoldBanner = () =>
  !insideIframe || (window.innerWidth >= 300 && window.innerHeight >= 150);

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
        // Consent-O-Matic knows no banner here; the background injects the
        // autoconsent fallback into this frame.
        if (mayHoldBanner()) sendMessage({ type: "fallback" }).catch(() => {});
        return;
      }
      reportAnswered(event.cmpName, event.clicks);
    },
  );
};

run().catch((error) => console.error("Hush:", error));
