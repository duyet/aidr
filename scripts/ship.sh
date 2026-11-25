#!/usr/bin/env bash
# Land work on master in one push. Master pushes deploy through
# .github/workflows/deploy-web.yml, so shipping is: merge, check once, push.
#
#   pnpm ship                 check and push what master already has
#   pnpm ship <branch>...     merge lane branches first (no PR per branch)
#
# Checks run once, on the files the whole batch changed.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

[ "$(git branch --show-current)" = master ] || { echo "ship: run on master" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "ship: commit or drop tracked changes first" >&2; exit 1; }

git pull -q --rebase origin master
for branch in "$@"; do
  git merge -q --no-edit "$branch" || { git merge --abort; echo "ship: conflict merging $branch" >&2; exit 1; }
done

base=$(git merge-base origin/master HEAD)
changed=$(git diff --name-only --diff-filter=d "$base" HEAD)
[ -n "$changed" ] || { echo "ship: nothing to push"; exit 0; }

lintable=$(echo "$changed" | grep -E '\.(tsx?|jsx?|mjs|json|css)$' || true)
[ -z "$lintable" ] || echo "$lintable" | xargs pnpm exec biome check

web=$(echo "$changed" | grep -E '^apps/web/.*\.(tsx?|jsx?)$' | sed 's#^apps/web/##' || true)
if [ -n "$web" ] || echo "$changed" | grep -qE '^packages/'; then
  pnpm --filter @aidr/web check-types
  [ -z "$web" ] || (cd apps/web && echo "$web" | xargs pnpm exec vitest related --run)
fi
if echo "$changed" | grep -qE '^(apps/extension|packages/libs)/'; then
  pnpm --filter @aidr/extension test
fi

git push origin master
echo "ship: pushed $(git rev-parse --short HEAD); CI deploys it"
