import { assertEquals } from "jsr:@std/assert@1";
import {
  isAnswerModeExcluded,
  parseMarkers,
  stripAnswerModeExclusions,
} from "./answer-mode.js";

const markers = parseMarkers(
  await Deno.readTextFile(
    new URL("../../data/answer-mode-exclusions.txt", import.meta.url),
  ),
);

Deno.test("Hide and block rules of answered platforms are dropped", () => {
  for (
    const line of [
      "###onetrust-consent-sdk",
      "feber.se###qc-cmp2-container",
      "##.cky-consent-container",
      'kotaku.com,insider.com##[id^="sp_message_container_"]',
      "||consent.cookiebot.com/uc.js",
      "||cdn.cookielaw.org^$third-party",
      "/cmp_didomi.js",
      "/otBannerSdk.js",
      "||privacy-center.org^$third-party",
      "||inmobi.com^$third-party",
    ]
  ) {
    assertEquals(isAnswerModeExcluded(line, markers), true, line);
  }
});

Deno.test("Look-alikes, exceptions and unlisted platforms stay", () => {
  for (
    const line of [
      "###cookiebottombar",
      "##.sticky-bar-cookie",
      "cookiebot.com##.granify-widget-container",
      "@@||cookiebot.com^$domain=asket.com",
      "example.com#@##onetrust-banner-sdk",
      "||consent.trustarc.com$script",
      "###truste-consent-track",
      "###krn-privacy-center",
      "! OneTrust comment",
    ]
  ) {
    assertEquals(isAnswerModeExcluded(line, markers), false, line);
  }
});

Deno.test("Stripping keeps every other line in order", () => {
  assertEquals(
    stripAnswerModeExclusions(
      "###a\n###onetrust-banner-sdk\n@@||onetrust.com^\n###b",
      markers,
    ),
    "###a\n@@||onetrust.com^\n###b",
  );
});
