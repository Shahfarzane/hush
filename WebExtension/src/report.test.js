import { assertEquals } from "jsr:@std/assert@1";
import { isAnswered, stillAnswering } from "./report.js";

Deno.test("Only a handled banner with a click counts as answered", () => {
  assertEquals(isAnswered({ handled: true, cmpName: "bing", clicks: 2 }), true);
  assertEquals(
    isAnswered({ handled: true, cmpName: "yahoo_consent", clicks: 0 }),
    false,
  );
  assertEquals(isAnswered({ handled: false }), false);
  assertEquals(isAnswered({ handled: false, error: true }), false);
});

Deno.test("A rule still running is not mistaken for no banner", () => {
  const timedOut = { handled: false };
  assertEquals(stillAnswering(timedOut, { checkRunning: true }), true);
  assertEquals(stillAnswering(timedOut, { checkRunning: false }), false);
});

Deno.test("A finished or failed rule ends the wait", () => {
  const engine = { checkRunning: true };
  assertEquals(stillAnswering({ handled: true, clicks: 3 }, engine), false);
  assertEquals(stillAnswering({ handled: false, error: true }, engine), false);
});
