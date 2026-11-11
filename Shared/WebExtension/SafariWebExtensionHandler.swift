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
            let sync = ConsentSettingsStore.sync()
            logger.notice("getSettings iCloud=\(ConsentSettingsStore.syncsWithICloud ? "on" : "off", privacy: .public) pulled=\(sync.writeLocal, privacy: .public) pushed=\(sync.writeCloud, privacy: .public)")
            response.userInfo = [SFExtensionMessageKey: ["settings": ConsentSettingsStore.jsonObject(sync.settings) ?? [:]]]
        case "setPaused":
            let settings = ConsentSettingsStore.setPaused(
                message?["site"] as? String, paused: message?["paused"] as? Bool ?? true, iCloud: true)
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
