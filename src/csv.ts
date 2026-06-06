export function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw
    .replace(/^﻿/, '')   // strip BOM
    .trim()
    .split('\n')
    .map(l => l.trimEnd());

  if (lines.length < 2) return [];
  const headers = parseRow(lines[0]);

  return lines
    .slice(1)
    .filter(l => l.trim())
    .map(line => {
      const vals = parseRow(line);
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
    });
}

function parseRow(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}
