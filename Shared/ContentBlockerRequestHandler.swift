import Foundation
import os

private let logger = Logger(subsystem: "ceo.nerd.hush", category: "ContentBlocker")

class ContentBlockerRequestHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        // In answer mode the Safari web extension answers the consent platforms
        // this list leaves out, so they must not be hidden or blocked first.
        let mode = ConsentSettingsStore.load()?.mode ?? ConsentSettings().mode
        let list = mode == .answer ? "blockerList-answer" : "blockerList"
        logger.notice("serving \(list, privacy: .public) for mode \(mode.rawValue, privacy: .public)")
        let attachment = NSItemProvider(contentsOf: Bundle.main.url(forResource: list, withExtension: "json"))!

        let item = NSExtensionItem()
        item.attachments = [attachment]

        context.completeRequest(returningItems: [item], completionHandler: nil)
    }
}
