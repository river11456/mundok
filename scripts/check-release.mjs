#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PRODUCT_SCRIPTS = new Set([
  'scripts/lint-data.mjs', 'scripts/promote.mjs', 'scripts/build-hanja-dictionary.mjs',
  'scripts/font-cmap.mjs', 'scripts/subset-font.mjs',
]);
const TOOLING_SCRIPTS = new Set(['scripts/check-release.mjs', 'scripts/verify-deployment.mjs']);

// Unknown files require a release; only known documentation/tooling paths are exempt.
export function isProductPath(file) {
  const path = file.normalize('NFC');
  if (/^(src|public|catalog)\//.test(path) || PRODUCT_SCRIPTS.has(path)) return true;
  if (TOOLING_SCRIPTS.has(path) || /^(test|tests|docs|\.github|\.omx|\.omc)\//.test(path)) return false;
  if (/\.md$/i.test(path) || ['.gitignore', '.gitattributes', '.editorconfig', 'LICENSE'].includes(path)) return false;
  return true;
}

function normalizedFiles(files) {
  const result = new Map();
  for (const [path, value] of Object.entries(files)) {
    const key = path.normalize('NFC');
    if (result.has(key)) throw new Error(`Unicode-normalized path collision: ${key}`);
    result.set(key, value);
  }
  return result;
}

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function compareVersions(a, b) {
  const left = a.split('.').map(BigInt);
  const right = b.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

/** Snapshots contain path => JSON text (or parsed JSON). tags contains tag => commit SHA. */
export function evaluateRelease({ baseFiles, headFiles, changedFiles, headCommit, tags = {} }) {
  const errors = [];
  const paths = [...new Set(changedFiles.map(path => path.normalize('NFC')))];
  const productChanged = paths.some(isProductPath);
  const base = normalizedFiles(baseFiles);
  const head = normalizedFiles(headFiles);
  function read(files, path, label) {
    if (!files.has(path)) {
      errors.push(`${label}: missing ${path}`);
      return null;
    }
    try {
      const value = files.get(path);
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected object');
      return parsed;
    } catch (error) {
      errors.push(`${label}: invalid JSON ${path}: ${error.message}`);
      return null;
    }
  }
  const before = read(base, 'package.json', 'base');
  const after = read(head, 'package.json', 'head');
  const lock = read(head, 'package-lock.json', 'head');
  const version = after?.version ?? null;
  for (const [label, value] of [['base', before?.version], ['head', version]]) {
    if (typeof value !== 'string' || !stableVersion.test(value)) errors.push(`${label}: version must be stable x.y.z`);
  }
  if (lock && (lock.version !== version || lock.packages?.['']?.version !== version)) {
    errors.push('package-lock.json root versions must match package.json');
  }
  if (typeof version === 'string' && stableVersion.test(version) && typeof before?.version === 'string' && stableVersion.test(before.version)) {
    const comparison = compareVersions(version, before.version);
    if (comparison < 0 || (productChanged && comparison === 0)) errors.push('Product changes require an increased app version; version downgrade is forbidden');
  }
  if (productChanged && Object.hasOwn(tags, `v${version}`) && tags[`v${version}`] !== headCommit) {
    errors.push(`Tag v${version} already identifies another commit`);
  }
  for (const path of paths.filter(path => /^catalog\/[^/]+\.json$/.test(path) && path !== 'catalog/_collections.json')) {
    if (!head.has(path)) continue; // Deliberate removals are reviewed in the PR.
    const doc = read(head, path, 'head');
    if (!doc) continue;
    const id = path.slice('catalog/'.length, -'.json'.length);
    if (typeof doc.id !== 'string' || doc.id.normalize('NFC') !== id) errors.push(`${path}: document ID must match filename`);
    if (!Number.isSafeInteger(doc.version) || doc.version < 1) errors.push(`${path}: explicit positive integer version required`);
    if (base.has(path)) {
      const old = read(base, path, 'base');
      if (!old) continue;
      if (typeof old.id !== 'string' || typeof doc.id !== 'string' || old.id.normalize('NFC') !== doc.id.normalize('NFC')) errors.push(`${path}: existing document ID must be preserved`);
      const previousVersion = old.version ?? 1; // Existing runtime and promote.mjs default.
      if (!Number.isSafeInteger(previousVersion) || previousVersion < 1 || !(doc.version > previousVersion)) {
        errors.push(`${path}: content version must increase from ${previousVersion}`);
      }
    }
  }
  return { productChanged, version, errors, changedFiles: paths };
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
}

export function checkGitRelease(baseRef, headRef = 'HEAD') {
  if (!baseRef) throw new Error('--base is required; release policy cannot run without a baseline');
  const baseCommit = git('rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`).trim();
  const headCommit = git('rev-parse', '--verify', '--end-of-options', `${headRef}^{commit}`).trim();
  const changedFiles = git('diff', '--name-only', '--no-renames', '-z', baseCommit, headCommit, '--').split('\0').filter(Boolean);
  function snapshot(commit) {
    // Read real Git filenames, not normalized spellings (macOS and Linux differ).
    const paths = git('ls-tree', '-r', '--name-only', '-z', commit).split('\0').filter(Boolean);
    const needed = new Set(changedFiles.map(path => path.normalize('NFC')));
    return Object.fromEntries(paths.filter(path => ['package.json', 'package-lock.json'].includes(path) ||
      (needed.has(path.normalize('NFC')) && /^catalog\/[^/]+\.json$/.test(path)))
      .map(path => [path, git('show', `${commit}:${path}`)]));
  }
  const tags = {};
  for (const name of git('tag', '--list', 'v*').split('\n').filter(Boolean)) {
    tags[name] = git('rev-parse', '--verify', `${name}^{commit}`).trim();
  }
  return evaluateRelease({ baseFiles: snapshot(baseCommit), headFiles: snapshot(headCommit), changedFiles, headCommit, tags });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let base;
    let head = 'HEAD';
    for (let i = 2; i < process.argv.length; i++) {
      const flag = process.argv[i];
      if (!['--base', '--head'].includes(flag) || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error('Usage: check-release.mjs --base <ref> [--head <ref>]');
      if (flag === '--base') base = process.argv[++i];
      else head = process.argv[++i];
    }
    const result = checkGitRelease(base, head);
    console.log(JSON.stringify(result));
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (error) {
    console.log(JSON.stringify({ productChanged: null, version: null, errors: [error.message] }));
    process.exitCode = 1;
  }
}
