import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  isAnswerModeExcluded,
  parseMarkers,
  stripAnswerModeExclusions,
} from "./answer-mode.js";

const markers = parseMarkers(
  await readFile(
    new URL("../../data/answer-mode-exclusions.txt", import.meta.url),
    "utf8",
  ),
);

test("Hide and block rules of answered platforms are dropped", () => {
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
      "###truste-consent-track",
      "||consent.trustarc.com$script",
      "chipotle.com###ketch-consent-banner",
      "ConsentManager$script,third-party",
    ]
  ) {
    assert.deepEqual(isAnswerModeExcluded(line, markers), true, line);
  }
});

test("Look-alikes, exceptions and unlisted platforms stay", () => {
  for (
    const line of [
      "###cookiebottombar",
      "##.sticky-bar-cookie",
      "cookiebot.com##.granify-widget-container",
      "@@||cookiebot.com^$domain=asket.com",
      "example.com#@##onetrust-banner-sdk",
      "###krn-privacy-center",
      "sketch.london##.cookies-modals",
      "jobs.wavy.com,trustee-connect.com##.cookie-notice-v2",
      "! OneTrust comment",
    ]
  ) {
    assert.deepEqual(isAnswerModeExcluded(line, markers), false, line);
  }
});

test("Stripping keeps every other line in order", () => {
  assert.deepEqual(
    stripAnswerModeExclusions(
      "###a\n###onetrust-banner-sdk\n@@||onetrust.com^\n###b",
      markers,
    ),
    "###a\n@@||onetrust.com^\n###b",
  );
});
