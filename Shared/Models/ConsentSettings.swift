import Foundation

// Same JSON shape as WebExtension/src/settings.js.
struct ConsentSettings: Codable, Equatable {
    enum Mode: String, Codable {
        case answer
        case hide
    }

    struct Categories: Codable, Equatable {
        var functional = true
        var performance = false
        var advertising = false
        var other = false
    }

    var version = 1
    var mode = Mode.answer
    var categories = Categories()
    var hideWhileAnswering = true
    var pausedSites: [String] = []
    var modifiedAt = Date()

    // What a device starts with before anyone picks a level. Stamped at 1970
    // so a choice already made on another device wins over it.
    static let defaults = ConsentSettings(modifiedAt: Date(timeIntervalSince1970: 0))
}

// Presets: Super Agent's onboarding offers "Maximum privacy" and "Balanced";
// "Functional only" sits between them. Anything else is Custom.
enum PrivacyLevel: String, CaseIterable, Identifiable {
    case maximumPrivacy
    case functionalOnly
    case balanced
    case custom

    var id: Self { self }

    var categories: ConsentSettings.Categories? {
        switch self {
        case .maximumPrivacy: return .init(functional: false, performance: false, advertising: false, other: false)
        case .functionalOnly: return .init(functional: true, performance: false, advertising: false, other: false)
        case .balanced: return .init(functional: true, performance: true, advertising: false, other: false)
        case .custom: return nil
        }
    }

    init(_ categories: ConsentSettings.Categories) {
        self = Self.allCases.first { $0.categories == categories } ?? .custom
    }
}

enum PausedSite {
    // Accepts "https://www.Example.com/path" and returns "example.com"; the
    // extension pauses subdomains of a paused site too.
    static func normalize(_ input: String) -> String? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let url = URL(string: text.contains("://") ? text : "https://\(text)"), let host = url.host {
            text = host
        }
        if text.hasPrefix("www.") {
            text.removeFirst(4)
        }
        let valid = text.contains(".") && !text.hasPrefix(".") && !text.hasSuffix(".") && !text.contains(" ")
        return valid ? text : nil
    }
}

// The settings live in two places: the App Group, which every Hush process on
// this device reads, and iCloud, which carries them to the user's other
// devices. The copy changed last wins as a whole, paused sites included, so an
// unpause on one device is not undone by the other.
enum SettingsSync {
    struct Result: Equatable {
        var settings: ConsentSettings
        var writeLocal: Bool
        var writeCloud: Bool
    }

    static func reconcile(local: ConsentSettings?, cloud: ConsentSettings?) -> Result {
        let settings: ConsentSettings
        if let cloud = cloud, cloud.modifiedAt > (local?.modifiedAt ?? .distantPast) {
            settings = cloud
        } else {
            settings = local ?? cloud ?? .defaults
        }
        return Result(
            settings: settings,
            writeLocal: settings != local,
            // Only a choice someone made goes up: untouched defaults never do.
            writeCloud: settings != cloud && settings.modifiedAt > (cloud ?? .defaults).modifiedAt)
    }
}

protocol SettingsStorage: AnyObject {
    func data(forKey key: String) -> Data?
    func set(_ value: Any?, forKey key: String)
}

extension UserDefaults: SettingsStorage {}
extension NSUbiquitousKeyValueStore: SettingsStorage {}

enum ConsentSettingsStore {
    // iOS uses group.ceo.nerd.hush; macOS needs the Team ID prefix because the
    // sandboxed Safari extension cannot read a group.-prefixed group there.
    static let appGroup = Bundle.main.object(forInfoDictionaryKey: "HushAppGroup") as? String ?? "group.ceo.nerd.hush"
    static let key = "consentSettings"

    private static var groupDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroup)
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    static func read(_ storage: SettingsStorage?) -> ConsentSettings? {
        storage?.data(forKey: key).flatMap { try? decoder.decode(ConsentSettings.self, from: $0) }
    }

    static func write(_ settings: ConsentSettings, to storage: SettingsStorage?) {
        guard let data = try? encoder.encode(settings) else { return }
        storage?.set(data, forKey: key)
    }

    static func load() -> ConsentSettings? {
        read(groupDefaults)
    }

    // A per-device choice, kept in the App Group and never synced.
    private static let iCloudSyncKey = "iCloudSync"

    static var syncsWithICloud: Bool {
        get { groupDefaults?.object(forKey: iCloudSyncKey) as? Bool ?? true }
        set { groupDefaults?.set(newValue, forKey: iCloudSyncKey) }
    }

    private static var cloud: NSUbiquitousKeyValueStore? {
        syncsWithICloud ? NSUbiquitousKeyValueStore.default : nil
    }

    static func save(_ settings: ConsentSettings) {
        write(settings, to: groupDefaults)
        if let cloud = cloud {
            write(settings, to: cloud)
            cloud.synchronize()
        }
    }

    // Brings the App Group and iCloud copies to the newer of the two.
    @discardableResult
    static func sync() -> SettingsSync.Result {
        let cloud = Self.cloud
        cloud?.synchronize()
        return sync(local: groupDefaults, cloud: cloud)
    }

    static func sync(local: SettingsStorage?, cloud: SettingsStorage?) -> SettingsSync.Result {
        var result = SettingsSync.reconcile(local: read(local), cloud: read(cloud))
        // With iCloud off there is nowhere to push to.
        result.writeCloud = result.writeCloud && cloud != nil
        if result.writeLocal {
            write(result.settings, to: local)
        }
        if result.writeCloud, let cloud = cloud {
            write(result.settings, to: cloud)
            (cloud as? NSUbiquitousKeyValueStore)?.synchronize()
        }
        return result
    }

    // iOS cannot ask Safari whether a web extension is on, so the extension
    // records when it last ran and the app reads that instead.
    private static let extensionLastSeenKey = "extensionLastSeen"

    static func markExtensionSeen() {
        groupDefaults?.set(Date(), forKey: extensionLastSeenKey)
    }

    static var extensionLastSeen: Date? {
        groupDefaults?.object(forKey: extensionLastSeenKey) as? Date
    }

    static func jsonObject(_ settings: ConsentSettings) -> Any? {
        (try? encoder.encode(settings)).flatMap { try? JSONSerialization.jsonObject(with: $0) }
    }
}
