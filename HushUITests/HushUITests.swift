import XCTest

class HushUITests: XCTestCase {
    var app: XCUIApplication!
    var settingsApp: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false

        app = XCUIApplication()
        settingsApp = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
    }

    override func tearDownWithError() throws {
        app.terminate()
    }

    // Settings uses a virtualized collection view, so off-screen rows are not in
    // the accessibility tree until scrolled into view. Recent simulators also take
    // several seconds to push a page, so wait for the opened page's title.
    private func scrollToAndTap(_ label: String) {
        let element = settingsApp.staticTexts[label]
        // The floating search field covers the bottom of the list, and taps there
        // land on it even though the row reports itself as hittable.
        let searchField = settingsApp.searchFields.firstMatch
        let clearOfSearchField = { element.isHittable && (!searchField.exists || element.frame.maxY < searchField.frame.minY) }
        var attempts = 0
        while !clearOfSearchField() && attempts < 15 {
            settingsApp.swipeUp()
            attempts += 1
        }
        XCTAssertTrue(clearOfSearchField(), "Could not find \"\(label)\" in Settings")
        // A tap while the list still coasts from the swipe only stops the scroll.
        if attempts > 0 {
            Thread.sleep(forTimeInterval: 1.5)
        }
        element.tap()
        XCTAssertTrue(settingsApp.navigationBars[label].waitForExistence(timeout: 30), "Settings did not open \"\(label)\"")
    }

    // Settings reopens on the last page it showed, so walk back to its root first.
    private func returnToSettingsRoot() {
        for _ in 0..<6 {
            let back = settingsApp.navigationBars.buttons.firstMatch
            guard back.waitForExistence(timeout: 1), back.isHittable else { return }
            back.tap()
        }
        _ = settingsApp.navigationBars["Settings"].waitForExistence(timeout: 30)
    }

    private func openExtensionSettings(_ identifier: String) {
        settingsApp.launch()
        returnToSettingsRoot()
        // Settings → Apps → Safari → Extensions → <extension>
        scrollToAndTap("Apps")
        scrollToAndTap("Safari")
        scrollToAndTap("Extensions")
        settingsApp.buttons[identifier].firstMatch.tap()
    }

    private func setAllowExtension(isOn: Bool) {
        let toggle = settingsApp.switches["Allow Extension"].firstMatch
        XCTAssertTrue(toggle.waitForExistence(timeout: 30), "Allow Extension switch not found")
        if toggle.value as? String != (isOn ? "1" : "0") {
            // The switch's accessibility frame spans the whole row, so its centre is
            // over the label. Tap near the trailing edge where the control actually is.
            toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        }
    }

    private func toggleContentBlockerEnabled(isOn: Bool) throws {
        openExtensionSettings("ceo.nerd.hush.ContentBlocker")
        setAllowExtension(isOn: isOn)
        settingsApp.terminate()
    }

    // The app only re-queries the content blocker state on foreground, and enabling
    // the blocker can take a moment to settle, so re-foreground until it is shown.
    private func assertAppShows(_ identifier: String, timeout: TimeInterval = 30) {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            app.activate()
            if app.staticTexts[identifier].waitForExistence(timeout: 3) {
                return
            }
            XCUIDevice.shared.press(.home)
        } while Date() < deadline
        XCTFail("App did not show \"\(identifier)\" within \(timeout)s")
    }

    func testSettingsIntegration() throws {
        app.launch()
        try toggleContentBlockerEnabled(isOn: false)
        assertAppShows("extension disabled")
        try toggleContentBlockerEnabled(isOn: true)
        assertAppShows("extension enabled")
    }

    func testWebExtensionCanBeAllowedOnAllWebsites() throws {
        app.launch()
        openExtensionSettings("ceo.nerd.hush.WebExtension")
        setAllowExtension(isOn: true)
        // Settings → … → Hush → All Websites → Allow
        scrollToAndTap("All Websites")
        settingsApp.staticTexts["Allow"].firstMatch.tap()
        settingsApp.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(settingsApp.staticTexts["Allow"].waitForExistence(timeout: 30), "All Websites is not set to Allow")
        settingsApp.terminate()
    }
}
