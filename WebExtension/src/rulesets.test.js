import assert from "node:assert/strict";
import { test } from "node:test";
import { rulesetUpdate } from "./rulesets.js";
import manifest from "../manifest.json" with { type: "json" };

const rulesets = manifest.declarative_net_request.rule_resources.map(
  (ruleset) => ruleset.id,
).sort();

test("Every mode names every ruleset, so Safari saves them all", () => {
  for (const mode of ["answer", "hide"]) {
    const { enableRulesetIds = [], disableRulesetIds = [] } = rulesetUpdate(
      mode,
    );
    assert.deepEqual(
      [...enableRulesetIds, ...disableRulesetIds].sort(),
      rulesets,
    );
  }
});

test("Only hide it adds the hide-only blocks to the answer ones", () => {
  assert.deepEqual(rulesetUpdate("answer"), {
    enableRulesetIds: ["block_answer"],
    disableRulesetIds: ["block_hide_only"],
  });
  assert.deepEqual(rulesetUpdate("hide"), {
    enableRulesetIds: ["block_answer", "block_hide_only"],
  });
});
