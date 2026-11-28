import AIDRKit
import SwiftUI

/// Customize and Settings in one sheet: the look of the reader (live behind the
/// sheet), language, the daily notification, links and the version. It owns its
/// NavigationStack and its Done button. RootView presents it; read the reader's
/// language from the store, not from `lang`, which only seeds the first frame.
struct SettingsScreen: View {
  let lang: Lang

  @Environment(ReaderPrefsStore.self) private var prefsStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var model = SettingsModel()
  @AppStorage(SettingsKey.notifyEnabled) private var notifyEnabled = false
  @AppStorage(SettingsKey.notifyMinutes) private var notifyMinutes = NotifyPrefs.defaultMinutes

  private var shown: Lang { prefsStore.prefs.language.resolve() }

  var body: some View {
    @Bindable var store = prefsStore
    NavigationStack {
      Form {
        CustomizeSections(store: store, lang: shown)
        languageSection
        notificationSection
        linksSection
        resetSection
        aboutSection
      }
      .font(.inter(16, relativeTo: .body))
      .foregroundStyle(Palette.foreground)
      .scrollContentBackground(.hidden)
      .background(Palette.background)
      .navigationTitle(shown.pick("Cài đặt", "Settings"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(shown.pick("Xong", "Done")) { dismiss() }
            .accessibilityIdentifier("settings-done")
        }
      }
    }
    .tint(Palette.foreground)
    .environment(\.locale, shown.locale)
    .task { await syncAuthorization() }
    .onChange(of: prefsStore.prefs.language) {
      // The pending notification is in the old language.
      Task { await model.reschedule(lang: shown) }
    }
    .onChange(of: notifyMinutes) {
      Task { await model.reschedule(lang: shown) }
    }
  }

  // MARK: Sections

  private var languageSection: some View {
    @Bindable var store = prefsStore
    return Section {
      Picker(selection: $store.prefs.language) {
        Text(t("Theo máy", "System")).tag(ReaderLanguage.system)
        Text("Tiếng Việt").tag(ReaderLanguage.vi)
        Text("English").tag(ReaderLanguage.en)
      } label: {
        Text(t("Ngôn ngữ", "Language"))
      }
      .pickerStyle(.inline)
      .labelsHidden()
      .accessibilityIdentifier("settings-language")
    } header: {
      SettingsHeader(text: t("Ngôn ngữ", "Language"), lang: shown)
    } footer: {
      SettingsFootnote(text: t("Tin tiếng Việt và tiếng Anh là hai bản riêng, không dùng thay nhau.", "Vietnamese and English are separate editions. One never stands in for the other."))
    }
    .listRowBackground(Palette.muted)
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

      LabeledContent(t("Bản tin đã lưu", "Saved edition")) {
        savedEditionAge
      }
      .accessibilityIdentifier("settings-edition-age")

      if model.authorization == .denied {
        Button(t("Mở Cài đặt của iPhone", "Open iPhone Settings")) {
          if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
        }
        .accessibilityIdentifier("settings-open-system")
      }
    } header: {
      SettingsHeader(text: t("Thông báo", "Notifications"), lang: shown)
    } footer: {
      if model.authorization == .denied {
        SettingsFootnote(text: t("Thông báo đang tắt cho AI;DR trong Cài đặt của iPhone.", "Notifications are off for AI;DR in iPhone Settings."))
      } else {
        SettingsFootnote(text: t("Mỗi ngày một thông báo với tin nổi bật nhất và ảnh. Tin được tải khi bạn mở ứng dụng, hoặc khi iPhone làm mới nền.", "One notification a day with the top story and its picture. The story is fetched when you open the app, or when iPhone refreshes it in the background."))
      }
    }
    .listRowBackground(Palette.muted)
  }

  private var linksSection: some View {
    Section {
      linkRow(t("Giới thiệu aidr.today", "About aidr.today"), "https://aidr.today/about?lang=\(shown.rawValue)")
      linkRow(t("Quyền riêng tư", "Privacy"), "https://aidr.today/privacy?lang=\(shown.rawValue)")
      linkRow(t("Đóng góp một tin", "Suggest a story"), "https://aidr.today/submit?lang=\(shown.rawValue)")
      linkRow("Telegram", shown == .vi ? "https://t.me/aihomnay" : "https://t.me/aidr_today")
    } header: {
      SettingsHeader(text: t("Về AI;DR", "About"), lang: shown)
    }
    .listRowBackground(Palette.muted)
  }

  private var resetSection: some View {
    Section {
      Button(t("Khôi phục mặc định", "Reset to defaults")) { prefsStore.reset() }
        .accessibilityIdentifier("settings-reset")
    } footer: {
      SettingsFootnote(text: t("Đưa giao diện, chữ, màu và bố cục về như ban đầu.", "Puts the look, text, colors and layout back as they were."))
    }
    .listRowBackground(Palette.muted)
  }

  private var aboutSection: some View {
    Section {
      LabeledContent(t("Phiên bản", "Version")) {
        Text(versionString)
          .font(.mono(13))
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
    .listRowBackground(Palette.muted)
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

  /// How old the edition a notification would carry is, counted afresh every minute.
  private var savedEditionAge: some View {
    TimelineView(.everyMinute) { context in
      Group {
        if let updated = model.editionUpdated {
          Text(editionAge(updated, now: context.date))
        } else {
          Text(t("Chưa có", "None yet"))
        }
      }
      .font(.inter(14, relativeTo: .callout))
      .foregroundStyle(Palette.mutedForeground)
    }
  }

  private func editionAge(_ updated: Date, now: Date) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.locale = shown.locale
    formatter.unitsStyle = .short
    return t("Cập nhật ", "Updated ") + formatter.localizedString(for: updated, relativeTo: now)
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

  private var versionString: String {
    let info = Bundle.main.infoDictionary
    let version = info?["CFBundleShortVersionString"] as? String ?? "0"
    let build = info?["CFBundleVersion"] as? String ?? "0"
    return "\(version) (\(build))"
  }

  private func t(_ vi: String, _ en: String) -> String { shown.pick(vi, en) }
}
