import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildWebLists } from "./web-lists.js";
import { createMatcher } from "./dnr.js";
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

test("Block lines become declarativeNetRequest rules", () => {
  assert.deepEqual(lists.rules.answer, [
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
  assert.deepEqual(lists.rules.hideOnly, [
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

test("Generic selectors no site exempts go in the stylesheet", () => {
  assert.deepEqual(lists.css, ".cookie-banner{display:none!important}\n");
  assert.deepEqual(lists.perSite.hideOnly, [".cmp-wall"]);
  assert.deepEqual(lists.genericHideOff, ["generichide.example"]);
});

test("Site rules and exceptions apply per site and subdomain", () => {
  const css = (host, mode = "answer") => siteCss(lists.perSite, host, mode);
  assert.deepEqual(
    css("news.example"),
    ".local-notice{display:none!important}\n.shared-popup{display:none!important}\n",
  );
  // shop.example exempts .shared-popup but keeps its own rule.
  assert.deepEqual(
    css("www.shop.example"),
    ".local-notice{display:none!important}\n",
  );
  assert.deepEqual(
    css("other.example"),
    ".shared-popup{display:none!important}\n",
  );
  assert.deepEqual(
    css("other.example", "hide"),
    ".shared-popup{display:none!important}\n.cmp-wall{display:none!important}\n",
  );
});

test("Options the extension cannot express are refused", () => {
  assert.throws(() => buildWebLists("||x.example^$popup", []));
  assert.throws(() => buildWebLists("example.com#?#div:has-text(Cookies)", []));
});

test("Answer mode lets its allow list through, Only hide it does not", () => {
  const built = buildWebLists(
    "/gdpr-consent-\n",
    [],
    "! a comment\n@@||cdn.example/consent-mf/*gdpr-consent-$domain=shop.example\n",
  );
  const answer = createMatcher(built.rules.answer);
  const hide = createMatcher([...built.rules.answer, ...built.rules.hideOnly]);
  const listed = {
    url: "https://cdn.example/consent-mf/a1/gdpr-consent-modal-view-f1.js",
    type: "script",
    initiator: "www.shop.example",
  };
  assert.deepEqual(answer(listed), false);
  assert.deepEqual(hide(listed), true);
  // Only on the sites the line names.
  assert.deepEqual(answer({ ...listed, initiator: "other.example" }), true);
  const other = {
    url: "https://other.example/js/gdpr-consent-banner.js",
    type: "script",
    initiator: "other.example",
  };
  assert.deepEqual(answer(other), true);
  assert.deepEqual(hide(other), true);
  assert.throws(() => buildWebLists("", [], "||cdn.example^"));
});

test("Answer mode lets scripts through only where a site rule answers", async () => {
  const read = (path) =>
    readFile(new URL(`../../data/${path}`, import.meta.url), "utf8");
  const answered = new Set(
    JSON.parse(await read("site-rules.json")).flatMap((rule) => rule.sites),
  );
  const lines = (await read("answer-mode-allow.txt")).split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("!"));
  for (const line of lines) {
    const domains = line.match(/\$(?:.*,)?domain=([^,]+)/)?.[1].split("|") ??
      [];
    assert.deepEqual(domains.length > 0, true, `${line} names no sites`);
    assert.deepEqual(
      domains.filter((domain) => !answered.has(domain)),
      [],
      line,
    );
  }
});

test("The generic stylesheet skips every $generichide site", async () => {
  const read = (path) =>
    readFile(new URL(`../../data/${path}`, import.meta.url), "utf8");
  const ignored = new Set((await read("ignored.txt")).split("\n"));
  const text = (await read("vendor/fanboy-cookiemonster.txt")).split("\n")
    .filter((line) => !ignored.has(line)).join("\n");
  const { genericHideOff } = buildWebLists(text, []);
  const entry = manifest.content_scripts.find((script) =>
    script.css?.includes("hide.css")
  );
  assert.deepEqual(
    [...entry.exclude_matches].sort(),
    genericHideOff.flatMap((domain) => [`*://${domain}/*`, `*://*.${domain}/*`])
      .sort(),
  );
});
