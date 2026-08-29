#!/usr/bin/env bash
# PostToolUse hook: typecheck the workspace containing the edited file.
set -uo pipefail
export PATH="$HOME/.npm-global/bin:$PATH"

file_path="$(cat | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')"
[ -z "$file_path" ] && exit 0

case "$file_path" in
  *.ts|*.tsx|*.vue) ;;
  *) exit 0 ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
rel_path="${file_path#"$repo_root"/}"

case "$rel_path" in
  apps/web/*) pkg="@lg/web" ;;
  apps/server/*) pkg="@lg/server" ;;
  packages/core/*) pkg="@lg/core" ;;
  packages/db/*) pkg="@lg/db" ;;
  packages/sources/*) pkg="@lg/sources" ;;
  *) exit 0 ;;
esac

cd "$repo_root" || exit 0
output="$(pnpm --filter="$pkg" typecheck 2>&1)"
status=$?

if [ $status -ne 0 ]; then
  echo "$output" >&2
  echo "Typecheck failed for $pkg after editing $rel_path" >&2
  exit 2
fi

exit 0
