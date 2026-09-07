import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNotice,
  parseArgs,
  parseHanjaDictionary,
  readSourceText,
  SOURCE_COMMIT,
  SOURCE_SHA256,
  SOURCE_URL,
} from '../scripts/build-hanja-dictionary.mjs';
import {
  loadHanjaDictionary,
  loadHanjaDictionaryResult,
  lookupHanjaCandidates,
  resetHanjaDictionaryCache,
  type HanjaDictionary,
} from '../src/hanja-dictionary.ts';

const source = [
  '# Copyright (c) 2005,2006 Choe Hwanjin',
  '# All rights reserved.',
  '학:學:배울 학',
  '부:不:아닐 부',
  '불:不:아닐 불',
  '신:慎:',
  '한글:한글:excluded',
  '가:可否:excluded',
  '학:學:배울 학',
].join('\n');

test('libhangul source is parsed into deterministic single-Hanja candidates', () => {
  const dictionary = parseHanjaDictionary(source, { verifyHash: false });

  assert.deepEqual(dictionary.metadata, {
    source: 'libhangul/data/hanja/hanja.txt',
    sourceUrl: SOURCE_URL,
    sourceCommit: SOURCE_COMMIT,
    sourceSha256: SOURCE_SHA256,
    license: 'BSD-3-Clause',
  });
  assert.deepEqual(dictionary.entries['學'], [{ reading: '학', meaning: '배울 학' }]);
  assert.deepEqual(dictionary.entries['不'], [
    { reading: '부', meaning: '아닐 부' },
    { reading: '불', meaning: '아닐 불' },
  ]);
  assert.deepEqual(dictionary.entries['慎'], [{ reading: '신', meaning: '' }]);
  assert.equal(dictionary.entries['한글'], undefined);
  assert.equal(dictionary.entries['可否'], undefined);
});

test('source hash mismatch fails generation', () => {
  assert.throws(
    () => parseHanjaDictionary(source),
    /sha256 mismatch/u,
  );
});

test('third-party notice preserves upstream BSD notice', () => {
  const notice = buildNotice(source);
  assert.match(notice, /License: BSD-3-Clause/u);
  assert.equal(notice.includes(SOURCE_URL), true);
  assert.match(notice, /Copyright \(c\) 2005,2006 Choe Hwanjin/u);
  assert.match(notice, new RegExp(SOURCE_SHA256, 'u'));
});

test('generator input args support optional --input and positional path', () => {
  assert.deepEqual(parseArgs(['--input', '/tmp/hanja.txt']), { inputPath: '/tmp/hanja.txt' });
  assert.deepEqual(parseArgs(['--input=/tmp/hanja.txt']), { inputPath: '/tmp/hanja.txt' });
  assert.deepEqual(parseArgs(['/tmp/hanja.txt']), { inputPath: '/tmp/hanja.txt' });
  assert.deepEqual(parseArgs([]), { inputPath: null });
});

test('generator default source downloads the pinned raw URL without network in tests', async () => {
  const seen: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(source);
  };

  assert.equal(await readSourceText(null, fetchImpl), source);
  assert.deepEqual(seen, [SOURCE_URL]);
});

test('lookup returns candidates and filters non-Hanja input', async () => {
  const dictionary: HanjaDictionary = {
    metadata: {
      source: 'test',
      sourceUrl: SOURCE_URL,
      sourceCommit: SOURCE_COMMIT,
      sourceSha256: SOURCE_SHA256,
      license: 'BSD-3-Clause',
    },
    entries: {
      學: [{ reading: '학', meaning: '배울 학' }],
    },
  };
  const fetchImpl = async () => new Response(JSON.stringify(dictionary));

  resetHanjaDictionaryCache();
  assert.deepEqual(await lookupHanjaCandidates('學', fetchImpl), [{ reading: '학', meaning: '배울 학' }]);
  assert.deepEqual(await lookupHanjaCandidates('春秋', fetchImpl), []);
  assert.deepEqual(await lookupHanjaCandidates('한', fetchImpl), []);
});

test('loader reports 404 errors and lookup can still safely return empty candidates', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('not found', { status: 404 });
  };

  resetHanjaDictionaryCache();
  const result = await loadHanjaDictionaryResult(fetchImpl);
  assert.equal(result.ok, false);
  assert.deepEqual(result.ok ? null : result.error, {
    kind: 'http',
    status: 404,
    message: 'failed to load Hanja dictionary: HTTP 404',
  });
  assert.deepEqual(await lookupHanjaCandidates('學', fetchImpl), []);
  assert.equal(calls, 2);
});

test('loader reports malformed payloads and allows retry', async () => {
  let calls = 0;
  const dictionary: HanjaDictionary = {
    metadata: {
      source: 'test',
      sourceCommit: SOURCE_COMMIT,
      sourceSha256: SOURCE_SHA256,
      license: 'BSD-3-Clause',
    },
    entries: {
      學: [{ reading: '학', meaning: '배울 학' }],
    },
  };
  const fetchImpl = async () => {
    calls += 1;
    return new Response(calls === 1 ? JSON.stringify({ entries: null }) : JSON.stringify(dictionary));
  };

  resetHanjaDictionaryCache();
  const failed = await loadHanjaDictionaryResult(fetchImpl);
  assert.equal(failed.ok, false);
  assert.equal(failed.ok ? null : failed.error.kind, 'malformed');

  const retried = await loadHanjaDictionaryResult(fetchImpl);
  assert.equal(retried.ok, true);
  assert.deepEqual(retried.ok ? retried.dictionary.entries['學'] : [], [{ reading: '학', meaning: '배울 학' }]);
  assert.equal(calls, 2);
});

test('loader reports invalid JSON as malformed instead of network failure', async () => {
  const fetchImpl = async () => new Response('{bad json');

  resetHanjaDictionaryCache();
  const result = await loadHanjaDictionaryResult(fetchImpl);
  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.error.kind, 'malformed');
});

test('loader reports transient network failures and retries next call', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new Error('network down');
    return new Response(
      JSON.stringify({
        metadata: {
          source: 'test',
          sourceCommit: SOURCE_COMMIT,
          sourceSha256: SOURCE_SHA256,
          license: 'BSD-3-Clause',
        },
        entries: {
          學: [{ reading: '학', meaning: '배울 학' }],
        },
      }),
    );
  };

  resetHanjaDictionaryCache();
  const failed = await loadHanjaDictionaryResult(fetchImpl);
  assert.equal(failed.ok, false);
  assert.equal(failed.ok ? null : failed.error.kind, 'network');
  assert.deepEqual(await loadHanjaDictionary(fetchImpl), {
    metadata: {
      source: 'test',
      sourceCommit: SOURCE_COMMIT,
      sourceSha256: SOURCE_SHA256,
      license: 'BSD-3-Clause',
    },
    entries: {
      學: [{ reading: '학', meaning: '배울 학' }],
    },
  });
  assert.equal(calls, 2);
});
