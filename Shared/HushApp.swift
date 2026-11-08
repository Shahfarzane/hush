import SwiftUI

@main
struct HushApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    #endif

    let appState = AppState()
    let settingsModel: ConsentSettingsModel

    init() {
        // On a new device this pulls the settings chosen on another one.
        settingsModel = ConsentSettingsModel(settings: ConsentSettingsStore.sync().settings)
    }

    func refreshEnabledState() {
        settingsModel.reload()
        Task { @MainActor in
            appState.webExtensionEnabledState = await SafariExtension.state()
        }
    }

    var body: some Scene {
        #if os(macOS)
        Window("Hush Extra", id: "main") {
            ContentView()
                .environmentObject(appState)
                .environmentObject(settingsModel)
                .onAppear(perform: refreshEnabledState)
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
                    refreshEnabledState()
                }
                .frame(minWidth: 600, minHeight: 420)
        }
        .defaultSize(width: 680, height: 480)
        .windowResizability(.contentMinSize)
        #else
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .environmentObject(settingsModel)
                .onAppear(perform: refreshEnabledState)
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                    refreshEnabledState()
                }
        }
        #endif
    }
}
