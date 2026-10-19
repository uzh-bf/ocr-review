'use strict'

// Reads the consuming repository's review configuration from its trusted
// default-branch commit. Pull-request heads never supply this file, so a
// change under review cannot widen what the reviewer may read or skip.

const { execFileSync } = require('node:child_process')

const CONFIG_PATH = '.github/open-code-review/config.json'
const CONFIG_SCHEMA = 'ocr-review-config/v1'
const MAX_CONFIG_BYTES = 64 * 1024
const MAX_LIST_ENTRIES = 32
const DEFAULTS = Object.freeze({
  context_roots: Object.freeze(['docs', '.agents/skills']),
  docs_libraries: Object.freeze([]),
  plan_globs: Object.freeze([]),
  include: Object.freeze([]),
  exclude: Object.freeze([]),
})
const KEYS = new Set(['schema', ...Object.keys(DEFAULTS)])
const SEGMENT = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/
const GLOB_SEGMENT = /^[A-Za-z0-9_.*{},-]+$/
const LIBRARY_ID = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function invalid() {
  return new Error('invalid_review_config')
}

function relativePath(value, segment) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    value
      .split('/')
      .every((part) => segment.test(part) && part !== '.' && part !== '..')
  )
}

function list(value, valid) {
  if (
    !Array.isArray(value) ||
    value.length > MAX_LIST_ENTRIES ||
    !value.every(valid)
  )
    throw invalid()
  return Object.freeze([...new Set(value)])
}

function parseReviewConfig(text) {
  if (text === undefined) return DEFAULTS
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_CONFIG_BYTES)
    throw invalid()
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    throw invalid()
  }
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    raw.schema !== CONFIG_SCHEMA ||
    Object.keys(raw).some((key) => !KEYS.has(key))
  )
    throw invalid()
  const glob = (value) => relativePath(value, GLOB_SEGMENT)
  return Object.freeze({
    context_roots: list(
      raw.context_roots ?? DEFAULTS.context_roots,
      (value) => relativePath(value, SEGMENT)
    ),
    docs_libraries: list(raw.docs_libraries ?? DEFAULTS.docs_libraries, (v) =>
      LIBRARY_ID.test(v)
    ),
    plan_globs: list(raw.plan_globs ?? DEFAULTS.plan_globs, glob),
    include: list(raw.include ?? DEFAULTS.include, glob),
    exclude: list(raw.exclude ?? DEFAULTS.exclude, glob),
  })
}

// Returns the defaults when the commit has no config file, so a repository can
// adopt the reviewer with only a caller workflow.
function loadReviewConfig(repo, revision) {
  if (!/^[0-9a-f]{40}$/.test(revision ?? '')) throw invalid()
  const git = (args) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: MAX_CONFIG_BYTES + 1,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  let text
  try {
    if (!git(['ls-tree', revision, '--', CONFIG_PATH]).trim()) return DEFAULTS
    text = git(['show', `${revision}:${CONFIG_PATH}`])
  } catch {
    throw invalid()
  }
  return parseReviewConfig(text)
}

// A context root is either a directory, whose Markdown files are readable, or
// a single Markdown file such as AGENTS.md.
function isContextPath(roots, value) {
  return (
    typeof value === 'string' &&
    value.endsWith('.md') &&
    roots.some((root) => value === root || value.startsWith(`${root}/`))
  )
}

module.exports = {
  CONFIG_PATH,
  CONFIG_SCHEMA,
  DEFAULTS,
  isContextPath,
  loadReviewConfig,
  parseReviewConfig,
}
