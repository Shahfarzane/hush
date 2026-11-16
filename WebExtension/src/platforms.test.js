import assert from "node:assert/strict";
import { test } from "node:test";
import { describeAnswer } from "./platforms.js";

test("Rule names become platform names", () => {
  assert.deepEqual(describeAnswer("onetrust_pctab"), {
    platform: "OneTrust",
    fallback: false,
  });
  assert.deepEqual(describeAnswer("autoconsent:TrustArc-top"), {
    platform: "TrustArc",
    fallback: true,
  });
  assert.deepEqual(describeAnswer("site:MediaMarkt"), {
    platform: "MediaMarkt",
    fallback: false,
  });
  assert.deepEqual(describeAnswer("site-refuse:someshop.example"), {
    platform: "someshop.example",
    fallback: true,
  });
  assert.deepEqual(describeAnswer("someshop.example"), {
    platform: "someshop.example",
    fallback: false,
  });
});
