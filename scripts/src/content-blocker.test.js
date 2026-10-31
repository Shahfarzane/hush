import { assertEquals } from "jsr:@std/assert@1";
import { createBlocker } from "./content-blocker.js";
import { transformLine } from "./convert.js";

const blocker = (lines) => createBlocker(lines.map(transformLine));

Deno.test("Hide rules respect the page's domain", () => {
  const rules = blocker([
    "###everywhere",
    "example.com###only-example",
    "other.org###only-other",
  ]);
  assertEquals(rules.hiddenSelectors("https://www.example.com/page"), [
    "#everywhere",
    "#only-example",
  ]);
});

Deno.test("A hide exception for a site cancels earlier rules there", () => {
  const rules = blocker(["###banner", "example.com#@##banner"]);
  assertEquals(rules.hiddenSelectors("https://example.com/"), []);
  assertEquals(rules.hiddenSelectors("https://other.org/"), ["#banner"]);
});

Deno.test("Block rules honour third-party and resource type", () => {
  const rules = blocker([
    "||consent.example-cmp.com^$third-party",
    "||cdn.site.com/cmp.js$script",
  ]);
  const page = "https://www.site.com/";
  assertEquals(
    rules.blocks("https://consent.example-cmp.com/uc.js", page, "script"),
    true,
  );
  assertEquals(
    rules.blocks(
      "https://consent.example-cmp.com/uc.js",
      "https://example-cmp.com/",
      "script",
    ),
    false,
  );
  assertEquals(
    rules.blocks("https://cdn.site.com/cmp.js", page, "script"),
    true,
  );
  assertEquals(
    rules.blocks("https://cdn.site.com/cmp.js", page, "image"),
    false,
  );
});

Deno.test("An allow rule after a block unblocks the request", () => {
  const rules = blocker([
    "||cmp.example.com^",
    "@@||cmp.example.com^$domain=site.com",
  ]);
  assertEquals(
    rules.blocks("https://cmp.example.com/x.js", "https://site.com/", "script"),
    false,
  );
  assertEquals(
    rules.blocks("https://cmp.example.com/x.js", "https://else.org/", "script"),
    true,
  );
});
