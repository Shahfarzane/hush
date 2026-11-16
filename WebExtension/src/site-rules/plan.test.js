import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORIES, pathFor, planFor, switchAllowed } from "./plan.js";
import { detectSwitchState, needsClick } from "./switches.js";
import { parseContains } from "./dom.js";
import { siteRuleFor } from "./answer.js";
import siteRules from "../../../data/site-rules.json" with { type: "json" };

const NONE = {
  functional: false,
  performance: false,
  advertising: false,
  other: false,
};
const FUNCTIONAL = { ...NONE, functional: true };
const ALL = {
  functional: true,
  performance: true,
  advertising: true,
  other: true,
};

const SHOP = {
  name: "Shop",
  sites: ["shop.example"],
  acceptAll: "#accept",
  reject: "#reject",
  openSettings: "#settings",
  save: "#save",
  switches: [
    { selector: "#comfort", categories: ["functional", "performance"] },
    { selector: "#marketing", categories: ["advertising"] },
  ],
  switchState: "checkbox",
};

test("A mixed level sets switches when the rule has them", () => {
  assert.deepEqual(pathFor(SHOP, FUNCTIONAL), "settings");
  // The settings button is pressed again until Save shows: a page drawn
  // on the server shows it before its click handler is attached.
  assert.deepEqual(planFor(SHOP, FUNCTIONAL).steps, [
    { click: "#settings", until: "#save" },
    { switches: SHOP.switches, switchState: "checkbox" },
    { click: "#save", ifDisabled: "#reject" },
  ]);
});

test("A switch covering two categories needs both allowed", () => {
  const [comfort, marketing] = SHOP.switches;
  assert.deepEqual(switchAllowed(comfort, FUNCTIONAL), false);
  assert.deepEqual(
    switchAllowed(comfort, { ...FUNCTIONAL, performance: true }),
    true,
  );
  assert.deepEqual(switchAllowed(marketing, ALL), true);
});

test("Refusing everything prefers the reject button", () => {
  assert.deepEqual(pathFor(SHOP, NONE), "reject");
  assert.deepEqual(pathFor({ ...SHOP, reject: null }, NONE), "settings");
  assert.deepEqual(
    pathFor({ ...SHOP, reject: null, necessaryOnly: "#n" }, NONE),
    "necessaryOnly",
  );
});

test("Accept all only when every category is allowed", () => {
  assert.deepEqual(pathFor(SHOP, ALL), "acceptAll");
  const acceptOnly = { name: "A", sites: ["a.example"], acceptAll: "#ok" };
  assert.deepEqual(pathFor(acceptOnly, FUNCTIONAL), null);
  assert.deepEqual(pathFor(acceptOnly, NONE), null);
});

test("Without switches a mixed level refuses instead", () => {
  const rule = {
    acceptAll: "#a",
    reject: "#r",
    openSettings: "#s",
    save: "#c",
  };
  assert.deepEqual(pathFor(rule, FUNCTIONAL), "reject");
  assert.deepEqual(pathFor({ ...rule, reject: null }, FUNCTIONAL), null);
});

test("A first click and a shadow root come before the answer", () => {
  const rule = {
    reject: "button.deny",
    shadowRoot: "#root",
    firstClick: "a.more",
  };
  assert.deepEqual(planFor(rule, NONE).steps, [
    { click: "a.more", optional: true },
    { shadowRoot: "#root" },
    { click: "button.deny" },
  ]);
});

const element = (attributes = {}, properties = {}) => ({
  ...properties,
  getAttribute: (name) => attributes[name] ?? null,
  hasAttribute: (name) => name in attributes,
});

test("Switches are clicked only when their state differs", () => {
  const on = element({}, { type: "checkbox", checked: true });
  assert.deepEqual(needsClick(on, "checkbox", true), false);
  assert.deepEqual(needsClick(on, "checkbox", false), true);
  const ariaOff = element({ "aria-checked": "false" });
  assert.deepEqual(needsClick(ariaOff, "aria-checked", false), false);
  assert.deepEqual(needsClick(ariaOff, "aria-checked", true), true);
  assert.deepEqual(
    needsClick(element({ "aria-pressed": "true" }), "aria-pressed", false),
    true,
  );
});

test("Auto reads the first state a switch exposes", () => {
  assert.deepEqual(
    detectSwitchState(element({}, { type: "checkbox" })),
    "checkbox",
  );
  assert.deepEqual(
    detectSwitchState(element({ "aria-checked": "true", "aria-pressed": "x" })),
    "aria-checked",
  );
  assert.deepEqual(
    needsClick(element({ "aria-checked": "true" }), "auto", false),
    true,
  );
  assert.deepEqual(
    needsClick(element({ class: "toggle" }), "auto", false),
    null,
  );
});

test(":contains splits into the element, its text and a child", () => {
  assert.deepEqual(parseContains("button:contains('Reject all')"), {
    before: "button",
    text: "Reject all",
    after: null,
  });
  assert.deepEqual(parseContains("div.banner:contains(Cookies) button.no"), {
    before: "div.banner",
    text: "Cookies",
    after: "button.no",
  });
  assert.deepEqual(parseContains("#plain"), null);
});

test("A site rule matches its sites and their subdomains", () => {
  const rules = [SHOP, { ...SHOP, name: "UK", sites: ["example.co.uk"] }];
  assert.deepEqual(siteRuleFor(rules, "shop.example")?.name, "Shop");
  assert.deepEqual(siteRuleFor(rules, "www.shop.example")?.name, "Shop");
  assert.deepEqual(siteRuleFor(rules, "news.example.co.uk")?.name, "UK");
  assert.deepEqual(siteRuleFor(rules, "other.co.uk"), null);
});

const FIELDS = new Set([
  "name",
  "sites",
  "banner",
  "firstClick",
  "shadowRoot",
  "reject",
  "necessaryOnly",
  "acceptAll",
  "openSettings",
  "save",
  "switches",
  "switchState",
]);

test("Every rule in data/site-rules.json is well formed", () => {
  for (const rule of siteRules) {
    const unknown = Object.keys(rule).filter((field) => !FIELDS.has(field));
    assert.deepEqual(unknown, [], `${rule.name}: unknown fields`);
    assert.deepEqual(typeof rule.name, "string");
    assert.deepEqual(typeof rule.banner, "string", `${rule.name}: no banner`);
    assert.deepEqual(rule.sites.length > 0, true, `${rule.name}: no sites`);
    for (const entry of rule.switches ?? []) {
      assert.deepEqual(
        typeof entry.selector,
        "string",
        `${rule.name}: selector`,
      );
      assert.deepEqual(
        entry.categories.length > 0 &&
          entry.categories.every((category) => CATEGORIES.includes(category)),
        true,
        `${rule.name}: categories of ${entry.selector}`,
      );
    }
    assert.deepEqual(
      ["checkbox", "aria-checked", "aria-pressed", "auto", undefined]
        .includes(rule.switchState),
      true,
      `${rule.name}: unknown switchState`,
    );
    assert.deepEqual(
      pathFor(rule, NONE) !== null,
      true,
      `${rule.name}: no way to refuse`,
    );
  }
});
