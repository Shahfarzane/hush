import Foundation

// Holds the settings the views edit and saves every change to the App Group
// and iCloud, where the Safari extension reads them.
class ConsentSettingsModel: ObservableObject {
    @Published var settings: ConsentSettings {
        didSet {
            var unstamped = settings
            unstamped.modifiedAt = oldValue.modifiedAt
            guard unstamped != oldValue else { return }
            settings.modifiedAt = Date()
            ConsentSettingsStore.save(settings)
        }
    }

    init(settings: ConsentSettings) {
        self.settings = settings
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
