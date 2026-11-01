# Consent levels for Hush: plan

Status: Phases 0 to 6 done 2026-10-31, Phase 7 started and Phase 8 done 2026-11-01 (see their results sections).

## Goal

Hush today only hides cookie banners. The goal is a mode where Hush answers banners with the user's own choice, at a level set in a settings panel, the way Super Agent does it. The level Shahin uses is "functional cookies only": functional on, performance, advertising and other off. It has to work in Safari on both iOS and macOS.

## Background

Super Agent, a commercial Safari extension, answers cookie banners per category: functional, performance, advertising and other, with presets such as "Maximum privacy" and "Balanced", a list of sites to leave alone, and an option to hide banners while it answers. Its site rules are its own and are not used here. This fork builds the same idea on open-source rule sets: Consent-O-Matic (MIT) and DuckDuckGo's autoconsent (MPL-2.0).

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

Social media and social sharing cookies count as advertising, matching OneTrust's C0005.
| Other | D (Information Storage and Access), X (Other Purposes) | n/a | rest |

Putting D under "Other" is a judgment call: D is TCF Purpose 1 (store or access information on a device). With "functional only" it stays off, which is the privacy-safe reading and matches Super Agent's "other: off".

### Decision order per page

1. Site paused (whitelist) or mode is "Hide only": do nothing in JS.
2. Consent-O-Matic detects a CMP it has a rule for: apply categories exactly. Hide the banner while it works if "Hide banner while answering" is on.
3. Otherwise autoconsent detects a CMP: all categories off or mixed: opt-out. All on: opt-in. For "functional only" this means functional is refused on these sites too.
4. Otherwise the content blocker's hide rules cover it, as Hush does today.
5. A banner with no way to refuse (only "Accept"): hide it, never accept.

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
- Four toggles with one-line summaries: Functional, Performance, Advertising, Other. They show only when "Custom" is picked, starting from the current level, so the presets and the toggles are not on screen twice (changed 2026-10-31 after Shahin found them duplicated).
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
- Bundle IDs to `ceo.nerd.hush`, `ceo.nerd.hush.ContentBlocker`, `ceo.nerd.hush.WebExtension`, App Group `group.ceo.nerd.hush`, team ID `89S32876QM`. Files: `Hush.xcodeproj/project.pbxproj`, entitlements, `HushUITests/HushUITests.swift` (hardcodes `se.oblador.Hush.ContentBlocker`).
- Deployment targets to iOS 17 and macOS 14 (from 14.3 and 11.0). Safari Web Extensions need iOS 15 at minimum; 17 and 14 allow `@Observable` and current SwiftUI `Form` APIs.
- Spike: a throwaway web extension that injects the Consent-O-Matic engine on a Cookiebot test page in iOS Simulator Safari and macOS Safari. Proves content-script injection, `all_frames`, native messaging, App Group reads, and reading a shared iCloud key-value store from the extension on both platforms before building on them.
- Verify: both platforms build; spike logs `HandledCMP` and `Cookiebot.consent` reads `preferences: true, statistics: false, marketing: false`.

**Phase 0 results (2026-10-31)**
- Both platforms answer Cookiebot at "functional only". iOS Simulator (iPhone 17, iOS 27.2) Safari and macOS 27.2 Safari (private window) each stored `necessary:true, preferences:true, statistics:false, marketing:false, method:'explicit'`, read back from the `CookieConsent` cookie. The extension read the settings from the App Group on both.
- The web extension targets, native handler, settings model and Consent-O-Matic bundle landed here already, so Phase 1 extends them instead of starting from a throwaway.
- Upstream rule bug: Consent-O-Matic's Cookiebot `SAVE_CONSENT` clicks "Allow selection" and then "Deny" while the dialog fades, saving reject-all whatever the categories. Fixed locally through `data/consent-o-matic-overrides.json`, applied by `WebExtension/src/rules.js`. Worth reporting upstream. Expect more of this; the corpus run in Phase 1 is how we find them.
- macOS App Group: Xcode's automatic Mac profiles do not carry `group.ceo.nerd.hush`, and the sandboxed extension is refused reading it. macOS now uses `$(TeamIdentifierPrefix)ceo.nerd.hush`, iOS keeps `group.ceo.nerd.hush`, and each target reads its group from the `HushAppGroup` Info.plist key.
- iCloud key-value store: the macOS extension reads the app's `NSUbiquitousKeyValueStore` value directly, which is what Phase 6 needs. Cross-device sync itself is not yet tested.
- Build: the "Build web extension" script phase must declare its outputs, otherwise Xcode skips re-signing after it rewrites `content.js` and Safari rejects the extension ("Computing the code signing dictionary failed"). Upstream's "Build block list" phase has the same latent pattern; fix it in Phase 3 when it emits two lists.
- iOS Safari lists two rows: "Hush" for the web extension and a separate "Content Blocker" row under the Hush name. macOS Safari with profiles needs the extension enabled per profile and asks for Touch ID to allow it in Private Browsing.
- Simulator limits: the iOS 27.2 simulator has no `com.apple.SafariServices.ContentBlockerLoader` service, so `testSettingsIntegration` (content blocker state) fails there regardless of this work; it needs a real device. The new `testWebExtensionCanBeAllowedOnAllWebsites` passes.
- Not yet verified: a build on a real iPhone (device provisioning for `group.ceo.nerd.hush` and iCloud), and the App Store Hush content blocker on your iPhone hiding banners before the engine sees them.

**Phase 1: web extension with Consent-O-Matic**
- New targets `WebExtension iOS` and `WebExtension macOS`, shared `Shared/WebExtension/SafariWebExtensionHandler.swift`, `WebExtension/` holding `manifest.json` (MV3, `content_scripts` at `document_start`, `all_frames`, `match_about_blank`), background script, content script.
- `scripts/build-extension.js` (Deno) bundles the vendored engine (`vendor/consent-o-matic/`, with its MIT license) and rules into `content.js`. Xcode build phase calls it like `make xcode` does for the blocklist.
- Settings model: `Shared/Models/ConsentSettings.swift` (categories, mode, hide-while-answering, paused sites) stored in the App Group, with a JSON shape shared with the extension.
- Verify: Deno unit tests for category mapping and decision order (`scripts/src/*.test.js`); manual Cookiebot and OneTrust pages on both platforms with consent state read back from the CMP API.

**Phase 1 results (2026-10-31)**
- `make test_corpus` loads the built `content.js` into headless WebKit on 17 live sites covering Cookiebot, OneTrust (three variants), Didomi, Sourcepoint, Quantcast, Usercentrics, Complianz, CookieYes, Cookie Information and TrustArc, then reads each platform's stored consent back (`scripts/src/consent-readers.js`). A run fails only on over-consent (a category stored as allowed that the level refuses); refusing an allowed category is reported as "stricter". Latest run: 14 pass, 0 wrong, 1 stricter, 2 not answered.
- Over-consent bugs found and fixed through overrides:
  - Quantcast opened "More options" by matching text in five languages and then clicked the primary button, which is Accept on the summary screen. Every other language, Swedish included (feber.se), accepted everything. Options now open by `#more-options-btn` and saving only happens from the options view.
  - Amazon's advertising control and one Cookie Information markup variant's statistics switch were labelled functional, so "functional only" turned them on. Retyped.
  - Social media or ad measurement mislabelled as analytics or functional in OneTrust, Lenovo, lamarquezone, Cookie Control (Civic), Springer and Chandago. Retyped.
- A unit test now fails whenever a vendored or Hush rule labels an advertising or analytics control as functional, or an advertising control as analytics, so re-vendoring cannot silently bring these back.
- Hush-owned rules (`data/consent-rules.json`) for CookieYes, which Consent-O-Matic does not cover, and Usercentrics' current banner, which lives in an open shadow root that the vendored rule no longer matches.
- Real Safari: OneTrust (onetrust.com) stored `groups=1:1,2:0,3:1,4:0` (necessary and functional on, performance and targeting off) in both iOS 27.2 simulator Safari and macOS Safari.
- Known gaps: didomi.io stays stricter (the rule disagrees to every vendor, and Didomi then reports the functional purpose off; the purpose-level mapping is fixed). TrustArc is not answered on ibm.com and only hidden on oracle.com. No Borlabs site with a visible box was found for the corpus. These fall back to hiding today and are candidates for the Phase 4 fallback.

**Phase 2: settings panel**
- `Shared/Views/SettingsView.swift`, `Shared/Views/PausedSitesView.swift`, wiring in `ContentView.swift` and `HushApp.swift` (macOS `Settings` scene).
- Verify: UI test that picks "Functional only" and asserts the stored App Group value; screenshots of iOS and macOS settings rendered and checked.

**Phase 2 results (2026-10-31)**
- `Shared/Views/SettingsView.swift`: privacy level (Maximum privacy, Functional only, Balanced, Custom), the four categories with one-line summaries (any change outside a preset selects Custom), banner mode (answer or only hide), hide while answering, and paused sites. Paused sites are added through a prompt and normalised (`https://www.Example.com/x` becomes `example.com`). Styled with Hush's own tokens (yellow background and black accents, black and yellow in dark mode).
- iOS opens it from "Cookie level: … · Change" on the main screen; macOS from the same link or ⌘, as a `Settings` scene. Every change saves to the App Group and iCloud through `ConsentSettingsModel`.
- In answer mode the main screen reports the web extension, not the content blocker: macOS asks `SFSafariExtensionManager`; iOS has no such API, so the extension records when it last ran (`extensionLastSeen`) and the app reads that. Hide-only mode keeps the classic content blocker screen.
- The macOS main window is now sized to its content (`windowResizability(.contentSize)`), which removes the grey bands it showed when wider than 500 pt.
- Verified: iOS 27.2 simulator and macOS 27.2 screens rendered and checked in light and dark; presets drive the switches, a single switch moves the level to Custom, paused sites store normalised, and the stored App Group JSON matches the screen on both platforms. UI tests `testCookieLevelIsSavedAcrossLaunches` and `testPausedSiteIsNormalizedAndRemovable` pass; `testSettingsIntegration` now switches to hide-only mode first and restores answer mode in a teardown block, and still fails on the iOS 27.2 simulator for the missing ContentBlockerLoader reason noted in Phase 0.
- Not covered: the iOS "answering" signal stays on after the extension is later turned off, since iOS cannot report that; an end-to-end Safari check of a paused site (the JS side is unit tested).

**Phase 3: answer-mode content blocker list**
- `scripts/build-blocklist.js` emits both lists; `data/answer-mode-exclusions.txt`; `ContentBlockerRequestHandler.swift` picks by mode; app reloads the blocker on mode change.
- Verify: unit test that the answer list contains no rule matching the exclusion markers and still contains the rest; corpus run shows banners answered, not hidden, for engine-covered CMPs.

**Phase 3 results (2026-10-31)**
- `make blocklist BLOCKLIST_FLAGS=--answer-mode` builds `blockerList-answer.json`: the classic list minus block and hide rules that mention a marker in `data/answer-mode-exclusions.txt` (111 of 25,033 rules). Markers are curated per platform rather than generated from rule detectors, because generic detector selectors (`#cookiebottombar`, `sticky-bar`) would have dropped unrelated rules. Hide rules are matched on their selector only; exception rules always stay, since dropping an unblock can let a generic rule block a platform's script.
- Only platforms the corpus shows answered are listed. TrustArc and Borlabs keep being hidden and blocked in answer mode (checked on ibm.com: its script is blocked and `#truste-consent-track` hidden).
- Rules that block or hide a platform without naming it needed their own markers: `/otBannerSdk.js` and `ot-sdk-*` (OneTrust), `privacy-center.org` (Didomi's CDN) and `||inmobi.com^` (Quantcast).
- The content blocker targets now share the App Group and read the mode: answer mode serves `blockerList-answer.json`, hide mode `blockerList.json`. The app reloads the blocker when the mode changes. Both lists are declared outputs of the "Build block list" phase, which fixes the stale-signature pattern noted in Phase 0.
- The corpus emulates the content blocker (`scripts/src/content-blocker.js`): hide rules as an early stylesheet in every frame, block rules as aborted requests, honouring domains, third-party, resource type and ignore-previous-rules. `--blocker=answer` is the default. Sites marked `"answered"` fail the run if they stop being answered. With the answer list: 14 pass, 0 wrong, 0 regressed, the same as without a blocker. With the full list, OneTrust and Quantcast go unanswered, as expected.
- Real Safari (macOS, Hush content blocker on): answer mode served `blockerList-answer` and onetrust.com stored `groups=1:1,2:0,3:1,4:0`; switching to "Only hide it" reloaded the blocker with `blockerList`, and onetrust.com showed no banner and was not answered. Safari can keep a list compiled before the blocker was enabled; the app reloads it at launch.
- Not verified: content blocker switching in iOS Safari (the iOS 27.2 simulator has no ContentBlockerLoader; needs a device).

**Phase 4: autoconsent fallback**
- Add `npm:@duckduckgo/autoconsent` to the bundle, `autoAction` left unset so our orchestrator decides after Consent-O-Matic reports. Eval rules need `scripting.executeScript` in the page's main world; the spike checks Safari support, and rules that need it are disabled if not.
- Verify: corpus sites covered only by autoconsent end in opt-out.

**Phase 4 results (2026-10-31)**
- DuckDuckGo autoconsent 17.2.0 (MPL-2.0) is vendored unmodified by `make fetch_autoconsent`. It is not part of `content.js`: when Consent-O-Matic stops without finding a banner in a frame (the top frame, or an iframe of at least 300×150), the content script asks the background, which injects `autoconsent.js` into that frame with `scripting.executeScript`. Pages Consent-O-Matic answers never load its 1 MB of rules, and a tab where any frame has answered gets no fallback, so autoconsent cannot overrule a per-category answer (Sourcepoint answers inside an iframe).
- autoconsent runs with `autoAction` opt-out unless all four categories are allowed (then opt-in), and with prehiding, heuristic detection and generated rules off. Its eval rules call named snippets that the background runs with `world: "MAIN"`.
- Real Safari: on iOS 27.2 simulator Safari and macOS Safari the fallback answered cookiefirst.com (performance, functional and advertising refused) and ibm.com's TrustArc (`notice_preferences=0:`, required only). consentmanager.net's detection snippets returned true in iOS Safari, so `world: "MAIN"` works there.
- Platforms now answered and therefore left visible in answer mode: Osano (by Consent-O-Matic, per category) and, by the fallback with a refusal, TrustArc, CookieFirst, Termly, Ketch, consentmanager.net and Axeptio. New corpus readers read each one back.
- Corpus: 25 sites, 20 pass, 4 stricter (didomi.io, TrustArc ×2 and CookieFirst refuse functional too, as chosen for fallback platforms), 0 wrong, 0 regressed, 1 unanswered (iubenda.com).
- Not covered: iubenda; Borlabs still has no corpus site.

**Phase 5: popup and polish**
- Popup with page status and pause toggle; onboarding copy for enabling both extensions, "All Websites" permission, and Private Browsing.
- Verify: popup on both platforms, pause round-trips to the app.

**Phase 5 results (2026-10-31)**
- Safari popup (`WebExtension/popup.*`): the site, what Hush did there ("Answered the OneTrust banner with your level", "Refused everything on the TrustArc banner", paused, or nothing answered), the cookie level, and "Pause on this site". The background remembers per tab which platform was answered (in session storage too, since Safari unloads it when idle) and matches it to the page by site, so a redirect such as www.spotify.com to open.spotify.com still shows the answer. Hush's toolbar icon is the logo padded to a template glyph; light and dark use Hush's colours.
- Pausing from the popup goes through the native handler (`setPaused`), which saves to the App Group and iCloud like the app does. The app reloads settings whenever it comes to the front.
- Main screen in answer mode: onboarding now covers both Safari entries (the extension and the content blocker), All Websites, and Private Browsing; when the content blocker is off (macOS can tell, iOS devices too), it says so.
- Verified in iOS 27.2 simulator Safari and macOS Safari: the popup opened from Safari's page menu and the toolbar, showed the OneTrust answer on open.spotify.com, paused the site into the shared settings, the app listed it, and unpausing (popup on macOS, app on iOS) cleared it. A first macOS run showed the popover collapsing to a narrow column; it now has a 300 pt minimum width.
- Not covered: opening the Hush app from the popup (an extension cannot launch its app on iOS), and the per-tab answer is cleared when Safari restarts the extension (for example after an update).

**Phase 6: iCloud sync between iPhone and Mac**
- `NSUbiquitousKeyValueStore` holds the settings JSON, with the same `com.apple.developer.ubiquity-kvstore-identifier` on the app and the web extension so the extension's native handler reads synced values even when the app has not been opened on that device. The App Group copy stays as the local cache and as the source for the content blocker handler.
- Conflict rule: last write wins per whole settings object, stamped with a modification date. Paused sites merge as a set union so a pause added on one device is not dropped by the other.
- The spike in Phase 0 confirms the extension can read the shared KVS store on both platforms; if not, the app mirrors KVS into the App Group on launch and on `didChangeExternallyNotification`, and the plan notes that iOS picks up changes the next time the app runs.
- Verify: change the level on the Mac, read it back on the iPhone (Simulator signed into the same Apple Account, then the real devices).

**Phase 6 results (2026-10-31)**
- Paused sites follow the same rule as the rest: the newer copy wins as a whole. A union would have made unpausing impossible to sync, because the other device would add the site straight back.
- `SettingsSync.reconcile` in `Shared/Models/ConsentSettings.swift` compares the App Group copy with the iCloud copy by `modifiedAt` and writes the winner to whichever side is older. Defaults are stamped 1970, so a new device takes what another device chose and never pushes its untouched defaults over it.
- When it syncs:
  - The app syncs at launch, when it comes to the front, and on `NSUbiquitousKeyValueStore.didChangeExternallyNotification`.
  - The web extension's native handler syncs on every `getSettings`, so a device picks up changes even when the app has not run there. If the mode changed, the handler reloads the content blocker itself.
- "Sync with iCloud" in the settings screen is per device and kept in the App Group, never synced. Off means this device neither reads nor writes iCloud.
- Swift unit tests: a new macOS `HushTests` target (`make test_swift`, ⌘U in the Hush macOS scheme) covers the merge rule and the store's write-back. While being written it caught defaults being pushed to iCloud and a `pushed` flag reported with sync off. UI test `testICloudSyncSwitchIsKeptAcrossLaunches` covers the switch.
- Verified on macOS Safari, with the local copy made stale on purpose to stand in for a change arriving from another device. Each step was checked through the extension's log and the App Group read back:
  - A page load pulled the newer iCloud copy into the App Group.
  - The extension reloaded `ceo.nerd.hush.ContentBlocker` when the mode differed, and the blocker served the answer list.
  - With sync off, nothing was pushed or pulled.
  - Turning sync back on pushed the newer local choice, and a later stale copy was replaced by it.
- Cross-device, between the Mac and the iOS 27.2 simulator signed in to the same Apple Account. Each copy was matched by its `modifiedAt` stamp:
  - On launch, the simulator took the Mac's newer copy.
  - Balanced picked on the Mac reached the open simulator app within 5 s, and its screen updated without a relaunch.
  - Maximum privacy picked on the simulator reached the running Mac app within 5 s.
  - With the Hush app closed, a change from the other device reached the extension on the next Safari page load, on both the Mac and the simulator.
- Not covered: real iPhone hardware, and delay on a slow or offline network (iCloud decides when key-value changes travel).

**Fixes from the first iPhone test (2026-10-31)**
- consent.yahoo.com (where se.yahoo.com and news.yahoo.com send EU visitors) stayed on screen. Consent-O-Matic's `yahoo_consent` claimed it with zero clicks and `yahoo_popup` opened settings without saving; both target older versions of the page. They are now disabled through a new `disable` override, and autoconsent's Yahoo rule answers instead. On the iPhone it clicked "Avvisa alla", and the corpus reads Yahoo's `EuConsent` TCF string back as no purpose consented.
- cookiebot.com was answered once the extension was allowed to run on the phone; the first screenshots were taken before it ran there.
- bing.com left its preferences panel open. Its "Save Settings" stays disabled until a switch changes, and at levels matching Bing's all-off defaults nothing changes. The `bing` override now waits for the panel and clicks Bing's own Reject when Save is still disabled. On the iPhone, Bing stored `BCP=AD=0&AL=0&SM=0`.
- x.com's banner was never detected: X moved it out of `#layers` and replaced `div[role=button]` with buttons in a "Cookie consent" region. A Hush rule (`x.com` in `data/consent-rules.json`) finds that region without relying on English text and clicks Refuse non-essential cookies unless every category is allowed.
- Guard: a Consent-O-Matic answer with zero clicks no longer counts. The frame reports `no-clicks` and asks for the autoconsent fallback, so a stale rule like Yahoo's cannot leave a banner on screen. With the old Yahoo rules switched back on, the corpus still answered se.yahoo.com through the fallback.
- The corpus gained `--mobile` (iPhone layout) and `--level=balanced`, and readers for Bing's `BCP` and X's `d_prefs`. Bing passes at both levels on both layouts.
- After installing a new build over an old one, iOS Safari keeps using the removed copy of the extension until Safari is force-quit.

**iubenda (2026-10-31)**
- iubenda.com, the last unanswered corpus site, no longer shows the classic iubenda banner. iubenda 1.109 now uses `tb-banner` web components, three shadow roots deep. A Hush rule (`iubenda-tb`) steps in with nested `runrooted` actions and clicks `button.reject-button` (or `accept-button` if every category is allowed); those class names are the same in every language.
- The classic banner (`#iubenda-cs-banner`, Consent-O-Matic's misspelled `iubuenda` rule) clicked Customize and went on before iubenda drew its preferences panel, about 180 ms later. It ended with one click and nothing saved. The override now waits for `#iubFooterBtn`.
- iubenda is now excluded from the answer-mode content blocker, and a corpus reader decodes its `_iub_cs-` cookie (per purpose, or a single consent flag).
- Corpus: tomshw.it passes at "functional only". skuola.net is stricter because it only offers a single yes/no, and iubenda.com is stricter by design. Full run: 24 pass, 0 wrong, 0 regressed, 6 stricter, 0 unanswered.

**Distribution through TestFlight (2026-10-31)**
- App Store Connect record "Hush Extra" (iOS and macOS, bundle ID `ceo.nerd.hush`); the apps still show "Hush" on the device. An internal TestFlight group gets every build, so installs and updates need no cable.
- `make testflight` archives both apps, exports them with App Store signing and uploads them, using an App Store Connect API key from `ASC_KEY_PATH`, `ASC_KEY_ID` and `ASC_ISSUER_ID`. Build numbers come from the clock (`20261031.1502`). Internal TestFlight builds expire after 90 days.
- Upload fixes:
  - Mac Release builds now sign with Apple Development; "-" could not carry the iCloud and App Group entitlements into an archive.
  - The web extension manifest gained the top-level `icons` App Store Connect requires.
  - The export uses the system `rsync`, because Homebrew's rsync 3.x breaks `xcodebuild -exportArchive`.

**granola.ai and the extension icon (2026-11-01)**
- granola.ai runs the classic iubenda banner, and Hush answers it in WebKit, in the iOS Simulator and on the iPhone (banner found at 0.3 to 1.6 s, saved within 0.3 s). It stayed up on the iPhone because Safari had not let the Hush extension run on that site; the popup still opened and said no banner was answered. Setting Hush to Allow on all websites fixed it. granola.ai is in the corpus now.
- The manifest icons were opaque squares cut from the iOS app icon, so Safari on the Mac drew them larger than other extensions' rounded icons. They now come from the Mac app icon, which has the rounded shape and the standard margin.

**Phase 7: Hush's own site rules (Shahin, 2026-11-01)**
- Goal: answer banners that neither Consent-O-Matic nor autoconsent knows, on sites people actually visit.
- First try: run Super Agent's public rule catalog as a third engine. Dropped for three reasons:
  - It would put their unlicensed data in this public repo.
  - Run ahead of the other engines, it regressed four corpus sites (bing.com, spiegel.de, termly.io, axeptio.eu) through rougher category mapping.
  - Run as a gap filler, it answered one site out of 45 candidates.
- What Hush does instead: rules of its own in `data/site-rules.json`, each written from the live site and proven by a corpus entry, run by a small engine in `WebExtension/src/site-rules/`. Rules for platforms many sites share go upstream to Consent-O-Matic or autoconsent, with Shahin's OK per pull request. Super Agent's catalog stays outside the repo as a list of sites worth checking, never as a source of selectors.
- Rule format, one object per site:
  - `name`, `sites` (domains; subdomains match too) and `banner` (the selector the engine waits for, up to 10 s, before any step).
  - Buttons: `reject`, `necessaryOnly`, `acceptAll`, `openSettings`, `save`; `firstClick` and `shadowRoot` for banners behind a first layer or inside a shadow root.
  - `switches`: a list of `{selector, categories}`. A switch covering several Hush categories (MediaMarkt's "Comfortabel" is functional and statistics) goes on only when all of them are allowed. `switchState` says how its state reads: `checkbox`, `aria-checked`, `aria-pressed` or `auto`.
  - Selectors may list comma-separated alternatives and use `:contains('text')`.
- Paths per level: a mixed level sets the switches and saves; refusing everything prefers `reject`, then `necessaryOnly`, then settings with every switch off; accept all only when every category is allowed. A rule with no way to refuse fails the unit tests. A Save button still disabled at the end falls back to `reject` or `necessaryOnly`.
- Order: a rule for the page's site runs first. It falls through to Consent-O-Matic when its banner never shows (consent already stored).

**Phase 7 results (2026-11-01)**
- Super Agent's catalog, tried first, showed where Hush's own engine needed care:
  - Running it after autoconsent gave up needed a handoff between the content script and the injected autoconsent script. In the iOS Simulator the handoff failed while the corpus passed: Safari runs content.js and the injected autoconsent.js as classic scripts in one global scope, and the two minified bundles' top-level `var`s overwrote each other, so content.js's `sendMessage` returned `true`. Every bundle is now an IIFE (`deno bundle --format iife`). This also ended autoconsent's injection silently breaking anything content.js still had running.
  - Its rules for well-known platforms were worse than the engines Hush has: Bing's saves through a button that stays disabled, a Sourcepoint entry carried bbcgoodfood.com's button numbers to spiegel.de, Termly's files analytics under functional, and Axeptio's "save" is accept all.
- MediaMarkt (mediamarkt.nl) is the first Hush rule. Its privacy layer shows its switches straight away and has no reject button, and autoconsent's MediaMarkt rule fails to opt out there. The rule first lost its switches: it started while the page loaded, gave up on them before the layer rendered and saved the defaults. Waiting for the rule's `banner` fixed it.
  - Corpus, desktop and iPhone: stricter at "functional only" (Comfortabel also covers statistics, so it stays off) and pass at "balanced". A reader decodes MediaMarkt's `pwaconsent` cookie.
  - iOS Simulator: answered by `site:MediaMarkt` within seconds of the page loading.
- Corpus tooling: `--corpus=<path>` runs a candidate list, sites with reader `none` count as answered when a rule clicked through their banner, and `build/corpus-results.json` keeps each site's reports (outcome, rule, clicks). Site rules that find their banner but cannot answer report `site-rule-failed` or `site-rule-skipped`.
- Full corpus: 24 pass, 8 stricter, 0 wrong, 0 regressed.

**Phase 8: one Safari extension instead of two (Shahin, 2026-11-01)**
- Why: Safari lists "Hush" twice (the content blocker and the web extension), both named Hush on the Mac, and each must be switched on separately, per profile on the Mac. Shahin chose a single extension over clearer names.
- Cost, accepted: "Only hide it" then needs the same website access as answering. Today the content blocker needs none.
- The content blocker's list (about 23,300 hide rules and 1,700 block rules) moves into the web extension:
  - Block rules become `declarativeNetRequest` static rulesets, one for answer mode and one for hide mode, switched with `updateEnabledRulesets` when the mode changes. Safari publishes no rule limit; Mozilla documents 50 static rulesets with 10 enabled, and Chrome guarantees 30,000 static rules. The first step measures Safari's real limit on iOS and macOS.
  - Hide rules that apply everywhere become a stylesheet in the manifest's `content_scripts.css`, which Safari applies before the page draws. It holds the answer-mode list, so banners Hush answers stay visible to the engines.
  - Site-specific hide rules and the extra hide-mode selectors are injected by the content script, from a host-keyed table, as soon as the document exists. Settings come from `storage.local` (the background already caches them there) instead of a native message, so nothing waits on the app.
- Removed: the `ContentBlocker iOS` and `ContentBlocker macOS` targets, `ContentBlockerRequestHandler`, `reloadContentBlocker()`, and the app's instructions for the second switch.
- Verify:
  - The blocklist generator's unit tests cover the new output formats.
  - The corpus runs with the new hiding: no regressions in answer mode, and hide mode hides the corpus banners.
  - On iOS and macOS, Safari shows one Hush. Hide mode hides a banner before it draws (no flash), and switching modes in the app takes effect on the next page load.

**Phase 8 results (2026-11-01)**
- Safari lists one Hush on iOS and macOS. The `ContentBlocker iOS` and `ContentBlocker macOS` targets, `ContentBlockerRequestHandler`, every `reloadContentBlocker()` call and the content blocker status are gone. The app's status screen reads "Hush is answering" or "Hush is hiding banners", and setup asks for one switch. `EnabledView` (which linked to the original app's App Store page and report form) went with it.
- `scripts/build-web-lists.js` (via `make extension`) converts the adblock-format lists straight from their lines, not from WebKit JSON, so a `#@#` exception now exempts one selector on one site instead of switching off every earlier rule there:
  - `rules/block-answer.json` (2,058 rules) and `rules/block-hide-only.json` (70 rules): `declarativeNetRequest` static rulesets, `urlFilter` in adblock syntax, `$third-party`, `$domain=` and resource types mapped to conditions. Exceptions are `allow` rules at priority 2.
  - `hide.css` (about 650 KB, one rule per selector): the generic selectors no site exempts, applied by the manifest in every frame before the page draws. The two `$generichide` sites are its `exclude_matches`; a unit test keeps those in step with the lists.
  - `build/web-lists/per-site.json` (about 840 KB, bundled into background.js): site hide rules for 16,141 domains, the 223 generic selectors some site exempts, `#@#` exceptions, and the 24 generic selectors only "Only hide it" uses. Each frame's content script asks as it starts, and the background injects that site's CSS with `scripting.insertCSS`.
- Mode switches turn `block_hide_only` on or off with `updateEnabledRulesets`. Safari's `getEnabledRulesets` kept reporting it off after it took effect, so the background remembers what it applied per wake-up. In the iOS 27.2 Simulator a switch took a few seconds to apply: the next page load after the switch could still use the old rules.
- Verified in the iOS 27.2 Simulator, which cannot load content blockers, so everything it hid or blocked came from the new path. A local probe page showed:
  - an always-on block rule blocking its script;
  - the hide-only rule blocking in hide mode and letting the script load in answer mode;
  - `hide.css` hiding its element.

  mediamarkt.nl was still answered in answer mode, and the background injected per-site CSS into Cookiebot's consent iframe. UI tests (4) and Swift unit tests (11) pass, and the macOS app bundle carries only the web extension.
- The corpus now emulates what ships: `hide.css` as an early stylesheet, the background's per-site CSS on the content script's request, and the rulesets through `scripts/src/dnr.js`. Answer mode is unchanged: 24 pass, 8 stricter, 0 wrong, 0 regressed. The old converter (`convert.js`, `build-blocklist.js`) and its WebKit emulation are removed.
- Not verified yet: updating a device from a build that still had the content blocker (expected: its row disappears from Safari's extension list), and macOS Safari with the new lists.

**Later, only on request**: scheduled rule refresh.

## Test corpus and verification

A Playwright WebKit suite injects the built `content.js` as an init script (same engine as Safari, no extension shell) and visits a fixed list of CMP pages: Cookiebot, OneTrust, Didomi, Usercentrics, Sourcepoint, Quantcast/InMobi, TrustArc, Borlabs, Complianz, CookieYes. For each it reads the stored consent back from the CMP's API or cookie (`Cookiebot.consent`, `OptanonConsent` groups, `__tcfapi('getTCData')` purposes) and asserts the "functional only" result.

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
