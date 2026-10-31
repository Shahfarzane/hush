import AutoConsent from "./vendor/autoconsent/autoconsent.esm.js";
import rules from "../data/vendor/autoconsent-rules.json" with {
  type: "json",
};
import { report, reportAnswered } from "./src/report.js";
import { autoActionFor } from "./src/settings.js";

// Injected by the background into a frame where Consent-O-Matic found no
// banner it knows. autoconsent can only accept or refuse everything.
const run = async () => {
  if (globalThis.hushAutoconsentStarted) return;
  globalThis.hushAutoconsentStarted = true;

  const settings = await browser.runtime.sendMessage({ type: "getSettings" });
  let consent;
  const handle = async (message) => {
    switch (message.type) {
      // Some rules call a named snippet in the page's own JavaScript world,
      // which only the background can reach.
      case "eval": {
        const result = await browser.runtime.sendMessage({
          type: "autoconsentEval",
          snippetId: message.snippetId,
        }).catch(() => false);
        consent.receiveMessageCallback({
          type: "evalResp",
          id: message.id,
          result,
        });
        break;
      }
      case "autoconsentDone":
        reportAnswered(`autoconsent:${message.cmp}`, message.totalClicks);
        break;
      case "optOutResult":
      case "optInResult":
        if (!message.result) {
          report({ outcome: "error", cmp: `autoconsent:${message.cmp}` });
        }
        break;
    }
  };
  consent = new AutoConsent(handle, {
    enabled: true,
    autoAction: autoActionFor(settings),
    // Prehiding and heuristic detection would act on banners Hush has not
    // identified; generated rules are not reviewed upstream.
    enablePrehide: false,
    enableHeuristicDetection: false,
    enableGeneratedRules: false,
    enableCosmeticRules: true,
    isMainWorld: false,
  }, { autoconsent: rules.autoconsent });
};

run().catch((error) => console.error("Hush:", error));
