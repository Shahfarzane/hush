# Consent levels for Hush: plan

Status: decisions settled 2026-10-31, waiting on the go-ahead for Phase 0. Nothing implemented yet.

## Goal

Hush today only hides cookie banners. The goal is a mode where Hush answers banners with the user's own choice, at a level set in a settings panel, the way Super Agent does it. The level Shahin uses is "functional cookies only": functional on, performance, advertising and other off. It has to work in Safari on both iOS and macOS.

## What Super Agent does (reference)

Sources: the Codex report at `~/Documents/Codex Default/super-agent-investigation-2026-10-31/report.html`, its readable sources in `readable/`, and `evidence/localization-en.json` from Super Agent 4.7.2 (build 4035).

- A Safari Web Extension content script runs at `document_start` in all frames, finds the consent banner, and clicks or toggles controls according to the user's preferences (report section 4, `content.js:120`, `content.js:1433`).
- Preferences are four categories plus a background-hiding flag. Code fallback, verbatim from `background.js:16940`: `advertising:!1, performance:!0, functional:!0, other:!1, background:!0`.
- Settings labels, verbatim from `localization-en.json`: "Cookie Preferences", "Functional cookies", "Performance cookies", "Advertising cookies", "Other cookies", presets "Maximum privacy" and "Balanced" (badge "Most popular"), "Or adjust each category", "Whitelist" ("Websites added to your whitelist will still display their cookie banners."), "Easylist" (hide banners before rule execution).
- Branch choice, from `content.js:1286` and `content.js:1309`: if every optional category is off, use reject-all, then accept-necessary, then edit-settings, then accept-all. If all are on, accept-all. Otherwise edit-settings (per-category toggles), falling back to accept-necessary, reject-all, and last accept-all.
- Inferred, not verified: "Balanced" equals the code fallback (functional and performance on).
- Rules come from Super Agent's private CDN (`files-prod.super-agent.com`). We do not use them. We use open-source rule sets instead.

## Why Hush cannot do it today

Hush ships only a Safari content blocker (`com.apple.Safari.content-blocker`, `Shared/ContentBlockerRequestHandler.swift`). Content blockers are declarative JSON: they can block requests and `display: none` elements, but they cannot run code, so they cannot click "Save preferences". Answering a banner needs a Safari Web Extension with a content script. Hush's README FAQ says this outright ("won't click on any buttons"), which is why this is a fork feature and not an upstream PR.

## Architecture

### Targets

| Target | Platforms | Role |
|---|---|---|
| Hush app (existing) | iOS, macOS | Settings panel, onboarding, source of truth for settings |
| ContentBlocker (existing) | iOS, macOS | Declarative hide/block. Serves one of two lists depending on mode |
| WebExtension (new) | iOS, macOS | Content script answers banners; background bridges settings from the app |

All three share an App Group (`group.ceo.nerd.hush`). The app writes settings to `UserDefaults(suiteName:)`. The content blocker handler reads the mode from it to pick a list. The web extension's `SafariWebExtensionHandler` reads it on `browser.runtime.sendNativeMessage` from the background script, which caches it in `browser.storage.local` so content scripts do not pay a native round trip per page.

### Consent engines

1. **Consent-O-Matic engine** (CAVI, Aarhus University, MIT, https://github.com/cavi-au/Consent-O-Matic). Primary engine because it is the only open-source engine with per-category consent: each rule's `consent` action has a `type` and the engine sets toggles to match the user's category values. 204 rule files today, covering OneTrust, Cookiebot, Usercentrics, Didomi, Sourcepoint, TrustArc and others. The engine is embeddable: `new ConsentEngine(config, consentTypes, callback)` (`Extension/contentScript.js`). It already ships a Safari iOS/macOS Xcode project, so the code runs in WebKit. Last release v1.1.5 (2025-06-17), last push 2026-02-07, 4.3k stars. We vendor the engine files and bundle the rules at build time.
2. **DuckDuckGo autoconsent** (MPL-2.0, https://github.com/duckduckgo/autoconsent). Fallback for coverage: 913 JSON rules plus 13 coded CMPs and heuristics, released daily (v17.2.0 on 2026-10-31), used in DuckDuckGo's iOS and macOS browsers (WebKit). It is binary only (opt-in or opt-out), so it runs only when Consent-O-Matic did not handle the page. Used as an unmodified npm package, which keeps MPL obligations trivial.
3. **Hush hide rules** (existing). Last resort for the long tail no engine knows.

### Category mapping

| Hush category (Super Agent name) | Consent-O-Matic types | Cookiebot | OneTrust |
|---|---|---|---|
| Necessary (always on) | n/a | necessary | C0001 |
| Functional | A (Preferences and Functionality) | preferences | C0003 |
| Performance | B (Performance and Analytics) | statistics | C0002 |
| Advertising | E (Content selection, delivery, reporting), F (Ad selection, delivery, reporting) | marketing | C0004, C0005 |
| Other | D (Information Storage and Access), X (Other Purposes) | n/a | rest |

Putting D under "Other" is a judgment call: D is TCF Purpose 1 (store or access information on a device). With "functional only" it stays off, which is the privacy-safe reading and matches Super Agent's "other: off".

### Decision order per page

1. Site paused (whitelist) or mode is "Hide only": do nothing in JS.
2. Consent-O-Matic detects a CMP it has a rule for: apply categories exactly. Hide the banner while it works if "Hide banner while answering" is on.
3. Otherwise autoconsent detects a CMP: all categories off or mixed: opt-out. All on: opt-in. For "functional only" this means functional is refused on these sites too. Super Agent's fallback does the same (reject-all before accept-all).
4. Otherwise the content blocker's hide rules cover it, as Hush does today.
5. A banner with no way to refuse (only "Accept"): hide it, never accept. This departs from Super Agent, whose last fallback is accept-all.

### Content blocker interplay (the subtle part)

Hush's current list blocks CMP scripts (for example `||consent.trustarc.com$script`, Sourcepoint) and hides CMP containers (for example `#onetrust-banner-sdk`, `#qc-cmp2-container`). If that stays on in answer mode, the engines never see a visible banner (Consent-O-Matic checks `isShowing()`), so the user's choice is never saved and sites with consent walls break.

So the build emits two lists from the same `data/*.txt` sources:

- `blockerList.json`: today's list, used in "Hide only" mode.
- `blockerList-answer.json`: the same list minus every network block of a CMP script and minus every hide rule targeting a CMP that an engine handles. The exclusion set is generated from the engines' detector selectors plus an explicit table of CMP markers (`onetrust`, `CybotCookiebot`, `didomi`, `qc-cmp`, `sp_message`, `usercentrics`, `truste`, `BorlabsCookie`, `cmplz`, `cky-`, ...) in `data/answer-mode-exclusions.txt`, and verified against the test corpus below.

`ContentBlockerRequestHandler` returns the list matching the mode in the App Group, and the app calls `SFContentBlockerManager.reloadContentBlocker` when the mode changes.

### Privacy

Rules are bundled at build time, not fetched at runtime, so Hush keeps its "nothing leaves your device" promise. Consent-O-Matic's own extension fetches rule lists from GitHub at runtime; we drop that. Rule freshness comes from `make fetch_external`, extended to pull both engines' rules.

## Settings panel

SwiftUI, in the Hush app on both platforms (iOS `Form`, macOS `Settings` scene plus the main window). Modeled on Super Agent's Preferences screen.

**Cookie preferences**
- Privacy level picker: "Maximum privacy" (all off), "Functional only" (Shahin's level), "Balanced" (functional and performance), "Custom".
- Four toggles with one-line summaries: Functional, Performance, Advertising, Other. Editing a toggle switches the picker to "Custom".
- Read-only row: "Necessary cookies: always allowed".

**Behavior**
- Mode: "Answer banners with my choices" or "Only hide banners (classic Hush)".
- "Hide banner while answering" (Super Agent's background flag), default on.
- Banners with no way to refuse are always hidden, never accepted. Fixed behavior, not a setting.
- "Sync with iCloud", default on (Phase 6).

**Paused sites**: list of hostnames where Hush does nothing, add and remove. Also reachable from the extension popup ("Pause on this site").

**Status**: content blocker and web extension enabled state with enable instructions. macOS can query both (`SFContentBlockerManager`, `SFSafariExtensionManager`). iOS has no public API for web extension state, so the app shows instructions and a "Test on a sample page" link instead.

Extension popup (Safari toolbar on macOS, the extensions menu in the iOS address bar): what was handled on this page (CMP name, outcome), "Pause on this site", "Open Hush settings".

## Phases

Each phase ends in a commit that builds and passes its verification.

**Phase 0: fork setup and spike**
- Create private `Shahfarzane/hush` and make it `origin`; rename the current `origin` (`oblador/hush`) to `upstream` for rule updates.
- Bundle IDs to `ceo.nerd.hush`, `ceo.nerd.hush.ContentBlocker`, `ceo.nerd.hush.WebExtension`, App Group `group.ceo.nerd.hush`, team ID from Shahin's signing identity via `op-agents`. Files: `Hush.xcodeproj/project.pbxproj`, entitlements, `HushUITests/HushUITests.swift` (hardcodes `se.oblador.Hush.ContentBlocker`).
- Deployment targets to iOS 17 and macOS 14 (from 14.3 and 11.0). Safari Web Extensions need iOS 15 at minimum; 17 and 14 allow `@Observable` and current SwiftUI `Form` APIs.
- Spike: a throwaway web extension that injects the Consent-O-Matic engine on a Cookiebot test page in iOS Simulator Safari and macOS Safari. Proves content-script injection, `all_frames`, native messaging, App Group reads, and reading a shared iCloud key-value store from the extension on both platforms before building on them.
- Verify: both platforms build; spike logs `HandledCMP` and `Cookiebot.consent` reads `preferences: true, statistics: false, marketing: false`.

**Phase 1: web extension with Consent-O-Matic**
- New targets `WebExtension iOS` and `WebExtension macOS`, shared `Shared/WebExtension/SafariWebExtensionHandler.swift`, `WebExtension/` holding `manifest.json` (MV3, `content_scripts` at `document_start`, `all_frames`, `match_about_blank`), background script, content script.
- `scripts/build-extension.js` (Deno) bundles the vendored engine (`vendor/consent-o-matic/`, with its MIT license) and rules into `content.js`. Xcode build phase calls it like `make xcode` does for the blocklist.
- Settings model: `Shared/Models/ConsentSettings.swift` (categories, mode, hide-while-answering, paused sites) stored in the App Group, with a JSON shape shared with the extension.
- Verify: Deno unit tests for category mapping and decision order (`scripts/src/*.test.js`); manual Cookiebot and OneTrust pages on both platforms with consent state read back from the CMP API.

**Phase 2: settings panel**
- `Shared/Views/SettingsView.swift`, `Shared/Views/PausedSitesView.swift`, wiring in `ContentView.swift` and `HushApp.swift` (macOS `Settings` scene).
- Verify: UI test that picks "Functional only" and asserts the stored App Group value; screenshots of iOS and macOS settings rendered and checked.

**Phase 3: answer-mode content blocker list**
- `scripts/build-blocklist.js` emits both lists; `data/answer-mode-exclusions.txt`; `ContentBlockerRequestHandler.swift` picks by mode; app reloads the blocker on mode change.
- Verify: unit test that the answer list contains no rule matching the exclusion markers and still contains the rest; corpus run shows banners answered, not hidden, for engine-covered CMPs.

**Phase 4: autoconsent fallback**
- Add `npm:@duckduckgo/autoconsent` to the bundle, `autoAction` left unset so our orchestrator decides after Consent-O-Matic reports. Eval rules need `scripting.executeScript` in the page's main world; the spike checks Safari support, and rules that need it are disabled if not.
- Verify: corpus sites covered only by autoconsent end in opt-out.

**Phase 5: popup and polish**
- Popup with page status and pause toggle; onboarding copy for enabling both extensions, "All Websites" permission, and Private Browsing.
- Verify: popup on both platforms, pause round-trips to the app.

**Phase 6: iCloud sync between iPhone and Mac**
- `NSUbiquitousKeyValueStore` holds the settings JSON, with the same `com.apple.developer.ubiquity-kvstore-identifier` on the app and the web extension so the extension's native handler reads synced values even when the app has not been opened on that device. The App Group copy stays as the local cache and as the source for the content blocker handler.
- Conflict rule: last write wins per whole settings object, stamped with a modification date. Paused sites merge as a set union so a pause added on one device is not dropped by the other.
- The spike in Phase 0 confirms the extension can read the shared KVS store on both platforms; if not, the app mirrors KVS into the App Group on launch and on `didChangeExternallyNotification`, and the plan notes that iOS picks up changes the next time the app runs.
- Verify: change the level on the Mac, read it back on the iPhone (Simulator signed into the same Apple Account, then the real devices).

**Later, only on request**: scheduled rule refresh.

## Test corpus and verification

A Playwright WebKit suite injects the built `content.js` as an init script (same engine as Safari, no extension shell) and visits a fixed list of CMP pages: Cookiebot, OneTrust, Didomi, Usercentrics, Sourcepoint, Quantcast/InMobi, TrustArc, Borlabs, Complianz, CookieYes. For each it reads the stored consent back from the CMP's API or cookie (`Cookiebot.consent`, `OptanonConsent` groups, `__tcfapi('getTCData')` purposes) and asserts the "functional only" result. The Codex investigation's `cookiebot-consent-test` tooling is the starting point for the Cookiebot case.

The real-Safari check is manual per phase: iOS Simulator Safari and macOS Safari, then Shahin's iPhone and Mac, with Super Agent and the App Store Hush disabled so they do not race the fork.

## Risks

- Rule rot: CMPs change markup. Consent-O-Matic's rule cadence is slower than autoconsent's; that is why autoconsent is the fallback.
- Synthetic clicks: some CMPs ignore untrusted events. Both engines already work around the common cases.
- iOS permission friction: the web extension does nothing until the user grants website access in Settings or per site.
- Exclusion list accuracy: if a CMP marker is missed, the blocker hides the banner and the choice is never saved. The corpus catches the common CMPs; the long tail falls back to hiding, which is today's behavior.
- Two Safari extensions from one app: supported, but the user must enable both. Onboarding has to make that obvious.
- Upstream drift: rule updates in `oblador/hush` keep landing in `data/`; merging `upstream/master` should stay conflict-free as long as we add files instead of editing theirs.

## Decisions (Shahin, 2026-10-31)

1. The fork lives in a private repo, `Shahfarzane/hush`, with `oblador/hush` as `upstream`.
2. Banners with no way to refuse are hidden, never accepted.
3. CMPs only autoconsent knows get reject-all, functional included.
4. Settings sync between iPhone and Mac through iCloud, as Phase 6.
