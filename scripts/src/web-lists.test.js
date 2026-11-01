import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { buildWebLists } from "./web-lists.js";
import { siteCss } from "../../WebExtension/src/hide-css.js";
import manifest from "../../WebExtension/manifest.json" with { type: "json" };

const LISTS = `! comment
##.cookie-banner
##.cmp-wall
##.shared-popup
news.example,shop.example##.local-notice
shop.example#@#.shared-popup
||consent.example^$script,third-party
@@||consent.example/allowed.js
||cmp.example/loader.js$domain=a.example|~b.example
@@||generichide.example^$generichide
`;

const lists = buildWebLists(LISTS, ["cmp"]);

Deno.test("Block lines become declarativeNetRequest rules", () => {
  assertEquals(lists.rules.answer, [
    {
      id: 1,
      priority: 1,
      action: { type: "block" },
      condition: {
        urlFilter: "||consent.example^",
        resourceTypes: ["script"],
        domainType: "thirdParty",
      },
    },
    {
      id: 2,
      priority: 2,
      action: { type: "allow" },
      condition: { urlFilter: "||consent.example/allowed.js" },
    },
  ]);
  // Answer mode leaves the "cmp" platform for the engines to answer.
  assertEquals(lists.rules.hideOnly, [
    {
      id: 1,
      priority: 1,
      action: { type: "block" },
      condition: {
        urlFilter: "||cmp.example/loader.js",
        initiatorDomains: ["a.example"],
        excludedInitiatorDomains: ["b.example"],
      },
    },
  ]);
});

Deno.test("Generic selectors no site exempts go in the stylesheet", () => {
  assertEquals(lists.css, ".cookie-banner{display:none!important}\n");
  assertEquals(lists.perSite.hideOnly, [".cmp-wall"]);
  assertEquals(lists.genericHideOff, ["generichide.example"]);
});

Deno.test("Site rules and exceptions apply per site and subdomain", () => {
  const css = (host, mode = "answer") => siteCss(lists.perSite, host, mode);
  assertEquals(
    css("news.example"),
    ".local-notice{display:none!important}\n.shared-popup{display:none!important}\n",
  );
  // shop.example exempts .shared-popup but keeps its own rule.
  assertEquals(
    css("www.shop.example"),
    ".local-notice{display:none!important}\n",
  );
  assertEquals(css("other.example"), ".shared-popup{display:none!important}\n");
  assertEquals(
    css("other.example", "hide"),
    ".shared-popup{display:none!important}\n.cmp-wall{display:none!important}\n",
  );
});

Deno.test("Options the extension cannot express are refused", () => {
  assertThrows(() => buildWebLists("||x.example^$popup", []));
  assertThrows(() => buildWebLists("example.com#?#div:has-text(Cookies)", []));
});

Deno.test("The generic stylesheet skips every $generichide site", async () => {
  const read = (path) =>
    Deno.readTextFile(new URL(`../../data/${path}`, import.meta.url));
  const ignored = new Set((await read("ignored.txt")).split("\n"));
  const text = (await read("vendor/fanboy-cookiemonster.txt")).split("\n")
    .filter((line) => !ignored.has(line)).join("\n");
  const { genericHideOff } = buildWebLists(text, []);
  const entry = manifest.content_scripts.find((script) =>
    script.css?.includes("hide.css")
  );
  assertEquals(
    [...entry.exclude_matches].sort(),
    genericHideOff.flatMap((domain) => [`*://${domain}/*`, `*://*.${domain}/*`])
      .sort(),
  );
});
