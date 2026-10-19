const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const test = require('node:test')
const {
  CONFIG_PATH,
  DEFAULTS,
  loadReviewConfig,
  parseReviewConfig,
} = require('./ocr-consumer-config.cjs')

const config = (fields) =>
  JSON.stringify({ schema: 'ocr-review-config/v1', ...fields })

test('review config accepts declared fields and fills defaults', () => {
  const parsed = parseReviewConfig(
    config({
      context_roots: ['AGENTS.md', 'docs'],
      docs_libraries: ['/vercel/next.js'],
      exclude: ['**/*.test.*', 'apps/*/tests/**'],
    })
  )
  assert.deepEqual(parsed.context_roots, ['AGENTS.md', 'docs'])
  assert.deepEqual(parsed.docs_libraries, ['/vercel/next.js'])
  assert.deepEqual(parsed.plan_globs, DEFAULTS.plan_globs)
  assert.deepEqual(parsed.exclude, ['**/*.test.*', 'apps/*/tests/**'])
})

test('review config fails closed on unknown keys, schemas and paths', () => {
  for (const text of [
    config({ unexpected: true }),
    JSON.stringify({ schema: 'ocr-review-config/v0' }),
    config({ context_roots: ['../outside'] }),
    config({ context_roots: ['/absolute'] }),
    config({ context_roots: ['docs/*'] }),
    config({ exclude: ['**/../x'] }),
    config({ docs_libraries: ['vercel/next.js'] }),
    config({ include: 'playwright/**' }),
    '{',
  ])
    assert.throws(() => parseReviewConfig(text), /invalid_review_config/)
})

test('review config loads from the trusted commit and defaults when absent', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-config-'))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-b', 'main')
  git('config', 'user.name', 'Synthetic fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'core.hooksPath', '/dev/null')
  git('commit', '--allow-empty', '-m', 'chore: synthetic base')
  assert.equal(loadReviewConfig(repo, git('rev-parse', 'HEAD')), DEFAULTS)
  fs.mkdirSync(path.join(repo, path.dirname(CONFIG_PATH)), { recursive: true })
  fs.writeFileSync(path.join(repo, CONFIG_PATH), config({ plan_globs: ['docs/project/*.md'] }))
  git('add', '.')
  git('commit', '-m', 'chore: synthetic config')
  assert.deepEqual(loadReviewConfig(repo, git('rev-parse', 'HEAD')).plan_globs, [
    'docs/project/*.md',
  ])
  assert.throws(
    () => loadReviewConfig(repo, '0'.repeat(40)),
    /invalid_review_config/
  )
})
