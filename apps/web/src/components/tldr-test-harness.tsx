import { type ReactNode, useState } from "react";
import { LangContext } from "../lib/lang-context";
import {
  DEFAULT_PREFS,
  type Prefs,
  PrefsContext,
  usePrefs,
} from "../lib/prefs";
import type { Lang, TldrBullet } from "../lib/types";
import { TldrSection } from "./TldrSection";

/** A prefs provider that keeps what setPrefs writes, so a test can click a
 * control and see the pref and the page change (the default context drops
 * every write). */
export function PrefsHarness({
  lang = "en",
  initial,
  children,
}: {
  lang?: Lang;
  initial?: Partial<Prefs>;
  children: ReactNode;
}) {
  const [prefs, setPrefsState] = useState<Prefs>({
    ...DEFAULT_PREFS,
    ...initial,
  });
  return (
    <LangContext.Provider value={lang}>
      <PrefsContext.Provider
        value={{
          prefs,
          setPrefs: (update) => setPrefsState((p) => ({ ...p, ...update })),
        }}
      >
        {children}
        <output data-testid="prefs">
          {JSON.stringify({
            tldrView: prefs.tldrView,
            tldrCount: prefs.tldrCount,
          })}
        </output>
      </PrefsContext.Provider>
    </LangContext.Provider>
  );
}

export function makeBullets(
  count: number,
  label = "Bullet",
  idPrefix = "item"
): TldrBullet[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `${label} ${i + 1}`,
    item_ids: [`${idPrefix}${i}`],
    image_url: null,
  }));
}

/** TldrSection fed the count pref the way the routes feed it. */
export function ConnectedTldrSection(
  props: Omit<Parameters<typeof TldrSection>[0], "defaultCount">
) {
  const { prefs } = usePrefs();
  return <TldrSection defaultCount={prefs.tldrCount} {...props} />;
}
