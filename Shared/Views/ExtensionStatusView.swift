import SwiftUI
import SafariServices

let webExtensionIdentifier = "\(Bundle.main.bundleIdentifier ?? "ceo.nerd.hush").WebExtension"

enum SafariExtension {
    static func state() async -> ExtensionEnabledState {
        #if os(macOS)
        await withCheckedContinuation { continuation in
            SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: webExtensionIdentifier) { state, _ in
                continuation.resume(returning: state.map { $0.isEnabled ? .enabled : .disabled } ?? .undetermined)
            }
        }
        #else
        if #available(iOS 26.2, *),
           let state = try? await SFSafariExtensionManager.stateOfExtension(withIdentifier: webExtensionIdentifier) {
            return state.isEnabled ? .enabled : .disabled
        }
        // Before iOS 26.2 the app cannot ask Safari, so it goes by whether
        // the extension has read the settings yet.
        return ConsentSettingsStore.extensionLastSeen == nil ? .disabled : .enabled
        #endif
    }

    static var canOpenSettings: Bool {
        #if os(macOS)
        true
        #else
        if #available(iOS 26.2, *) { true } else { false }
        #endif
    }

    static func openSettings() {
        #if os(macOS)
        SFSafariApplication.showPreferencesForExtension(withIdentifier: webExtensionIdentifier)
        #else
        if #available(iOS 26.2, *) {
            SFSafariSettings.openExtensionsSettings(forIdentifiers: [webExtensionIdentifier]) { _ in }
        }
        #endif
    }
}

struct StatusBadge: View {
    var systemImage: String
    var isOn: Bool

    var body: some View {
        Image(systemName: systemImage)
            .font(.title2.weight(.semibold))
            .foregroundStyle(isOn ? Color.black : Color.white)
            .frame(width: 52, height: 52)
            .background(isOn ? Color.brandYellow : Color.gray, in: .circle)
            .accessibilityHidden(true)
    }
}

struct StatusHeader: View {
    var systemImage: String
    var isOn: Bool
    var title: String
    var subtitle: String
    var identifier: String

    var body: some View {
        HStack(spacing: 14) {
            StatusBadge(systemImage: systemImage, isOn: isOn)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.title3.weight(.semibold))
                    .accessibilityIdentifier(identifier)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}

struct ExtensionStatusSection: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var model: ConsentSettingsModel

    var body: some View {
        switch appState.webExtensionEnabledState {
        case .undetermined:
            EmptyView()
        case .enabled:
            Section {
                if model.settings.mode == .answer {
                    StatusHeader(
                        systemImage: "checkmark.shield.fill",
                        isOn: true,
                        title: "Hush is answering",
                        subtitle: "Cookie banners get your choice: \(model.level.title.lowercased()).",
                        identifier: "extension answering")
                } else {
                    StatusHeader(
                        systemImage: "eye.slash.fill",
                        isOn: true,
                        title: "Hush is hiding banners",
                        subtitle: "Cookie banners are hidden, never answered.",
                        identifier: "extension hiding")
                }
            }
        case .disabled:
            Section {
                StatusHeader(
                    systemImage: "exclamationmark.shield.fill",
                    isOn: false,
                    title: "Turn on Hush in Safari",
                    subtitle: "Hush answers cookie banners once Safari lets it run on every website.",
                    identifier: "extension off")
                SetupSteps()
                if SafariExtension.canOpenSettings {
                    Button {
                        SafariExtension.openSettings()
                    } label: {
                        Text("Open Safari Settings")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(.brandYellow)
                    .foregroundStyle(.black)
                    .controlSize(.large)
                    .accessibilityIdentifier("open safari settings")
                }
            } footer: {
                #if os(iOS)
                Text("Already on? Open any website in Safari once. Turn on Allow in Private Browsing too if you use it.")
                #endif
            }
        }
    }
}

struct ExtensionStatusSection_Previews: PreviewProvider {
    static var previews: some View {
        Form {
            ExtensionStatusSection()
        }
        .formStyle(.grouped)
        .environmentObject(AppState(webExtensionEnabledState: .disabled))
        .environmentObject(ConsentSettingsModel(settings: ConsentSettings()))
    }
}
