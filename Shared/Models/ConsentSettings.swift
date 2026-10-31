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
}

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

    static func load() -> ConsentSettings? {
        groupDefaults?.data(forKey: key).flatMap { try? decoder.decode(ConsentSettings.self, from: $0) }
    }

    static func loadFromCloud() -> ConsentSettings? {
        NSUbiquitousKeyValueStore.default.data(forKey: key).flatMap { try? decoder.decode(ConsentSettings.self, from: $0) }
    }

    static func save(_ settings: ConsentSettings) {
        guard let data = try? encoder.encode(settings) else { return }
        groupDefaults?.set(data, forKey: key)
        NSUbiquitousKeyValueStore.default.set(data, forKey: key)
        NSUbiquitousKeyValueStore.default.synchronize()
    }

    static func jsonObject(_ settings: ConsentSettings) -> Any? {
        (try? encoder.encode(settings)).flatMap { try? JSONSerialization.jsonObject(with: $0) }
    }
}
