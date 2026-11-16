import ConsentEngine from "../vendor/consent-o-matic/ConsentEngine.js";
import { isAnswered, stillAnswering } from "./report.js";

// Consent-O-Matic counts a CMP as tried once its detector matches, gives the
// banner 1.25 s to show, then skips that CMP for the rest of the run, and its
// five-second timer reports no banner. Complianz renders its banner hidden
// and shows it from a deferred script, sometimes after those 1.25 s; taken at
// its word, the fallback refuses every category there. So a banner the
// engine detected keeps the fallback out for as long as autoconsent would
// wait for it (ten checks 500 ms apart) and goes back to the engine as soon
// as it shows.
export const HIDDEN_BANNER_WAIT_MS = 5000;
const HIDDEN_BANNER_CHECK_MS = 250;

// Runs Consent-O-Matic in this frame. `answered` gets a banner a rule clicked
// through, `failed` a rule that errored or pressed nothing, and `unanswered`
// is called once Consent-O-Matic leaves any banner here to the fallback.
export const startConsentOMatic = (
  rules,
  consentTypes,
  { answered, failed, unanswered },
) => {
  let waitUntil;
  let watch;

  const engine = new ConsentEngine(rules, consentTypes, (event) => {
    clearInterval(watch);
    if (stillAnswering(event, engine)) {
      engine.startStopTimeout();
      return;
    }
    if (isAnswered(event)) {
      answered(event.cmpName, event.clicks);
      return;
    }
    if (event.error) failed({ outcome: "error" });
    else if (event.handled) {
      failed({ outcome: "no-clicks", cmp: event.cmpName });
    } else if (waitForHiddenBanner()) return;
    unanswered();
  });
  ConsentEngine.singleton = engine;

  // True while a CMP the engine detected and stopped checking may still
  // show its banner.
  const waitForHiddenBanner = () => {
    const hidden = engine.cmps.filter((cmp) =>
      engine.triedCMPs.has(cmp.name) && !cmp.isUtility()
    );
    if (hidden.length === 0) return false;
    waitUntil ??= Date.now() + HIDDEN_BANNER_WAIT_MS;
    if (Date.now() >= waitUntil) return false;
    watch = setInterval(() => {
      const shown = hidden.find((cmp) => cmp.detect() && cmp.isShowing());
      if (shown) {
        clearInterval(watch);
        engine.triedCMPs.delete(shown.name);
        // The engine stopped its own timers, so this is the only check.
        engine.checkForCMPs();
      } else if (Date.now() >= waitUntil) {
        clearInterval(watch);
        unanswered();
      }
    }, HIDDEN_BANNER_CHECK_MS);
    return true;
  };
};
