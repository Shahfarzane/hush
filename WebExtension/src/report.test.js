import assert from "node:assert/strict";
import { test } from "node:test";
import { isAnswered, stillAnswering } from "./report.js";

test("Only a handled banner with a click counts as answered", () => {
  assert.deepEqual(
    isAnswered({ handled: true, cmpName: "bing", clicks: 2 }),
    true,
  );
  assert.deepEqual(
    isAnswered({ handled: true, cmpName: "yahoo_consent", clicks: 0 }),
    false,
  );
  assert.deepEqual(isAnswered({ handled: false }), false);
  assert.deepEqual(isAnswered({ handled: false, error: true }), false);
});

test("A rule still running is not mistaken for no banner", () => {
  const timedOut = { handled: false };
  assert.deepEqual(stillAnswering(timedOut, { checkRunning: true }), true);
  assert.deepEqual(stillAnswering(timedOut, { checkRunning: false }), false);
});

test("A finished or failed rule ends the wait", () => {
  const engine = { checkRunning: true };
  assert.deepEqual(stillAnswering({ handled: true, clicks: 3 }, engine), false);
  assert.deepEqual(
    stillAnswering({ handled: false, error: true }, engine),
    false,
  );
});
