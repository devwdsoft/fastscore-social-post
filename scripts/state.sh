#!/usr/bin/env bash
# Keeps data/ (state.json + drafts waiting for review) on the "autopost-state" branch
# so it survives between GitHub Actions runs.
#   scripts/state.sh pull   → clone the branch into data/ (or start an empty one)
#   scripts/state.sh push   → commit and push data/ back
set -euo pipefail

BRANCH=autopost-state
URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

case "${1:-}" in
  pull)
    rm -rf data
    if git ls-remote --exit-code --heads "$URL" "$BRANCH" >/dev/null 2>&1; then
      git clone --quiet --depth 1 --branch "$BRANCH" "$URL" data
    else
      mkdir -p data
      git -C data init --quiet -b "$BRANCH"
      git -C data remote add origin "$URL"
    fi
    ;;
  push)
    cd data
    printf 'out/\n' > .gitignore
    git config user.name "fastscore-bot"
    git config user.email "fastscore-bot@users.noreply.github.com"
    git add -A
    if git diff --cached --quiet; then
      echo "state unchanged"
    else
      git commit --quiet -m "state: $(date -u +%Y-%m-%dT%H:%MZ)"
      git push --quiet origin "$BRANCH"
    fi
    ;;
  *)
    echo "usage: $0 pull|push" >&2
    exit 1
    ;;
esac
