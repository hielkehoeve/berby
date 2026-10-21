#!/usr/bin/env bash
# Claude Code PostToolUse hook (Write|Edit): formats the edited file with Prettier, then typechecks
# the project when a TypeScript file changed. Exit code 2 sends the type errors back to Claude.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$root" || exit 0

file="$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')"
[[ -z "$file" ]] && exit 0
# Only files inside the project, and never generated output.
case "$file" in
  "$root"/*) ;;
  *) exit 0 ;;
esac
case "$file" in
  */node_modules/*|*/dist/*|*/dev-dist/*) exit 0 ;;
esac

case "$file" in
  *.ts|*.js|*.cjs|*.mjs|*.css|*.html|*.json|*.yml|*.yaml)
    npx prettier --log-level warn --write "$file" >/dev/null 2>&1 || true
    ;;
esac

case "$file" in
  *.ts)
    if ! out="$(npx tsc --noEmit 2>&1)"; then
      echo "tsc --noEmit reports errors after editing ${file#"$root"/}:" >&2
      printf '%s\n' "$out" | head -40 >&2
      exit 2
    fi
    ;;
esac
exit 0
