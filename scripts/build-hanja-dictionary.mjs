import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OUTPUT_PATH = new URL('../public/data/hanja-dictionary.json', import.meta.url);
export const NOTICE_PATH = new URL('../THIRD_PARTY_NOTICES.md', import.meta.url);
export const SOURCE_COMMIT = 'a34aef73378c0992316861bbf13fc914ee7577d9';
export const SOURCE_SHA256 = 'dd44dcc856cf542b1022d0f39c2e9b9f8805fdcc5923be80f04849ed97ce0996';
export const SOURCE_URL = `https://raw.githubusercontent.com/libhangul/libhangul/${SOURCE_COMMIT}/data/hanja/hanja.txt`;

const HAN_RE = /^\p{Script=Han}$/u;

function assertSourceHash(sourceText) {
  const actual = createHash('sha256').update(sourceText).digest('hex');
  if (actual !== SOURCE_SHA256) {
    throw new Error(`libhangul hanja.txt sha256 mismatch: expected ${SOURCE_SHA256}, got ${actual}`);
  }
}

function isSingleHanja(value) {
  return [...value].length === 1 && HAN_RE.test(value);
}

function compareCandidate(a, b) {
  return a.reading.localeCompare(b.reading, 'ko') || a.meaning.localeCompare(b.meaning, 'ko');
}

export function parseHanjaDictionary(sourceText, options = {}) {
  if (options.verifyHash !== false) assertSourceHash(sourceText);

  const byChar = new Map();

  for (const rawLine of sourceText.split(/\r?\n/u)) {
    if (!rawLine || rawLine.startsWith('#')) continue;

    const first = rawLine.indexOf(':');
    const second = rawLine.indexOf(':', first + 1);
    if (first <= 0 || second <= first) continue;

    const reading = rawLine.slice(0, first).trim();
    const char = rawLine.slice(first + 1, second).trim();
    const meaning = rawLine.slice(second + 1).trim();
    if (!reading || !isSingleHanja(char)) continue;

    if (!byChar.has(char)) byChar.set(char, new Map());
    byChar.get(char).set(`${reading}\u0000${meaning}`, { reading, meaning });
  }

  const entries = {};
  for (const char of [...byChar.keys()].sort((a, b) => a.codePointAt(0) - b.codePointAt(0))) {
    entries[char] = [...byChar.get(char).values()].sort(compareCandidate);
  }

  return {
    metadata: {
      source: 'libhangul/data/hanja/hanja.txt',
      sourceUrl: SOURCE_URL,
      sourceCommit: SOURCE_COMMIT,
      sourceSha256: SOURCE_SHA256,
      license: 'BSD-3-Clause',
    },
    entries,
  };
}

export function extractSourceNotice(sourceText) {
  const lines = [];
  for (const line of sourceText.split(/\r?\n/u)) {
    if (!line.startsWith('#')) break;
    lines.push(line.replace(/^# ?/u, ''));
  }
  return lines.join('\n').trimEnd();
}

export function buildNotice(sourceText) {
  return [
    '# Third Party Notices',
    '',
    '## libhangul hanja data',
    '',
    `Source: libhangul/data/hanja/hanja.txt at commit ${SOURCE_COMMIT}`,
    `URL: ${SOURCE_URL}`,
    `SHA-256: ${SOURCE_SHA256}`,
    'License: BSD-3-Clause',
    '',
    'The generated `public/data/hanja-dictionary.json` file is derived from this data file.',
    'The notice below is copied from the top of the upstream data file.',
    '',
    '```text',
    extractSourceNotice(sourceText),
    '```',
    '',
  ].join('\n');
}

export function parseArgs(argv) {
  const args = [...argv];
  let inputPath = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--input') {
      inputPath = args[index + 1] ?? null;
      index += 1;
    } else if (arg.startsWith('--input=')) {
      inputPath = arg.slice('--input='.length);
    } else if (!arg.startsWith('-') && !inputPath) {
      inputPath = arg;
    }
  }

  return { inputPath };
}

export async function readSourceText(inputPath, fetchImpl = fetch) {
  if (inputPath) return readFileSync(inputPath, 'utf8');

  const response = await fetchImpl(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`failed to download libhangul hanja.txt: HTTP ${response.status}`);
  }
  return response.text();
}

export async function buildHanjaDictionary({ inputPath, fetchImpl } = {}) {
  const sourceText = await readSourceText(inputPath, fetchImpl);
  const dictionary = parseHanjaDictionary(sourceText);
  const json = JSON.stringify(dictionary) + '\n';

  mkdirSync(dirname(fileURLToPath(OUTPUT_PATH)), { recursive: true });
  writeFileSync(OUTPUT_PATH, json, 'utf8');
  writeFileSync(NOTICE_PATH, buildNotice(sourceText), 'utf8');

  return { dictionary, bytes: Buffer.byteLength(json, 'utf8') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { inputPath } = parseArgs(process.argv.slice(2));
  await buildHanjaDictionary({ inputPath });
}
