#!/usr/bin/env bash
# Helper script to stage all tracked changes and create a git commit.
# Usage: ./scripts/git_commit.sh "commit message"

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"commit message\""
  exit 1
fi

COMMIT_MESSAGE=$1
SHIFT_COUNT=1

while [[ ${SHIFT_COUNT} -lt $# ]]; do
  shift
done

PROJECT_ROOT=$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1
  pwd
)

cd "${PROJECT_ROOT}"

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git command not found on PATH."
  exit 1
fi

if [[ ! -d .git ]]; then
  echo "Error: no .git directory found in ${PROJECT_ROOT}"
  exit 1
fi

echo "Staging tracked changes..."
git add --all

if git diff --cached --quiet; then
  echo "No staged changes detected. Commit aborted."
  exit 0
fi

echo "Creating commit with message: ${COMMIT_MESSAGE}"
git commit -m "${COMMIT_MESSAGE}"

echo "Commit created successfully. Push it with:"
echo "  git push"
