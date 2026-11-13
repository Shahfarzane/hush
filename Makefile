format:
	deno fmt scripts

check_format:
	deno fmt --check scripts

test:
	make test_unit
	make test_swift
	make test_ui

test_unit:
	deno test --allow-read=./data

# Full permissions: on Linux, Playwright reads /proc/sys/fs/binfmt_misc to
# detect WSL, which Deno only allows with --allow-all.
test_corpus: extension
	deno run --allow-all scripts/corpus.js $(CORPUS_FLAGS) $(SITES)

# The same sites in Chrome for Testing with the real build/ChromeExtension
# loaded. CHROMIUM_PATH picks the browser binary; branded Chrome ignores
# --load-extension.
test_corpus_chrome: chrome
	deno run --allow-read --allow-write --allow-net --allow-env --allow-run --allow-sys scripts/corpus.js --browser=chromium $(CORPUS_FLAGS) $(SITES)

# Xcode registers the Debug app it builds with LaunchServices. Safari then
# lists Hush Extra twice and may run that copy instead of the installed one,
# so the run unregisters and deletes it on any exit, Ctrl-C included (the
# EXIT trap keeps xcodebuild's status).
LSREGISTER = /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
TEST_DERIVED_DATA = build/DerivedData
TEST_APP = $(TEST_DERIVED_DATA)/Build/Products/Debug/Hush Extra.app

test_swift:
	trap '$(LSREGISTER) -u "$(TEST_APP)"; rm -rf "$(TEST_APP)"' EXIT; \
	xcodebuild test -project Hush.xcodeproj -scheme 'Hush macOS' -destination 'platform=macOS' -only-testing:HushTests -allowProvisioningUpdates -derivedDataPath $(TEST_DERIVED_DATA)

test_ui:
	xcodebuild test -project Hush.xcodeproj -scheme 'Hush iOS' -destination 'platform=iOS Simulator,name=iPhone 17'

# Archives both apps and uploads them to App Store Connect for TestFlight.
# Needs an App Store Connect API key: ASC_KEY_PATH (the .p8 file), ASC_KEY_ID
# and ASC_ISSUER_ID. Each run gets a new build number from the clock.
ifndef BUILD_NUMBER
BUILD_NUMBER := $(shell date +%Y%m%d.%H%M)
endif
ASC_AUTH = -allowProvisioningUpdates -authenticationKeyPath "$(ASC_KEY_PATH)" -authenticationKeyID "$(ASC_KEY_ID)" -authenticationKeyIssuerID "$(ASC_ISSUER_ID)"
PLATFORM_ios = iOS
PLATFORM_macos = macOS

# SIGNING=automatic (the default) signs the archive with this Mac's Apple
# Development identity and the export with Apple's cloud-managed distribution
# certificate. A CI runner has neither, so SIGNING=manual signs both with the
# Apple Distribution identity and the "Hush App Store <platform> (<bundle id>)"
# profiles, which the release workflow installs.
# TESTFLIGHT_DESTINATION=export stops before the upload, for a dry run.
SIGNING ?= automatic
ifeq ($(filter $(SIGNING),automatic manual),)
$(error SIGNING is "$(SIGNING)"; use automatic or manual)
endif
TESTFLIGHT_DESTINATION ?= upload
ARCHIVE_SIGNING_manual = CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="Apple Distribution" 'PROVISIONING_PROFILE_SPECIFIER=Hush App Store $(PLATFORM_$*) ($$(PRODUCT_BUNDLE_IDENTIFIER))'
EXPORT_OPTIONS_automatic = ExportOptions.plist
EXPORT_OPTIONS_manual = ExportOptions-AppStore-$*.plist

testflight: testflight_ios testflight_macos

testflight_%:
	xcodebuild archive -project Hush.xcodeproj -scheme 'Hush $(PLATFORM_$*)' -configuration Release -destination 'generic/platform=$(PLATFORM_$*)' -archivePath build/Hush-$*.xcarchive CURRENT_PROJECT_VERSION=$(BUILD_NUMBER) $(ARCHIVE_SIGNING_$(SIGNING)) $(ASC_AUTH)
	cp $(EXPORT_OPTIONS_$(SIGNING)) build/ExportOptions-$*.plist
	plutil -replace destination -string $(TESTFLIGHT_DESTINATION) build/ExportOptions-$*.plist
	# The export copies with the first rsync on PATH and fails with Homebrew's
	# rsync 3.x ("syntax or usage error"), so the system one goes first.
	PATH="/usr/bin:$$PATH" xcodebuild -exportArchive -archivePath build/Hush-$*.xcarchive -exportOptionsPlist build/ExportOptions-$*.plist -exportPath build/export-$* $(ASC_AUTH)

# A Developer ID signed and notarized $(DMG) with "Hush Extra.app" in it, for
# installing the Mac app without TestFlight. Needs the Developer ID Application certificate in
# the keychain and the two Developer ID provisioning profiles named in
# ExportOptions-DeveloperID.plist installed (Xcode's API key signing cannot
# make them without an Admin key). The archive signs with them too, so no
# Apple Development certificate is needed (CI runners have none). The notary
# service takes the same API key variables as testflight.
DMG_DIR = build/dmg
NOTARY_AUTH = --key "$(ASC_KEY_PATH)" --key-id "$(ASC_KEY_ID)" --issuer "$(ASC_ISSUER_ID)" --wait
DMG = build/Hush-Extra.dmg
APP = Hush Extra.app

dmg:
	rm -rf $(DMG_DIR) $(DMG)
	xcodebuild archive -project Hush.xcodeproj -scheme 'Hush macOS' -configuration Release -destination 'generic/platform=macOS' -archivePath $(DMG_DIR)/Hush.xcarchive -derivedDataPath $(DMG_DIR)/DerivedData CURRENT_PROJECT_VERSION=$(BUILD_NUMBER) CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="Developer ID Application" 'PROVISIONING_PROFILE_SPECIFIER=Hush Developer ID ($$(PRODUCT_BUNDLE_IDENTIFIER))'
	PATH="/usr/bin:$$PATH" xcodebuild -exportArchive -archivePath $(DMG_DIR)/Hush.xcarchive -exportOptionsPlist ExportOptions-DeveloperID.plist -exportPath $(DMG_DIR)/export
	# The app gets its own ticket, so it opens offline after being copied
	# out of the disk image.
	ditto -c -k --keepParent "$(DMG_DIR)/export/$(APP)" $(DMG_DIR)/Hush.zip
	xcrun notarytool submit $(DMG_DIR)/Hush.zip $(NOTARY_AUTH)
	xcrun stapler staple "$(DMG_DIR)/export/$(APP)"
	mkdir -p $(DMG_DIR)/root
	ditto "$(DMG_DIR)/export/$(APP)" "$(DMG_DIR)/root/$(APP)"
	ln -s /Applications $(DMG_DIR)/root/Applications
	diskutil image create from --format UDZO --volumeName "Hush Extra" $(DMG_DIR)/root $(DMG)
	codesign --sign "Developer ID Application" --timestamp $(DMG)
	xcrun notarytool submit $(DMG) $(NOTARY_AUTH)
	xcrun stapler staple $(DMG)
	# Safari lists every copy of the app it finds on disk, so only the image stays.
	rm -rf $(DMG_DIR)

fetch_external:
	deno run --allow-write=./data --allow-net scripts/fetch-external.js

fetch_consent_o_matic:
	deno run --allow-read=./data/vendor --allow-write=./data/vendor,./WebExtension/vendor --allow-net=raw.githubusercontent.com,api.github.com --allow-env=GITHUB_TOKEN scripts/fetch-consent-o-matic.js $(FETCH_FLAGS)

fetch_autoconsent:
	deno run --allow-read=./data/vendor --allow-write=./data/vendor,./WebExtension/vendor --allow-net=cdn.jsdelivr.net,registry.npmjs.org scripts/fetch-autoconsent.js $(FETCH_FLAGS)

# Every rule source at its newest version: the Fanboy list, and both engines
# with their pins in data/vendor/pins.json moved to the latest release.
refresh_rules:
	make fetch_external
	make fetch_consent_o_matic FETCH_FLAGS=--latest
	make fetch_autoconsent FETCH_FLAGS=--latest

EXTENSION_OUT ?= build/WebExtension

# Each bundle is an IIFE: Safari runs content.js and the autoconsent.js it
# injects as classic scripts in one global scope, where two minified bundles'
# top-level names would overwrite each other.
extension:
	mkdir -p "$(EXTENSION_OUT)" build/web-lists
	deno run --allow-read=./data --allow-write="$(EXTENSION_OUT)",./build scripts/build-web-lists.js "$(EXTENSION_OUT)" build/web-lists/per-site.json
	deno bundle --quiet --platform browser --minify --format iife -o "$(EXTENSION_OUT)/content.js" WebExtension/content.js
	deno bundle --quiet --platform browser --minify --format iife -o "$(EXTENSION_OUT)/background.js" WebExtension/background.js
	deno bundle --quiet --platform browser --minify --format iife -o "$(EXTENSION_OUT)/autoconsent.js" WebExtension/autoconsent.js
	deno bundle --quiet --platform browser --minify --format iife -o "$(EXTENSION_OUT)/popup.js" WebExtension/popup.js
	cp WebExtension/manifest.json WebExtension/content.css WebExtension/popup.html WebExtension/popup.css "$(EXTENSION_OUT)/"
	mkdir -p "$(EXTENSION_OUT)/images"
	cp WebExtension/images/*.png "$(EXTENSION_OUT)/images/"

CHROME_OUT ?= build/ChromeExtension

# Chrome and Helium run the same bundles as Safari, with the keys in
# WebExtension/manifest.chrome.json laid over Safari's manifest. Load
# $(CHROME_OUT) unpacked from chrome://extensions.
chrome:
	$(MAKE) extension --silent EXTENSION_OUT="$(CHROME_OUT)"
	deno run --allow-read=./WebExtension --allow-write="$(CHROME_OUT)" scripts/build-chrome.js "$(CHROME_OUT)"

# The Chrome Web Store upload: the Chrome build without its `key`, zipped
# into build/hush-extra-chrome-<version>.zip, versioned <Safari version>.<commits
# on HEAD> so every commit uploads higher. The store item has an ID of its own,
# which the host also lets in (STORE_EXTENSION_ID in scripts/src/chrome.js).
chrome_store:
	rm -rf build/ChromeStore
	$(MAKE) chrome --silent CHROME_OUT=build/ChromeStore
	version=$$(deno run --allow-read=build/ChromeStore --allow-write=build/ChromeStore scripts/chrome-store.js build/ChromeStore "$$(git rev-list --count HEAD)") && \
	rm -f "build/hush-extra-chrome-$$version.zip" && \
	(cd build/ChromeStore && zip -qrX "../hush-extra-chrome-$$version.zip" . -x '.*') && \
	echo "build/hush-extra-chrome-$$version.zip"

# The store item through the Chrome Web Store API, with the service account's
# JSON key: the 1Password DEV document "Chrome Web Store API service account",
# read with op-agents into a temp folder that is removed on exit.
# chrome_store_status: its live and submitted revisions.
# chrome_publish: builds chrome_store, uploads it and submits it for review;
# it goes live by itself after review.
CWS_KEY_ITEM = Chrome Web Store API service account
CWS_DENO = deno run --allow-read --allow-env=CWS_SERVICE_ACCOUNT_KEY --allow-net=oauth2.googleapis.com,chromewebstore.googleapis.com scripts/chrome-publish.js

chrome_store_status:
	@dir=$$(mktemp -d) && trap 'rm -rf "$${dir:?}"' EXIT && \
	op-agents document get "$(CWS_KEY_ITEM)" --vault DEV --out-file "$$dir/key.json" --force >/dev/null && \
	CWS_SERVICE_ACCOUNT_KEY="$$dir/key.json" $(CWS_DENO) status

chrome_publish:
	zip=$$($(MAKE) --silent chrome_store | tail -1) && \
	dir=$$(mktemp -d) && trap 'rm -rf "$${dir:?}"' EXIT && \
	op-agents document get "$(CWS_KEY_ITEM)" --vault DEV --out-file "$$dir/key.json" --force >/dev/null && \
	CWS_SERVICE_ACCOUNT_KEY="$$dir/key.json" $(CWS_DENO) publish "$$zip"

# The native messaging host Chrome and Helium start to read and write the
# app's settings, built from the app's own settings code. It opens the
# team's App Group, so it is signed with the team's Developer ID identity.
# Registered for the extension ID that manifest.chrome.json's key gives and
# for the Chrome Web Store item's ID.
CHROME_HOST_DIR ?= $(HOME)/Library/Application Support/Hush Extra
CHROME_HOST_IDENTITY ?= Developer ID Application

chrome_host:
	mkdir -p build/chrome-host "$(CHROME_HOST_DIR)"
	swiftc -O -o build/chrome-host/hush-chrome-host macOS/ChromeHost/main.swift Shared/Models/ConsentSettings.swift -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker macOS/ChromeHost/Info.plist
	codesign --force --options runtime --timestamp --sign "$(CHROME_HOST_IDENTITY)" --identifier ceo.nerd.hush.chrome-host --entitlements macOS/ChromeHost/ChromeHost.entitlements build/chrome-host/hush-chrome-host
	ditto build/chrome-host/hush-chrome-host "$(CHROME_HOST_DIR)/hush-chrome-host"
	deno run --allow-read --allow-write="$(HOME)/Library/Application Support" --allow-env=HOME scripts/chrome-host.js "$(CHROME_HOST_DIR)/hush-chrome-host"

xcode_extension:
ifeq ("$(CONFIGURATION_BUILD_DIR)","")
	$(error CONFIGURATION_BUILD_DIR env is not set, make this command is run from Xcode)
endif
ifeq ("$(UNLOCALIZED_RESOURCES_FOLDER_PATH)","")
	$(error UNLOCALIZED_RESOURCES_FOLDER_PATH env is not set, make this command is run from Xcode)
endif
	make extension --silent EXTENSION_OUT="$(CONFIGURATION_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)"
