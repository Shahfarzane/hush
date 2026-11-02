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

    // The filled version for the page header.
    var headerImage: String {
        switch self {
        case .status: return "checkmark.shield.fill"
        case .level: return "hand.raised.fill"
        case .banners: return "rectangle.bottomhalf.inset.filled"
        case .paused: return "pause.circle.fill"
        }
    }

    var summary: String {
        switch self {
        case .status: return ""
        case .level: return "Which cookies Hush allows when it answers a banner for you."
        case .banners: return "What Hush does when a site asks about cookies."
        case .paused: return "Hush leaves cookie banners alone on these sites and their subdomains."
        }
    }
}

// The icon, title and summary System Settings puts at the top of a pane.
struct PageHeader: View {
    var page: Page

    var body: some View {
        Section {
            HStack(spacing: 14) {
                Image(systemName: page.headerImage)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.black)
                    .frame(width: 44, height: 44)
                    .background(Color.brandYellow, in: .rect(cornerRadius: 10))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(page.title)
                        .font(.title3.weight(.semibold))
                    Text(page.summary)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
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
                    PageHeader(page: page)
                    PrivacyLevelSections()
                case .banners:
                    PageHeader(page: page)
                    BannersSection()
                case .paused:
                    PageHeader(page: page)
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
