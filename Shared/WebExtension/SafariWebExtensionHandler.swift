import SafariServices
import os

private let logger = Logger(subsystem: "ceo.nerd.hush", category: "WebExtension")

// ceo.nerd.hush.WebExtension sits next to ceo.nerd.hush.ContentBlocker.
private let contentBlockerIdentifier = (Bundle.main.bundleIdentifier ?? "ceo.nerd.hush.WebExtension")
    .replacingOccurrences(of: ".WebExtension", with: ".ContentBlocker")

private func reloadContentBlocker() {
    SFContentBlockerManager.reloadContentBlocker(withIdentifier: contentBlockerIdentifier) { error in
        if let error = error {
            logger.error("reloading \(contentBlockerIdentifier, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
        } else {
            logger.notice("reloaded \(contentBlockerIdentifier, privacy: .public)")
        }
    }
}

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = request?.userInfo?[SFExtensionMessageKey] as? [String: Any]
        let response = NSExtensionItem()

        switch message?["type"] as? String {
        case "getSettings":
            ConsentSettingsStore.markExtensionSeen()
            let before = ConsentSettingsStore.load() ?? .defaults
            let sync = ConsentSettingsStore.sync()
            // A mode synced from another device needs the other blocker list,
            // even when the app has not run here since.
            if sync.settings.mode != before.mode {
                reloadContentBlocker()
            }
            logger.notice("getSettings iCloud=\(ConsentSettingsStore.syncsWithICloud ? "on" : "off", privacy: .public) pulled=\(sync.writeLocal, privacy: .public) pushed=\(sync.writeCloud, privacy: .public)")
            response.userInfo = [SFExtensionMessageKey: ["settings": ConsentSettingsStore.jsonObject(sync.settings) ?? [:]]]
        case "setPaused":
            var settings = ConsentSettingsStore.sync().settings
            if let input = message?["site"] as? String, let site = PausedSite.normalize(input) {
                let paused = message?["paused"] as? Bool ?? true
                settings.pausedSites.removeAll { $0 == site }
                if paused {
                    settings.pausedSites = (settings.pausedSites + [site]).sorted()
                }
                settings.modifiedAt = Date()
                ConsentSettingsStore.save(settings)
            }
            response.userInfo = [SFExtensionMessageKey: ["settings": ConsentSettingsStore.jsonObject(settings) ?? [:]]]
        case "report":
            #if DEBUG
            logger.notice("report \(String(describing: message ?? [:]), privacy: .public)")
            #endif
        default:
            break
        }

        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
