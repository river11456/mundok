import Papa from 'papaparse';

export function parseCSV(raw: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data;
}
