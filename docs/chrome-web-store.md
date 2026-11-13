# Hush Extra on the Chrome Web Store

Hush Extra for Chrome and Helium ships as an Unlisted item: installable from its store link, not shown in search. The browsers then update it themselves. Every version is reviewed before it goes live; `<all_urls>` with `scripting` makes that review take longer.

## Building the upload

```sh
make chrome_store   # build/hush-extra-chrome-<version>.zip
```

It is `make chrome` into `build/ChromeStore` with the manifest's `key` removed: the store rejects a `key`, and the private half of this one was never saved. The store item gets an ID of its own, which `hush-chrome-host` lets in next to the unpacked build's `peklpnngkdekjbeheogkeabpllgmnefj` (`scripts/src/chrome.js`). The version is Safari's (`WebExtension/manifest.json`); each upload needs a higher one.

## Listing

Name (from the manifest): Hush Extra

Summary (manifest `description`): Answers cookie banners with the cookie level you chose in Hush Extra.

Category: Privacy & Security. Language: English.

Description:

```
Hush Extra answers cookie banners for you. Pick a cookie level once (Maximum privacy, Functional only, Balanced, or Custom) and it answers each banner with that level, using the open-source Consent-O-Matic and DuckDuckGo autoconsent rules plus its own. A banner with no way to refuse is hidden, never accepted.

On a Mac with the Hush Extra app, Chrome and Helium follow the app's settings (cookie level, mode, paused sites) through a small helper program, so Safari and Chrome answer the same way. Without the helper it answers at Functional only.

It runs in your browser. No analytics, no accounts, and no network requests of its own.

Hush Extra is a fork of Hush by Joel Arvidsson. Source code: https://github.com/Shahfarzane/hush
```

Store icon: `WebExtension/images/icon-128.png`. Screenshot (1280x800) and small promo tile (440x280): `docs/chrome-web-store/`.

Privacy policy: https://github.com/Shahfarzane/hush/blob/master/PRIVACY.md

## Privacy practices tab

Single purpose:

```
Answers cookie consent banners on the pages the user visits with the cookie level the user chose, and hides banners that cannot be answered.
```

Permission justifications:

| Permission | Justification |
|---|---|
| storage | Keeps the banner it answered per tab in session storage, for the toolbar popup, and a copy of the settings for when the Mac app cannot be reached. |
| nativeMessaging | Reads the cookie level, mode and paused sites from the Hush Extra Mac app through its helper, and saves "Pause on this site" there. |
| scripting | Injects the consent engines that answer a banner, and the per-site CSS that hides one, into the page that shows it. |
| declarativeNetRequest | Blocks known cookie notice scripts with static rule lists in the package. In answer mode it leaves the consent platforms the engines can answer; "Only hide it" mode blocks those too. |
| Host permissions (<all_urls>) | Cookie banners appear on any site, and answering one means reading and clicking it on that page. |

Remote code: No. All code, rules and lists ship in the package.

Data usage, collected: none.

Certifications, all three ticked: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.
