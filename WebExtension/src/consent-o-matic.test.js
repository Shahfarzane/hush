import assert from "node:assert/strict";
import { test } from "node:test";
import ConsentEngine from "../vendor/consent-o-matic/ConsentEngine.js";
import {
  HIDDEN_BANNER_WAIT_MS,
  startConsentOMatic,
} from "./consent-o-matic.js";

// A CMP whose container is in the page from the start and whose banner shows
// later, the way Complianz renders it hidden and shows it from a script.
const RULES = {
  late: {
    detectors: [{
      presentMatcher: [{ type: "css", target: { selector: "#container" } }],
      showingMatcher: [{
        type: "css",
        target: { selector: "#banner", displayFilter: true },
      }],
    }],
    methods: [{
      name: "SAVE_CONSENT",
      action: { type: "click", target: { selector: "#save" } },
    }],
  },
};

const element = () => ({
  offsetHeight: 0,
  clicks: 0,
  matches: () => false,
  closest: () => null,
  click() {
    this.clicks++;
  },
});

// Runs the vendored engine for 20 s of mocked time on a stub page. The banner
// shows at `showsAt` ms (never when null). Returns what Consent-O-Matic
// reported and when, and how often the banner's button was pressed.
const run = async (t, { container = true, button = true, showsAt = null }) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const page = {
    "#container": element(),
    "#banner": element(),
    "#save": element(),
  };
  page["#container"].offsetHeight = 100;
  const stubs = {
    HTMLElement: class {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    window: { addEventListener() {}, focus() {} },
    document: {
      body: { focus() {} },
      activeElement: null,
      querySelectorAll: (selector) =>
        (selector === "#container" && !container) ||
          (selector === "#save" && !button) || !page[selector]
          ? []
          : [page[selector]],
    },
  };
  Object.assign(globalThis, stubs);
  t.after(() => Object.keys(stubs).forEach((name) => delete globalThis[name]));

  ConsentEngine.debugValues = { skipHideMethod: true };
  ConsentEngine.generalSettings = { hideInsteadOfPIP: true };
  const outcomes = [];
  startConsentOMatic(
    RULES,
    {},
    {
      answered: (cmp, clicks) =>
        outcomes.push({ outcome: "answered", cmp, clicks, at: Date.now() }),
      failed: (fields) => outcomes.push({ ...fields, at: Date.now() }),
      unanswered: () =>
        outcomes.push({ outcome: "unanswered", at: Date.now() }),
    },
  );
  for (let now = 50; now <= 20000; now += 50) {
    t.mock.timers.tick(50);
    if (now === showsAt) page["#banner"].offsetHeight = 200;
    // The engine awaits zero-delay timeouts between steps.
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }
  return { outcomes, presses: page["#save"].clicks };
};

// The engine finds the container at 0.75 s and checks the banner until 2 s.
// Then it skips the CMP and reports no banner at 7 s; the fallback could take
// the frame from there.
const ENGINE_STOPS_AT = 7000;

for (
  const [name, showsAt] of [
    ["during the engine's own check", 1000],
    ["after the engine stopped checking it (Complianz)", 3000],
    ["after the engine stopped", ENGINE_STOPS_AT + 2000],
  ]
) {
  test(`Consent-O-Matic answers a banner it detected that shows ${name}`, async (t) => {
    const { outcomes, presses } = await run(t, { showsAt });
    assert.deepEqual(
      outcomes.map(({ outcome, cmp, clicks }) => ({ outcome, cmp, clicks })),
      [{ outcome: "answered", cmp: "late", clicks: 1 }],
    );
    assert.equal(presses, 1);
  });
}

test("A detected banner that never shows reaches the fallback after the wait", async (t) => {
  const { outcomes, presses } = await run(t, {});
  assert.deepEqual(outcomes, [{
    outcome: "unanswered",
    at: ENGINE_STOPS_AT + HIDDEN_BANNER_WAIT_MS,
  }]);
  assert.equal(presses, 0);
});

test("A banner that shows after the wait is left to the fallback", async (t) => {
  const { outcomes, presses } = await run(t, {
    showsAt: ENGINE_STOPS_AT + HIDDEN_BANNER_WAIT_MS + 1000,
  });
  assert.deepEqual(outcomes.map(({ outcome }) => outcome), ["unanswered"]);
  assert.equal(presses, 0);
});

test("A rule that presses nothing goes to the fallback without the wait", async (t) => {
  const { outcomes } = await run(t, { button: false, showsAt: 1000 });
  assert.deepEqual(outcomes.map(({ outcome, cmp }) => ({ outcome, cmp })), [
    { outcome: "no-clicks", cmp: "late" },
    { outcome: "unanswered", cmp: undefined },
  ]);
  assert.equal(outcomes[0].at, outcomes[1].at);
});

test("A frame with no banner Consent-O-Matic knows goes to the fallback at once", async (t) => {
  const { outcomes } = await run(t, { container: false });
  // The engine's own five seconds, with no wait added.
  assert.deepEqual(outcomes, [{ outcome: "unanswered", at: 5000 }]);
});
