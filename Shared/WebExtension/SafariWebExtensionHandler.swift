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
            let local = ConsentSettingsStore.load()
            let cloud = ConsentSettingsStore.loadFromCloud()
            let settings = local ?? cloud ?? ConsentSettings()
            logger.notice("getSettings appGroup=\(local != nil ? "present" : "absent", privacy: .public) iCloud=\(cloud != nil ? "present" : "absent", privacy: .public)")
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
