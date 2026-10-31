import XCTest

private final class MemoryStorage: SettingsStorage {
    var values: [String: Any] = [:]

    func data(forKey key: String) -> Data? {
        values[key] as? Data
    }

    func set(_ value: Any?, forKey key: String) {
        values[key] = value
    }
}

private func settings(_ seconds: TimeInterval, paused: [String] = [], mode: ConsentSettings.Mode = .answer) -> ConsentSettings {
    var settings = ConsentSettings(modifiedAt: Date(timeIntervalSince1970: seconds))
    settings.pausedSites = paused
    settings.mode = mode
    return settings
}

final class ReconcileTests: XCTestCase {
    func testNewerCloudCopyReplacesLocal() {
        let cloud = settings(2_000, mode: .hide)
        let result = SettingsSync.reconcile(local: settings(1_000), cloud: cloud)
        XCTAssertEqual(result, .init(settings: cloud, writeLocal: true, writeCloud: false))
    }

    func testNewerLocalCopyIsPushed() {
        let local = settings(2_000)
        let result = SettingsSync.reconcile(local: local, cloud: settings(1_000, mode: .hide))
        XCTAssertEqual(result, .init(settings: local, writeLocal: false, writeCloud: true))
    }

    func testMatchingCopiesNeedNoWrites() {
        let result = SettingsSync.reconcile(local: settings(1_000), cloud: settings(1_000))
        XCTAssertEqual(result, .init(settings: settings(1_000), writeLocal: false, writeCloud: false))
    }

    func testANewDeviceTakesTheCloudCopy() {
        let cloud = settings(1_000, mode: .hide)
        let result = SettingsSync.reconcile(local: nil, cloud: cloud)
        XCTAssertEqual(result, .init(settings: cloud, writeLocal: true, writeCloud: false))
    }

    func testDefaultsAreSavedLocallyButNeverPushed() {
        let result = SettingsSync.reconcile(local: nil, cloud: nil)
        XCTAssertEqual(result, .init(settings: .defaults, writeLocal: true, writeCloud: false))
    }

    func testUntouchedDefaultsLoseToAChoiceMadeElsewhere() {
        let cloud = settings(1_000, mode: .hide)
        let result = SettingsSync.reconcile(local: .defaults, cloud: cloud)
        XCTAssertEqual(result.settings, cloud)
    }

    func testAnUnpauseOnOneDeviceIsNotUndoneByTheOther() {
        let unpaused = settings(2_000, paused: [])
        let result = SettingsSync.reconcile(local: settings(1_000, paused: ["example.com"]), cloud: unpaused)
        XCTAssertEqual(result.settings.pausedSites, [])
    }
}

final class StoreSyncTests: XCTestCase {
    func testSyncWritesTheWinnerBackToTheOlderCopy() {
        let local = MemoryStorage()
        let cloud = MemoryStorage()
        ConsentSettingsStore.write(settings(1_000), to: local)
        ConsentSettingsStore.write(settings(2_000, paused: ["example.com"]), to: cloud)

        let result = ConsentSettingsStore.sync(local: local, cloud: cloud)

        XCTAssertEqual(result.settings.pausedSites, ["example.com"])
        XCTAssertEqual(ConsentSettingsStore.read(local), ConsentSettingsStore.read(cloud))
    }

    func testSyncWithICloudOffOnlyTouchesTheAppGroup() {
        let local = MemoryStorage()
        ConsentSettingsStore.write(settings(1_000), to: local)

        let result = ConsentSettingsStore.sync(local: local, cloud: nil)

        XCTAssertEqual(result, .init(settings: settings(1_000), writeLocal: false, writeCloud: false))
    }

    func testANewDeviceWithICloudOffStartsFromDefaults() {
        let local = MemoryStorage()

        let result = ConsentSettingsStore.sync(local: local, cloud: nil)

        XCTAssertEqual(result.settings, .defaults)
        XCTAssertEqual(ConsentSettingsStore.read(local), .defaults)
    }

    func testStoredDatesSurviveTheRoundTrip() {
        let storage = MemoryStorage()
        ConsentSettingsStore.write(.defaults, to: storage)
        XCTAssertEqual(ConsentSettingsStore.read(storage)?.modifiedAt, Date(timeIntervalSince1970: 0))
    }
}
