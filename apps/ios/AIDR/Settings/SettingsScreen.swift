import AIDRKit
import SwiftUI

/// Language, text size, the daily notification, links and the version. Presented
/// as a sheet from Today; it owns its NavigationStack and its Done button.
struct SettingsScreen: View {
  let lang: Lang

  /// The language the sheet speaks now. It follows the picker at once, so the
  /// sheet does not wait for the screen behind it to rebuild.
  @State private var shown: Lang
  @State private var model = SettingsModel()
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @ScaledMetric(relativeTo: .caption) private var eyebrow: CGFloat = 11
  @AppStorage(SettingsKey.language) private var languagePref = LanguageChoice.system.rawValue
  @AppStorage(SettingsKey.textSize) private var textSizePref = TextSizeChoice.system.rawValue
  @AppStorage(SettingsKey.notifyEnabled) private var notifyEnabled = false
  @AppStorage(SettingsKey.notifyMinutes) private var notifyMinutes = NotifyPrefs.defaultMinutes

  init(lang: Lang) {
    self.lang = lang
    _shown = State(initialValue: lang)
  }

  var body: some View {
    NavigationStack {
      Form {
        languageSection
        textSizeSection
        notificationSection
        linksSection
        aboutSection
      }
      .font(.inter(16, relativeTo: .body))
      .foregroundStyle(Palette.foreground)
      .scrollContentBackground(.hidden)
      .background(Self.page)
      .navigationTitle(t("Cài đặt", "Settings"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(t("Xong", "Done")) { dismiss() }
            .accessibilityIdentifier("settings-done")
        }
      }
    }
    .environment(\.locale, shown.locale)
    .modifier(TextSizeModifier())
    .task { await syncAuthorization() }
    .onChange(of: languagePref) {
      shown = Lang.preferred(stored: languagePref)
      // The pending notification is in the old language.
      Task { await model.reschedule(lang: shown) }
    }
    .onChange(of: notifyMinutes) {
      Task { await model.reschedule(lang: shown) }
    }
  }

  // MARK: Sections

  private var languageSection: some View {
    Section {
      Picker(selection: $languagePref) {
        Text(t("Theo máy", "System")).tag(LanguageChoice.system.rawValue)
        Text("Tiếng Việt").tag(LanguageChoice.vi.rawValue)
        Text("English").tag(LanguageChoice.en.rawValue)
      } label: {
        Text(t("Ngôn ngữ", "Language"))
      }
      .pickerStyle(.inline)
      .labelsHidden()
      .accessibilityIdentifier("settings-language")
    } header: {
      header(t("Ngôn ngữ", "Language"))
    } footer: {
      footnote(t("Tin tiếng Việt và tiếng Anh là hai bản riêng, không dùng thay nhau.", "Vietnamese and English are separate editions. One never stands in for the other."))
    }
    .listRowBackground(Palette.card)
  }

  private var textSizeSection: some View {
    Section {
      Picker(selection: $textSizePref) {
        ForEach(TextSizeChoice.allCases) { choice in
          Text(title(of: choice)).tag(choice.rawValue)
        }
      } label: {
        Text(t("Cỡ chữ", "Text size"))
      }
      .pickerStyle(.menu)
      .accessibilityIdentifier("settings-text-size")

      Text(t("Mỗi sáng một bản tin AI ngắn gọn, đọc trong vài phút.", "One short AI briefing every morning, read in a few minutes."))
        .font(.inter(15, relativeTo: .body))
        .foregroundStyle(Palette.body)
        .accessibilityIdentifier("settings-text-preview")
    } header: {
      header(t("Cỡ chữ", "Text size"))
    }
    .listRowBackground(Palette.card)
  }

  private var notificationSection: some View {
    Section {
      Toggle(isOn: notifyBinding) {
        Text(t("Bản tin hằng ngày", "Daily edition"))
      }
      .tint(Palette.signal)
      .accessibilityIdentifier("settings-notify-toggle")

      if notifyEnabled {
        DatePicker(selection: timeBinding, displayedComponents: .hourAndMinute) {
          Text(t("Giờ nhận", "Time"))
        }
        .accessibilityIdentifier("settings-notify-time")

        Button {
          Task { await model.sendTest(lang: shown) }
        } label: {
          HStack {
            Text(t("Gửi thử ngay", "Send a test now"))
            Spacer()
            testStatus
          }
        }
        .disabled(model.test == .sending)
        .accessibilityIdentifier("settings-test-button")
      }

      if model.authorization == .denied {
        Button(t("Mở Cài đặt của iPhone", "Open iPhone Settings")) {
          if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
        }
        .accessibilityIdentifier("settings-open-system")
      }
    } header: {
      header(t("Thông báo", "Notifications"))
    } footer: {
      if model.authorization == .denied {
        footnote(t("Thông báo đang tắt cho AI;DR trong Cài đặt của iPhone.", "Notifications are off for AI;DR in iPhone Settings."))
      } else {
        footnote(t("Mỗi ngày một thông báo với tin nổi bật nhất và ảnh. Tin được tải khi bạn mở ứng dụng, hoặc khi iPhone làm mới nền.", "One notification a day with the top story and its picture. The story is fetched when you open the app, or when iPhone refreshes it in the background."))
      }
    }
    .listRowBackground(Palette.card)
  }

  private var linksSection: some View {
    Section {
      linkRow(t("Giới thiệu aidr.today", "About aidr.today"), "https://aidr.today/about?lang=\(shown.rawValue)")
      linkRow(t("Quyền riêng tư", "Privacy"), "https://aidr.today/privacy?lang=\(shown.rawValue)")
      linkRow(t("Đóng góp một tin", "Suggest a story"), "https://aidr.today/submit?lang=\(shown.rawValue)")
      linkRow("Telegram", shown == .vi ? "https://t.me/aihomnay" : "https://t.me/aidr_today")
    } header: {
      header(t("Về AI;DR", "About"))
    }
    .listRowBackground(Palette.card)
  }

  private var aboutSection: some View {
    Section {
      LabeledContent(t("Phiên bản", "Version")) {
        Text(versionString)
          .font(.mono(eyebrow + 2))
          .foregroundStyle(Palette.mutedForeground)
      }
      .accessibilityIdentifier("settings-version")
    } footer: {
      HStack(spacing: Spacing.sm) {
        Text(";")
          .font(.inter(13, .bold))
          .foregroundStyle(Palette.signalInk)
          .frame(width: 20, height: 20)
          .background(Palette.signal, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
          .accessibilityHidden(true)
        Text("AI;DR · aidr.today")
          .font(.inter(13, .medium, relativeTo: .footnote))
          .foregroundStyle(Palette.mutedForeground)
      }
      .frame(maxWidth: .infinity)
      .padding(.top, Spacing.lg)
    }
    .listRowBackground(Palette.card)
  }

  // MARK: Pieces

  @ViewBuilder private var testStatus: some View {
    switch model.test {
    case .sent:
      Text(t("Đã gửi", "Sent")).font(.inter(14, relativeTo: .callout)).foregroundStyle(Palette.mutedForeground)
    case .failed:
      Text(t("Không gửi được", "Could not send")).font(.inter(14, relativeTo: .callout)).foregroundStyle(Palette.mutedForeground)
    case .sending:
      ProgressView()
    case .idle:
      EmptyView()
    }
  }

  private func linkRow(_ title: String, _ url: String) -> some View {
    Link(destination: URL(string: url)!) {
      HStack {
        Text(title)
        Spacer()
        Image(systemName: "arrow.up.right")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(Palette.mutedForeground)
          .accessibilityHidden(true)
      }
    }
    .foregroundStyle(Palette.foreground)
  }

  private func header(_ text: String) -> some View {
    Text(text.uppercased(with: shown.locale))
      .font(.mono(eyebrow, weight: .medium))
      .tracking(1.1)
      .foregroundStyle(Palette.mutedForeground)
      .textCase(nil)
  }

  private func footnote(_ text: String) -> some View {
    Text(text)
      .font(.inter(13, relativeTo: .footnote))
      .foregroundStyle(Palette.mutedForeground)
  }

  // MARK: State

  /// Flips only once the system has allowed notifications, so the first tap
  /// is what raises the permission alert and nothing else does.
  private var notifyBinding: Binding<Bool> {
    Binding(
      get: { notifyEnabled },
      set: { on in Task { await setNotify(on) } })
  }

  private func setNotify(_ on: Bool) async {
    guard on else {
      notifyEnabled = false
      model.cancel()
      return
    }
    if await model.requestPermission() {
      notifyEnabled = true
      await model.reschedule(lang: shown)
    } else {
      notifyEnabled = false
    }
  }

  /// A reader who turned notifications off in iPhone Settings sees the switch off.
  private func syncAuthorization() async {
    await model.refreshAuthorization()
    if notifyEnabled, model.authorization == .denied {
      notifyEnabled = false
      model.cancel()
    }
  }

  private var timeBinding: Binding<Date> {
    Binding(
      get: {
        Calendar.current.date(bySettingHour: notifyMinutes / 60, minute: notifyMinutes % 60, second: 0, of: Date()) ?? Date()
      },
      set: { date in
        let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
        notifyMinutes = NotifyPrefs.clamp((parts.hour ?? 0) * 60 + (parts.minute ?? 0))
      })
  }

  private func title(of choice: TextSizeChoice) -> String {
    switch choice {
    case .system: t("Theo máy", "System")
    case .small: t("Nhỏ", "Small")
    case .medium: t("Vừa", "Medium")
    case .large: t("Lớn", "Large")
    case .extraLarge: t("Rất lớn", "Extra large")
    }
  }

  private var versionString: String {
    let info = Bundle.main.infoDictionary
    let version = info?["CFBundleShortVersionString"] as? String ?? "0"
    let build = info?["CFBundleVersion"] as? String ?? "0"
    return "\(version) (\(build))"
  }

  private func t(_ vi: String, _ en: String) -> String { shown == .vi ? vi : en }

  private static let page = Color(light: "#f5f5f3", dark: "#1f1e1d")
}
