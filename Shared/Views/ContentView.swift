import SwiftUI

struct CookieLevelLink: View {
    @EnvironmentObject var model: ConsentSettingsModel

    private var label: some View {
        Text("Change")
            .underline()
            .bold()
            .foregroundColor(.primary)
    }

    var body: some View {
        HStack(spacing: 0) {
            Text("Cookie level: ").bold()
            Text(model.level.title)
                .accessibilityIdentifier("current cookie level")
            Text(" · ")
            #if os(macOS)
            SettingsLink { label }
                .buttonStyle(.plain)
                .accessibilityIdentifier("change cookie level")
            #else
            NavigationLink { SettingsView() } label: { label }
                .accessibilityIdentifier("change cookie level")
            #endif
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var model: ConsentSettingsModel

    private var enabledState: ExtensionEnabledState {
        appState.webExtensionEnabledState
    }

    var body: some View {
        VStack ( alignment: .leading, spacing: 40) {
            Spacer()
            VStack {
                Image(enabledState == .disabled ? "Disabled" : "Enabled")
                    .resizable()
                    .renderingMode(.template)
                    .foregroundColor(.invertedBackgroundColor)
                    .frame(width: 200, height: 155)
            }
            .frame(
                maxWidth: .infinity,
                alignment: .center
            )
            VStack(alignment: .leading, spacing: 30) {
                ExtensionStatusView()
                CookieLevelLink()
            }
            .padding()
            Spacer()
        }
        .frame(maxWidth: 400)
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environmentObject(AppState(webExtensionEnabledState: .enabled))
            .environmentObject(ConsentSettingsModel(settings: ConsentSettings()))
        ContentView()
            .environmentObject(AppState(webExtensionEnabledState: .disabled))
            .environmentObject(ConsentSettingsModel(settings: ConsentSettings(mode: .hide)))
    }
}
