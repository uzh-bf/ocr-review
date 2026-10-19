# Shared OpenCodeReview host for uzh-bf repositories

## Approval summary

**Why and what changes?** The OpenCodeReview (OCR) workflow in klicker-uzh now gives useful draft reviews, a `/final-review` exact-head gate, a bounded review advisor and Context7 documentation lookup. It lives as about 11k lines of scripts plus 14k lines of tests inside klicker-uzh. Copying that into every repository would create drift on each fix. We extract it once into a new public host repository, `uzh-bf/ocr-review`, that exposes two reusable workflows (draft review and single-PR final review). Each consuming repository keeps a short caller workflow and one config file. klicker-uzh-catalyst is the first consumer and the place where the config surface is shaped. gbl-uzh and thesis-platform follow.

**What stays unchanged?** klicker-uzh keeps its current in-repo workflows until the host is proven; its migration is a later package. Pinned OCR CLI 1.13.0, the pinned publisher commit, the trust model (no PR-head code execution, policy from a trusted commit), result validation, cost summaries and diagnostics stay as they are. Stack review (`/final-review-stack`) is not offered to other repositories yet.

**What could change the decision?** Four choices, decided by the user on 2026-10-19:
1. Host location: new public `uzh-bf/ocr-review`. Public repos can only call public reusable workflows, and the code is already public in klicker-uzh.
2. Secrets: `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` and `CONTEXT7_API_KEY` exist only in klicker-uzh. An org admin sets them as org-level secrets restricted to the opted-in repositories, from Infisical.
3. Draft trigger: draft review runs on draft PRs only, in every repository. gbl-uzh and thesis-platform contributors open PRs as drafts to get early reviews; their adoption PRs say so.
4. Required checks: `final-ai-review` stays non-required in new repos until it has run cleanly on a few PRs. Making it required is a later branch-protection change.

Two open klicker-uzh OCR PRs (#6531 compression, #6598 Context7 qualification) touch the extracted scripts; whichever merges first is ported into the host.

**How will we know it is done?** Host CI runs the existing script test suites green. A catalyst draft PR receives a sticky OCR draft summary, and `/final-review` on a ready catalyst PR posts an exact-head `final-ai-review` status. gbl-uzh and thesis-platform each have a draft caller PR open with the same evidence.

**What does approval authorize?** Creating the public `uzh-bf/ocr-review` repository and pushing its initial `main`; worktrees, commits, task-branch pushes and draft PRs in the host, catalyst, gbl-uzh and thesis-platform; live runs on catalyst PRs. Withheld: setting secrets (user or org admin), branch-protection changes, marking PRs ready, merging, and any klicker-uzh workflow change.

## Execution details

### Evidence and binding contracts

- Source of truth: klicker-uzh `origin/v3` at the commit recorded in slice 1. Files: `.github/workflows/check-ocr-review.yml`, `.github/workflows/check-ocr-final-review.yml`, `.github/scripts/{ocr-draft-review.cjs,ocr-mistral-adapter.cjs,ocr-review-tools.cjs,final-ai-review.js,final-ai-review-shared.js,final-ai-review-fixtures.js}` with tests, `.github/open-code-review/final-review-rules.json`, `.github/open-code-review/qualification/**`, `.agents/skills/ocr-reviewer/SKILL.md` (already repository-neutral).
- Reusable-workflow identity: inside a called workflow, `job.workflow_repository` and `job.workflow_sha` name the host commit. Scripts are checked out from that commit; consumer policy (config, rules, docs, skills) is checked out sparsely from the consumer's default branch. Callers pin the host by full SHA.
- Access: a public caller can only use a public reusable workflow; a private caller can use either.
- klicker-specific couplings to parametrize:
  - rules include/exclude paths (`playwright/**`, `cypress/**`, `apps/docs/**`) → consumer rules file;
  - trusted context roots (`docs`, `.agents/skills`, `.opencodereview`) → `context_roots` (catalyst has `AGENTS.md`, `CONTEXT.md`, `docs/adr`, `docs/project`, no `.agents`);
  - plan-context glob `project/**/*-plan.md` (`final-ai-review.js`) → `plan_globs`;
  - integration-branch suffix rule (`v3-*`) in `final-ai-review-shared.js` → optional `integration_branch_pattern`, off by default;
  - Context7 public library list in `ocr-draft-review.cjs` → `docs_libraries`;
  - names `klicker_review`, `klicker-review`, `KLICKER_FINAL_REVIEW_TOOL_CANARY` → neutral names;
  - workflow-path checks (`FINAL_REVIEW_WORKFLOW_PATH`) used for status and clean-evidence verification → caller workflow path plus host identity.
- Consumer config: `.github/open-code-review/config.json` validated by the host at load; unknown keys fail closed.

### Ownership and sequence

Execution mode: solo (main session owns all slices; final simplification and review at the end).

1. **Host bootstrap.** Create `uzh-bf/ocr-review` (public, default `main`). Copy scripts, tests, qualification fixtures and the reviewer skill from the recorded klicker-uzh SHA. Add the config loader and replace the couplings above with config reads that default to current klicker behavior. Add a host CI workflow running `node --test` over all suites. Acceptance: host CI green; a diff of each script against the source SHA shows only parametrization and renames.
2. **Draft reusable workflow.** `.github/workflows/draft-review.yml` (`workflow_call`, explicit `secrets:`), ported from `check-ocr-review.yml`, plus a caller template in the host README. Acceptance: workflow lint (`actionlint`) and a test that the caller template's inputs match the workflow's declared inputs.
3. **Catalyst draft review live.** In a catalyst worktree from `origin/main`: caller workflow, `config.json`, rules file with catalyst paths. Requires the secrets. Acceptance: one catalyst draft PR shows the sticky OCR summary and the cost summary step on the PR's head SHA.
4. **Final review reusable workflow.** `.github/workflows/final-review.yml` ported from the single-PR jobs of `check-ocr-final-review.yml` (`trusted_policy` through `finalize`, no stack jobs). Adapt trusted-commit and workflow-path verification to the caller/host pair. Acceptance: host tests for the adapted verification pass; on catalyst, `/final-review` produces an exact-head `final-ai-review` status and, when clean, the clean-evidence check.
5. **Roll out to gbl-uzh and thesis-platform.** One draft caller PR per repo with config and rules (gbl-uzh targets `dev`; the PR body asks contributors to open drafts). Acceptance: one live review per repo after secrets exist there.

**Catalyst validation gate.** klicker-uzh does not migrate until catalyst passes every check below on live pull requests:

- Draft review: two or more draft PRs touching source get a sticky summary for the exact head, with complete coverage. Advisor and Context7 counters show at least one completed call, and the cost summary renders.
- Context: the reviewer reads catalyst's own `AGENTS.md`, `docs/adr` or `docs/project` through `read_review_context`.
- Final review: `/final-review` on a ready PR posts a consolidated comment and an exact-head `final-ai-review` status. A clean run creates the clean-evidence check.
- Trust: a new push resets the status to pending. A `/final-review` comment from a user without write access is ignored. Run logs show the caller path from `GITHUB_WORKFLOW_REF` and the scripts checked out from the pinned host commit.
- Incremental: a fix pushed after a reviewed head gets an incremental review, and a `config.json` change on `main` forces a full review.
- Findings quality: the user judges the findings on these PRs as comparable to klicker-uzh's.

Later packages (not authorized here): klicker-uzh migration to the host, after the catalyst validation gate passes with stack review as an opt-in; further private and public repositories; making `final-ai-review` a required check.

### Test portfolio

| Risk | Obligation | Seam |
| --- | --- | --- |
| Config parametrization changes klicker defaults | extend existing | existing script suites run with a klicker-equivalent config |
| Invalid consumer config runs a review with wrong scope | add new | config loader unit test: unknown key and bad glob fail closed |
| Scripts load from PR head or wrong commit in called workflow | add new | test for trusted-commit and workflow-path verification with caller/host identities |
| Caller template drifts from workflow inputs | add new | test comparing template `with:`/`secrets:` keys to `workflow_call` declarations |

### Verification

Host: `node --test .github/scripts/*.test.*` and `actionlint`. Consumers: live PR runs as named per slice; no application runtime is needed.

### Working context

- Plan branch: klicker-uzh `docs/ocr-review-shared-host` (worktree `trees/ocr-review-shared-host`). The host repo carries implementation; this plan moves into the host repo's `docs/project/` with its first commit.
- Catalyst primary checkout is on an unrelated branch; use `trees/<branch>` from `origin/main`.
- `gh` needs to run outside the command sandbox in this environment (TLS interception).

## Progress

- Execution mode: solo; final simplification and review were self-performed.
- Slices 1–2 done on host `main` (`23ad70d`, `d21dfd3`, `4563f8a`): verbatim import, consumer config, reusable draft review.
- Slice 4 done in [uzh-bf/ocr-review#1](https://github.com/uzh-bf/ocr-review/pull/1) (`6dcd396`, `72179a0`): reusable single-PR final review.
- Slices 3 and 5 open as draft caller PRs: [uzh-bf/klicker-uzh-catalyst#116](https://github.com/uzh-bf/klicker-uzh-catalyst/pull/116), [uzh-bf/gbl-uzh#223](https://github.com/uzh-bf/gbl-uzh/pull/223), [uzh-bf/thesis-platform#204](https://github.com/uzh-bf/thesis-platform/pull/204). Their final callers pin `6dcd396` and must be repinned to the merged host `main` commit.
- Evidence: local `pnpm test` 263 pass, 0 fail, 1 skipped. Hosted CI was queued behind an org-wide runner backlog. OCR 1.13.0 `--preview` with rules built for catalyst selected source files and excluded only tests and Markdown, and passed `validate-ocr-preview`. `plan-context` rendered a catalyst plan through the configured glob.
- Blocked on the user: org secrets for the three consumers, then merging host #1 and the consumer PRs. The first live runs must confirm that `GITHUB_WORKFLOW_REF` names the caller file inside the called job.
- Test delta: added config, context-root, caller-path, rules-merge, digest and caller-template tests; adapted workflow-shape tests; removed stack-job shape tests.
