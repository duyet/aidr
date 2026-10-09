#!/usr/bin/env bash
# Render cuts one at a time, in the order given, and keep STATUS.json current so someone can
# upload each cut as it lands. A cut goes queued → rendering → review; the reviewer then sets
# "passed" or "failed" (scripts/status.py <cut> <state> [review note]).
#
# Usage: scripts/queue.sh v0.1.12:en:16x9 v0.1.12:vi:16x9 v0.1.0:en:16x9 ...
set -euo pipefail
cd "$(dirname "$0")/.."
for spec in "$@"; do python3 scripts/status.py "${spec//:/-}" queued; done
for spec in "$@"; do
  IFS=: read -r v lang ratio <<< "$spec"
  cut="$v-$lang-$ratio"
  python3 scripts/status.py "$cut" rendering
  if scripts/render.sh "$v" "$lang:$ratio"; then python3 scripts/status.py "$cut" review; else python3 scripts/status.py "$cut" failed "render failed"; fi
done
