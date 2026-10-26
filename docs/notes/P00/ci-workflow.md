# Task: CI workflow (P00-01) · Phase: 00 · Owner: builder (wt-p00s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none (tooling). The phase row lists no reference counterpart. Read
`docs/plan/phases/P00-foundations.md` (P00-01 row), the existing `.github/workflows/ci.yml`,
`package.json` scripts, `tooling/checks/banned.ts` (which paths may name the reference) and the
lead's decisions in the task (D-16.54 adapted: the repository is Platewise only).

What it does (own words): every push and pull request runs the whole run-until-green loop on a
clean Ubuntu runner: install with the frozen lockfile, lint, format check, typecheck, unit tests,
the clean-room guards against the pinned reference, the production build, the bundle budget, then
the browser tests. The reference is fetched outside the workspace and the job stops unless its
HEAD is the pinned commit. When anything fails, the Playwright output (report and traces) is kept
as an artifact. `scripts/ci-local.sh` runs the same commands in the same order on a developer's
machine so a red CI run can be reproduced; it refuses to start unless `PLATEWISE_REF` points at a
checkout of the pinned reference commit.

Inputs → outputs:
- Workflow: a push or pull request → one `verify` job, green only when every step passes; on
  failure an artifact with `playwright-report/` and `test-results/`.
- `scripts/ci-local.sh`: `PLATEWISE_REF` (required) → each step announced and run in CI order;
  exit 0 when all pass, the failing step's code otherwise, 2 when the reference guard fails.

Files: changed `.github/workflows/ci.yml`; created `scripts/ci-local.sh`.

Edge cases / failure modes:
- `PLATEWISE_REF` unset, not a directory, not a git checkout, or at another commit: the local
  script stops before running anything, with a message saying which.
- A tag of a third-party action is moved upstream: actions are pinned by full commit SHA, so the
  run keeps using the reviewed code; the version stays readable in a trailing comment.
- Annotated tags: `git ls-remote` gives the tag object first; the pin must be the peeled
  `^{}` commit, not the tag object.
- A newer push to the same ref: `concurrency` cancels the superseded run.
- No Playwright HTML reporter is configured today (`reporter: list`), so `playwright-report/`
  may not exist: the upload must not fail on missing files.
- The script must not name the reference (it lives under `scripts/`, which the banned check
  scans); only the workflow, which is exempt, names the upstream repository.

Our design differences / decisions:
- Location: the existing `.github/workflows/ci.yml` (D-16.54 adapted by the lead: the package is
  the repository root), no path filter, no `working-directory`.
- Pins (looked up with `git ls-remote` on 2026-10-26; each release at least two weeks old):
  `actions/checkout` v7.0.1, `pnpm/action-setup` v6.1.0 (annotated tag, peeled commit),
  `actions/setup-node` v7.1.0, `actions/upload-artifact` v7.0.2. All run on the node24 action
  runtime; the inputs we use are unchanged from the v4 lines the file used before.
- Node pinned to 22.22.0 (this machine's version); pnpm stays 10.28.0.
- Checkout with `persist-credentials: false`: no later step needs the token in `.git/config`.
- The reference fetch step is kept as it was (shallow fetch of the pinned commit into
  `$RUNNER_TEMP/ref`, SHA guard, `PLATEWISE_REF` exported).
- Step order: install, lint, fmt:check, typecheck, test, check --require-ref, build,
  check:bundle, playwright install, e2e (the lead's order; the guards run before the build).
- Locally the browser step is `playwright install chromium` without `--with-deps`: system
  packages need root and apt, which belong to the machine setup, not to a reproduction run.

Tests we will write:
- `bash -n scripts/ci-local.sh` (syntax).
- The guard: run the script with `PLATEWISE_REF` unset, pointing at a missing path, at a
  non-git temp dir, and at a throwaway git repo on another commit; each must exit non-zero
  before any pnpm step.
- `grep` that every `uses:` line carries a 40-hex SHA and a version comment.
- The full `bash scripts/ci-local.sh` run is for the lead (it runs the full suites, which
  builders must not run).

Compare checklist (filled after the rewrite; no reference files reopened: tooling, no counterpart):
- [x] Every `uses:` pinned to a 40-hex SHA with a `# vX.Y.Z` comment (grep over
      `.github/workflows/ci.yml`: no line without one; SHAs from `git ls-remote`, the annotated
      `pnpm/action-setup` tag peeled)
- [x] Steps in the decided order, in both the workflow and the script (the `run: pnpm` lines and
      the `step` lines listed side by side: install, lint, fmt:check, typecheck, test,
      check --require-ref, build, check:bundle, playwright install, e2e)
- [x] Guard fails, exit 2 before any pnpm step, for `PLATEWISE_REF` unset, a missing path, a
      non-git temp dir and a throwaway git repo on another commit (manual runs; messages in the
      final report). The real reference HEAD is `10e14b67116c52b515d2389621266e32b3a99840`.
- [x] `bash -n scripts/ci-local.sh` clean
- [x] Report upload only `if: failure()`, `if-no-files-found: ignore`
- [ ] Full `bash scripts/ci-local.sh` exits 0, and exits non-zero at the test step with a broken
      test: for the lead (it runs the full suites, which builders must not run)
- Deliberate differences: n/a (no reference behaviour).
- Not taken: a path filter and `working-directory` (the package is the repository root).

## Decisions for the lead

- Action majors moved to the newest releases (checkout v7.0.1, pnpm/action-setup v6.1.0,
  setup-node v7.1.0, upload-artifact v7.0.2; all ≥ 19 days old) because they run on the node24
  action runtime; the inputs we pass exist unchanged in each `action.yml`. If you prefer the v4
  lines, pin their newest v4 tags instead.
- `persist-credentials: false` on checkout (nothing later needs the token).
- `playwright.config.ts` uses only the `list` reporter, so CI produces no `playwright-report/`
  today; the upload keeps `test-results/` (traces on failure). For an HTML report, S5 (owner of
  the config) can add `['html', { open: 'never' }]`.
- Locally the browser step drops `--with-deps` (apt and root are machine setup).
- The P00-01 row and "Files to create" in the phase file still describe `ci/platewise.yml`, the
  path filter and `working-directory`; they need the D-16.54 adaptation written back.
- The reference-fetch step is unchanged and still runs before install, as before.

## Status

Done (2026-10-26) apart from the full local run, which is the lead's. Changed
`.github/workflows/ci.yml`; created `scripts/ci-local.sh` (executable). No other files.
