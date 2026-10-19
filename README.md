# OCR review

Reusable GitHub Actions workflows that run [OpenCodeReview](https://github.com/alibaba/open-code-review) (OCR) on pull requests in uzh-bf repositories. They were extracted from [klicker-uzh](https://github.com/uzh-bf/klicker-uzh).

- **Draft review** runs on every push to a draft pull request. It posts a sticky summary and inline findings. The reviewer can read the repository's trusted documentation, ask a bounded advisor model and look up public library docs through Context7.
- **Final review** runs when someone with write access comments `/final-review` on a pull request. It reviews the exact head commit for merge-blocking defects, publishes one consolidated comment, and sets a `final-ai-review` commit status. Every new push resets the status to pending, so a clean status always refers to the current head.

## Trust model

The workflows run on `pull_request_target`, so they hold secrets. They never check out or execute pull-request code. They read the diff from Git objects, load scripts from the exact host commit the caller pins, and read configuration and documentation from the consuming repository's default branch.

## Adopt in a repository

1. Ask an org admin to grant the repository access to the org secrets `OPENROUTER_API_KEY` (required), `MISTRAL_API_KEY` (advisor, optional) and `CONTEXT7_API_KEY` (library docs, optional).
2. Add the caller workflow below as `.github/workflows/ocr-draft-review.yml`. Pin `uses:` to a full commit SHA of this repository.
3. Optionally add `.github/open-code-review/config.json` (see below). Without it, the reviewer reads `docs/` and `.agents/skills/` and skips library docs.
4. Merge both files to the default branch. The workflow only runs from there.

Open a pull request as a draft to get draft reviews.

```yaml
name: OCR draft review

on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review, converted_to_draft]

permissions:
  contents: read
  pull-requests: write

jobs:
  draft:
    uses: uzh-bf/ocr-review/.github/workflows/draft-review.yml@<full-commit-sha>
    secrets:
      OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      MISTRAL_API_KEY: ${{ secrets.MISTRAL_API_KEY }}
      CONTEXT7_API_KEY: ${{ secrets.CONTEXT7_API_KEY }}
```

For the final review, also add `.github/workflows/ocr-final-review.yml`. It needs only `MISTRAL_API_KEY`. The `final-ai-review` status is advisory unless branch protection makes it required.

```yaml
name: OCR final review

on:
  pull_request_target:
    types: [opened, synchronize, reopened, closed, ready_for_review, converted_to_draft]
  issue_comment:
    types: [created]

# Newer events for the same pull request replace obsolete runs. Other
# comments get a unique group so they never cancel a running review.
concurrency:
  group: >-
    final-ai-review-${{ (github.event_name == 'pull_request_target' &&
    format('pr-{0}', github.event.pull_request.number)) ||
    (github.event_name == 'issue_comment' &&
    github.event.comment.body == '/final-review' &&
    format('cmd-{0}', github.event.issue.number)) || github.run_id }}
  cancel-in-progress: true

permissions:
  actions: read
  checks: write
  contents: read
  issues: read
  pull-requests: write
  statuses: write

jobs:
  final:
    uses: uzh-bf/ocr-review/.github/workflows/final-review.yml@<full-commit-sha>
    secrets:
      MISTRAL_API_KEY: ${{ secrets.MISTRAL_API_KEY }}
```

The final review's trusted policy is the caller workflow plus `config.json` at the default-branch commit, together with the pinned host commit. Changing any of them invalidates earlier clean reviews.

## Configuration

`.github/open-code-review/config.json` is read from the default branch. Unknown keys or unsafe paths stop the review.

```json
{
  "schema": "ocr-review-config/v1",
  "context_roots": ["AGENTS.md", "CONTEXT.md", "docs"],
  "docs_libraries": ["/vercel/next.js", "/microsoft/typescript"],
  "plan_globs": ["docs/project/**/*-plan.md"],
  "include": [],
  "exclude": ["**/*.test.*", "docs/**"]
}
```

| Key | Meaning | Default |
| --- | --- | --- |
| `context_roots` | Directories or single Markdown files the reviewer may read as trusted guidance | `docs`, `.agents/skills` |
| `docs_libraries` | Context7 library IDs the reviewer may query | none |
| `plan_globs` | Plan files offered to the final review as context | none |
| `include`, `exclude` | Path globs added to or removed from final-review scope | none |

## Development

```bash
pnpm install
pnpm test
```

The first commit is a verbatim import from klicker-uzh; later commits show each adaptation.
