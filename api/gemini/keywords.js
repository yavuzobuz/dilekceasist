import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-3-pro-preview';

const STOPWORDS = new Set([
    've', 'veya', 'ile', 'olan', 'olduğu', 'oldugu', 'iddia', 'edilen',
    'üzerine', 'uzerine', 'kapsamında', 'kapsaminda', 'gibi', 'daha', 'çok', 'cok',
    'için', 'icin', 'üzere', 'uzere', 'bu', 'şu', 'su', 'o', 'bir', 'de', 'da',
    'mi', 'mı', 'mu', 'mü', 'ki'
]);

const normalizeKeyword = (value = '') => {
    return String(value || '')
        .replace(/[“”"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const keywordKey = (value = '') => normalizeKeyword(value).toLocaleLowerCase('tr-TR');

const isWeakKeyword = (value = '') => {
    const normalized = normalizeKeyword(value);
    if (!normalized || normalized.length < 3) return true;

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length === 1 && STOPWORDS.has(words[0].toLocaleLowerCase('tr-TR'))) return true;

    const nonStopCount = words.filter((word) => !STOPWORDS.has(word.toLocaleLowerCase('tr-TR'))).length;
    return nonStopCount === 0;
};

const pickFirst = (regex, text) => {
    const match = String(text || '').match(regex);
    return match ? normalizeKeyword(match[0]) : '';
};

const extractHeuristicKeywords = (analysisText = '') => {
    const text = String(analysisText || '');
    const keywords = [];

    const tckRef = pickFirst(/TCK\s*\d+(?:\s*\/\s*\d+)?(?:\s*[-–]\s*\d+)?/i, text);
    if (tckRef) keywords.push(tckRef.replace(/\s+/g, ' '));

    const cityContext = pickFirst(/[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:'da|'de|'ta|'te)/, text);
    if (cityContext) keywords.push(cityContext);

    const fullName = pickFirst(/[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+/, text);
    if (fullName) keywords.push(fullName);

    if (/uyuşturucu|uyusturucu/i.test(text) && /ticaret|satıc|satic/i.test(text)) {
        keywords.push('uyuşturucu ticareti');
        keywords.push('uyuşturucu satıcılığı iddiası');
    }

    if (/evine gelen\s*\d+\s*kişi|evine gelen.*kişi/i.test(text)) {
        keywords.push('evine gelen kişilerde farklı uyuşturucu ele geçirilmesi');
    }

    if (/kullanım sınırını aşan|kullanim sinirini asan|kullanım sınırı|kullanim siniri/i.test(text)) {
        keywords.push('kullanım sınırını aşan miktarda madde');
    }

    if (/tutuklan|tutuklu/i.test(text)) {
        keywords.push('uyuşturucu ticareti suçundan tutuklama');
    }

    return keywords;
};

const safeJsonParse = (raw = '') => {
    if (!raw || typeof raw !== 'string') return null;
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        const objectMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!objectMatch) return null;
        try {
            return JSON.parse(objectMatch[0]);
        } catch {
            return null;
        }
    }
};

const buildFinalKeywords = (modelKeywords = [], analysisText = '') => {
    const combined = [
        ...extractHeuristicKeywords(analysisText),
        ...(Array.isArray(modelKeywords) ? modelKeywords : []),
    ];

    const unique = [];
    const seen = new Set();

    for (const keyword of combined) {
        const normalized = normalizeKeyword(keyword);
        if (isWeakKeyword(normalized)) continue;

        const key = keywordKey(normalized);
        if (seen.has(key)) continue;

        seen.add(key);
        unique.push(normalized);
        if (unique.length >= 12) break;
    }

    return unique;
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { analysisText, userRole } = req.body || {};

        const systemInstruction = `Sen bir hukuki anahtar kelime ureticisisin.
Sana verilen analiz metnine dayanarak, web ve ictihat aramasi icin baglamsal anahtar ifadeler uret.
Rol: ${userRole || 'Tarafsiz'}

Kurallar:
- Tek kelimelik ve baglamsiz stop-word anahtar kelime verme.
- Olayin cekirdek unsurlarini mutlaka dahil et:
  1) Suclama tipi (ornek: uyusturucu ticareti)
  2) Delil unsuru (ornek: kullanim sinirini asan miktar, uc kiside ele gecirilen maddeler)
  3) Kanun maddesi (varsa ornek: TCK 188/3)
  4) Kisi ve yer bilgisi (varsa)
- Anahtar kelimelerin cogu 2-6 kelimelik ifade olsun.

Anahtar kelimeleri su JSON formatinda dondur:
{ "keywords": ["kelime1", "kelime2", ...] }

8-12 arasi anahtar ifade uret. SADECE JSON dondur.`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: analysisText || '',
            config: { systemInstruction },
        });

        const parsed = safeJsonParse(response.text || '');
        const modelKeywords = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
        const finalKeywords = buildFinalKeywords(modelKeywords, analysisText || '');

        res.json({
            text: JSON.stringify({ keywords: finalKeywords }),
        });
    } catch (error) {
        console.error('Keywords Error:', error);
        res.status(500).json({ error: error.message });
    }
}