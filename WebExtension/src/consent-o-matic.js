import ConsentEngine from "../vendor/consent-o-matic/ConsentEngine.js";
import { isAnswered, stillAnswering } from "./report.js";

// Runs Consent-O-Matic in this frame. `answered` gets a banner a rule clicked
// through, `failed` a rule that errored or pressed nothing, and `unanswered`
// is called once Consent-O-Matic leaves any banner here to the fallback.
export const startConsentOMatic = (
  rules,
  consentTypes,
  { answered, failed, unanswered },
) => {
  const engine = new ConsentEngine(rules, consentTypes, (event) => {
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
    }
    unanswered();
  });
  ConsentEngine.singleton = engine;
};
