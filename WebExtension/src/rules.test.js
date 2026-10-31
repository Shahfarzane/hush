import { assertEquals } from "jsr:@std/assert@1";
import { applyOverrides, buildRules } from "./rules.js";
import rules from "../../data/vendor/consent-o-matic-rules.json" with {
  type: "json",
};
import overrides from "../../data/consent-o-matic-overrides.json" with {
  type: "json",
};
import hushRules from "../../data/consent-rules.json" with { type: "json" };

const methodNames = (rule) => rule.methods.map((method) => method.name);

const consentsOf = (node, found = []) => {
  if (Array.isArray(node)) node.forEach((child) => consentsOf(child, found));
  else if (node && typeof node === "object") {
    if (node.type === "consent") found.push(...node.consents);
    Object.values(node).forEach((child) => consentsOf(child, found));
  }
  return found;
};

const selectorsOf = (consent) =>
  JSON.stringify({ ...consent, type: undefined });

const ADS =
  /advert|marketing|\bads?\b|targeting|werbung|annonc|publicit|reklam|social/i;
const STATS = /statist|analytic|performance|measure|mesure|leistung|analys/i;
const FUNCTIONAL =
  /functional|preference|komfort|fonctionn|funktion|präferenz/i;

Deno.test("Overrides replace only the named method", () => {
  const result = applyOverrides({
    cmp: { detectors: [], methods: [{ name: "A", v: 1 }, { name: "B", v: 1 }] },
    other: { detectors: [], methods: [{ name: "A", v: 1 }] },
  }, { cmp: { methods: [{ name: "B", v: 2 }] } });
  assertEquals(result.cmp.methods, [{ name: "A", v: 1 }, { name: "B", v: 2 }]);
  assertEquals(result.other.methods, [{ name: "A", v: 1 }]);
});

Deno.test("Retype changes the category of matching consents only", () => {
  const consent = (selector, type) => ({
    matcher: { type: "css", target: { selector } },
    type,
  });
  const result = applyOverrides({
    cmp: {
      detectors: [],
      methods: [{
        name: "DO_CONSENT",
        action: {
          type: "consent",
          consents: [consent("#ads", "A"), consent("#prefs", "A")],
        },
      }],
    },
  }, { cmp: { retype: { "#ads": "F" } } });
  assertEquals(
    result.cmp.methods[0].action.consents.map((c) => c.type),
    ["F", "A"],
  );
});

Deno.test("Amazon's advertising control is not treated as functional", () => {
  const types = consentsOf(applyOverrides(rules, overrides).amazon.methods)
    .filter((c) => selectorsOf(c).includes("ADVERTISING"))
    .map((c) => c.type);
  assertEquals(types, ["F"]);
});

// Vendored rules sometimes label advertising or analytics controls as
// functional, which would switch them on at the "functional only" level.
// Reviewed exceptions: flysas calls its functionality tab "Performance".
Deno.test("No functional consent controls advertising or analytics", () => {
  const reviewed = ["flysas"];
  const mislabelled = Object.entries(buildRules(rules, overrides, hushRules))
    .filter(([name]) => !reviewed.includes(name))
    .flatMap(([name, rule]) =>
      consentsOf(rule.methods)
        .filter((c) => {
          const text = selectorsOf(c);
          if (c.type === "A") {
            return (ADS.test(text) || STATS.test(text)) &&
              !FUNCTIONAL.test(text);
          }
          if (c.type === "B") return ADS.test(text) && !STATS.test(text);
          return false;
        })
        .map((c) => `${name}: ${c.type} ${selectorsOf(c).slice(0, 80)}`)
    );
  assertEquals(mislabelled, []);
});

Deno.test("Every override targets an existing vendored method", () => {
  for (const [name, { methods = [] }] of Object.entries(overrides)) {
    for (const { name: method } of methods) {
      assertEquals(
        methodNames(rules[name]).includes(method),
        true,
        `${name}.${method}`,
      );
    }
  }
});

Deno.test("Cookiebot saves the selection without clicking Deny after it", () => {
  const save = applyOverrides(rules, overrides).cookiebot.methods
    .find((method) => method.name === "SAVE_CONSENT").action;
  const allowSelection = save.actions[1];
  assertEquals(
    allowSelection.trueAction.target.selector,
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection",
  );
  assertEquals(
    JSON.stringify(allowSelection.trueAction).includes("Decline"),
    false,
  );
});

Deno.test("Quantcast only saves from the options view, never Accept", () => {
  const methods = applyOverrides(rules, overrides).quantcast2b.methods;
  const save = methods.find((method) => method.name === "SAVE_CONSENT").action;
  assertEquals(save.target.selector, "#save-and-exit");
  assertEquals(save.falseAction, undefined);
  assertEquals(JSON.stringify(save).includes("accept"), false);
});

Deno.test("Hush rules keep vendored names free and define every step", () => {
  const steps = ["HIDE_CMP", "OPEN_OPTIONS", "DO_CONSENT", "SAVE_CONSENT"];
  for (const [name, rule] of Object.entries(hushRules)) {
    assertEquals(name in rules, false, `${name} shadows a vendored rule`);
    assertEquals(methodNames(rule), steps, name);
    assertEquals(rule.detectors.length > 0, true, name);
  }
});

Deno.test("Didomi treats Functionality as functional, not device storage", () => {
  const branches = applyOverrides(rules, overrides)["didomi.io"].methods
    .find((method) => method.name === "DO_CONSENT").action.actions
    .find((action) => action.type === "foreach").action.actions;
  const typeFor = (text) =>
    branches.find((branch) => branch.target.textFilter?.includes(text))
      ?.trueAction.consents[0].type;
  assertEquals(typeFor("Functionality"), "A");
  assertEquals(typeFor("Store and/or access information on a device"), "D");
});
