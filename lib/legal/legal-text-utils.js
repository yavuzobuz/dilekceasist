const CP1252_REVERSE_BYTE_MAP = new Map([
    [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84], [0x2026, 0x85],
    [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88], [0x2030, 0x89], [0x0160, 0x8A],
    [0x2039, 0x8B], [0x0152, 0x8C], [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92],
    [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B], [0x0153, 0x9C],
    [0x017E, 0x9E], [0x0178, 0x9F],
]);

const MOJIBAKE_DETECTION = /[ÃÄÅÂ]/;

export const decodePotentialMojibake = (value = '') => {
    const text = String(value || '');
    if (!text || !MOJIBAKE_DETECTION.test(text)) return text;

    const bytes = [];
    for (const char of text) {
        const codePoint = char.codePointAt(0);
        if (codePoint == null) continue;

        if (codePoint <= 0xFF) {
            bytes.push(codePoint);
            continue;
        }

        const cp1252Byte = CP1252_REVERSE_BYTE_MAP.get(codePoint);
        if (cp1252Byte == null) {
            return text;
        }
        bytes.push(cp1252Byte);
    }

    try {
        return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    } catch {
        return text;
    }
};

export const sanitizeLegalInput = (value = '', { preserveLayout = false } = {}) => {
    const original = String(value || '');
    const repaired = decodePotentialMojibake(original);
    const normalized = preserveLayout
        ? repaired.replace(/\r\n/g, '\n').replace(/\t/g, ' ').trim()
        : repaired.replace(/\s+/g, ' ').trim();

    return {
        text: normalized,
        encodingRepaired: normalized !== (preserveLayout
            ? original.replace(/\r\n/g, '\n').replace(/\t/g, ' ').trim()
            : original.replace(/\s+/g, ' ').trim()),
    };
};
