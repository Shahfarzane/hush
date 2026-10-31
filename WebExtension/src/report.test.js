import { assertEquals } from "jsr:@std/assert@1";
import { isAnswered } from "./report.js";

Deno.test("Only a handled banner with a click counts as answered", () => {
  assertEquals(isAnswered({ handled: true, cmpName: "bing", clicks: 2 }), true);
  assertEquals(
    isAnswered({ handled: true, cmpName: "yahoo_consent", clicks: 0 }),
    false,
  );
  assertEquals(isAnswered({ handled: false }), false);
  assertEquals(isAnswered({ handled: false, error: true }), false);
});
