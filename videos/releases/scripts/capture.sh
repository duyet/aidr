#!/usr/bin/env bash
# Capture the live aidr.today pages a release film shows.
#
# Usage: scripts/capture.sh <out-dir> <name>=<path>[@<scrollY>][#<text to click>] ...
#
#   home="/?lang=en"                       the page at the top
#   rows="/?lang=en@700"                   scrolled 700 CSS px
#   why="/90b333df?lang=en#Why this ranks" after clicking the element with that text
#   card="/api/og/date/2026-10-08.png"     /api/ paths are downloaded as-is
#
# Pages render at 1360x850 CSS px and 2x, so each still is 2720x1700.
# Output holds third-party story photos, so it goes to the ignored capture/ folder.
# Needs agent-browser and curl. CAPTURE_WAIT_MS sets the settle time (default 6000; shorter can miss web fonts).
set -euo pipefail
out="$1"; shift
mkdir -p "$out"
export AGENT_BROWSER_SESSION="${AGENT_BROWSER_SESSION:-aidr-release-capture}"
agent-browser set viewport 1360 850 2 >/dev/null
for spec in "$@"; do
  name="${spec%%=*}"; rest="${spec#*=}"
  click=""; scroll=0
  if [[ "$rest" == *"#"* ]]; then click="${rest#*#}"; rest="${rest%%#*}"; fi
  if [[ "$rest" == *@* ]]; then scroll="${rest##*@}"; rest="${rest%@*}"; fi
  path="$rest"
  if [[ "$path" == /api/* ]]; then
    curl -fsS -o "$out/${name}.png" "https://aidr.today${path}"
    echo "fetched  $name  ${path}"
    continue
  fi
  agent-browser open "https://aidr.today${path}" >/dev/null
  agent-browser wait "${CAPTURE_WAIT_MS:-6000}" >/dev/null
  if [[ -n "$click" ]]; then
    agent-browser find text "$click" click >/dev/null
    agent-browser wait 1200 >/dev/null
  fi
  agent-browser eval "window.scrollTo(0, ${scroll})" >/dev/null
  agent-browser wait 900 >/dev/null
  agent-browser screenshot "$out/${name}.png" >/dev/null
  echo "captured $name  ${path}  y=${scroll}${click:+  clicked \"$click\"}"
done
