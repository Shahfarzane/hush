import { assertEquals } from "jsr:@std/assert@1";
import { describeAnswer } from "./platforms.js";

Deno.test("Rule names become platform names", () => {
  assertEquals(describeAnswer("onetrust_pctab"), {
    platform: "OneTrust",
    fallback: false,
  });
  assertEquals(describeAnswer("autoconsent:TrustArc-top"), {
    platform: "TrustArc",
    fallback: true,
  });
  assertEquals(describeAnswer("someshop.example"), {
    platform: "someshop.example",
    fallback: false,
  });
});
