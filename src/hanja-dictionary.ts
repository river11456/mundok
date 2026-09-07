export type HanjaCandidate = {
  reading: string;
  meaning: string;
};

export type HanjaDictionary = {
  metadata: {
    source: string;
    sourceUrl?: string;
    sourceCommit: string;
    sourceSha256: string;
    license: string;
  };
  entries: Record<string, HanjaCandidate[]>;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type HanjaDictionaryLoadError =
  | { kind: 'missing-fetch'; message: string }
  | { kind: 'http'; status: number; message: string }
  | { kind: 'malformed'; message: string }
  | { kind: 'network'; message: string };

export type HanjaDictionaryLoadResult =
  | { ok: true; dictionary: HanjaDictionary }
  | { ok: false; error: HanjaDictionaryLoadError };

export const EMPTY_DICTIONARY: HanjaDictionary = {
  metadata: { source: '', sourceCommit: '', sourceSha256: '', license: '' },
  entries: {},
};

const HAN_RE = /^\p{Script=Han}$/u;

let dictionaryPromise: Promise<HanjaDictionaryLoadResult> | null = null;

function isSingleHanja(value: string): boolean {
  return [...value].length === 1 && HAN_RE.test(value);
}

export function resetHanjaDictionaryCache(): void {
  dictionaryPromise = null;
}

export function hanjaDictionaryUrl(): string {
  const base = import.meta.env?.BASE_URL ?? './';
  const documentBase =
    typeof globalThis.location === 'undefined' ? 'http://localhost/' : globalThis.location.href;
  return new URL('data/hanja-dictionary.json', new URL(base, documentBase)).toString();
}

function isDictionary(value: unknown): value is HanjaDictionary {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<HanjaDictionary>;
  return Boolean(maybe.metadata && maybe.entries && typeof maybe.entries === 'object');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function loadHanjaDictionaryResult(fetchImpl?: FetchLike): Promise<HanjaDictionaryLoadResult> {
  const resolvedFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!resolvedFetch) {
    return { ok: false, error: { kind: 'missing-fetch', message: 'fetch is not available' } };
  }

  if (!dictionaryPromise) {
    dictionaryPromise = resolvedFetch(hanjaDictionaryUrl())
      .then(async response => {
        if (!response.ok) {
          return {
            ok: false as const,
            error: {
              kind: 'http' as const,
              status: response.status,
              message: `failed to load Hanja dictionary: HTTP ${response.status}`,
            },
          };
        }
        let json: unknown;
        try {
          json = await response.json();
        } catch (error: unknown) {
          return {
            ok: false as const,
            error: { kind: 'malformed' as const, message: errorMessage(error) },
          };
        }
        if (!isDictionary(json)) {
          return {
            ok: false as const,
            error: { kind: 'malformed' as const, message: 'Hanja dictionary payload is malformed' },
          };
        }
        return { ok: true as const, dictionary: json };
      })
      .catch((error: unknown) => ({
        ok: false as const,
        error: { kind: 'network' as const, message: errorMessage(error) },
      }));

    dictionaryPromise.then(result => {
      if (!result.ok) dictionaryPromise = null;
    });
  }
  return dictionaryPromise;
}

export async function loadHanjaDictionary(fetchImpl?: FetchLike): Promise<HanjaDictionary> {
  const result = await loadHanjaDictionaryResult(fetchImpl);
  return result.ok ? result.dictionary : EMPTY_DICTIONARY;
}

export async function lookupHanjaCandidates(
  char: string,
  fetchImpl?: FetchLike,
): Promise<HanjaCandidate[]> {
  if (!isSingleHanja(char)) return [];
  const dictionary = await loadHanjaDictionary(fetchImpl);
  return dictionary.entries[char] ?? [];
}
