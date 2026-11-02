import SwiftUI

#if os(macOS)
enum Page: String, CaseIterable, Identifiable {
    case status, level, banners, paused

    var id: Self { self }

    var title: String {
        switch self {
        case .status: return "Status"
        case .level: return "Privacy Level"
        case .banners: return "Banners"
        case .paused: return "Paused Sites"
        }
    }

    var systemImage: String {
        switch self {
        case .status: return "checkmark.shield"
        case .level: return "hand.raised"
        case .banners: return "rectangle.bottomhalf.inset.filled"
        case .paused: return "pause.circle"
        }
    }
}

// What the Status page shows of the other pages.
struct SummarySection: View {
    @EnvironmentObject var model: ConsentSettingsModel

    var body: some View {
        Section {
            LabeledContent("Privacy level") {
                Text(model.level.title)
                    .accessibilityIdentifier("current cookie level")
            }
            LabeledContent("When Hush sees a banner", value: model.settings.mode.title)
            LabeledContent("Paused sites", value: model.settings.pausedSites.count.formatted())
        }
    }
}

struct ContentView: View {
    @State private var page: Page? = .status

    var body: some View {
        NavigationSplitView {
            List(Page.allCases, selection: $page) { page in
                Label(page.title, systemImage: page.systemImage)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 260)
        } detail: {
            let page = page ?? .status
            Form {
                switch page {
                case .status:
                    ExtensionStatusSection()
                    SummarySection()
                    SyncSection()
                case .level:
                    PrivacyLevelSections()
                case .banners:
                    BannersSection()
                case .paused:
                    PausedSitesSection()
                }
            }
            .formStyle(.grouped)
            .navigationTitle(page.title)
        }
    }
}
#else
struct ContentView: View {
    var body: some View {
        NavigationStack {
            Form {
                ExtensionStatusSection()
                PrivacyLevelSections()
                BannersSection()
                PausedSitesSection()
                SyncSection()
            }
            .formStyle(.grouped)
            .navigationTitle("Hush")
        }
    }
}
#endif

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
