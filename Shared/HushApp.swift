import SwiftUI
import SafariServices

@main
struct HushApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    #endif

    let contentBlockerIdentifier = "\(Bundle.main.bundleIdentifier ?? "ceo.nerd.hush").ContentBlocker"
    let appState = AppState(initialContentBlockerEnabledState: .undetermined)
    let settingsModel = ConsentSettingsModel(settings: ConsentSettingsStore.load() ?? ConsentSettings())

    init() {
        if ConsentSettingsStore.load() == nil {
            ConsentSettingsStore.save(ConsentSettings())
        }

        SFContentBlockerManager.reloadContentBlocker(withIdentifier: contentBlockerIdentifier,
            completionHandler: { (error) in
                if let error = error {
                    print("Failed to reload content blocker")
                    print(error)
                }
        })
    }

    func refreshEnabledState() {
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
