import Foundation

// Chrome's native messaging host for Hush Extra, the counterpart of
// SafariWebExtensionHandler. Chrome starts it for each
// browser.runtime.sendNativeMessage and writes one message to stdin: a 32-bit
// length in native byte order, then that many bytes of JSON. The reply goes
// out the same way. It reads and writes the App Group only (see
// ConsentSettingsStore.cloud(iCloud:)).

func readMessage() -> [String: Any]? {
    let input = FileHandle.standardInput
    guard let header = try? input.read(upToCount: 4), header.count == 4 else { return nil }
    let length = Int(header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) })
    guard let body = try? input.read(upToCount: length), body.count == length else { return nil }
    return (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
}

func writeMessage(_ message: [String: Any]) {
    guard let body = try? JSONSerialization.data(withJSONObject: message) else { return }
    var length = UInt32(body.count)
    FileHandle.standardOutput.write(Data(bytes: &length, count: 4) + body)
}

let message = readMessage()
let settings: ConsentSettings?
switch message?["type"] as? String {
case "getSettings":
    settings = ConsentSettingsStore.sync(iCloud: false).settings
case "setPaused":
    settings = ConsentSettingsStore.setPaused(
        message?["site"] as? String, paused: message?["paused"] as? Bool ?? true, iCloud: false)
default:
    settings = nil
}
writeMessage(settings.map { ["settings": ConsentSettingsStore.jsonObject($0) ?? [:]] } ?? [:])
