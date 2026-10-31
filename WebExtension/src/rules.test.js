import { assertEquals } from "jsr:@std/assert@1";
import { applyOverrides } from "./rules.js";
import rules from "../../data/vendor/consent-o-matic-rules.json" with {
  type: "json",
};
import overrides from "../../data/consent-o-matic-overrides.json" with {
  type: "json",
};

const methodNames = (rule) => rule.methods.map((method) => method.name);

Deno.test("Overrides replace only the named method", () => {
  const result = applyOverrides({
    cmp: { detectors: [], methods: [{ name: "A", v: 1 }, { name: "B", v: 1 }] },
    other: { detectors: [], methods: [{ name: "A", v: 1 }] },
  }, { cmp: { methods: [{ name: "B", v: 2 }] } });
  assertEquals(result.cmp.methods, [{ name: "A", v: 1 }, { name: "B", v: 2 }]);
  assertEquals(result.other.methods, [{ name: "A", v: 1 }]);
});

Deno.test("Every override targets an existing vendored method", () => {
  for (const [name, { methods }] of Object.entries(overrides)) {
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
