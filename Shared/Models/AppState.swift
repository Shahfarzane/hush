import Foundation

enum ExtensionEnabledState {
    case undetermined
    case disabled
    case enabled
}

class AppState: ObservableObject {
    @Published var webExtensionEnabledState: ExtensionEnabledState
    init(webExtensionEnabledState: ExtensionEnabledState = .undetermined) {
        self.webExtensionEnabledState = webExtensionEnabledState
    }
}
