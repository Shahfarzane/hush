import SwiftUI
import SafariServices

let webExtensionIdentifier = "\(Bundle.main.bundleIdentifier ?? "ceo.nerd.hush").WebExtension"

struct ExtensionStatusView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var model: ConsentSettingsModel

    var body: some View {
        switch appState.webExtensionEnabledState {
        case .undetermined:
            EmptyView()
        case .enabled:
            VStack(alignment: .leading, spacing: 5) {
                Text("Hush is answering")
                    .font(.title)
                    .accessibilityIdentifier("extension answering")
                Text("Cookie banners get your choice: \(model.level.title.lowercased()).")
            }
        case .disabled:
            VStack(alignment: .leading, spacing: 30) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Turn on Hush in Safari")
                        .font(.title)
                        .accessibilityIdentifier("extension not answering")
                    Text("Follow these steps:")
                }
                #if os(macOS)
                VStack(alignment: .leading, spacing: 10) {
                    Instruction(imageName: "Safari", label: Text("Open ") + Text("Safari").bold())
                    Instruction(imageName: "Settings", label: Text("Select ") + Text("Extensions").bold() + Text(" in ") + Text("Settings").bold())
                    Instruction(imageName: "Checkbox", label: Text("Enable ") + Text("Hush").bold() + Text(" and ") + Text("Always Allow on Every Website").bold())
                }
                Button {
                    SFSafariApplication.showPreferencesForExtension(withIdentifier: webExtensionIdentifier)
                } label: {
                    Text("Open Safari Settings")
                        .underline()
                        .bold()
                        .foregroundColor(.primary)
                }
                .buttonStyle(.plain)
                #else
                VStack(alignment: .leading, spacing: 15) {
                    Instruction(imageName: "Settings", label: Text("Open ") + Text("Settings").bold() + Text(" app"))
                    Instruction(imageName: "Safari", label: Text("Tap ") + Text("Apps → Safari → Extensions → Hush").bold())
                    Instruction(imageName: "Toggle", label: Text("Allow ") + Text("Hush").bold() + Text(" on ") + Text("All Websites").bold())
                }
                Text("Already on? Open any website in Safari once.")
                    .font(.footnote)
                #endif
            }
        }
    }
}

struct ExtensionStatusView_Previews: PreviewProvider {
    static var previews: some View {
        ExtensionStatusView()
            .environmentObject(AppState(initialContentBlockerEnabledState: .disabled))
            .environmentObject(ConsentSettingsModel(settings: ConsentSettings()))
    }
}
