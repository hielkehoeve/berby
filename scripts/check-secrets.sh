#!/usr/bin/env bash
# Scans STAGED files for secrets and personal data so they never land in a commit.
#
# Two entry points:
#   scripts/check-secrets.sh          git pre-commit mode: prints findings, exits 1 on a hit.
#   scripts/check-secrets.sh --hook   Claude Code PreToolUse hook: reads the tool call from stdin,
#                                     ignores anything that is not a `git commit`, and answers
#                                     with a JSON "deny" decision on a hit.
#
# Compatible with the bash 3.2 that ships with macOS.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

mode="${1:-}"
if [[ "$mode" == "--hook" ]]; then
  input="$(cat)"
  case "$input" in
    *"git commit"*) ;;
    *) exit 0 ;;
  esac
fi

# label|extended-regex. The label must not contain '|'.
checks=(
  'private key|-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'GitHub token|gh[pousr]_[A-Za-z0-9]{36,}'
  'GitHub token|github_pat_[A-Za-z0-9_]{20,}'
  'AWS access key|AKIA[0-9A-Z]{16}'
  'Anthropic API key|sk-ant-[A-Za-z0-9_-]{20,}'
  'API key|sk-[A-Za-z0-9]{32,}'
  'Slack token|xox[baprs]-[A-Za-z0-9-]{10,}'
  'Google API key|AIza[0-9A-Za-z_-]{35}'
  'hardcoded credential|(api[_-]?key|secret|token|passw(or)?d)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{8,}'
  'email address|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
  'home directory path|/(Users|home)/[A-Za-z0-9._-]+/'
)
# Lines matching this are fine (documentation placeholders, bot addresses).
allow='(@example\.(com|org|net)|noreply@|@users\.noreply\.github\.com)'

findings=()
while IFS= read -r -d '' file; do
  # The scanner's own patterns would trip the scanner; lockfiles carry third-party metadata.
  case "$file" in
    scripts/check-secrets.sh|package-lock.json|pnpm-lock.yaml|yarn.lock) continue ;;
  esac
  content="$(git show ":$file" 2>/dev/null || true)"
  [[ -z "$content" ]] && continue
  for check in "${checks[@]}"; do
    label="${check%%|*}"
    regex="${check#*|}"
    while IFS= read -r hit; do
      [[ -z "$hit" ]] && continue
      findings+=("$file:${hit%%:*} ($label)")
    done < <(printf '%s\n' "$content" | grep -nIE -e "$regex" | grep -vE -e "$allow" || true)
  done
done < <(git diff --cached --name-only --diff-filter=ACM -z)

if (( ${#findings[@]} == 0 )); then
  exit 0
fi

summary="$(printf '%s; ' "${findings[@]}")"
if [[ "$mode" == "--hook" ]]; then
  reason="Commit blocked: staged files contain possible secrets or personal data. Remove or unstage: ${summary}"
  jq -cn --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
fi

echo "check-secrets: commit blocked, staged files contain possible secrets or personal data:" >&2
printf '  %s\n' "${findings[@]}" >&2
echo "Remove the data (or unstage the file) and commit again." >&2
exit 1
