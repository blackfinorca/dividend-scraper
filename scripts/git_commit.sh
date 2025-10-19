#!/usr/bin/env bash
# Helper script to stage all tracked changes and create a git commit.
# Usage: ./scripts/git_commit.sh "commit message"

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"commit message\""
  exit 1
fi

COMMIT_MESSAGE="$1"

PROJECT_ROOT=$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1
  pwd
)

cd "${PROJECT_ROOT}"

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is not installed."
  exit 1
fi

if [[ ! -d .git ]]; then
  echo "Error: .git directory not found in project root."
  exit 1
fi

echo "Staging tracked changes..."
git add --all

if git diff --cached --quiet; then
  echo "No staged changes to commit."
  exit 0
fi

echo "Creating commit..."
git commit -m "${COMMIT_MESSAGE}"

echo "Commit created. Push with: git push"
