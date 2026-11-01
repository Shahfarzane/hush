import { assertEquals } from "jsr:@std/assert@1";
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

Deno.test("A mixed level sets switches when the rule has them", () => {
  assertEquals(pathFor(SHOP, FUNCTIONAL), "settings");
  assertEquals(planFor(SHOP, FUNCTIONAL).steps, [
    { click: "#settings" },
    { switches: SHOP.switches, switchState: "checkbox" },
    { click: "#save", ifDisabled: "#reject" },
  ]);
});

Deno.test("A switch covering two categories needs both allowed", () => {
  const [comfort, marketing] = SHOP.switches;
  assertEquals(switchAllowed(comfort, FUNCTIONAL), false);
  assertEquals(
    switchAllowed(comfort, { ...FUNCTIONAL, performance: true }),
    true,
  );
  assertEquals(switchAllowed(marketing, ALL), true);
});

Deno.test("Refusing everything prefers the reject button", () => {
  assertEquals(pathFor(SHOP, NONE), "reject");
  assertEquals(pathFor({ ...SHOP, reject: null }, NONE), "settings");
  assertEquals(
    pathFor({ ...SHOP, reject: null, necessaryOnly: "#n" }, NONE),
    "necessaryOnly",
  );
});

Deno.test("Accept all only when every category is allowed", () => {
  assertEquals(pathFor(SHOP, ALL), "acceptAll");
  const acceptOnly = { name: "A", sites: ["a.example"], acceptAll: "#ok" };
  assertEquals(pathFor(acceptOnly, FUNCTIONAL), null);
  assertEquals(pathFor(acceptOnly, NONE), null);
});

Deno.test("Without switches a mixed level refuses instead", () => {
  const rule = {
    acceptAll: "#a",
    reject: "#r",
    openSettings: "#s",
    save: "#c",
  };
  assertEquals(pathFor(rule, FUNCTIONAL), "reject");
  assertEquals(pathFor({ ...rule, reject: null }, FUNCTIONAL), null);
});

Deno.test("A first click and a shadow root come before the answer", () => {
  const rule = {
    reject: "button.deny",
    shadowRoot: "#root",
    firstClick: "a.more",
  };
  assertEquals(planFor(rule, NONE).steps, [
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

Deno.test("Switches are clicked only when their state differs", () => {
  const on = element({}, { type: "checkbox", checked: true });
  assertEquals(needsClick(on, "checkbox", true), false);
  assertEquals(needsClick(on, "checkbox", false), true);
  const ariaOff = element({ "aria-checked": "false" });
  assertEquals(needsClick(ariaOff, "aria-checked", false), false);
  assertEquals(needsClick(ariaOff, "aria-checked", true), true);
  assertEquals(
    needsClick(element({ "aria-pressed": "true" }), "aria-pressed", false),
    true,
  );
});

Deno.test("Auto reads the first state a switch exposes", () => {
  assertEquals(
    detectSwitchState(element({}, { type: "checkbox" })),
    "checkbox",
  );
  assertEquals(
    detectSwitchState(element({ "aria-checked": "true", "aria-pressed": "x" })),
    "aria-checked",
  );
  assertEquals(
    needsClick(element({ "aria-checked": "true" }), "auto", false),
    true,
  );
  assertEquals(needsClick(element({ class: "toggle" }), "auto", false), null);
});

Deno.test(":contains splits into the element, its text and a child", () => {
  assertEquals(parseContains("button:contains('Reject all')"), {
    before: "button",
    text: "Reject all",
    after: null,
  });
  assertEquals(parseContains("div.banner:contains(Cookies) button.no"), {
    before: "div.banner",
    text: "Cookies",
    after: "button.no",
  });
  assertEquals(parseContains("#plain"), null);
});

Deno.test("A site rule matches its sites and their subdomains", () => {
  const rules = [SHOP, { ...SHOP, name: "UK", sites: ["example.co.uk"] }];
  assertEquals(siteRuleFor(rules, "shop.example")?.name, "Shop");
  assertEquals(siteRuleFor(rules, "www.shop.example")?.name, "Shop");
  assertEquals(siteRuleFor(rules, "news.example.co.uk")?.name, "UK");
  assertEquals(siteRuleFor(rules, "other.co.uk"), null);
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

Deno.test("Every rule in data/site-rules.json is well formed", () => {
  for (const rule of siteRules) {
    const unknown = Object.keys(rule).filter((field) => !FIELDS.has(field));
    assertEquals(unknown, [], `${rule.name}: unknown fields`);
    assertEquals(typeof rule.name, "string");
    assertEquals(rule.sites.length > 0, true, `${rule.name}: no sites`);
    for (const entry of rule.switches ?? []) {
      assertEquals(typeof entry.selector, "string", `${rule.name}: selector`);
      assertEquals(
        entry.categories.length > 0 &&
          entry.categories.every((category) => CATEGORIES.includes(category)),
        true,
        `${rule.name}: categories of ${entry.selector}`,
      );
    }
    assertEquals(
      ["checkbox", "aria-checked", "aria-pressed", "auto", undefined]
        .includes(rule.switchState),
      true,
      `${rule.name}: unknown switchState`,
    );
    assertEquals(
      pathFor(rule, NONE) !== null,
      true,
      `${rule.name}: no way to refuse`,
    );
  }
});
