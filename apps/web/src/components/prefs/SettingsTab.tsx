import { track } from "../../lib/analytics/track";
import { type TldrCount, usePrefs } from "../../lib/prefs";
import { PrefsRow, Segmented } from "./Segmented";

const TLDR_COUNTS: TldrCount[] = [8, 12, 16];

export function SettingsTab({ t }: { t: (en: string, vi: string) => string }) {
  const { prefs, setPrefs } = usePrefs();

  return (
    <div className="space-y-3">
      <PrefsRow id="prefs-tldr-count" label={t("AI;DR items", "Số mục AI;DR")}>
        <Segmented
          labelledBy="prefs-tldr-count"
          value={prefs.tldrCount}
          onChange={(n: TldrCount) => {
            track("prefs_change", { pref: "tldrCount", pref_value: `${n}` });
            setPrefs({ tldrCount: n });
          }}
          options={TLDR_COUNTS.map((n) => ({ value: n, label: n }))}
        />
      </PrefsRow>
    </div>
  );
}
