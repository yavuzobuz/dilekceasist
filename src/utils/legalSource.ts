export type LegalSource = 'all' | 'yargitay' | 'danistay' | 'uyap' | 'anayasa';

const SUPPORTED_SOURCES: ReadonlySet<LegalSource> = new Set([
  'all',
  'yargitay',
  'danistay',
  'uyap',
  'anayasa',
]);

const normalizeForMatch = (value: unknown): string =>
  String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .trim();

const mergeQueryInput = (input: string | string[]): string =>
  Array.isArray(input)
    ? input.map(item => String(item || '').trim()).filter(Boolean).join(' ')
    : String(input || '');

export const normalizeLegalSource = (value: unknown): LegalSource | null => {
  const normalized = normalizeForMatch(value);
  if (!normalized) return null;
  if (SUPPORTED_SOURCES.has(normalized as LegalSource)) {
    return normalized as LegalSource;
  }
  return null;
};

/**
 * Sorgu metninden hukuki kaynak (mahkeme) belirler.
 *
 * Strateji: Client tarafında sadece açıkça belirtilen mahkeme adları
 * tanınır. Belirsiz durumlarda 'all' döndürülür ve server tarafındaki
 * AI router doğru mahkemeyi seçer.
 *
 * Bu sayede "itirazın iptali → Danıştay" gibi hatalı kural eşleşmeleri
 * yaşanmaz; routing kararı bağlamı anlayan AI'a bırakılır.
 */
export const resolveLegalSourceForQuery = (
  input: string | string[],
  fallback: LegalSource = 'all'
): LegalSource => {
  const merged = mergeQueryInput(input);

  // Önce doğrudan kaynak adı olarak parse etmeyi dene
  const directSource = normalizeLegalSource(merged);
  if (directSource) return directSource;

  const text = normalizeForMatch(merged);
  if (!text) return fallback;

  // Anayasa Mahkemesi – kesin sinyal
  if (
    text.includes('anayasa mahkemesi') ||
    text.includes('aym') ||
    text.includes('bireysel basvuru')
  ) {
    return 'anayasa';
  }

  // Açık mahkeme isimleri içeriyorsa doğrudan yönlendir
  const hasDanistay = text.includes('danistay');
  const hasYargitay = text.includes('yargitay');
  if (hasDanistay && hasYargitay) return 'all';
  if (hasDanistay) return 'danistay';
  if (hasYargitay) return 'yargitay';

  // Geri kalan her şey için Server-side AI router karar verir.
  // Client-side kural tabanlı tahmin yapılmaz → fallback 'all'
  return fallback;
};
