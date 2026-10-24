#!/usr/bin/env bash
# Install the sub2api 4K image skill and ask for credentials in one step.
#
#   curl -fsSL https://raw.githubusercontent.com/CaroLe-prw/sub2api-4k-image-generator-ts/main/install.sh | bash
#
# Flags:
#   --project            install into ./.agents/skills instead of the user-level skill dir
#   --agent NAME         agent to install for (default: codex)
#   --repo OWNER/REPO    source repository (default: CaroLe-prw/sub2api-4k-image-generator-ts)
#   --force              ask for credentials even when a config already exists
#   --no-setup           skip the credential prompt
#   -h, --help           show this help
#
# Environment (same effect as the flags, useful with `curl ... | bash`):
#   SUB2API_SKILL_SCOPE=global|project   SUB2API_SKILL_AGENT=codex
#   SUB2API_SKILL_REPO=owner/repo        SUB2API_FORCE_SETUP=1   SUB2API_RUN_SETUP=0
#
# Environment (skips the credential prompt, useful for CI):
#   SUB2API_BASE_URL, SUB2API_API_KEY
set -euo pipefail

REPO="${SUB2API_SKILL_REPO:-CaroLe-prw/sub2api-4k-image-generator-ts}"
SKILL="sub2api-4k-image-generator-ts"
AGENT="${SUB2API_SKILL_AGENT:-codex}"
SCOPE="${SUB2API_SKILL_SCOPE:-global}"
FORCE_SETUP="${SUB2API_FORCE_SETUP:-0}"
RUN_SETUP="${SUB2API_RUN_SETUP:-1}"

usage() {
  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
  echo
  echo "Passing flags through a pipe: bash -s -- --force   (plain 'bash -- --force' fails)"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --project) SCOPE="project" ;;
    --global) SCOPE="global" ;;
    --agent) AGENT="${2:?--agent requires a value}"; shift ;;
    --agent=*) AGENT="${1#*=}" ;;
    --repo) REPO="${2:?--repo requires a value}"; shift ;;
    --repo=*) REPO="${1#*=}" ;;
    --force) FORCE_SETUP=1 ;;
    --no-setup) RUN_SETUP=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

command -v node >/dev/null 2>&1 || { echo "node is required (Node.js 18+)." >&2; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || { echo "Node.js 18+ is required, found $(node -v)." >&2; exit 1; }

echo "Installing ${SKILL} from ${REPO} (${SCOPE})..."

add_args=(add "$REPO" --skill "$SKILL" -a "$AGENT" -y --copy)
[ "$SCOPE" = "global" ] && add_args+=(-g)
npx -y skills@latest "${add_args[@]}"

if [ "$SCOPE" = "global" ]; then
  SKILL_DIR="${SKILLS_HOME:-$HOME/.agents}/skills/$SKILL"
else
  SKILL_DIR="$PWD/.agents/skills/$SKILL"
fi

if [ ! -f "$SKILL_DIR/dist/openai_4k_image_generator.js" ]; then
  echo "Installed skill not found at $SKILL_DIR" >&2
  echo "Re-run with --project, or check the install output above." >&2
  exit 1
fi

[ "$RUN_SETUP" = "1" ] || { echo "Skipped credential setup (--no-setup)."; exit 0; }

CONFIG_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/sub2api-4k-image-generator/config.env"
if [ -f "$CONFIG_PATH" ] && [ "$FORCE_SETUP" != "1" ]; then
  echo
  echo "Credentials already saved at $CONFIG_PATH"
  echo "Re-run with --force to change them."
  exit 0
fi

echo
if [ -n "${SUB2API_BASE_URL:-}" ] && [ -n "${SUB2API_API_KEY:-}" ]; then
  node "$SKILL_DIR/dist/openai_4k_image_generator.js" --setup \
    --base-url "$SUB2API_BASE_URL" --api-key "$SUB2API_API_KEY"
else
  node "$SKILL_DIR/dist/openai_4k_image_generator.js" --setup
fi

echo
echo "Done. Generate an image with:"
echo "  node $SKILL_DIR/dist/openai_4k_image_generator.js \"your prompt\" --size 3840x2160 --output-dir output"
