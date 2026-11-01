import { assertEquals } from "jsr:@std/assert@1";
import { createMatcher, urlFilterRegExp } from "./dnr.js";

Deno.test("urlFilter anchors and separators become a RegExp", () => {
  const domain = urlFilterRegExp("||consent.example^");
  assertEquals(domain.test("https://consent.example/x.js"), true);
  assertEquals(domain.test("https://cdn.consent.example/x.js"), true);
  assertEquals(domain.test("https://consent.example.org/x.js"), false);
  assertEquals(
    urlFilterRegExp("-cookie-consent.js").test(
      "https://a.b/x-cookie-consent.js?v=1",
    ),
    true,
  );
  assertEquals(
    urlFilterRegExp("/didomi.js|").test("https://a.b/didomi.js?v=1"),
    false,
  );
  assertEquals(
    urlFilterRegExp("/js/onetrust/*").test("https://a.b/js/onetrust/otSDK.js"),
    true,
  );
});

const block = (id, urlFilter, extra = {}) => ({
  id,
  priority: 1,
  action: { type: "block" },
  condition: { urlFilter, ...extra },
});

Deno.test("Conditions and exceptions decide what is blocked", () => {
  const blocks = createMatcher([
    block(1, "||consent.example^", {
      domainType: "thirdParty",
      resourceTypes: ["script"],
    }),
    block(2, "/banner.js", { initiatorDomains: ["news.example"] }),
    {
      id: 3,
      priority: 2,
      action: { type: "allow" },
      condition: { urlFilter: "||consent.example/ok.js" },
    },
  ]);
  const request = (url, type = "script", initiator = "shop.example") => ({
    url,
    type,
    initiator,
  });
  assertEquals(blocks(request("https://consent.example/cmp.js")), true);
  assertEquals(blocks(request("https://consent.example/ok.js")), false);
  assertEquals(
    blocks(request("https://consent.example/cmp.css", "stylesheet")),
    false,
  );
  // First-party on the platform's own site.
  assertEquals(
    blocks(
      request(
        "https://consent.example/cmp.js",
        "script",
        "www.consent.example",
      ),
    ),
    false,
  );
  assertEquals(
    blocks(request("https://cdn.x/banner.js", "script", "m.news.example")),
    true,
  );
  assertEquals(blocks(request("https://cdn.x/banner.js")), false);
  // No resourceTypes: everything but the page itself.
  assertEquals(
    createMatcher([block(1, "/x")])(request("https://a.b/x", "main_frame")),
    false,
  );
});
