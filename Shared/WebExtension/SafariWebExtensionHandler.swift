import SafariServices
import os

private let logger = Logger(subsystem: "ceo.nerd.hush", category: "WebExtension")

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = request?.userInfo?[SFExtensionMessageKey] as? [String: Any]
        let response = NSExtensionItem()

        switch message?["type"] as? String {
        case "getSettings":
            ConsentSettingsStore.markExtensionSeen()
            let local = ConsentSettingsStore.load()
            let cloud = ConsentSettingsStore.loadFromCloud()
            let settings = local ?? cloud ?? ConsentSettings()
            logger.notice("getSettings appGroup=\(local != nil ? "present" : "absent", privacy: .public) iCloud=\(cloud != nil ? "present" : "absent", privacy: .public)")
            response.userInfo = [SFExtensionMessageKey: ["settings": ConsentSettingsStore.jsonObject(settings) ?? [:]]]
        case "setPaused":
            var settings = ConsentSettingsStore.load() ?? ConsentSettings()
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
