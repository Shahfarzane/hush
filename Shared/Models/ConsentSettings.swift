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
