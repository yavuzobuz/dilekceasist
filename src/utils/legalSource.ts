export type LegalSource = 'all' | 'yargitay' | 'danistay' | 'uyap' | 'anayasa';

const SUPPORTED_SOURCES: ReadonlySet<LegalSource> = new Set([
  'all',
  'yargitay',
  'danistay',
  'uyap',
  'anayasa',
]);

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .trim();

const normalizeForMatch = (value: unknown): string =>
  normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text: string, probes: string[]): boolean =>
  probes.some((probe) => text.includes(probe));

export const normalizeLegalSource = (value: unknown): LegalSource | null => {
  const normalized = normalizeForMatch(value);
  if (!normalized) return null;
  if (SUPPORTED_SOURCES.has(normalized as LegalSource)) {
    return normalized as LegalSource;
  }
  return null;
};

const mergeQueryInput = (input: string | string[]): string =>
  Array.isArray(input)
    ? input.map(item => String(item || '').trim()).filter(Boolean).join(' ')
    : String(input || '');

export const resolveLegalSourceForQuery = (
  input: string | string[],
  fallback: LegalSource = 'all'
): LegalSource => {
  const merged = mergeQueryInput(input);
  const directSource = normalizeLegalSource(merged);
  if (directSource) return directSource;

  const text = normalizeForMatch(merged);
  if (!text) return fallback;

  if (includesAny(text, ['anayasa mahkemesi', 'aym', 'bireysel basvuru'])) {
    return 'anayasa';
  }

  const explicitDanistay = includesAny(text, ['danistay']);
  const explicitYargitay = includesAny(text, ['yargitay']);

  if (explicitDanistay && explicitYargitay) return 'all';
  if (explicitDanistay) return 'danistay';
  if (explicitYargitay) return 'yargitay';

  if (includesAny(text, ['uyap', 'emsal', 'yerel mahkeme', 'bolge adliye', 'istinaf'])) {
    return 'uyap';
  }

  if (
    includesAny(text, [
      'idari yargi',
      'idari',
      'idare mahkemesi',
      'tam yargi',
      'iptal davasi',
      'vergi mahkemesi',
      'imar',
      'ruhsat',
      'belediye',
      'encumen',
      'kamu ihale',
    ])
  ) {
    return 'danistay';
  }

  return fallback;
};
