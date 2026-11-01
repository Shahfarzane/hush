import Foundation

// Holds the settings the views edit and saves every change to the App Group
// and iCloud, where the Safari extension reads them.
class ConsentSettingsModel: ObservableObject {
    private var isReloading = false

    @Published var settings: ConsentSettings {
        didSet {
            guard !isReloading else { return }
            var unstamped = settings
            unstamped.modifiedAt = oldValue.modifiedAt
            guard unstamped != oldValue else { return }
            settings.modifiedAt = Date()
            ConsentSettingsStore.save(settings)
        }
    }

    @Published var syncsWithICloud: Bool {
        didSet {
            guard syncsWithICloud != oldValue else { return }
            ConsentSettingsStore.syncsWithICloud = syncsWithICloud
            reload()
        }
    }

    init(settings: ConsentSettings) {
        self.settings = settings
        syncsWithICloud = ConsentSettingsStore.syncsWithICloud
        NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: NSUbiquitousKeyValueStore.default,
            queue: .main
        ) { [weak self] _ in
            self?.reload()
        }
    }

    // Picks up changes made elsewhere: a site paused from Safari, or a change
    // synced from another device.
    func reload() {
        let synced = ConsentSettingsStore.sync().settings
        guard synced != settings else { return }
        isReloading = true
        settings = synced
        isReloading = false
    }

    var level: PrivacyLevel {
        get { PrivacyLevel(settings.categories) }
        set {
            if let categories = newValue.categories {
                settings.categories = categories
            }
        }
    }

    // Returns false when the input is not a site name.
    func pause(_ input: String) -> Bool {
        guard let site = PausedSite.normalize(input) else { return false }
        if !settings.pausedSites.contains(site) {
            settings.pausedSites = (settings.pausedSites + [site]).sorted()
        }
        return true
    }

    func unpause(_ site: String) {
        settings.pausedSites.removeAll { $0 == site }
    }
}
