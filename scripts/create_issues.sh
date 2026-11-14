#!/usr/bin/env bash
# Create labels and one GitHub issue per task in docs/issues/issues.json.
# Requires: GitHub CLI (`gh auth login`) and python3. Run from the repo root after the first push.
# Optional: map owners to GitHub usernames so issues are assigned, e.g.
#   export GH_USERS="victor=vic-gh dlizarraga=diegol-gh ddona=diegod-gh angel=angel-gh aaron=aaron-gh paul=paul-gh"
set -euo pipefail

for l in victor dlizarraga ddona angel aaron paul; do
  gh label create "owner:$l" --color 1f6feb --force >/dev/null
done
for b in B0 B1 B2 B3 B4 B5; do
  gh label create "block:$b" --color fbca04 --force >/dev/null
done

python3 - <<'PY' | while IFS=$'\t' read -r owner block title body; do
import json, os
users = dict(p.split("=", 1) for p in os.environ.get("GH_USERS", "").split() if "=" in p)
for it in json.load(open("docs/issues/issues.json", encoding="utf-8")):
    body = it["body"].replace("\n", "\\n")
    print("\t".join([it["owner"] + "|" + users.get(it["owner"], ""), it["block"], it["title"], body]))
PY
  login="${owner#*|}"; owner="${owner%%|*}"
  args=(--title "$title" --body "$(printf '%b' "$body")" --label "owner:$owner" --label "block:$block")
  [ -n "$login" ] && args+=(--assignee "$login")
  gh issue create "${args[@]}" >/dev/null && echo "✓ $title"
done
