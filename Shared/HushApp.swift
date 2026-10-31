import SwiftUI
import SafariServices

@main
struct HushApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    #endif

    let appState = AppState(initialContentBlockerEnabledState: .undetermined)
    let settingsModel: ConsentSettingsModel

    init() {
        // On a new device this pulls the settings chosen on another one.
        settingsModel = ConsentSettingsModel(settings: ConsentSettingsStore.sync().settings)
        reloadContentBlocker()
    }

    func refreshEnabledState() {
        settingsModel.reload()
        SFContentBlockerManager.getStateOfContentBlocker(withIdentifier: contentBlockerIdentifier, completionHandler: { (state, error) in
            if let error = error {
                print("Failed to get content blocker state")
                print(error)
                DispatchQueue.main.async {
                    appState.contentBlockerEnabledState = .undetermined
                }
            }
            if let state = state {
                DispatchQueue.main.async {
                    appState.contentBlockerEnabledState = state.isEnabled ? .enabled : .disabled
                }
            }
        })
        #if os(macOS)
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: webExtensionIdentifier) { (state, error) in
            DispatchQueue.main.async {
                appState.webExtensionEnabledState = state.map { $0.isEnabled ? .enabled : .disabled } ?? .undetermined
            }
        }
        #else
        appState.webExtensionEnabledState = ConsentSettingsStore.extensionLastSeen == nil ? .disabled : .enabled
        #endif
    }

    var body: some Scene {
        #if os(macOS)
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .environmentObject(settingsModel)
                .onAppear(perform: refreshEnabledState)
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.willBecomeActiveNotification)) { _ in
                    refreshEnabledState()
                }
                .frame(
                    minWidth: 360,
                    idealWidth: 400,
                    maxWidth: 500,
                    minHeight: 580,
                    idealHeight: 600,
                    maxHeight: 700
                )
                .background(Color.appBackgroundColor.ignoresSafeArea())
        }
        .commands {
            // Disable "New Window" command
            CommandGroup(replacing: CommandGroupPlacement.newItem) {}
        }
        .windowStyle(HiddenTitleBarWindowStyle())
        .windowResizability(.contentSize)

        Settings {
            SettingsView()
                .environmentObject(settingsModel)
                .frame(width: 480, height: 640)
        }
        #else
        WindowGroup {
            NavigationStack {
                ZStack {
                    Color.appBackgroundColor.ignoresSafeArea()
                    ContentView()
                        .environmentObject(appState)
                        .onAppear(perform: refreshEnabledState)
                        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                            refreshEnabledState()
                        }
                }
            }
            .environmentObject(settingsModel)
            .tint(.invertedBackgroundColor)
        }
        #endif
    }
}
