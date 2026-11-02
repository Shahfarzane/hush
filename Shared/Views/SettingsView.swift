import SwiftUI

extension PrivacyLevel {
    var title: String {
        switch self {
        case .maximumPrivacy: return "Maximum privacy"
        case .functionalOnly: return "Functional only"
        case .balanced: return "Balanced"
        case .custom: return "Custom"
        }
    }

    var summary: String {
        switch self {
        case .maximumPrivacy: return "Refuse every optional cookie."
        case .functionalOnly: return "Allow cookies that remember your logins and settings. Refuse the rest."
        case .balanced: return "Also allow performance cookies that help sites measure themselves."
        case .custom: return "Your own mix of the categories below."
        }
    }
}

extension ConsentSettings.Mode {
    var title: String {
        switch self {
        case .answer: return "Answer with my choices"
        case .hide: return "Only hide it"
        }
    }
}

struct TitleAndSummary: View {
    var title: String
    var summary: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
            Text(summary)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

struct LevelRow: View {
    var level: PrivacyLevel
    var isSelected: Bool
    var select: () -> Void

    var body: some View {
        Button(action: select) {
            HStack {
                TitleAndSummary(title: level.title, summary: level.summary)
                    .foregroundStyle(.primary)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.tint)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("level \(level.rawValue)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

struct CategoryToggle: View {
    var title: String
    var summary: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            TitleAndSummary(title: title, summary: summary)
        }
        .toggleStyle(.switch)
        .tint(.accentColor)
        .accessibilityIdentifier(title)
    }
}

// The level list and, for Custom, the category switches under it.
struct PrivacyLevelSections: View {
    @EnvironmentObject var model: ConsentSettingsModel
    // Custom stays picked while its switches still match a preset.
    @State private var isCustomizing = false

    private var selectedLevel: PrivacyLevel {
        isCustomizing ? .custom : model.level
    }

    private func select(_ level: PrivacyLevel) {
        withAnimation {
            isCustomizing = level == .custom
            model.level = level
        }
    }

    var body: some View {
        Section {
            #if os(macOS)
            // Mac uses radio buttons for one choice out of a few.
            Picker("Privacy level", selection: Binding(get: { selectedLevel }, set: select)) {
                ForEach(PrivacyLevel.allCases) { level in
                    TitleAndSummary(title: level.title, summary: level.summary)
                        .padding(.vertical, 2)
                        .tag(level)
                        .accessibilityIdentifier("level \(level.rawValue)")
                }
            }
            .pickerStyle(.radioGroup)
            .labelsHidden()
            #else
            ForEach(PrivacyLevel.allCases) { level in
                LevelRow(level: level, isSelected: selectedLevel == level) {
                    select(level)
                }
            }
            #endif
        } header: {
            // On the Mac the page title already says it.
            #if os(iOS)
            Text("Privacy level")
            #endif
        } footer: {
            Text("Necessary cookies are always allowed.")
        }

        if selectedLevel == .custom {
            Section {
                CategoryToggle(
                    title: "Functional cookies",
                    summary: "Remember your logins, language and other preferences.",
                    isOn: $model.settings.categories.functional)
                CategoryToggle(
                    title: "Performance cookies",
                    summary: "Help sites count visits and see how their pages perform.",
                    isOn: $model.settings.categories.performance)
                CategoryToggle(
                    title: "Advertising cookies",
                    summary: "Track you across sites for targeted ads. Social media cookies count here.",
                    isOn: $model.settings.categories.advertising)
                CategoryToggle(
                    title: "Other cookies",
                    summary: "Anything a site does not put in the categories above.",
                    isOn: $model.settings.categories.other)
            } header: {
                Text("Cookie categories")
            }
        }
    }
}

struct BannersSection: View {
    @EnvironmentObject var model: ConsentSettingsModel

    var body: some View {
        Section {
            Picker("When Hush sees a banner", selection: $model.settings.mode) {
                ForEach([ConsentSettings.Mode.answer, .hide], id: \.self) { mode in
                    Text(mode.title).tag(mode)
                }
            }
            #if os(iOS)
            // A menu's value wraps under this label on a phone, so the
            // choices are rows and the label is the section header.
            .pickerStyle(.inline)
            .labelsHidden()
            #endif
            .accessibilityIdentifier("banner mode")
            Toggle("Hide the banner while answering", isOn: $model.settings.hideWhileAnswering)
                .toggleStyle(.switch)
                .tint(.accentColor)
                .disabled(model.settings.mode == .hide)
        } header: {
            #if os(iOS)
            Text("When Hush sees a banner")
            #endif
        } footer: {
            Text("Banners with no way to refuse are hidden, never accepted.")
        }
    }
}

struct PausedSitesSection: View {
    @EnvironmentObject var model: ConsentSettingsModel
    @State private var isAdding = false
    @State private var newSite = ""
    @State private var rejectedInput = false

    private func add() {
        rejectedInput = !model.pause(newSite)
        newSite = ""
    }

    var body: some View {
        Section {
            ForEach(model.settings.pausedSites, id: \.self) { site in
                HStack {
                    Label(site, systemImage: "pause.circle")
                    Spacer()
                    Button(role: .destructive) {
                        model.unpause(site)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Resume \(site)")
                }
            }
            Button {
                rejectedInput = false
                isAdding = true
            } label: {
                Label("Pause a site…", systemImage: "plus")
            }
            .accessibilityIdentifier("pause a site")
        } header: {
            #if os(iOS)
            Text("Paused sites")
            #endif
        } footer: {
            Text(rejectedInput
                 ? "That doesn't look like a site name."
                 : "Hush leaves cookie banners alone on these sites and their subdomains.")
        }
        .alert("Pause a site", isPresented: $isAdding) {
            TextField("example.com", text: $newSite)
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                #endif
                .accessibilityIdentifier("new paused site")
            Button("Pause", action: add)
            Button("Cancel", role: .cancel) {
                newSite = ""
            }
        } message: {
            Text("Hush will leave cookie banners alone there.")
        }
    }
}

struct SyncSection: View {
    @EnvironmentObject var model: ConsentSettingsModel

    var body: some View {
        Section {
            Toggle(isOn: $model.syncsWithICloud) {
                Label("Sync with iCloud", systemImage: "icloud")
            }
            .toggleStyle(.switch)
            .tint(.accentColor)
            .accessibilityIdentifier("sync with icloud")
        } footer: {
            Text("Uses the same level, banner choice and paused sites on your iPhone, iPad and Mac. The latest change wins.")
        }
    }
}

struct SettingsSections_Previews: PreviewProvider {
    static var previews: some View {
        Form {
            PrivacyLevelSections()
            BannersSection()
            PausedSitesSection()
            SyncSection()
        }
        .formStyle(.grouped)
        .environmentObject(ConsentSettingsModel(settings: ConsentSettings()))
    }
}
