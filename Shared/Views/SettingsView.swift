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

struct LevelRow: View {
    var level: PrivacyLevel
    var isSelected: Bool
    var select: () -> Void

    var body: some View {
        Button(action: select) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(level.title)
                        .foregroundColor(.primary)
                    Text(level.summary)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundColor(.primary)
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
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                Text(summary)
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
        }
        .toggleStyle(.switch)
        .tint(.invertedBackgroundColor)
        .accessibilityIdentifier(title)
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
                    Text(site)
                    Spacer()
                    Button(role: .destructive) {
                        model.unpause(site)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Resume \(site)")
                }
            }
            Button("Pause a site…") {
                rejectedInput = false
                isAdding = true
            }
            .accessibilityIdentifier("pause a site")
        } header: {
            Text("Paused sites")
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

struct SettingsView: View {
    @EnvironmentObject var model: ConsentSettingsModel

    var body: some View {
        Form {
            Section {
                ForEach(PrivacyLevel.allCases) { level in
                    LevelRow(level: level, isSelected: model.level == level) {
                        model.level = level
                    }
                }
            } header: {
                Text("Privacy level")
            } footer: {
                Text("Necessary cookies are always allowed.")
            }

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

            Section {
                Picker("When Hush sees a banner", selection: $model.settings.mode) {
                    Text("Answer with my choices").tag(ConsentSettings.Mode.answer)
                    Text("Only hide it").tag(ConsentSettings.Mode.hide)
                }
                .accessibilityIdentifier("banner mode")
                Toggle("Hide the banner while answering", isOn: $model.settings.hideWhileAnswering)
                    .toggleStyle(.switch)
                    .tint(.invertedBackgroundColor)
                    .disabled(model.settings.mode == .hide)
            } header: {
                Text("Banners")
            } footer: {
                Text("Banners with no way to refuse are hidden, never accepted.")
            }

            PausedSitesSection()

            Section {
                Toggle("Sync with iCloud", isOn: $model.syncsWithICloud)
                    .toggleStyle(.switch)
                    .tint(.invertedBackgroundColor)
                    .accessibilityIdentifier("sync with icloud")
            } footer: {
                Text("Uses the same level, banner choice and paused sites on your iPhone, iPad and Mac. The latest change wins.")
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .background(Color.appBackgroundColor.ignoresSafeArea())
        .tint(.invertedBackgroundColor)
        .navigationTitle("Cookie level")
    }
}

struct SettingsView_Previews: PreviewProvider {
    static var previews: some View {
        SettingsView()
            .environmentObject(ConsentSettingsModel(settings: ConsentSettings()))
    }
}
