import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { GEMINI_MODEL_NAME, getGeminiClient } from './_shared.js';

const MODEL_NAME = GEMINI_MODEL_NAME;
const SEARCH_TIMEOUT_MS = Number(process.env.GEMINI_WEB_SEARCH_TIMEOUT_MS || 45000);

const normalizeKeywordList = (rawKeywords) => {
    if (!Array.isArray(rawKeywords)) return [];

    const seen = new Set();
    const cleaned = [];

    rawKeywords.forEach((item) => {
        const value = String(item || '').replace(/\s+/g, ' ').trim();
        if (!value) return;
        const key = value.toLocaleLowerCase('tr-TR');
        if (seen.has(key)) return;
        seen.add(key);
        cleaned.push(value.slice(0, 120));
    });

    return cleaned.slice(0, 8);
};

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
    let timer = null;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        });
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const buildPrimaryPrompt = (keywords) => {
    const yargitayQueries = keywords.map((kw) => `\"${kw}\" Yargitay karar emsal`);
    const mevzuatQueries = keywords.map((kw) => `\"${kw}\" kanun maddesi hukum`);

    return `
## ARAMA GOREVI: YARGITAY KARARLARI VE MEVZUAT

### ANAHTAR KELIMELER
${keywords.join(', ')}

### ARAMA STRATEJISI
**1. Yargitay Kararlari (Oncelikli)**
${yargitayQueries.map((q) => `- ${q}`).join('\n')}

**2. Mevzuat Aramasi**
${mevzuatQueries.map((q) => `- ${q}`).join('\n')}

## BEKLENTILER
1. En az 3-5 Yargitay karari bul
2. Her karar icin TAM KUNYESINI yaz
3. Ilgili kanun maddelerini listele
`;
};

const SYSTEM_INSTRUCTION = `Sen, Turk hukuku alaninda uzman bir arastirma asistanisin.
Gorevin ozellikle Yargitay kararlari bulmak ve bunlari dilekcede kullanilabilir formatta sunmaktir.

KRITIK GOREV: Yargitay kararlari bulma
1. Karar kunyesi: Daire, Esas No, Karar No, Tarih
2. Karar ozeti: 1-2 cumlelik ozet
3. Ilgili kanun maddesi: Kararda atif yapilan mevzuat

CIKTI FORMATI
### EMSAL YARGITAY KARARLARI
**1. [Yargitay X. HD., E. XXXX/XXXX, K. XXXX/XXXX, T. XX.XX.XXXX]**
Ozet: [Kararin ozeti]
Ilgili Mevzuat: [Kanun maddesi]

### ILGILI MEVZUAT
- [Kanun Adi] m. [madde no]: [madde ozeti]

### ARASTIRMA OZETI
[Bulunan karar ve mevzuata dayali genel hukuki degerlendirme]

Onemli: Uydurma karar numarasi veya kaynak verme.`;

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const keywords = normalizeKeywordList(req?.body?.keywords);

        if (keywords.length === 0) {
            return res.status(400).json({ error: 'keywords must be a non-empty array' });
        }

        const ai = getGeminiClient();

        const primaryPrompt = buildPrimaryPrompt(keywords);

        let response = null;
        let degraded = false;
        let warning = null;

        let _debugPrimaryError = null;
        let _debugFallbackError = null;

        try {
            response = await withTimeout(
                ai.models.generateContent({
                    model: MODEL_NAME,
                    contents: primaryPrompt,
                    config: {
                        tools: [{ googleSearch: {} }],
                        systemInstruction: SYSTEM_INSTRUCTION,
                    },
                }),
                SEARCH_TIMEOUT_MS,
                'Web search timed out'
            );
        } catch (searchError) {
            degraded = true;
            _debugPrimaryError = String(searchError?.message || searchError || 'unknown');
            console.error('[web-search] Primary search error:', searchError);
            warning = getSafeErrorMessage(searchError, 'Live web search failed');

            const fallbackPrompt = `Asagidaki anahtar kelimelere gore Turk hukuku kapsaminda kisa bir mevzuat odakli on degerlendirme ver. Uydurma karar numarasi yazma.\n\nAnahtar kelimeler: ${keywords.join(', ')}`;

            try {
                response = await withTimeout(
                    ai.models.generateContent({
                        model: MODEL_NAME,
                        contents: fallbackPrompt,
                        config: {
                            systemInstruction: SYSTEM_INSTRUCTION,
                        },
                    }),
                    10000, // 10s cap so 45s + 10s = 55s (under 60s Vercel limit)
                    'Fallback search timed out'
                );
            } catch (fallbackError) {
                _debugFallbackError = String(fallbackError?.message || fallbackError || 'unknown');
                console.error('[web-search] Fallback search error:', fallbackError);
                warning = getSafeErrorMessage(fallbackError, warning || 'Live/Fallback web search failed');
                response = { text: 'Canli arama su an tamamlanamadi. Mevcut bilgilerle genel bir hukuki yonlendirme sunulabilir.' };
            }
        }

        return res.status(200).json({
            text: String(response?.text || '').trim(),
            groundingMetadata: response?.candidates?.[0]?.groundingMetadata || null,
            degraded,
            warning,
            _debugPrimaryError,
            _debugFallbackError,
        });
    } catch (error) {
        console.error('Web Search Error:', error);
        return res.status(200).json({
            text: 'Web aramasi su anda kullanilamiyor. Soru genel hukuki cercevede yanitlanmalidir.',
            groundingMetadata: null,
            degraded: true,
            warning: getSafeErrorMessage(error, 'Web search API error'),
        });
    }
}
