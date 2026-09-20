import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRelease, isProductPath } from '../scripts/check-release.mjs';

const metadata = version => ({
  'package.json': { version },
  'package-lock.json': { version, packages: { '': { version } } },
});
const doc = (version = 1) => ({ id: '문헌', version, levels: { sentence: [{ id: 's1', text: '甲' }] } });
function check({ version = '2.3.3', changedFiles = ['src/app.ts'], baseExtra = {}, headExtra = {}, tags = {} } = {}) {
  return evaluateRelease({ baseFiles: { ...metadata('2.3.2'), ...baseExtra }, headFiles: { ...metadata(version), ...headExtra }, changedFiles, tags, headCommit: 'head-sha' });
}

test('documentation, tests, workflow and release tooling do not deploy or need a bump', () => {
  const result = check({ version: '2.3.2', changedFiles: ['PROCESS.md', 'docs/design.md', '.github/workflows/deploy.yml', 'test/new.test.mjs', 'scripts/check-release.mjs', 'scripts/verify-deployment.mjs'] });
  assert.equal(result.productChanged, false);
  assert.deepEqual(result.errors, []);
});

test('catalog README changes do not deploy or need a version bump', () => {
  const result = check({ version: '2.3.2', changedFiles: ['catalog/README.md'] });
  assert.equal(result.productChanged, false);
  assert.deepEqual(result.errors, []);
});

test('catalog README exemption does not hide catalog data changes', () => {
  const result = check({
    version: '2.3.2', changedFiles: ['catalog/README.md', 'catalog/문헌.json'],
    baseExtra: { 'catalog/문헌.json': doc(1) }, headExtra: { 'catalog/문헌.json': doc(1) },
  });
  assert.equal(result.productChanged, true);
  assert.match(result.errors.join(), /increased app version/);
  assert.match(result.errors.join(), /content version must increase/);
  for (const path of ['catalog/other.md', 'public/README.md', 'src/README.md']) {
    assert.equal(isProductPath(path), true, path);
  }
});

test('standalone design reference HTML changes do not deploy', () => {
  const result = check({ version: '2.3.2', changedFiles: [
    'design/mockups/final.html', 'design/mockups/a-mac-native.html', 'design/char-cell.md',
  ] });
  assert.equal(result.productChanged, false);
  assert.deepEqual(result.errors, []);
});

test('design documentation exemption does not hide product HTML or styles', () => {
  for (const path of ['index.html', 'public/mockups/demo.html', 'src/style.css', 'design/new-runtime.html']) {
    const result = check({ version: '2.3.2', changedFiles: ['design/mockups/final.html', path] });
    assert.equal(result.productChanged, true, path);
    assert.match(result.errors.join(), /increased app version/, path);
  }
});

test('product classifier includes build, generated assets, metadata and unknown executable paths', () => {
  for (const path of ['src/a.ts', 'public/sw.js', 'catalog/_collections.json', 'index.html', 'package.json', 'package-lock.json', 'vite.config.mts', 'tsconfig.json', 'scripts/lint-data.mjs', 'scripts/promote.mjs', 'scripts/build-hanja-dictionary.mjs', 'scripts/font-cmap.mjs', 'scripts/subset-font.mjs', 'scripts/new-build.mjs', 'new-runtime.js', 'src/README.md']) assert.equal(isProductPath(path), true, path);
});

test('unchanged product version fails and patch/minor/major increases pass', () => {
  assert.match(check({ version: '2.3.2' }).errors.join(), /increased app version/);
  for (const version of ['2.3.3', '2.4.0', '3.0.0']) assert.deepEqual(check({ version }).errors, []);
});

test('mixed documentation and code requires a release', () => {
  const result = check({ version: '2.3.2', changedFiles: ['README.md', 'src/app.ts'] });
  assert.equal(result.productChanged, true);
  assert.ok(result.errors.length);
});

test('negative, malformed, prerelease, leading-zero and downgraded app versions fail', () => {
  for (const version of ['-1.0.0', '2.03.3', '2.3.3-beta.1', '2.3', '2.3.1', '1.9.9']) assert.ok(check({ version }).errors.length, version);
});

test('either lockfile root version mismatch fails', () => {
  for (const lock of [{ version: '2.3.2', packages: { '': { version: '2.3.3' } } }, { version: '2.3.3', packages: { '': { version: '2.3.2' } } }, { version: '2.3.3' }]) {
    assert.match(check({ headExtra: { 'package-lock.json': lock } }).errors.join(), /root versions/);
  }
});

test('existing catalog document requires an explicit increased revision', () => {
  for (const version of [undefined, 0, -1, 1, 1.5, '2']) {
    assert.ok(check({ changedFiles: ['catalog/문헌.json'], baseExtra: { 'catalog/문헌.json': doc(1) }, headExtra: { 'catalog/문헌.json': { ...doc(), version } } }).errors.length, String(version));
  }
  assert.deepEqual(check({ changedFiles: ['catalog/문헌.json'], baseExtra: { 'catalog/문헌.json': doc(1) }, headExtra: { 'catalog/문헌.json': doc(2) } }).errors, []);
});

test('legacy missing revision means baseline 1 and must become 2 or higher', () => {
  const options = { changedFiles: ['catalog/문헌.json'], baseExtra: { 'catalog/문헌.json': { ...doc(), version: undefined } } };
  assert.ok(check({ ...options, headExtra: { 'catalog/문헌.json': doc(1) } }).errors.length);
  assert.deepEqual(check({ ...options, headExtra: { 'catalog/문헌.json': doc(2) } }).errors, []);
});

test('new document starts at positive integer revision; missing revision fails', () => {
  assert.deepEqual(check({ changedFiles: ['catalog/문헌.json'], headExtra: { 'catalog/문헌.json': doc(1) } }).errors, []);
  assert.ok(check({ changedFiles: ['catalog/문헌.json'], headExtra: { 'catalog/문헌.json': { ...doc(), version: undefined } } }).errors.length);
});

test('NFC/NFD filenames represent same existing document, so renaming cannot bypass revision', () => {
  const nfd = 'catalog/문헌.json'.normalize('NFD');
  const options = { changedFiles: [nfd, 'catalog/문헌.json'], baseExtra: { [nfd]: doc(1) } };
  assert.ok(check({ ...options, headExtra: { 'catalog/문헌.json': doc(1) } }).errors.length);
  assert.deepEqual(check({ ...options, headExtra: { 'catalog/문헌.json': doc(2) } }).errors, []);
});

test('collections require app release but have no document revision', () => {
  const result = check({ changedFiles: ['catalog/_collections.json'], headExtra: { 'catalog/_collections.json': { shelves: [], refs: [] } } });
  assert.equal(result.productChanged, true);
  assert.deepEqual(result.errors, []);
});

test('duplicate release tag fails, same commit rerun passes', () => {
  assert.match(check({ tags: { 'v2.3.3': 'other-sha' } }).errors.join(), /another commit/);
  assert.deepEqual(check({ tags: { 'v2.3.3': 'head-sha' } }).errors, []);
});

test('document identity changes fail; deliberate card deletion remains reviewable', () => {
  const options = { changedFiles: ['catalog/문헌.json'], baseExtra: { 'catalog/문헌.json': doc(1) } };
  for (const id of ['다른문헌', 42, undefined]) assert.ok(check({ ...options, headExtra: { 'catalog/문헌.json': { ...doc(2), id } } }).errors.length);
  assert.deepEqual(check({ ...options, headExtra: { 'catalog/문헌.json': { ...doc(2), levels: { sentence: [] } } } }).errors, []);
});

test('missing metadata and malformed JSON fail explicitly', () => {
  assert.ok(evaluateRelease({ baseFiles: {}, headFiles: {}, changedFiles: [] }).errors.length);
  assert.match(check({ headExtra: { 'package.json': '{' } }).errors.join(), /invalid JSON/);
});

test('CLI reads Git snapshots, Unicode paths, tags and rejects missing baseline', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'mundok-release-test-'));
  const script = fileURLToPath(new URL('../scripts/check-release.mjs', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const writeMetadata = version => {
    for (const [path, data] of Object.entries(metadata(version))) writeFileSync(join(cwd, path), JSON.stringify(data));
  };
  const run = (...args) => {
    const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
    return { status: result.status, body: JSON.parse(result.stdout) };
  };
  try {
    git('init');
    git('config', 'user.name', 'Release policy test');
    git('config', 'user.email', 'test@example.invalid');
    writeMetadata('2.3.2');
    mkdirSync(join(cwd, 'catalog'));
    const docPath = join(cwd, 'catalog', '문헌.json'.normalize('NFD'));
    writeFileSync(docPath, JSON.stringify(doc(1)));
    git('add', '.'); git('commit', '-m', 'baseline');
    const base = git('rev-parse', 'HEAD');
    writeMetadata('2.3.3');
    writeFileSync(docPath, JSON.stringify(doc(2)));
    git('add', '.'); git('commit', '-m', 'release');
    const result = run('--base', base);
    assert.equal(result.status, 0);
    assert.equal(result.body.productChanged, true);
    assert.equal(result.body.version, '2.3.3');
    git('tag', 'v2.3.3', base);
    assert.equal(run('--base', base).status, 1);
    git('tag', '-f', 'v2.3.3', 'HEAD');
    assert.equal(run('--base', base).status, 0);
    assert.equal(run('--base', 'missing-ref').status, 1);
    assert.match(run().body.errors.join(), /base is required/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
