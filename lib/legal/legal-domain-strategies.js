const DOMAIN_DETECTION_TERMS = {
    ceza: ['tck', 'cmk', 'sanik', 'supheli', 'iddianame', 'sorusturma', 'kovusturma', 'beraat', 'ceza'],
    is_hukuku: ['is kanunu', 'is mahkemesi', 'ise iade', 'kidem', 'ihbar', 'fazla mesai', 'mobbing', 'sgk'],
    aile: ['bosanma', 'nafaka', 'velayet', 'mal rejimi', 'ziynet', 'tmk'],
    borclar: ['tbk', 'sozlesme', 'tazminat', 'haksiz fiil', 'sebepsiz zenginlesme', 'kira'],
    ticaret: ['ttk', 'ticari', 'sirket', 'ortaklik', 'cek', 'bono', 'banka'],
    gayrimenkul: ['tapu', 'tescil', 'ecrimisil', 'elatmanin onlenmesi', 'muris muvazaasi', 'kat mulkiyeti', 'tasinmaz'],
    idare: ['iyuk', 'idari islem', 'iptal davasi', 'tam yargi', 'idare mahkemesi', 'danistay'],
    vergi: ['vergi', 'vuk', 'kdv', 'tarhiyat', 'vergi dairesi', 'ihbarname'],
    icra: ['iik', 'icra', 'haciz', 'iflas', 'odeme emri', 'itirazin iptali'],
    miras: ['miras', 'tenkis', 'tereke', 'vasiyetname'],
    tuketici: ['tuketici', 'tkhk', 'ayipli', 'cayma hakki', 'hakem heyeti'],
    sigorta: ['sigorta', 'police', 'hasar', 'rucu', 'kasko', 'trafik kazasi'],
    anayasa: ['anayasa mahkemesi', 'aym', 'bireysel basvuru', 'norm denetimi', 'ihlal', 'aihs'],
};

export function detectDomainFromText(text) {
    if (!text) return 'ceza';

    const source = String(text || '');
    const scores = Object.fromEntries(
        Object.keys(DOMAIN_DETECTION_TERMS).map((domain) => [domain, 0]),
    );

    for (const [domain, terms] of Object.entries(DOMAIN_DETECTION_TERMS)) {
        for (const term of terms) {
            const regex = new RegExp(`(?:^|\\W)(${term})(?:$|\\W)`, 'gi');
            const matches = source.match(regex);
            if (matches) {
                scores[domain] += matches.length;
            }
        }
    }

    if (/iddianame|sorusturma no|esas no|karar no|sanik|supheli/i.test(source)) scores.ceza += 5;
    if (/bosanma|velayet|nafaka/i.test(source)) scores.aile += 5;
    if (/is mahkemesi|kidem|ihbar|ise iade/i.test(source)) scores.is_hukuku += 5;
    if (/icra mudurlugu|takip|itirazin iptali/i.test(source)) scores.icra += 5;
    if (/danistay|idare mahkemesi|iptal davasi|tam yargi/i.test(source)) scores.idare += 5;
    if (/vergi dairesi|vergi ziyai|ihbarname/i.test(source)) scores.vergi += 5;
    if (/tapu|tescil|ecrimisil|elatmanin onlenmesi|muris muvazaasi|kat mulkiyeti|aidat|ortakligin giderilmesi|kira tespiti|kira tahliye/i.test(source)) {
        scores.gayrimenkul += 6;
    }

    let bestDomain = 'borclar';
    let maxScore = 0;

    for (const [domain, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestDomain = domain;
        }
    }

    if (/tck|5237|cmk|5271/i.test(source) || (source.match(/sanik/gi) || []).length > 2) {
        return 'ceza';
    }

    return bestDomain;
}

export function extractLegalArticles(text) {
    if (!text) return [];

    const articles = new Set();
    const lawAbbrs = ['TCK', 'CMK', 'TBK', 'TMK', 'HMK', 'IIK', 'IYUK', 'VUK', 'TKHK', 'TTK'];

    lawAbbrs.forEach((abbr) => {
        const regex = new RegExp(`${abbr}['\\u2019]?(?:nin|nun)?\\s*(\\d+)(?:\\/(\\d+))?`, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
            articles.add(match[2] ? `${abbr} ${match[1]}/${match[2]}` : `${abbr} ${match[1]}`);
        }
    });

    const articleRegex = /(?:madde|m\.|md\.)\s*(\d+)(?:\s*fikra\s*(\d+))?/gi;
    let match;
    while ((match = articleRegex.exec(text)) !== null) {
        articles.add(match[2] ? `Madde ${match[1]}/${match[2]}` : `Madde ${match[1]}`);
    }

    return Array.from(articles);
}

const normalizeCezaSkillText = (value = '') => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const dedupeSkillTerms = (values = [], max = 12) => {
    const unique = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : [values]) {
        const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
        if (!cleaned) continue;

        const normalized = normalizeCezaSkillText(cleaned);
        if (!normalized || seen.has(normalized)) continue;

        seen.add(normalized);
        unique.push(cleaned);
        if (unique.length >= max) break;
    }

    return unique;
};

export const CEZA_SKILL_EVIDENCE_TERMS = [
    'paketleme',
    'paketlenmis satis materyali',
    'hassas terazi',
    'hts kayitlari',
    'telefon gorusmeleri',
    'telefon inceleme tutanagi',
    'parmak izi',
    'materyal mukayese',
    'kriminal rapor',
    'adli rapor',
    'fiziki takip',
    'arama karari',
    'tanik',
    'kullanici tanik',
    'kamera kaydi',
    'ele gecirilen miktar',
    'uyusturucu madde miktari',
];

export const CEZA_SKILL_NEGATIVE_TERMS = [
    'hukuk dairesi',
    'is hukuku',
    'ise iade',
    'kidem tazminati',
    'borclar hukuku',
    'sozlesme',
    'sigorta',
    '4. hukuk dairesi',
    'idare mahkemesi',
    'danistay',
    'vergi',
    'imar',
];

export function buildCezaDomainSkillContext(text) {
    const rawText = String(text || '').trim();
    const normalized = normalizeCezaSkillText(rawText);
    const articles = extractLegalArticles(rawText);
    const articleText = articles.join(' ');

    const hasAny = (...terms) => terms.some((term) => normalized.includes(normalizeCezaSkillText(term)));
    const isTck188 = /tck\s*188/i.test(articleText) || hasAny('uyusturucu veya uyarici madde ticareti', 'uyusturucu madde ticareti', 'ticaret kasti', 'saglama');
    const isTck191 = /tck\s*191/i.test(articleText) || hasAny('kullanmak icin bulundurma', 'kisisel kullanim', 'kullanim siniri');
    const isDrugMatter = hasAny('uyusturucu', 'uyarici madde', 'metamfetamin', 'kokain', 'sentetik kannabinoid', 'pregabalin', 'gabapentin');

    const tradeVsPersonal = isTck188 && (isTck191 || hasAny('kisisel kullanim', 'kullanmak icin bulundurma'));
    const mentionsTradeIntent = hasAny('ticaret kasti', 'satis', 'saglama', 'ticaret amaci');
    const mentionsPersonalUse = hasAny('kisisel kullanim', 'kullanmak icin bulundurma', 'kullanim siniri');
    const hasPackagingSignal = hasAny('paketleme', 'satisa hazir', 'paketlenmis');
    const hasPhoneSignal = hasAny('telefon', 'telefon inceleme tutanagi', 'whatsapp', 'hts', 'mesaj');
    const hasFingerprintSignal = hasAny('parmak izi', 'ekspertiz');
    const hasUserWitness = hasAny('kullanici tanik', 'tanik beyani', 'tanik');
    const hasWeightSignal = hasAny('miktar', 'gram', 'ele gecirilen');

    const retrievalConcepts = dedupeSkillTerms([
        isTck188 ? 'uyusturucu madde ticareti' : '',
        isTck191 ? 'kullanmak icin bulundurma' : '',
        tradeVsPersonal ? 'ticaret kasti' : '',
        mentionsPersonalUse ? 'kisisel kullanim siniri' : '',
        isTck188 ? 'TCK 188' : '',
        isTck191 ? 'TCK 191' : '',
        !isTck188 && !isTck191 && isDrugMatter ? 'uyusturucu suclarinda suc vasfi' : '',
    ], 6);

    const supportConcepts = dedupeSkillTerms([
        mentionsTradeIntent ? 'ticaret kasti' : '',
        mentionsPersonalUse ? 'kisisel kullanim siniri' : '',
        hasUserWitness ? 'kullanici tanik' : '',
        hasWeightSignal ? 'ele gecirilen miktar' : '',
        'somut delil',
        'supheden sanik yararlanir',
    ], 8);

    const evidenceConcepts = dedupeSkillTerms([
        hasPackagingSignal ? 'paketleme' : '',
        hasPhoneSignal ? 'telefon gorusmeleri' : '',
        hasFingerprintSignal ? 'parmak izi' : '',
        hasUserWitness ? 'tanik' : '',
        hasWeightSignal ? 'ele gecirilen miktar' : '',
        ...CEZA_SKILL_EVIDENCE_TERMS.filter((term) => hasAny(term)),
    ], 10);

    return {
        isCezaDomain: detectDomainFromText(rawText) === 'ceza',
        isDrugMatter,
        isTck188,
        isTck191,
        tradeVsPersonal,
        mentionsTradeIntent,
        mentionsPersonalUse,
        hasPackagingSignal,
        hasPhoneSignal,
        hasFingerprintSignal,
        hasUserWitness,
        hasWeightSignal,
        articles,
        retrievalConcepts,
        supportConcepts,
        evidenceConcepts,
        negativeConcepts: dedupeSkillTerms(CEZA_SKILL_NEGATIVE_TERMS, 14),
    };
}
