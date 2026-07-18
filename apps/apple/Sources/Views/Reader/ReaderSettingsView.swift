import GlassleafDomain
import SwiftUI

struct ReaderSettingsView: View {
    @Binding var preferences: ReaderPreferences
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        NavigationStack {
            Form {
                Section("Theme") {
                    HStack(spacing: 14) {
                        ForEach(ReaderTheme.allCases) { theme in
                            themeButton(theme)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 6)
                }

                Section("Text") {
                    Picker("Typeface", selection: $preferences.fontFamily) {
                        Text("Serif").tag(ReaderFont.serif)
                        Text("Sans").tag(ReaderFont.sans)
                        Text("Rounded").tag(ReaderFont.rounded)
                    }
                    .pickerStyle(.segmented)

                    LabeledContent("Size") {
                        HStack(spacing: 12) {
                            Image(systemName: "textformat.size.smaller")
                                .accessibilityHidden(true)
                            Slider(value: $preferences.fontScale, in: 0.8...2, step: 0.1)
                                .accessibilityLabel("Text size")
                            Image(systemName: "textformat.size.larger")
                                .accessibilityHidden(true)
                        }
                    }

                    LabeledContent("Line spacing") {
                        Slider(value: $preferences.lineSpacing, in: 2...20, step: 1)
                            .accessibilityLabel("Line spacing")
                    }

                    LabeledContent("Margins") {
                        Slider(value: $preferences.horizontalMargin, in: 16...72, step: 4)
                            .accessibilityLabel("Page margins")
                    }

                    Picker("Alignment", selection: $preferences.alignment) {
                        Label("Natural", systemImage: "text.alignleft")
                            .tag(ReaderTextAlignment.leading)
                        Label("Justified", systemImage: "text.justify")
                            .tag(ReaderTextAlignment.justified)
                    }
                    .pickerStyle(.segmented)
                }

                Section("Reading") {
                    Picker("Layout", selection: $preferences.mode) {
                        Label("Pages", systemImage: "book.pages")
                            .tag(ReadingMode.paginated)
                        Label("Scroll", systemImage: "scroll")
                            .tag(ReadingMode.scrolling)
                    }
                    .pickerStyle(.segmented)
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Reading Appearance")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .frame(minWidth: 360, idealWidth: 500, minHeight: 460, idealHeight: 620)
        .presentationDetents([.medium, .large])
    }

    private func themeButton(_ theme: ReaderTheme) -> some View {
        Button {
            preferences.theme = theme
        } label: {
            ZStack {
                Circle()
                    .fill(theme.background(for: colorScheme))
                Circle()
                    .strokeBorder(.primary.opacity(0.18), lineWidth: 1)
                if preferences.theme == theme {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.bold))
                        .foregroundStyle(theme.foreground(for: colorScheme))
                } else if theme == .automatic {
                    Image(systemName: "circle.lefthalf.filled")
                        .font(.body.weight(.medium))
                        .foregroundStyle(theme.foreground(for: colorScheme))
                }
            }
            .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(theme.accessibilityName)
        .accessibilityAddTraits(preferences.theme == theme ? .isSelected : [])
        .help(theme.accessibilityName)
    }
}

private extension ReaderTheme {
    var accessibilityName: String {
        switch self {
        case .automatic: "Automatic theme"
        case .paper: "Paper theme"
        case .sepia: "Sepia theme"
        case .night: "Night theme"
        case .black: "True black theme"
        }
    }
}
