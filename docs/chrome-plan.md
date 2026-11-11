# Hush Extra for Chrome: plan

Status: research and a load probe 2026-11-11 on MBPro16; built the same day with the app's settings shared through a native messaging host (see Decisions and Results).

## Goal

Run Hush Extra's banner answering in Chrome and Helium on the Mac, at the same level as in Safari ("functional only" for Shahin), from the same `WebExtension/` source and `data/` rules. iPhone stays on Safari: Chrome on iOS and Android has no extensions.

## What the probe showed

A throwaway Playwright script loaded `build/WebExtension` (the Safari build, unchanged) into Chrome for Testing 157.0.8103.38 and then visited corpus sites. Observed, not inferred:

1. The unchanged build loads with no manifest errors or install warnings, but Chrome never starts the background: an MV3 manifest with `background.scripts` gets no service worker. Content scripts then get no replies (no settings, no fallback injection, no per-site hide CSS).
2. With only `"background": { "service_worker": "background.js" }` changed, everything else ran as is: the service worker started, `browser` was defined, the `block_answer` ruleset was on, and both test sites were answered at the default level:
   - cookiebot.com: `CookieConsent` = `necessary:true, preferences:true, statistics:false, marketing:false`.
   - onetrust.com: `OptanonConsent` `groups=1:1,2:0,3:1,4:0` (performance and targeting off, functional on).
   - didomi.io: no answer recorded; the headless page hit a Cloudflare challenge, so this is inconclusive, not a failure.
3. `browser.runtime.sendNativeMessage("ceo.nerd.hush", ...)` failed with "Specified native messaging host not found", and `readSettings` fell back to `normalizeSettings(undefined)`. The defaults happen to be functional only, so the answers above were right by luck: without a host there is no way to change the level, mode or paused sites, and "Pause on this site" fails.

The 2,130 static block rules (2,059 answer + 71 hide-only, no regex rules) are far under Chrome's 30,000 guaranteed static rules.

## Why so little has to change

The Safari extension is already Manifest V3 and written against `browser.*` with promises. Chrome 148 added the `browser` namespace and promise-returning `runtime.onMessage` listeners together ([Chrome docs](https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace)), and Chrome 157 and Helium (Chromium 157.0.8103.50) are past that. `scripting.executeScript` with `world: "MAIN"`, `scripting.insertCSS`, `storage.session`, `declarativeNetRequest` static rulesets and `match_about_blank` content scripts all exist in Chrome with the same shapes. Consent-O-Matic's engine already calls `chrome.runtime.sendMessage` and uses `chrome.dom.openOrClosedShadowRoot` (Chromium only) when it is there, so it does slightly more in Chrome than in Safari.

What is Safari-specific is the settings path: `background.js` reads and writes settings through `sendNativeMessage`, which Safari hands to `SafariWebExtensionHandler` inside the app. Chrome instead starts a separately registered executable per message ([Chrome docs](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)).

## Chrome versus Safari, item by item

| Piece | Safari | Chrome and Helium |
|---|---|---|
| Background | `background.scripts`, non-persistent page | `background.service_worker` from `WebExtension/manifest.chrome.json`; Chrome stops it after about 30 s idle. The in-memory `cache`, `answers` and `appliedMode` already tolerate unloads (answers are mirrored to `storage.session`) |
| Settings | `sendNativeMessage` to the app extension, 5 s cache | Same call, answered by `hush-chrome-host`, a new process per message, so still at most one every 5 s |
| Pause on this site | `setPaused` through the native handler | Same, through the host |
| Debug reports | Native handler, logged in debug builds | Several per page, too many to start a process for: `console.debug("HUSH-REPORT ...")` in the service worker |
| Rulesets | `rulesetUpdate` names every ruleset (Safari relaunch workaround) | Harmless, unchanged |
| Extension ID | Assigned by Safari | Fixed by the `key` in `manifest.chrome.json`: `peklpnngkdekjbeheogkeabpllgmnefj`. The host's `allowed_origins` takes no wildcards |
| Install | Xcode app bundles the extension | Unpacked `build/ChromeExtension` |

## Settings options considered

**A: Chrome keeps its own settings** in an options page and `chrome.storage.sync`. No native parts, store-friendly, but the level and paused sites are set apart from Safari and the iPhone.

**B: share the app's settings through a native host (chosen).** Chrome's counterpart of the Safari handler.

### B as built

- `macOS/ChromeHost/main.swift`, compiled with `Shared/Models/ConsentSettings.swift`, the app's own settings code. It reads one message (32-bit native-endian length, then UTF-8 JSON), answers `getSettings` and `setPaused` with the same JSON shape as the Safari handler, and exits. `ConsentSettingsStore.setPaused` now holds the pause logic both use.
- Sandboxed, with the App Group entitlement `89S32876QM.ceo.nerd.hush` and an embedded `Info.plist` naming that group (`HushAppGroup`, as the extensions' plists do). A Team-ID-prefixed group needs no provisioning profile on macOS, so a bare tool signed with the team's Developer ID identity can open it; reading it raised no permission prompt.
- No iCloud: `NSUbiquitousKeyValueStore` needs the `ubiquity-kvstore-identifier` entitlement, which needs a profile, which a bare tool cannot carry. `ConsentSettingsStore` takes `iCloud: false` for the host, which then works on the App Group alone. Its App Group copy may be older than one another device saved, so the host never stamps a new `modifiedAt` (that copy would win the next sync and undo the other device's change; Chiron's F1 on PR 35). `queuePause` applies the pause to the App Group copy as is, for Chrome to see at once, and queues it under `queuedPauses`. The app (on activation) and Safari's extension (on every settings read) sync with iCloud and apply the queue on top of whichever copy won, then stamp and push it. So a pause made in Chrome reaches the iPhone on their next run, and a level changed on the iPhone reaches Chrome once one of them has run on the Mac.
- Every frame asks for settings as it starts; concurrent asks share one native read (`src/single-flight.js`), so a cold page with iframes starts one host process, not one per frame.
- It lives outside the app: `make chrome_host` builds it, signs it with "Developer ID Application", copies it to `~/Library/Application Support/Hush Extra/hush-chrome-host`, and writes `ceo.nerd.hush.json` into `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` and `~/Library/Application Support/net.imput.helium/NativeMessagingHosts/` (each browser looks in its user data folder). Bundling it inside `Hush Extra.app` instead would have changed release signing: the Makefile passes `PROVISIONING_PROFILE_SPECIFIER` on the command line for every target, which a command-line tool target rejects, and App Store and external TestFlight review would have to accept a helper that writes into browser folders. For an unpacked, personal install the Makefile route keeps the shipping app as it is.

## Distribution

1. **Load unpacked (chosen).** `chrome://extensions` (the same page in Helium), Developer mode, Load unpacked, pick `build/ChromeExtension`. It does not auto-update: after `make chrome`, press reload on the card. Branded Chrome 137 and later ignore the `--load-extension` flag, so the UI is the way in for Chrome itself; Chrome for Testing and Chromium still take the flag, which the corpus uses.
2. **Chrome Web Store.** $5 one-time registration, a privacy policy at a public URL (this repo is private), review that `<all_urls>` plus `scripting` can lengthen ([review process](https://developer.chrome.com/docs/webstore/review-process)). A store item gets its own ID unless the key's private half is uploaded; the private half of the current key was never saved, so a store ID would be added to `allowed_origins` next to this one.
3. **Self-hosted `.crx`.** Chrome on macOS refuses off-store installs without enterprise policy.

## What was built

- `WebExtension/manifest.chrome.json`: Chrome's keys (`key`, `minimum_chrome_version: "148"`, the service worker) laid over Safari's manifest by `scripts/src/chrome.js` (`make chrome`, into `build/ChromeExtension`). `minimum_chrome_version` keeps an older Chrome from loading a build whose promise-returning listeners it would answer with `undefined`.
- `background.js`: reports stay in the service worker console outside Safari; `appReachable` tracks whether the native side answered. The popup hides "Pause on this site" and says it cannot reach the app when it did not.
- `make chrome_host` and `scripts/chrome-host.js`: build, sign, install and register the host.
- `scripts/corpus.js --browser=chromium` (`make test_corpus_chrome`): loads the real `build/ChromeExtension` into Chrome for Testing, one throwaway profile per site, with a stand-in host in the profile's `NativeMessagingHosts` that answers `getSettings` with the level under test. Unlike the WebKit run, which injects `content.js` with a stubbed `browser`, this runs the real service worker, rulesets, injection and native messaging.
- Tests: `scripts/src/chrome.test.js` (manifest overlay, extension ID from the key, host manifest), `PauseTests` in `HushTests` (pause, unpause, invalid input, a host pause going up to iCloud on the next sync).

## Results (2026-11-11, MBPro16)

- Corpus in Chrome for Testing 157.0.8103.38, headless, functional only (`make test_corpus_chrome`): 31 pass, 0 wrong, 8 stricter, 7 answered without readback, 1 unanswered (adidas.se, unanswered in WebKit too), 2 regressed (didomi.io, 20minutes.fr; below), 0 errors.
- The first full run had 8 regressed and x.com failed to load: headless Chromium sends `HeadlessChrome/157` in its user agent, and x.com, bing.com, lufthansa.com, revolut.com and others walled it off or served no banner. With "Chrome/157" all of those pass or read stricter. The corpus now swaps the token.
- "Balanced" on cookiebot.com and onetrust.com stores performance on, so the level reaches the extension through native messaging, not from its built-in defaults.
- Didomi in Chrome: on both Didomi sites the rule clicks through (24 and 26 clicks) but leaves some purpose rows unset, and Didomi keeps "Save" disabled until every row has an answer, so nothing is stored and the preferences popup stays open. Unset on didomi.io: "Storing and/or accessing information on a terminal" and "Identify devices based on information actively requested"; on 20minutes.fr: "Attribution et utilisation d’identifiants publicitaires" and the stack "Publicité et contenus personnalisés de Tiers". WebKit sets them on the same pages (didomi.io stricter, 20minutes.fr pass). Consent-O-Matic matches rows by `textContent`, the same in both engines, and these rows match the rule's lists only through nested partner and stack text, so the likely cause is the rule running before that text loads in Chrome. Not proven, and real Safari (isolated world, different timing from the corpus's main-world injection) may share it. Nothing is over-consented. Open.
- Real host, Chrome for Testing: Chrome reported `peklpnngkdekjbeheogkeabpllgmnefj`, the ID the key gives. `getSettings` through `hush-chrome-host` returned the App Group's settings (functional only, saved 2026-10-31). In the popup, "Pause on this site" on cookiebot.com put `cookiebot.com` in the App Group's `pausedSites` and turning it off removed it. The popup was checked answered (light and dark), paused, and with no host registered ("Can't reach the Hush Extra app", pause row hidden).
- The host is 161 KB (arm64) and answers in 130 to 150 ms per message, its first run included.
- `make test_unit` 85 pass, `make check_format` clean, `make test_swift` 15 pass (4 new), Xcode builds of `Hush macOS` and `Hush iOS` succeed.
- Installed on MBPro16: `make chrome_host` put the host in `~/Library/Application Support/Hush Extra/` and registered it with Chrome and Helium.

## Risks

- Helium bundles uBlock Origin. If its cookie notice filter lists are on, uBO hides CMP banners before Hush can answer, the same failure the answer-mode list exclusions fix for Hush's own lists.
- Cold service worker: the background bundle is 805 KB (the per-site hide table has 16,141 domains). Every frame's `hideCss` message wakes the worker, so per-site hide CSS can land later than in Safari on a cold start.
- Chrome changes MV3 behavior faster than Safari; the corpus run in Chromium is the check.
- Two answerers: running "I still don't care about cookies" or Consent-O-Matic next to Hush races the same banners.
- The host is built from the checkout: after a change to `ConsentSettings.swift`, run `make chrome_host` again. Moving the checkout does not matter (the host is copied out), but the unpacked extension is loaded from `build/ChromeExtension` in the checkout.

## Decisions (Shahin, 2026-11-11)

1. Chrome and Helium share the app's settings through a native host (Option B).
2. Installed unpacked, for personal use; no Chrome Web Store for now.
3. Build it now.
