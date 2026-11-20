import SwiftUI

@main
struct ImageHelperApp: App {
    var body: some Scene {
        WindowGroup {
            SetupView()
        }
    }
}

private struct SetupView: View {
    private let accent = Color(uiColor: .systemBlue)
    private var settingsInstructions: LocalizedStringKey {
        if #available(iOS 18.0, *) {
            return "setup.settings.modern"
        }
        return "setup.settings.legacy"
    }

    private var privacyURL: URL? {
        let page = Bundle.main.preferredLocalizations.first?.hasPrefix("zh") == true
            ? "%E9%9A%90%E7%A7%81%E6%94%BF%E7%AD%96"
            : "Privacy-Policy"
        return URL(string: "https://github.com/wxmvv/ImageHelper/wiki/\(page)")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 30) {
                VStack(spacing: 12) {
                    Image("BrandIcon")
                        .resizable()
                        .frame(width: 76, height: 76)
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                        .accessibilityHidden(true)

                    Text(verbatim: "ImageHelper")
                        .font(.largeTitle.bold())
                        .accessibilityAddTraits(.isHeader)
                    Text("setup.intro")
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                VStack(alignment: .leading, spacing: 18) {
                    Text("setup.heading")
                        .font(.title2.bold())
                        .accessibilityAddTraits(.isHeader)

                    SetupStep(symbol: "1.circle.fill", heading: "setup.enable", detail: settingsInstructions)
                    Divider()
                    SetupStep(symbol: "2.circle.fill", heading: "setup.open", detail: "setup.open.detail")
                    Divider()
                    SetupStep(symbol: "3.circle.fill", heading: "setup.extract", detail: "setup.extract.detail")
                }
                .padding(22)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 24))

                if let privacyURL {
                    Link(destination: privacyURL) {
                        Label("setup.privacy", systemImage: "hand.raised")
                            .font(.subheadline.weight(.semibold))
                            .frame(minHeight: 44)
                    }
                }
            }
            .frame(maxWidth: 530)
            .padding(.horizontal, 20)
            .padding(.vertical, 30)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
        .tint(accent)
    }
}

private struct SetupStep: View {
    let symbol: String
    let heading: LocalizedStringKey
    let detail: LocalizedStringKey

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(Color(uiColor: .systemBlue))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                Text(heading).font(.headline)
                Text(detail).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
