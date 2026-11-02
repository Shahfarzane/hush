import SwiftUI

struct SetupStep: View {
    var systemImage: String
    var text: Text

    var body: some View {
        Label {
            text
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(.tint)
        }
    }
}

// Where Safari keeps the switch and the website access Hush needs. The
// "Open Safari Settings" button below these steps goes straight to Hush,
// so the way there is only spelled out where the button is missing.
struct SetupSteps: View {
    var body: some View {
        #if os(macOS)
        SetupStep(systemImage: "checkmark.square", text: Text("Turn on ") + Text("Hush").bold())
        SetupStep(systemImage: "globe", text: Text("Click ") + Text("Always Allow on Every Website").bold())
        #else
        if !SafariExtension.canOpenSettings {
            SetupStep(systemImage: "gear", text: Text("Open ") + Text("Settings").bold() + Text(", then ") + Text("Apps › Safari › Extensions").bold())
        }
        SetupStep(systemImage: "switch.2", text: Text("Turn on ") + Text("Hush").bold())
        SetupStep(systemImage: "globe", text: Text("Set ") + Text("All Websites").bold() + Text(" to ") + Text("Allow").bold())
        #endif
    }
}
