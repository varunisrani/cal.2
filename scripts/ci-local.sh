#!/usr/bin/env bash
# Runs the CI steps of .github/workflows/ci.yml locally, in the same order, from the repository
# root: bash scripts/ci-local.sh
#
# Needs PLATEWISE_REF: a checkout of the clean-room reference at the pinned commit (see AGENTS.md).
# Exit codes: 0 every step passed, 2 the reference is missing or at the wrong commit, otherwise
# the code of the step that failed.
set -euo pipefail

readonly REF_COMMIT=10e14b67116c52b515d2389621266e32b3a99840

fail_setup() {
  echo "ci-local: $*" >&2
  exit 2
}

if [[ -z "${PLATEWISE_REF:-}" ]]; then
  fail_setup "PLATEWISE_REF is not set; point it at the reference checkout (commit ${REF_COMMIT})"
fi
if [[ ! -d "${PLATEWISE_REF}" ]]; then
  fail_setup "PLATEWISE_REF=${PLATEWISE_REF} is not a directory"
fi
if ! ref_head="$(git -C "${PLATEWISE_REF}" rev-parse --verify --quiet HEAD 2>/dev/null)"; then
  fail_setup "PLATEWISE_REF=${PLATEWISE_REF} is not a git checkout"
fi
if [[ "${ref_head}" != "${REF_COMMIT}" ]]; then
  fail_setup "reference HEAD is ${ref_head}, expected ${REF_COMMIT}"
fi
# Absolute, so it still points at the reference after the cd below.
PLATEWISE_REF="$(cd "${PLATEWISE_REF}" && pwd)"
export PLATEWISE_REF

cd "$(dirname "${BASH_SOURCE[0]}")/.."

step() {
  echo
  echo "==> $*"
  "$@"
}

step pnpm install --frozen-lockfile
step pnpm lint
step pnpm fmt:check
step pnpm typecheck
step pnpm test
step pnpm check --require-ref
step pnpm build
step pnpm check:bundle
# CI adds --with-deps (system packages through apt, as root); that is machine setup, not this run.
step pnpm exec playwright install chromium
step pnpm e2e

echo
echo "ci-local: every step passed"
