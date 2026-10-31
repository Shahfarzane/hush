import Foundation

enum ContentBlockerEnabledState {
    case undetermined
    case disabled
    case enabled
}

class AppState: ObservableObject {
    @Published var contentBlockerEnabledState: ContentBlockerEnabledState
    @Published var webExtensionEnabledState = ContentBlockerEnabledState.undetermined
    init(initialContentBlockerEnabledState:ContentBlockerEnabledState) {
        self.contentBlockerEnabledState = initialContentBlockerEnabledState
    }
}
