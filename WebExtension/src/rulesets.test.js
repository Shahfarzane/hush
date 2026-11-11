import { assertEquals } from "jsr:@std/assert@1";
import { rulesetUpdate } from "./rulesets.js";
import manifest from "../manifest.json" with { type: "json" };

const rulesets = manifest.declarative_net_request.rule_resources.map(
  (ruleset) => ruleset.id,
).sort();

Deno.test("Every mode names every ruleset, so Safari saves them all", () => {
  for (const mode of ["answer", "hide"]) {
    const { enableRulesetIds = [], disableRulesetIds = [] } = rulesetUpdate(
      mode,
    );
    assertEquals([...enableRulesetIds, ...disableRulesetIds].sort(), rulesets);
  }
});

Deno.test("Only hide it adds the hide-only blocks to the answer ones", () => {
  assertEquals(rulesetUpdate("answer"), {
    enableRulesetIds: ["block_answer"],
    disableRulesetIds: ["block_hide_only"],
  });
  assertEquals(rulesetUpdate("hide"), {
    enableRulesetIds: ["block_answer", "block_hide_only"],
  });
});
