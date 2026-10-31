format:
	deno fmt scripts

check_format:
	deno fmt --check scripts

test:
	make test_unit
	make test_ui

test_unit:
	deno test --allow-read=./data

test_corpus: extension
	deno run --allow-read --allow-write --allow-net --allow-env --allow-run --allow-sys scripts/corpus.js $(SITES)

test_ui:
	xcodebuild test -project Hush.xcodeproj -scheme 'Hush iOS' -destination 'platform=iOS Simulator,name=iPhone 17'

fetch_external:
	deno run --allow-write=./data --allow-net scripts/fetch-external.js

fetch_consent_o_matic:
	deno run --allow-write=./data/vendor,./WebExtension/vendor --allow-net=raw.githubusercontent.com scripts/fetch-consent-o-matic.js

EXTENSION_OUT ?= build/WebExtension

extension:
	mkdir -p "$(EXTENSION_OUT)"
	deno bundle --quiet --platform browser --minify -o "$(EXTENSION_OUT)/content.js" WebExtension/content.js
	deno bundle --quiet --platform browser --minify -o "$(EXTENSION_OUT)/background.js" WebExtension/background.js
	cp WebExtension/manifest.json WebExtension/content.css "$(EXTENSION_OUT)/"

blocklist:
	deno run --allow-read=./data --allow-env=MINIFY scripts/build-blocklist.js $(BLOCKLIST_FLAGS)

xcode:
ifeq ("$(CONFIGURATION_BUILD_DIR)","")
	$(error CONFIGURATION_BUILD_DIR env is not set, make this command is run from Xcode)
endif
ifeq ("$(UNLOCALIZED_RESOURCES_FOLDER_PATH)","")
	$(error UNLOCALIZED_RESOURCES_FOLDER_PATH env is not set, make this command is run from Xcode)
endif
	mkdir -p "$(CONFIGURATION_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)"
	MINIFY=1 make blocklist --silent > "$(CONFIGURATION_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/blockerList.json"
	MINIFY=1 make blocklist --silent BLOCKLIST_FLAGS=--answer-mode > "$(CONFIGURATION_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/blockerList-answer.json"

xcode_extension:
ifeq ("$(CONFIGURATION_BUILD_DIR)","")
	$(error CONFIGURATION_BUILD_DIR env is not set, make this command is run from Xcode)
endif
ifeq ("$(UNLOCALIZED_RESOURCES_FOLDER_PATH)","")
	$(error UNLOCALIZED_RESOURCES_FOLDER_PATH env is not set, make this command is run from Xcode)
endif
	make extension --silent EXTENSION_OUT="$(CONFIGURATION_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)"
