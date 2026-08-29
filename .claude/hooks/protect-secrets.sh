#!/usr/bin/env bash
# PreToolUse hook: block Edit/Write on .env* files (except *.example) and pnpm-lock.yaml.
set -uo pipefail

input="$(cat)"
file_path="$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')"
[ -z "$file_path" ] && exit 0

base="$(basename "$file_path")"

case "$base" in
  *.example)
    exit 0
    ;;
  .env|.env.*)
    reason="Blocked: $base looks like a secrets file. Edit it manually if intended."
    ;;
  pnpm-lock.yaml)
    reason="Blocked: pnpm-lock.yaml should only change via 'pnpm install', not direct edits."
    ;;
  *)
    exit 0
    ;;
esac

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "$reason"
  }
}
EOF
exit 0
