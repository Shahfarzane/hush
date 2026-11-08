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

test_corpus: extension
	deno run --allow-read --allow-write --allow-net --allow-env --allow-run --allow-sys scripts/corpus.js $(CORPUS_FLAGS) $(SITES)

test_swift:
	xcodebuild test -project Hush.xcodeproj -scheme 'Hush macOS' -destination 'platform=macOS' -only-testing:HushTests -allowProvisioningUpdates

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

# A Developer ID signed and notarized build/Hush.dmg, for installing the Mac
# app without TestFlight. Needs the Developer ID Application certificate in
# the keychain and the two Developer ID provisioning profiles named in
# ExportOptions-DeveloperID.plist installed (Xcode's API key signing cannot
# make them without an Admin key). The archive signs with them too, so no
# Apple Development certificate is needed (CI runners have none). The notary
# service takes the same API key variables as testflight.
DMG_DIR = build/dmg
NOTARY_AUTH = --key "$(ASC_KEY_PATH)" --key-id "$(ASC_KEY_ID)" --issuer "$(ASC_ISSUER_ID)" --wait

dmg:
	rm -rf $(DMG_DIR) build/Hush.dmg
	xcodebuild archive -project Hush.xcodeproj -scheme 'Hush macOS' -configuration Release -destination 'generic/platform=macOS' -archivePath $(DMG_DIR)/Hush.xcarchive -derivedDataPath $(DMG_DIR)/DerivedData CURRENT_PROJECT_VERSION=$(BUILD_NUMBER) CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="Developer ID Application" 'PROVISIONING_PROFILE_SPECIFIER=Hush Developer ID ($$(PRODUCT_BUNDLE_IDENTIFIER))'
	PATH="/usr/bin:$$PATH" xcodebuild -exportArchive -archivePath $(DMG_DIR)/Hush.xcarchive -exportOptionsPlist ExportOptions-DeveloperID.plist -exportPath $(DMG_DIR)/export
	# The app gets its own ticket, so it opens offline after being copied
	# out of the disk image.
	ditto -c -k --keepParent $(DMG_DIR)/export/Hush.app $(DMG_DIR)/Hush.zip
	xcrun notarytool submit $(DMG_DIR)/Hush.zip $(NOTARY_AUTH)
	xcrun stapler staple $(DMG_DIR)/export/Hush.app
	mkdir -p $(DMG_DIR)/root
	ditto $(DMG_DIR)/export/Hush.app $(DMG_DIR)/root/Hush.app
	ln -s /Applications $(DMG_DIR)/root/Applications
	diskutil image create from --format UDZO --volumeName Hush $(DMG_DIR)/root build/Hush.dmg
	codesign --sign "Developer ID Application" --timestamp build/Hush.dmg
	xcrun notarytool submit build/Hush.dmg $(NOTARY_AUTH)
	xcrun stapler staple build/Hush.dmg
	# Safari lists every Hush.app it finds on disk, so only the image stays.
	rm -rf $(DMG_DIR)

fetch_external:
	deno run --allow-write=./data --allow-net scripts/fetch-external.js

fetch_consent_o_matic:
	deno run --allow-write=./data/vendor,./WebExtension/vendor --allow-net=raw.githubusercontent.com scripts/fetch-consent-o-matic.js

fetch_autoconsent:
	deno run --allow-write=./data/vendor,./WebExtension/vendor --allow-net=cdn.jsdelivr.net scripts/fetch-autoconsent.js

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

xcode_extension:
ifeq ("$(CONFIGURATION_BUILD_DIR)","")
	$(error CONFIGURATION_BUILD_DIR env is not set, make this command is run from Xcode)
endif
ifeq ("$(UNLOCALIZED_RESOURCES_FOLDER_PATH)","")
	$(error UNLOCALIZED_RESOURCES_FOLDER_PATH env is not set, make this command is run from Xcode)
endif
	make extension --silent EXTENSION_OUT="$(CONFIGURATION_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)"
