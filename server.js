import express from 'express';
import htmlToDocx from 'html-to-docx';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { AI_CONFIG, SERVER_CONFIG } from './config.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = SERVER_CONFIG.PORT;
// Support both GEMINI_API_KEY and VITE_GEMINI_API_KEY for flexibility
const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
    console.error('âŒ GEMINI_API_KEY or VITE_GEMINI_API_KEY is not defined in .env file');
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Security: API Key for server endpoints (optional, set in .env)
const SERVER_API_KEY = process.env.SERVER_API_KEY;

// CORS Configuration - Restrict to allowed origins
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.FRONTEND_URL // Production URL from env
].filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`âš ï¸ CORS blocked request from: ${origin}`);
            callback(new Error('CORS: Origin not allowed'));
        }
    },
    credentials: true
};

// Auth Middleware (optional - only enforced if SERVER_API_KEY is set)
const authMiddleware = (req, res, next) => {
    // Skip auth if no SERVER_API_KEY is configured
    if (!SERVER_API_KEY) return next();

    const providedKey = req.headers['x-api-key'];

    if (providedKey !== SERVER_API_KEY) {
        console.warn('âš ï¸ Unauthorized request attempt');
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    }

    next();
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // Increased limit for file uploads

// Rate Limiting Configuration
const aiRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 30, // Max 30 requests per minute per IP
    message: {
        error: 'Ã‡ok fazla istek gÃ¶nderdiniz. LÃ¼tfen bir dakika bekleyip tekrar deneyin.',
        retryAfter: 60
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        console.warn(`âš ï¸ Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json(options.message);
    }
});

// Apply rate limiter to AI endpoints
app.use('/api/gemini', aiRateLimiter);


// --- Helper Functions (Copied from geminiService.ts) ---

const formatChatHistoryForPrompt = (history) => {
    if (!history || history.length === 0) return "Sohbet geÃ§miÅŸi yok.";
    return history.map(msg => `${msg.role === 'user' ? 'KullanÄ±cÄ±' : 'Asistan'}: ${msg.text}`).join('\n');
};

const formatPartiesForPrompt = (parties) => {
    if (!parties) return "Taraf bilgisi saÄŸlanmadÄ±.";
    const partyEntries = Object.entries(parties).filter(([, value]) => value && value.trim() !== '');
    if (partyEntries.length === 0) return "Taraf bilgisi saÄŸlanmadÄ±.";

    const labelMap = {
        plaintiff: 'DavacÄ±',
        defendant: 'DavalÄ±',
        appellant: 'BaÅŸvuran / Ä°tiraz Eden',
        counterparty: 'KarÅŸÄ± Taraf',
        complainant: 'MÃ¼ÅŸteki / ÅikayetÃ§i',
        suspect: 'ÅÃ¼pheli',
        party1: 'Taraf 1',
        party2: 'Taraf 2',
    };

    return partyEntries
        .map(([key, value]) => `${labelMap[key] || key}: ${value}`)
        .join('\n');
};

const formatCaseDetailsForPrompt = (details) => {
    if (!details) return "Dava kÃ¼nye bilgisi saÄŸlanmadÄ±.";
    const detailEntries = [
        details.court && `Mahkeme: ${details.court}`,
        details.fileNumber && `Dosya NumarasÄ± (Esas No): ${details.fileNumber}`,
        details.decisionNumber && `Karar NumarasÄ±: ${details.decisionNumber}`,
        details.decisionDate && `Karar Tarihi: ${details.decisionDate}`,
    ].filter(Boolean);

    if (detailEntries.length === 0) return "Dava kÃ¼nye bilgisi saÄŸlanmadÄ±.";
    return detailEntries.join('\n');
}

const formatLawyerInfoForPrompt = (lawyerInfo) => {
    if (!lawyerInfo || !lawyerInfo.name) return "Vekil bilgisi saÄŸlanmadÄ±.";

    const entries = [
        `Ad Soyad: ${lawyerInfo.name}`,
        lawyerInfo.title && `Unvan: ${lawyerInfo.title}`,
        lawyerInfo.bar && `Baro: ${lawyerInfo.bar}`,
        lawyerInfo.barNumber && `Baro Sicil No: ${lawyerInfo.barNumber}`,
        lawyerInfo.address && `Adres: ${lawyerInfo.address}`,
        lawyerInfo.phone && `Telefon: ${lawyerInfo.phone}`,
        lawyerInfo.email && `Email: ${lawyerInfo.email}`,
        lawyerInfo.tcNo && `TC No: ${lawyerInfo.tcNo}`,
    ].filter(Boolean);

    return entries.join('\n');
}

const formatContactInfoForPrompt = (contactInfo) => {
    if (!contactInfo || contactInfo.length === 0) return "Ä°letiÅŸim bilgisi saÄŸlanmadÄ±.";

    return contactInfo.map((contact, index) => {
        const entries = [
            `--- KiÅŸi/Kurum ${index + 1} ---`,
            contact.name && `Ad: ${contact.name}`,
            contact.address && `Adres: ${contact.address}`,
            contact.phone && `Telefon: ${contact.phone}`,
            contact.email && `Email: ${contact.email}`,
            contact.tcNo && `TC No: ${contact.tcNo}`,
        ].filter(Boolean);
        return entries.join('\n');
    }).join('\n\n');
}

// --- API Endpoints ---

// Apply auth middleware to all /api/gemini routes
app.use('/api/gemini', authMiddleware);
app.use('/api/html-to-docx', authMiddleware);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// 1. Analyze Documents
app.post('/api/gemini/analyze', async (req, res) => {
    try {
        const { uploadedFiles, udfTextContent, wordTextContent } = req.body;
        console.log('Analyze Request Received');

        const model = AI_CONFIG.MODEL_NAME;
        const systemInstruction = `Sen TÃ¼rk hukukunda uzmanlaÅŸmÄ±ÅŸ bir hukuk asistanÄ±sÄ±n. GÃ¶revin, saÄŸlanan belgeleri, resimleri ve metinleri titizlikle analiz etmektir. Temel bilgileri Ã§Ä±kar, tÃ¼m potansiyel taraflarÄ± (ÅŸahÄ±slar, ÅŸirketler) belirle ve eÄŸer varsa dava kÃ¼nyesi bilgilerini (mahkeme adÄ±, dosya/esas no, karar no, karar tarihi) tespit et. AyrÄ±ca belgelerden avukat/vekil bilgilerini (isim, baro, baro sicil no, adres, telefon, email) ve diÄŸer iletiÅŸim bilgilerini Ã§Ä±kar. Ã‡Ä±ktÄ±nÄ± JSON nesnesi olarak yapÄ±landÄ±r. Analiz Ã¶zetinin HER ZAMAN TÃ¼rkÃ§e olmasÄ±nÄ± saÄŸla.`;

        const promptText = `
LÃ¼tfen SANA GÃ–NDERÄ°LEN PDF belgelerini, resim dosyalarÄ±nÄ± ve aÅŸaÄŸÄ±daki metin olarak saÄŸlanan UDF ve Word belgelerinin iÃ§eriÄŸini titizlikle analiz et.

**ANA GÃ–REVLER:**
1. OlayÄ±n detaylÄ± ve TÃ¼rkÃ§e bir Ã¶zetini oluÅŸtur. **Ã–ZETÄ° MUTLAKA PARAGRAFLARA BÃ–LEREK YAZ (paragraflar arasÄ±nda '\\n\\n' boÅŸluklarÄ± bÄ±rak)**, tek parÃ§a blok yazÄ± KESÄ°NLÄ°KLE kullanma.
2. Metinde adÄ± geÃ§en tÃ¼m potansiyel taraflarÄ± listele
3. Dava kÃ¼nyesi bilgilerini Ã§Ä±kar (mahkeme, dosya numarasÄ±, karar numarasÄ±, karar tarihi)
4. **Ã–NEMLÄ°:** Avukat/vekil bilgilerini bul ve Ã§Ä±kar:
   - Avukat adÄ± soyadÄ± (genellikle "Av." veya "Avukat" ile baÅŸlar)
   - Baro adÄ± ("... Barosu" formatÄ±nda)
   - Baro sicil numarasÄ±
   - Ä°ÅŸ adresi
   - Telefon numarasÄ±
   - Email adresi
5. DiÄŸer iletiÅŸim bilgilerini Ã§Ä±kar (taraflarÄ±n adres, telefon, email bilgileri)

**UDF Belge Ä°Ã§erikleri:**
${udfTextContent || "UDF belgesi yÃ¼klenmedi."}

**Word Belge Ä°Ã§erikleri:**
${wordTextContent || "Word belgesi yÃ¼klenmedi."}

**Ã‡IKTI FORMATI:**
Sonucu 'summary', 'potentialParties', 'caseDetails', 'lawyerInfo' ve 'contactInfo' anahtarlarÄ±na sahip bir JSON nesnesi olarak dÃ¶ndÃ¼r.
`;

        const contentParts = [
            { text: promptText },
            ...(uploadedFiles || []).map(file => ({
                inlineData: {
                    mimeType: file.mimeType,
                    data: file.data
                }
            }))
        ];

        const response = await ai.models.generateContent({
            model,
            contents: { parts: contentParts },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        summary: { type: Type.STRING, description: 'DocumentslarÄ±n detaylÄ± TÃ¼rkÃ§e Ã¶zeti.' },
                        potentialParties: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Benzersiz potansiyel taraf isimlerinin listesi.' },
                        caseDetails: {
                            type: Type.OBJECT,
                            properties: {
                                court: { type: Type.STRING },
                                fileNumber: { type: Type.STRING },
                                decisionNumber: { type: Type.STRING },
                                decisionDate: { type: Type.STRING },
                            }
                        },
                        lawyerInfo: {
                            type: Type.OBJECT,
                            description: 'Avukat/vekil bilgileri (eÄŸer belgede varsa)',
                            properties: {
                                name: { type: Type.STRING, description: 'AvukatÄ±n tam adÄ±' },
                                address: { type: Type.STRING, description: 'AvukatÄ±n iÅŸ adresi' },
                                phone: { type: Type.STRING, description: 'Telefon numarasÄ±' },
                                email: { type: Type.STRING, description: 'Email adresi' },
                                barNumber: { type: Type.STRING, description: 'Baro sicil numarasÄ±' },
                                bar: { type: Type.STRING, description: 'Baro adÄ± (Ã¶rn: Ankara Barosu)' },
                                title: { type: Type.STRING, description: 'Unvan (Ã¶rn: Avukat)' },
                                tcNo: { type: Type.STRING, description: 'TC Kimlik No (eÄŸer varsa)' }
                            }
                        },
                        contactInfo: {
                            type: Type.ARRAY,
                            description: 'DiÄŸer iletiÅŸim bilgileri (taraflarÄ±n adresleri, telefonlarÄ±)',
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING, description: 'KiÅŸi/Kurum adÄ±' },
                                    address: { type: Type.STRING, description: 'Adres' },
                                    phone: { type: Type.STRING, description: 'Telefon' },
                                    email: { type: Type.STRING, description: 'Email' },
                                    tcNo: { type: Type.STRING, description: 'TC Kimlik No (eÄŸer varsa)' }
                                }
                            }
                        }
                    },
                    required: ['summary', 'potentialParties']
                }
            },
        });

        // The logic for parsing/retrying can be simplified here as the SDK handles basic errors.
        // We just return the text which contains the JSON.
        res.json({ text: response.text });

    } catch (error) {
        console.error('Analyze Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// 2. Generate Keywords
app.post('/api/gemini/keywords', async (req, res) => {
    try {
        const { analysisText, userRole } = req.body;
        const model = AI_CONFIG.MODEL_NAME;
        const systemInstruction = `Sen TÃ¼rk Hukuku alanÄ±nda uzman, stratejik bir araÅŸtÄ±rma asistanÄ±sÄ±n. GÃ¶revin, verilen vaka Ã¶zetini analiz ederek, kullanÄ±cÄ±nÄ±n '${userRole}' olan rolÃ¼nÃ¼ hukuki olarak en gÃ¼Ã§lÃ¼ konuma getirecek anahtar kelimeleri belirlemektir. OluÅŸturacaÄŸÄ±n anahtar kelimeler, kullanÄ±cÄ±nÄ±n lehine olan YargÄ±tay kararlarÄ±nÄ±, mevzuatÄ± ve hukuki argÃ¼manlarÄ± bulmaya odaklanmalÄ±dÄ±r. Ã‡Ä±ktÄ± olarak SADECE 'keywords' anahtarÄ±nÄ± iÃ§eren ve bu anahtarÄ±n deÄŸerinin bir string dizisi olduÄŸu bir JSON nesnesi dÃ¶ndÃ¼r.`;
        const promptText = `SaÄŸlanan vaka Ã¶zeti:\n\n"${analysisText}"\n\nBu Ã¶zete dayanarak... (kÄ±saltÄ±ldÄ±)`; // Simplified prompt for brevity in this file context

        const response = await ai.models.generateContent({
            model,
            contents: promptText,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        keywords: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                    required: ["keywords"]
                }
            },
        });
        res.json({ text: response.text });
    } catch (error) {
        console.error('Keywords Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Web Search - Enhanced for YargÄ±tay Decisions
app.post('/api/gemini/web-search', async (req, res) => {
    try {
        const { keywords, query } = req.body;

        // Handle both keywords array and single query string
        const searchTerms = keywords || (query ? [query] : []);

        if (!Array.isArray(searchTerms) || searchTerms.length === 0) {
            return res.status(400).json({ error: 'Keywords veya query parametresi gerekli' });
        }

        const model = AI_CONFIG.MODEL_NAME;

        const systemInstruction = `Sen, TÃ¼rk hukuku alanÄ±nda uzman bir araÅŸtÄ±rma asistanÄ±sÄ±n. 
GÃ¶revin Ã¶zellikle YARGITAY KARARLARI bulmak ve bunlarÄ± dilekÃ§ede kullanÄ±labilir formatta sunmaktÄ±r.

## KRÄ°TÄ°K GÃ–REV: YARGITAY KARARLARI BULMA

Her aramada ÅŸunlarÄ± tespit etmeye Ã§alÄ±ÅŸ:
1. **Karar KÃ¼nyesi:** Daire, Esas No, Karar No, Tarih (Ã¶rn: "YargÄ±tay 9. HD., E. 2023/1234, K. 2023/5678, T. 15.03.2023")
2. **Karar Ã–zeti:** 1-2 cÃ¼mlelik Ã¶zet
3. **Ä°lgili Kanun Maddesi:** Kararda atÄ±f yapÄ±lan mevzuat

## Ã‡IKTI FORMATI

Ã‡Ä±ktÄ±nÄ± ÅŸu ÅŸekilde yapÄ±landÄ±r:

### EMSAL YARGITAY KARARLARI

**1. [YargÄ±tay X. HD., E. XXXX/XXXX, K. XXXX/XXXX, T. XX.XX.XXXX]**
Ã–zet: [KararÄ±n Ã¶zeti]
Ä°lgili Mevzuat: [Kanun maddesi]

**2. [DiÄŸer karar]**
...

### Ä°LGÄ°LÄ° MEVZUAT

- [Kanun AdÄ±] m. [madde no]: [madde Ã¶zeti]

### ARAÅTIRMA Ã–ZETÄ°

[Bulunan karar ve mevzuata dayalÄ± genel hukuki deÄŸerlendirme]

NOT: En az 3-5 emsal karar bulmaya Ã§alÄ±ÅŸ. Bulamazsan "Bu konuda emsal karar bulunamadÄ±" yaz.`;

        // Generate search queries for YargÄ±tay and legislation
        const yargitayQueries = searchTerms.map(kw => `"${kw}" YargÄ±tay karar emsal`);
        const mevzuatQueries = searchTerms.map(kw => `"${kw}" kanun maddesi hÃ¼kÃ¼m`);
        const uyapQueries = searchTerms.map(kw => `"${kw}" site:karararama.yargitay.gov.tr`);

        const promptText = `
## ARAMA GÃ–REVÄ°: YARGITAY KARARLARI VE MEVZUAT

AÅŸaÄŸÄ±daki konularda kapsamlÄ± bir hukuki araÅŸtÄ±rma yap:

### ANAHTAR KELÄ°MELER
${searchTerms.join(', ')}

### ARAMA STRATEJÄ°SÄ°

**1. YargÄ±tay KararlarÄ± (Ã–ncelikli)**
${yargitayQueries.map(q => `- ${q}`).join('\n')}

**2. UYAP Karar Arama**
${uyapQueries.map(q => `- ${q}`).join('\n')}

**3. Mevzuat AramasÄ±**
${mevzuatQueries.map(q => `- ${q}`).join('\n')}

---

## BEKLENTÄ°LER

1. **En az 3-5 YargÄ±tay kararÄ±** bul (mÃ¼mkÃ¼nse)
2. Her karar iÃ§in TAM KÃœNYESÄ°NÄ° yaz (Daire, E., K., Tarih)
3. Ä°lgili kanun maddelerini listele
4. AraÅŸtÄ±rma Ã¶zetini hazÄ±rla

âš ï¸ Ã–NEMLÄ°: Karar kÃ¼nyelerini doÄŸru ve eksiksiz yaz. Bu bilgiler dilekÃ§ede referans olarak kullanÄ±lacak.
`;

        const response = await ai.models.generateContent({
            model,
            contents: promptText,
            config: {
                tools: [{ googleSearch: {} }],
                systemInstruction: systemInstruction,
            },
        });

        res.json({
            text: response.text,
            groundingMetadata: response.candidates?.[0]?.groundingMetadata
        });

    } catch (error) {
        console.error('Web Search Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Generate Petition
app.post('/api/gemini/generate-petition', async (req, res) => {
    try {
        const params = req.body;
        const model = AI_CONFIG.MODEL_NAME;

        const systemInstruction = `Sen, TÃ¼rk hukuk sisteminde 20+ yÄ±l deneyime sahip, Ã¼st dÃ¼zey bir hukuk danÄ±ÅŸmanÄ± ve dilekÃ§e yazÄ±m uzmanÄ±sÄ±n.

## SENÄ°N GÃ–REVÄ°N
SaÄŸlanan ham verileri, profesyonel ve ikna edici bir hukuki anlatÄ±ya dÃ¶nÃ¼ÅŸtÃ¼rmek. Ham bilgileri olduÄŸu gibi kopyalamak DEÄÄ°L, bunlarÄ± hukuki bir dil ve mantÄ±ksal akÄ±ÅŸ iÃ§inde sentezlemek.

## KRÄ°TÄ°K YAZIM KURALLARI

### 1. AÃ‡IKLAMALAR BÃ–LÃœMÃœ NASIL YAZILMALI
âŒ YANLIÅ (Ham veri dÃ¶kÃ¼mÃ¼):
"DavalÄ± kurum tarafÄ±ndan mÃ¼vekkil HÃœSEYÄ°N Ã‡ELÄ°K adÄ±na 'kaÃ§ak elektrik tahakkuk hesap detayÄ±' dÃ¼zenlenmiÅŸ olup, bu belge mÃ¼vekkilime tebliÄŸ edilmiÅŸtir. Ä°ÅŸbu tahakkukta, mÃ¼vekkilimin Tesisat No (4004311180), MÃ¼ÅŸteri No (205539133), TC Kimlik No (41038011064)..."

âœ… DOÄRU (Profesyonel hukuki anlatÄ±):
"1. MÃ¼vekkilim, davalÄ± kurumun abonesi olup, sÃ¶z konusu taÅŸÄ±nmazda ikamet etmektedir.

2. DavalÄ± kurum, mÃ¼vekkilim aleyhine "kaÃ§ak elektrik kullanÄ±mÄ±" iddiasÄ±yla tahakkuk iÅŸlemi baÅŸlatmÄ±ÅŸ ve 25.275,55 TL tutarÄ±nda borÃ§ Ã§Ä±karmÄ±ÅŸtÄ±r.

3. YapÄ±lan incelemede, mÃ¼vekkilimin sayacÄ±nÄ±n (Seri No: CE000624281) herhangi bir mÃ¼dahale izine rastlanmamÄ±ÅŸ olup, iddia edilen kaÃ§ak kullanÄ±m tespiti usulsÃ¼z bir ÅŸekilde gerÃ§ekleÅŸtirilmiÅŸtir.

4. ÅÃ¶yle ki; [olay detaylarÄ± kronolojik sÄ±rayla anlatÄ±lmalÄ±]..."

### 2. âš ï¸ EMSAL KARARLARIN KULLANIMI (Ã‡OK Ã–NEMLÄ°)
YargÄ±tay/DanÄ±ÅŸtay kararlarÄ± SADECE "HUKUKÄ° SEBEPLER" bÃ¶lÃ¼mÃ¼ne listelenmemeli!

âŒ YANLIÅ (Sadece listeleme):
"## HUKUKÄ° SEBEPLER
- YargÄ±tay 9. HD., E. 2023/1234, K. 2023/5678
- YargÄ±tay 3. HD., E. 2022/5678, K. 2022/9999"

âœ… DOÄRU (Ä°lgili argÃ¼manla entegre):
"## AÃ‡IKLAMALAR
...
4. DavalÄ± kurumun iddia ettiÄŸi kaÃ§ak elektrik kullanÄ±mÄ±nÄ±n somut delilleri bulunmamaktadÄ±r. Nitekim YargÄ±tay 3. Hukuk Dairesi'nin E. 2022/5678, K. 2022/9999, T. 15.03.2023 tarihli kararÄ±nda: 'KaÃ§ak elektrik kullanÄ±mÄ± iddiasÄ±nÄ±n ispatÄ± davalÄ±ya aittir. SayaÃ§ mÃ¼hrÃ¼ Ã¼zerinde herhangi bir mÃ¼dahale izi tespit edilememiÅŸse kaÃ§ak elektrik kullanÄ±mÄ±ndan sÃ¶z edilemez' ÅŸeklinde hÃ¼kmedilmiÅŸtir. Somut olayda da sayaÃ§ta herhangi bir mÃ¼dahale izi tespit edilememiÅŸtir.

5. AyrÄ±ca tahakkuk edilen miktar da fahiÅŸtir. YargÄ±tay 3. HD., E. 2021/4567 kararÄ±nda da belirtildiÄŸi Ã¼zere, 'TÃ¼ketim miktarÄ±nÄ±n belirlenmesinde gerÃ§ek tÃ¼ketim deÄŸerleri esas alÄ±nmalÄ±dÄ±r.'
..."

### 3. BÃ–LÃœM YAPISI (Kesin sÄ±ra)
Her dilekÃ§ede ÅŸu bÃ¶lÃ¼mler MUTLAKA bulunmalÄ± ve bu sÄ±rayla yazÄ±lmalÄ±:

## [MAHKEME/MAKAM ADI - BÃœYÃœK HARFLERLE, ORTALI]

**DOSYA NO:** [varsa]

---

**DAVACI/BAÅVURAN:**
[Ad Soyad]
TC: [Kimlik No]
Adres: [Adres]

**VEKÄ°LÄ°:** [varsa]
[Avukat bilgileri]

**DAVALI/KARÅI TARAF:**
[Kurum/KiÅŸi adÄ±]
Adres: [Adres]

---

**KONU:** [Tek cÃ¼mlelik Ã¶zet - Ã¶rn: "KaÃ§ak elektrik tahakkuku iddiasÄ±na itiraz hakkÄ±ndadÄ±r."]

---

## AÃ‡IKLAMALAR

[NumaralÄ± maddeler halinde, her madde ayrÄ± paragraf]

1. [GiriÅŸ: TaraflarÄ±n tanÄ±tÄ±mÄ± ve temel iliÅŸki]

2. [Olay: Ne oldu, kronolojik anlatÄ±m]

3. [Sorun: Neden haksÄ±z/hukuka aykÄ±rÄ± + DESTEKLEYÄ°CÄ° EMSAL KARAR]

4. [Deliller ve destekleyici argÃ¼manlar + Ä°LGÄ°LÄ° YARGITAY KARARI]

5. [SonuÃ§ Ã§Ä±karÄ±mÄ±]

---

## HUKUKÄ° SEBEPLER

- [Ä°lgili Kanun maddesi ve aÃ§Ä±klamasÄ±]
- [YukarÄ±da atÄ±f yapÄ±lan emsal kararlarÄ±n Ã¶zet listesi]

---

## DELÄ°LLER

1. [Delil listesi]

---

## SONUÃ‡ VE Ä°STEM

YukarÄ±da arz ve izah edilen sebeplerle;
- [Talep 1]
- [Talep 2]
... kararÄ± verilmesini saygÄ±larÄ±mla arz ve talep ederim.

[Tarih]
[Ad Soyad / Vekil]

### 4. DÄ°L VE ÃœSLUP KURALLARI
- "MÃ¼vekkil" kelimesini tutarlÄ± kullan
- Resmi hitap formu kullan: "SayÄ±n Mahkemeniz", "arz ve talep ederim"
- Teknik verileri (TC No, dosya no) akÄ±cÄ± cÃ¼mle iÃ§inde yerleÅŸtir, liste olarak deÄŸil
- Hukuki terimler kullan: "haksÄ±z fiil", "usulsÃ¼z iÅŸlem", "hukuka aykÄ±rÄ±lÄ±k" vb.
- Her paragraf bir ana fikir iÃ§ermeli
- Gereksiz tekrarlardan kaÃ§Ä±n
- EMSAL KARARLARI ilgili argÃ¼mana entegre et, ayrÄ± liste yapma`;

        const promptText = `
## DÄ°LEKÃ‡E OLUÅTURMA TALÄ°MATI

AÅŸaÄŸÄ±daki HAM VERÄ°LERÄ° kullanarak PROFESYONEL bir TÃ¼rk hukuk dilekÃ§esi hazÄ±rla.

âš ï¸ Ã–NEMLÄ°: Ham verileri olduÄŸu gibi kopyalama! BunlarÄ± hukuki bir anlatÄ±ya dÃ¶nÃ¼ÅŸtÃ¼r.

---

### GÄ°RDÄ° VERÄ°LERÄ°

**DilekÃ§e TÃ¼rÃ¼:** ${params.petitionType}
**KullanÄ±cÄ±nÄ±n RolÃ¼:** ${params.userRole}

**Dava KÃ¼nyesi:**
${formatCaseDetailsForPrompt(params.caseDetails)}

**Vekil Bilgileri:**
${formatLawyerInfoForPrompt(params.lawyerInfo)}

**Taraflar:**
${formatPartiesForPrompt(params.parties)}

**Olay Ã–zeti (Ham):**
${params.analysisSummary || "Olay Ã¶zeti saÄŸlanmadÄ±."}

**Hukuki AraÅŸtÄ±rma:**
${params.webSearchResult || "Web araÅŸtÄ±rmasÄ± sonucu saÄŸlanmadÄ±."}

**Emsal YargÄ±tay/DanÄ±ÅŸtay KararlarÄ±:**
${params.legalSearchResult || "Emsal karar araÅŸtÄ±rmasÄ± yapÄ±lmadÄ±."}

**Ek Notlar:**
${params.docContent || "Ek metin saÄŸlanmadÄ±."}

**Ã–zel Talimatlar:**
${params.specifics || "Ã–zel talimat saÄŸlanmadÄ±."}

**Sohbet GeÃ§miÅŸi:**
${formatChatHistoryForPrompt(params.chatHistory)}

---

## BEKLENEN Ã‡IKTI

YukarÄ±daki ham verileri kullanarak:
1. Profesyonel, ikna edici bir hukuki anlatÄ± oluÅŸtur
2. Her bÃ¶lÃ¼mÃ¼ (AÃ‡IKLAMALAR, HUKUKÄ° SEBEPLER, DELÄ°LLER, SONUÃ‡ VE Ä°STEM) ayrÄ± ayrÄ± formatla
3. NumaralÄ± maddelerde akÄ±cÄ± paragraflar kullan, ham veri listesi deÄŸil
4. Mahkemeye sunulmaya hazÄ±r, resmi bir dilekÃ§e formatÄ±nda yaz
5. Markdown formatÄ±nÄ± kullan (## baÅŸlÄ±klar, **kalÄ±n**, 1. 2. 3. listeler)
6. âš ï¸ EMSAL KARARLARI: YargÄ±tay kararlarÄ±nÄ± ilgili argÃ¼manla birlikte AÃ‡IKLAMALAR bÃ¶lÃ¼mÃ¼nde kullan. "Nitekim YargÄ±tay X. HD., E. .../..., K. .../... kararÄ±nda '...' ÅŸeklinde hÃ¼kmedilmiÅŸtir" formatÄ±nda entegre et.
`;

        const response = await ai.models.generateContent({
            model,
            contents: promptText,
            config: { systemInstruction },
        });

        res.json({ text: response.text });
    } catch (error) {
        console.error('Generate Petition Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Chat Stream - Enhanced with document generation capability
app.post('/api/gemini/chat', async (req, res) => {
    try {
        const { chatHistory, analysisSummary, context, files } = req.body;
        const model = AI_CONFIG.MODEL_NAME;

        const contextPrompt = `
**MEVCUT DURUM VE BAÄLAM:**
- **Vaka Ã–zeti:** ${analysisSummary || "HenÃ¼z analiz yapÄ±lmadÄ±."}
- **Mevcut Arama Anahtar Kelimeleri:** ${context.keywords || "HenÃ¼z anahtar kelime oluÅŸturulmadÄ±."}
- **Web AraÅŸtÄ±rma Ã–zeti:** ${context.searchSummary || "HenÃ¼z web araÅŸtÄ±rmasÄ± yapÄ±lmadÄ±."}
- **KullanÄ±cÄ±nÄ±n Ek Metinleri:** ${context.docContent || "Ek metin saÄŸlanmadÄ±."}
- **KullanÄ±cÄ±nÄ±n Ã–zel TalimatlarÄ±:** ${context.specifics || "Ã–zel talimat saÄŸlanmadÄ±."}
${files && files.length > 0 ? `- **YÃ¼klenen Belgeler:** ${files.length} adet dosya yÃ¼klendi (${files.map(f => f.name).join(', ')})` : ''}
`;

        const systemInstruction = `Sen, TÃ¼rk Hukuku konusunda uzman, yardÄ±msever ve proaktif bir hukuk asistanÄ±sÄ±n.

**SENÄ°N GÃ–REVLERÄ°N:**
1. KullanÄ±cÄ±nÄ±n hukuki sorularÄ±nÄ± yanÄ±tlamak
2. Dava stratejisi konusunda beyin fÄ±rtÄ±nasÄ± yapmak
3. Hukuki terimleri aÃ§Ä±klamak
4. **BELGE ANALÄ°ZÄ°: KullanÄ±cÄ± dosya yÃ¼klediÄŸinde, bu dosyalarÄ± analiz et ve sorularÄ±nÄ± yanÄ±tla**
5. **Ã–NEMLÄ°: KullanÄ±cÄ± belge/dilekÃ§e/talep hazÄ±rlamanÄ± istediÄŸinde, generate_document fonksiyonunu kullan**
6. **KRÄ°TÄ°K: KullanÄ±cÄ± YargÄ±tay kararÄ±/emsal karar aramasÄ± istediÄŸinde, GERÃ‡EK bir Google aramasÄ± yap**

**BELGE ANALÄ°ZÄ° KURALLARI:**
KullanÄ±cÄ± dosya yÃ¼klediÄŸinde:
- PDF veya resim dosyalarÄ±nÄ± dikkatlice incele
- Ä°Ã§eriÄŸi Ã¶zetle ve anahtar bilgileri Ã§Ä±kar
- Hukuki aÃ§Ä±dan Ã¶nemli noktalarÄ± vurgula
- KullanÄ±cÄ±nÄ±n sorularÄ±nÄ± belge iÃ§eriÄŸine gÃ¶re yanÄ±tla

**YARGITAY KARARI ARAMA KURALLARI:**
KullanÄ±cÄ± ÅŸunlarÄ± sÃ¶ylediÄŸinde GERÃ‡EK bir web aramasÄ± yap:
- "YargÄ±tay kararÄ± ara", "emsal karar bul", "iÃ§tihat araÅŸtÄ±r"
- "Bu konuda YargÄ±tay ne diyor?", "YargÄ±tay kararlarÄ±nÄ± bul"
- "Karar kÃ¼nyesi ver", "emsal karar listele"

Arama yaparken:
1. Mevcut baÄŸlamdaki anahtar kelimeleri kullan
2. "site:karararama.yargitay.gov.tr" veya "YargÄ±tay" anahtar kelimesi ekle
3. Bulunan kararlarÄ±n TAM KÃœNYESÄ°NÄ° ver (Daire, Esas No, Karar No, Tarih)
4. Her karar iÃ§in kÄ±sa bir Ã¶zet yaz

**Ã‡IKTI FORMATI (YargÄ±tay AramasÄ±):**
### BULUNAN YARGITAY KARARLARI

**1. YargÄ±tay X. HD., E. XXXX/XXXX, K. XXXX/XXXX, T. XX.XX.XXXX**
Ã–zet: [Karar Ã¶zeti]
Kaynak: [URL varsa]

**2. ...**

**BELGE TALEBÄ° TESPÄ°T KURALLARI:**
KullanÄ±cÄ± ÅŸunlarÄ± sÃ¶ylediÄŸinde generate_document fonksiyonunu MUTLAKA Ã§aÄŸÄ±r:
- "... hazÄ±rla", "... oluÅŸtur", "... yaz" (dilekÃ§e, talep, itiraz vb. ile birlikte)
- "haricen tahsil talebi", "ihtarname", "feragat dilekÃ§esi" vb. belge isimleri
- "bana bir ... hazÄ±rla"
- "... iÃ§in dilekÃ§e lazÄ±m"

**BELGE TÃœRÃœ Ã–RNEKLERÄ°:**
- harici_tahsil_talebi: Haricen tahsil talebi/yazÄ±sÄ±
- ihtarname: Ä°htarname
- dava_dilekÃ§esi: Dava dilekÃ§esi
- itiraz_dilekÃ§esi: Ä°tiraz dilekÃ§esi
- feragat_dilekÃ§esi: Feragat dilekÃ§esi
- cevap_dilekÃ§esi: Cevap dilekÃ§esi
- temyiz_dilekÃ§esi: Temyiz dilekÃ§esi
- icra_takip_talebi: Ä°cra takip talebi
- genel_dilekÃ§e: Genel dilekÃ§e/belge

Ä°ÅŸte mevcut davanÄ±n baÄŸlamÄ±:
${contextPrompt}

TÃ¼rkÃ§e yanÄ±t ver. YargÄ±tay kararÄ± aranmasÄ± istendiÄŸinde Google Search ile GERÃ‡EK arama yap ve kÃ¼nyeli sonuÃ§lar sun.`;

        // Function for updating keywords
        const updateKeywordsFunction = {
            name: 'update_search_keywords',
            description: 'KullanÄ±cÄ± anahtar kelime eklenmesini istediÄŸinde bu fonksiyonu kullan.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    keywordsToAdd: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Eklenecek anahtar kelimeler listesi'
                    },
                },
                required: ['keywordsToAdd'],
            },
        };

        // Function for generating documents directly in chat
        const generateDocumentFunction = {
            name: 'generate_document',
            description: 'KullanÄ±cÄ± bir belge, dilekÃ§e veya resmi yazÄ± hazÄ±rlanmasÄ±nÄ± istediÄŸinde bu fonksiyonu kullan. Ã–rnek: "harici tahsil talebi hazÄ±rla", "ihtarname yaz", "feragat dilekÃ§esi oluÅŸtur".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    documentType: {
                        type: Type.STRING,
                        description: 'Belge tÃ¼rÃ¼: harici_tahsil_talebi, ihtarname, dava_dilekÃ§esi, itiraz_dilekÃ§esi, feragat_dilekÃ§esi, cevap_dilekÃ§esi, temyiz_dilekÃ§esi, icra_takip_talebi, genel_dilekÃ§e'
                    },
                    documentTitle: {
                        type: Type.STRING,
                        description: 'Belgenin baÅŸlÄ±ÄŸÄ± (Ã¶rn: "HARÄ°CEN TAHSÄ°L TALEBÄ°", "Ä°HTARNAME")'
                    },
                    documentContent: {
                        type: Type.STRING,
                        description: 'Belgenin tam iÃ§eriÄŸi - TÃ¼rk hukuk formatÄ±na uygun, markdown formatÄ±nda, bÃ¶lÃ¼mlere ayrÄ±lmÄ±ÅŸ. Mevcut baÄŸlam bilgilerini kullan.'
                    }
                },
                required: ['documentType', 'documentTitle', 'documentContent'],
            },
        };
        // Function for searching YargÄ±tay decisions
        const searchYargitayFunction = {
            name: 'search_yargitay',
            description: 'KullanÄ±cÄ± YargÄ±tay kararÄ± aramasÄ± istediÄŸinde bu fonksiyonu kullan. Ã–rnek: "YargÄ±tay kararÄ± ara", "emsal karar bul", "iÃ§tihat araÅŸtÄ±r".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    searchQuery: {
                        type: Type.STRING,
                        description: 'Aranacak konu. Mevcut baÄŸlamdaki anahtar kelimeleri ve konuyu iÃ§ermeli.'
                    },
                    keywords: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Arama iÃ§in kullanÄ±lacak anahtar kelimeler listesi'
                    }
                },
                required: ['searchQuery'],
            },
        };

        // Build contents array - include files if provided
        const contents = chatHistory.map(msg => {
            const parts = [{ text: msg.text }];

            // If this message has files attached, add them as inline data
            if (msg.files && msg.files.length > 0) {
                msg.files.forEach(file => {
                    parts.push({
                        inlineData: {
                            mimeType: file.mimeType,
                            data: file.data
                        }
                    });
                });
            }

            return {
                role: msg.role === 'user' ? 'user' : 'model',
                parts: parts
            };
        });

        // Also add files from request body to the last user message if present
        if (files && files.length > 0 && contents.length > 0) {
            const lastUserMsgIndex = contents.length - 1;
            if (contents[lastUserMsgIndex].role === 'user') {
                files.forEach(file => {
                    contents[lastUserMsgIndex].parts.push({
                        inlineData: {
                            mimeType: file.mimeType,
                            data: file.data
                        }
                    });
                });
            }
        }

        const responseStream = await ai.models.generateContentStream({
            model,
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                tools: [{ functionDeclarations: [updateKeywordsFunction, generateDocumentFunction, searchYargitayFunction] }],
            },
        });

        // Setup streaming response
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        let pendingFunctionCalls = [];

        for await (const chunk of responseStream) {
            // Check for function calls
            const candidate = chunk.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.functionCall && part.functionCall.name === 'search_yargitay') {
                        pendingFunctionCalls.push(part.functionCall);
                    }
                }
            }

            // Send chunk as JSON string to handle both text and function calls
            const data = JSON.stringify(chunk);
            res.write(data + '\n'); // Newline delimited JSON
        }

        // If there were search_yargitay function calls, execute them and send results
        if (pendingFunctionCalls.length > 0) {
            for (const fc of pendingFunctionCalls) {
                try {
                    const searchQuery = fc.args?.searchQuery || fc.args?.keywords?.join(' ') || '';
                    console.log(`ğŸ” AI requesting legal search: "${searchQuery}"`);

                    // Execute the legal search using existing function
                    const searchResult = await searchEmsalFallback(searchQuery);

                    // Format results for the AI
                    let formattedResults = '\n\n### ğŸ“š BULUNAN YARGITAY KARARLARI\n\n';
                    if (searchResult.results && searchResult.results.length > 0) {
                        searchResult.results.forEach((result, index) => {
                            formattedResults += `**${index + 1}. ${result.title || 'YargÄ±tay KararÄ±'}**\n`;
                            if (result.esasNo) formattedResults += `E. ${result.esasNo} `;
                            if (result.kararNo) formattedResults += `K. ${result.kararNo} `;
                            if (result.tarih) formattedResults += `T. ${result.tarih}`;
                            formattedResults += '\n';
                            if (result.ozet) formattedResults += `Ã–zet: ${result.ozet}\n`;
                            formattedResults += '\n';
                        });
                    } else {
                        formattedResults += 'Bu konuda emsal karar bulunamadÄ±.\n';
                    }

                    // Send search results as additional chunk
                    const resultChunk = {
                        text: formattedResults,
                        functionCallResults: true,
                        searchResults: searchResult.results || []
                    };
                    res.write(JSON.stringify(resultChunk) + '\n');

                } catch (searchError) {
                    console.error('Legal search error in chat:', searchError);
                    const errorChunk = { text: '\n\nâš ï¸ Emsal karar aramasÄ± sÄ±rasÄ±nda bir hata oluÅŸtu.\n' };
                    res.write(JSON.stringify(errorChunk) + '\n');
                }
            }
        }

        res.end();

    } catch (error) {
        console.error('Chat Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            res.end();
        }
    }
});

// 8. HTML to DOCX
app.post('/api/html-to-docx', async (req, res) => {
    try {
        const { html, options } = req.body;
        if (!html) return res.status(400).json({ error: 'HTML content is required' });

        const documentOptions = {
            ...options,
            table: { row: { cantSplit: true } },
            footer: true,
            pageNumber: true,
        };

        const fileBuffer = await htmlToDocx(html, null, documentOptions);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename=dilekce.docx');
        res.send(fileBuffer);
    } catch (error) {
        console.error('DOCX Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. Rewrite Text
app.post('/api/gemini/rewrite', async (req, res) => {
    try {
        const { textToRewrite } = req.body;
        const model = AI_CONFIG.MODEL_NAME;
        const systemInstruction = `Sen bir TÃ¼rk hukuk metni editÃ¶rÃ¼sÃ¼n...`;
        const promptText = `LÃ¼tfen aÅŸaÄŸÄ±daki metni yeniden yaz:\n\n"${textToRewrite}"`;

        const response = await ai.models.generateContent({
            model,
            contents: promptText,
            config: { systemInstruction },
        });
        res.json({ text: response.text.trim() });
    } catch (error) {
        console.error('Rewrite Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 7. Review Petition
app.post('/api/gemini/review', async (req, res) => {
    try {
        const params = req.body;
        const model = AI_CONFIG.MODEL_NAME;
        const systemInstruction = `You are a senior Turkish legal editor...`;

        const promptText = `
**GÃ–REV: AÅAÄIDAKÄ° MEVCUT DÄ°LEKÃ‡E TASLAÄINI, SAÄLANAN BAÄLAM BÄ°LGÄ°LERÄ°NÄ° KULLANARAK GÃ–ZDEN GEÃ‡Ä°R VE Ä°YÄ°LEÅTÄ°R.**

**1. Ä°YÄ°LEÅTÄ°RÄ°LECEK MEVCUT DÄ°LEKÃ‡E TASLAÄI:**
---
${params.currentPetition}
---

**2. DÄ°LEKÃ‡ENÄ°N HAZIRLANMASINDA KULLANILAN ORÄ°JÄ°NAL BAÄLAM BÄ°LGÄ°LERÄ°:**
- **KULLANICININ ROLÃœ:** ${params.userRole}
- **DÄ°LEKÃ‡E TÃœRÃœ:** ${params.petitionType}
- **DAVA KÃœNYESÄ°:** ${formatCaseDetailsForPrompt(params.caseDetails)}
- **VEKÄ°L BÄ°LGÄ°LERÄ°:** ${formatLawyerInfoForPrompt(params.lawyerInfo)}
- **Ä°LETÄ°ÅÄ°M BÄ°LGÄ°LERÄ°:** ${formatContactInfoForPrompt(params.contactInfo)}
- **OLAYIN Ã–ZETÄ°:** ${params.analysisSummary}
- **TARAFLAR:** ${formatPartiesForPrompt(params.parties)}
- **Ä°LGÄ°LÄ° HUKUKÄ° ARAÅTIRMA:** ${params.webSearchResult}
- **EK METÄ°N VE NOTLAR:** ${params.docContent}
- **Ã–ZEL TALÄ°MATLAR:** ${params.specifics}
- **Ã–NCEKÄ° SOHBET GEÃ‡MÄ°ÅÄ°:** ${formatChatHistoryForPrompt(params.chatHistory)}

**Ä°YÄ°LEÅTÄ°RÄ°LMÄ°Å NÄ°HAÄ° DÄ°LEKÃ‡E METNÄ°:**
[Buraya, yukarÄ±daki taslaÄŸÄ± tÃ¼m baÄŸlamÄ± dikkate alarak daha gÃ¼Ã§lÃ¼, ikna edici ve hukuken saÄŸlam hale getirilmiÅŸ tam dilekÃ§e metnini yaz.]
`;

        const response = await ai.models.generateContent({
            model,
            contents: promptText,
            config: { systemInstruction },
        });

        res.json({ text: response.text.trim() });
    } catch (error) {
        console.error('Review Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// HTML to DOCX conversion endpoint (Existing)
app.post('/api/html-to-docx', async (req, res) => {
    try {
        const { html, options } = req.body;

        if (!html) {
            return res.status(400).json({ error: 'HTML content is required' });
        }

        // Generate DOCX
        const fileBuffer = await htmlToDocx(html, null, {
            font: options?.font || 'Calibri',
            fontSize: options?.fontSize || '22',
            ...options
        });

        // Send as downloadable file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename="dilekce.docx"');
        res.send(Buffer.from(fileBuffer));
    } catch (error) {
        console.error('Error generating DOCX:', error);
        res.status(500).json({ error: 'Failed to generate DOCX file' });
    }
});

// ============================================
// YARGI MCP - LEGAL DECISION SEARCH ENDPOINTS
// ============================================

// Direct API endpoints (Bedesten)
const BEDESTEN_BASE_URL = 'https://bedesten.adalet.gov.tr';
const BEDESTEN_SEARCH_URL = `${BEDESTEN_BASE_URL}/emsal-karar/searchDocuments`;
const BEDESTEN_DOCUMENT_URL = `${BEDESTEN_BASE_URL}/emsal-karar/getDocumentContent`;

const stripHtmlToText = (html = '') => {
    if (!html || typeof html !== 'string') return '';
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|tr|li|h1|h2|h3|h4|h5|h6)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
};

const maybeExtractJson = (text = '') => {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        // ignore
    }

    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        try {
            return JSON.parse(arrayMatch[0]);
        } catch {
            // ignore
        }
    }

    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        try {
            return JSON.parse(objectMatch[0]);
        } catch {
            // ignore
        }
    }

    return null;
};

const getBedestenHeaders = () => ({
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'tr,en-US;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Content-Type': 'application/json',
    'Origin': 'https://emsal.yargitay.gov.tr',
    'Pragma': 'no-cache',
    'Referer': 'https://emsal.yargitay.gov.tr/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
});

const getBedestenItemTypeList = (source) => {
    const normalized = (source || '').toLowerCase();
    switch (normalized) {
        case 'yargitay':
            return ['YARGITAYKARARI'];
        case 'danistay':
            return ['DANISTAYKARAR'];
        case 'uyap':
            return ['YERELHUKUK', 'YERELCEZA', 'BOLGEIDARE', 'BOLGEADLIYE'];
        case 'anayasa':
            return ['ANAYASAMAHKEMESI'];
        default:
            return ['YARGITAYKARARI', 'DANISTAYKARAR', 'YERELHUKUK', 'YERELCEZA', 'BOLGEIDARE', 'BOLGEADLIYE', 'ANAYASAMAHKEMESI'];
    }
};

const toBedestenFormattedDecision = (item, index) => {
    const safeItem = item || {};
    const esasNo = safeItem.esasNo || (safeItem.esasYili && safeItem.esasSiraNo ? `${safeItem.esasYili}/${safeItem.esasSiraNo}` : '');
    const kararNo = safeItem.kararNo || (safeItem.kararYili && safeItem.kararSiraNo ? `${safeItem.kararYili}/${safeItem.kararSiraNo}` : '');
    const daire = safeItem.birimAdi || safeItem.birim || '';
    const mahkeme = safeItem.itemType?.description || safeItem.mahkeme || '';
    const title = `${mahkeme} ${daire}`.trim() || safeItem.title || `Karar ${index + 1}`;
    const ozet = safeItem.ozet || safeItem.kararOzeti || safeItem.summary || '';
    const score = Number(safeItem.relevanceScore ?? safeItem.score);

    return {
        id: safeItem.documentId || safeItem.id || `bedesten-${index + 1}`,
        documentId: safeItem.documentId || safeItem.id || '',
        title,
        esasNo,
        kararNo,
        tarih: safeItem.kararTarihiStr || safeItem.kararTarihi || safeItem.tarih || '',
        daire,
        ozet,
        relevanceScore: Number.isFinite(score) ? score : undefined,
    };
};

async function searchBedestenAPI(keyword, source, filters = {}) {
    const pageNumber = Math.max(1, Number(filters.pageNumber) || 1);
    const pageSize = Math.min(50, Math.max(10, Number(filters.pageSize) || 20));

    const payload = {
        data: {
            pageSize,
            pageNumber,
            itemTypeList: getBedestenItemTypeList(source),
            phrase: keyword,
            birimAdi: (typeof filters.birimAdi === 'string' && filters.birimAdi.trim()) ? filters.birimAdi.trim() : 'ALL',
            kararTarihiStart: filters.kararTarihiStart || null,
            kararTarihiEnd: filters.kararTarihiEnd || null,
            sortFields: Array.isArray(filters.sortFields) && filters.sortFields.length > 0 ? filters.sortFields : ['KARAR_TARIHI'],
            sortDirection: (filters.sortDirection || 'DESC').toString().toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
        },
        applicationName: 'UyapMevzuat',
        paging: true,
    };

    const response = await fetch(BEDESTEN_SEARCH_URL, {
        method: 'POST',
        headers: getBedestenHeaders(),
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Bedesten search failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const rawListCandidates = [
        data?.data?.emsalKararList,
        data?.emsalKararList,
        data?.results,
    ];
    const rawList = rawListCandidates.find(Array.isArray) || [];

    return rawList.map((item, index) => toBedestenFormattedDecision(item, index));
}

async function extractPdfTextWithGemini(base64Data, documentId = '') {
    try {
        const response = await ai.models.generateContent({
            model: AI_CONFIG.MODEL_NAME,
            contents: {
                parts: [
                    {
                        text: `Aşağıdaki hukuk karar PDF içeriğini düz metin olarak çıkar.\nKurallar:\n- Link veya açıklama ekleme.\n- Kararın görülen metnini mümkün olduğunca eksiksiz döndür.\n- Metni Türkçe karakterleri koruyarak yaz.\nBelge Kimliği: ${documentId || 'bilinmiyor'}`
                    },
                    {
                        inlineData: {
                            mimeType: 'application/pdf',
                            data: base64Data,
                        }
                    }
                ]
            },
            config: {
                temperature: 0.1,
            },
        });

        return (response.text || '').trim();
    } catch (error) {
        console.error('PDF text extraction error:', error);
        return '';
    }
}

async function getBedestenDocumentContent(documentId) {
    const payload = {
        data: { documentId },
        applicationName: 'UyapMevzuat',
    };

    const response = await fetch(BEDESTEN_DOCUMENT_URL, {
        method: 'POST',
        headers: getBedestenHeaders(),
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Bedesten document fetch failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const container = data?.data || data || {};
    const encodedContent = container.content || container.documentContent || container.base64Content || '';
    const mimeType = (container.mimeType || container.contentType || 'text/html').toString();

    if (!encodedContent || typeof encodedContent !== 'string') {
        return {
            content: '',
            mimeType,
            raw: container,
        };
    }

    let content = '';

    try {
        if (mimeType.toLowerCase().includes('pdf')) {
            content = await extractPdfTextWithGemini(encodedContent, documentId);
        } else {
            const decoded = Buffer.from(encodedContent, 'base64').toString('utf-8');
            content = mimeType.toLowerCase().includes('html')
                ? stripHtmlToText(decoded)
                : decoded.trim();
        }
    } catch (error) {
        console.error('Document decode error:', error);
    }

    return {
        content: content || '',
        mimeType,
        raw: container,
    };
}
// Fallback: Use Gemini + Google Search for legal decisions
async function searchEmsalFallback(keyword) {
    try {
        const response = await ai.models.generateContent({
            model: AI_CONFIG.MODEL_NAME,
            contents: `Türkiye'de "${keyword}" konusunda emsal Yargıtay ve Danıştay kararları bul.

Her karar için şu alanları üret:
- mahkeme
- daire
- esasNo
- kararNo
- tarih
- ozet (en fazla 2-3 cümle)
- sourceUrl (resmi karar arama linki varsa)
- relevanceScore (0-100)

Sadece JSON array döndür:
[{"mahkeme":"...","daire":"...","esasNo":"...","kararNo":"...","tarih":"...","ozet":"...","sourceUrl":"https://...","relevanceScore":85}]`,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        const text = response.text || '';
        const parsed = maybeExtractJson(text);
        const rows = Array.isArray(parsed) ? parsed : [];

        if (rows.length > 0) {
            return {
                success: true,
                results: rows.map((r, i) => ({
                    id: `search-${i}`,
                    documentId: `search-${i}`,
                    title: `${r.mahkeme || 'Yargitay'} ${r.daire || ''}`.trim(),
                    esasNo: r.esasNo || r.esas_no || '',
                    kararNo: r.kararNo || r.karar_no || '',
                    tarih: r.tarih || r.date || '',
                    daire: r.daire || '',
                    ozet: r.ozet || r.snippet || '',
                    sourceUrl: r.sourceUrl || r.url || '',
                    relevanceScore: Number(r.relevanceScore) || Math.max(0, 100 - (i * 8)),
                })).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
            };
        }

        return {
            success: true,
            results: [{
                id: 'ai-summary',
                documentId: 'ai-summary',
                title: 'AI Arama Sonucu',
                ozet: text.substring(0, 500),
            }]
        };
    } catch (error) {
        console.error('Fallback search error:', error);
        throw error;
    }
}

async function getDocumentViaAIFallback({ keyword = '', documentId = '', documentUrl = '', title = '', esasNo = '', kararNo = '', tarih = '', daire = '', ozet = '' }) {
    const queryParts = [
        keyword,
        title,
        daire,
        esasNo ? `E. ${esasNo}` : '',
        kararNo ? `K. ${kararNo}` : '',
        tarih ? `T. ${tarih}` : '',
        ozet,
        documentId,
        documentUrl,
    ].filter(Boolean);

    const query = queryParts.join(' ').trim();
    if (!query) return '';

    try {
        const response = await ai.models.generateContent({
            model: AI_CONFIG.MODEL_NAME,
            contents: `Aşağıdaki karar künyesine ait karar METNİNİ resmi kaynaklardan bul:
${query}

Kurallar:
- Cevapta URL/link verme.
- Giriş/yorum ekleme.
- Sadece karar metnini düz yazı olarak döndür.
- Tam metin bulunamazsa, bulunabilen en detaylı metni döndür.`,
            config: {
                tools: [{ googleSearch: {} }],
                temperature: 0.1,
            }
        });

        const text = (response.text || '').replace(/https?:\/\/\S+/gi, '').trim();
        return text;
    } catch (error) {
        console.error('AI document fallback error:', error);
        return '';
    }
}
// Search legal decisions endpoint
app.post('/api/legal/search-decisions', authMiddleware, async (req, res) => {
    try {
        const { source, keyword, filters = {} } = req.body;

        if (!keyword) {
            return res.status(400).json({ error: 'Arama kelimesi (keyword) gereklidir.' });
        }

        console.log(`ğŸ“š Legal Search: "${keyword}" (source: ${source || 'all'})`);

        let results = [];
        let provider = 'bedesten';

        try {
            // Try Bedesten first for real decision ids + detail retrieval support
            results = await searchBedestenAPI(keyword, source, filters);
        } catch (bedestenError) {
            provider = 'ai-fallback';
            console.error('Bedesten search failed, switching to AI fallback:', bedestenError);
        }

        if (!Array.isArray(results) || results.length === 0) {
            provider = 'ai-fallback';
            const fallback = await searchEmsalFallback(keyword);
            results = fallback.results || [];
        }

        res.json({
            success: true,
            source: source || 'all',
            keyword,
            provider,
            results
        });

    } catch (error) {
        console.error('Legal Search Error:', error);
        res.status(500).json({
            error: 'Ä°Ã§tihat arama sÄ±rasÄ±nda bir hata oluÅŸtu.',
            details: error.message
        });
    }
});

// Get specific legal document endpoint
app.post('/api/legal/get-document', authMiddleware, async (req, res) => {
    try {
        const { source, documentId, documentUrl, title, esasNo, kararNo, tarih, daire, ozet, snippet } = req.body;

        if (!documentId && !documentUrl) {
            return res.status(400).json({ error: 'documentId veya documentUrl gereklidir.' });
        }

        console.log(`ğŸ“„ Get Document: ${documentId || documentUrl}`);

        let content = '';
        let provider = 'bedesten';
        let mimeType = 'text/plain';

        // If search came from Bedesten, documentId can directly fetch full content.
        const looksLikeFallbackId = typeof documentId === 'string' && (documentId.startsWith('search-') || documentId === 'ai-summary');

        if (documentId && !looksLikeFallbackId) {
            try {
                const bedestenDocument = await getBedestenDocumentContent(documentId);
                content = bedestenDocument.content || '';
                mimeType = bedestenDocument.mimeType || mimeType;
            } catch (bedestenError) {
                provider = 'ai-fallback';
                console.error('Bedesten get-document failed, switching to AI fallback:', bedestenError);
            }
        } else {
            provider = 'ai-fallback';
        }

        if (!content || content.trim().length < 120) {
            provider = 'ai-fallback';
            content = await getDocumentViaAIFallback({
                keyword: [title, daire, esasNo, kararNo, tarih].filter(Boolean).join(' '),
                documentId,
                documentUrl,
                title,
                esasNo,
                kararNo,
                tarih,
                daire,
                ozet: [ozet, snippet].filter(Boolean).join(' '),
            });
        }

        if (!content || content.trim().length === 0) {
            content = 'Karar metni getirilemedi. Lütfen farklı bir karar seçip tekrar deneyin.';
        }

        res.json({
            success: true,
            source,
            provider,
            document: {
                content,
                mimeType,
                documentId: documentId || '',
                documentUrl: documentUrl || '',
            }
        });

    } catch (error) {
        console.error('Get Document Error:', error);
        res.status(500).json({
            error: 'Belge alÄ±nÄ±rken bir hata oluÅŸtu.',
            details: error.message
        });
    }
});

// List available legal sources
app.get('/api/legal/sources', (req, res) => {
    res.json({
        sources: [
            { id: 'yargitay', name: 'YargÄ±tay', description: 'YargÄ±tay KararlarÄ± (Bedesten API)' },
            { id: 'danistay', name: 'DanÄ±ÅŸtay', description: 'DanÄ±ÅŸtay KararlarÄ± (Bedesten API)' },
            { id: 'uyap', name: 'Emsal (UYAP)', description: 'Emsal Kararlar (UYAP Sistemi)' },
            { id: 'anayasa', name: 'Anayasa Mahkemesi', description: 'AYM Norm Denetimi ve Bireysel BaÅŸvuru' },
            { id: 'kik', name: 'Kamu Ä°hale Kurulu', description: 'KÄ°K KararlarÄ±' },
        ]
    });
});

// ============================================
// TEMPLATE GALLERY ENDPOINTS
// ============================================

// In-memory template data (can be moved to database later)
const TEMPLATES = [
    {
        id: '1',
        category: 'Hukuk',
        subcategory: 'Aile Hukuku',
        title: 'BoÅŸanma DavasÄ± DilekÃ§esi',
        description: 'AnlaÅŸmalÄ± veya Ã§ekiÅŸmeli boÅŸanma davalarÄ± iÃ§in temel dilekÃ§e ÅŸablonu',
        icon: 'HeartCrack',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme AdÄ±', type: 'text', placeholder: 'Ã–rn: Ä°stanbul Anadolu 5. Aile Mahkemesi', required: true },
            { key: 'DAVACI_AD', label: 'DavacÄ± AdÄ± SoyadÄ±', type: 'text', placeholder: 'Ã–rn: AyÅŸe YILMAZ', required: true },
            { key: 'DAVACI_TC', label: 'DavacÄ± TC Kimlik No', type: 'text', placeholder: 'Ã–rn: 12345678901', required: true },
            { key: 'DAVACI_ADRES', label: 'DavacÄ± Adresi', type: 'textarea', placeholder: 'Ã–rn: AtatÃ¼rk Mah. Cumhuriyet Cad. No:15/3 KadÄ±kÃ¶y/Ä°stanbul' },
            { key: 'DAVACI_VEKIL_AD', label: 'DavacÄ± Vekili (Avukat)', type: 'text', placeholder: 'Ã–rn: Av. Mehmet KAYA' },
            { key: 'DAVACI_VEKIL_BARO', label: 'Baro Sicil No', type: 'text', placeholder: 'Ã–rn: Ä°stanbul Barosu 54321' },
            { key: 'DAVALI_AD', label: 'DavalÄ± AdÄ± SoyadÄ±', type: 'text', placeholder: 'Ã–rn: Ali YILMAZ', required: true },
            { key: 'DAVALI_TC', label: 'DavalÄ± TC Kimlik No', type: 'text', placeholder: 'Ã–rn: 98765432109' },
            { key: 'DAVALI_ADRES', label: 'DavalÄ± Adresi', type: 'textarea', placeholder: 'Ã–rn: BahÃ§elievler Mah. Ä°nÃ¶nÃ¼ Sok. No:7 BakÄ±rkÃ¶y/Ä°stanbul' },
            { key: 'EVLILIK_TARIHI', label: 'Evlilik Tarihi', type: 'date', required: true },
            { key: 'EVLILIK_YERI', label: 'Evlenme Yeri', type: 'text', placeholder: 'Ã–rn: KadÄ±kÃ¶y Evlendirme Dairesi' },
            { key: 'COCUK_BILGI', label: 'MÃ¼ÅŸterek Ã‡ocuk Bilgileri (varsa)', type: 'textarea', placeholder: 'Ã–rn: 1. Zeynep YILMAZ (D: 01.01.2015, TC: 11122233344)' },
            { key: 'BOSANMA_SEBEPLERI', label: 'BoÅŸanma Sebepleri', type: 'textarea', placeholder: 'Åiddetli geÃ§imsizlik, evlilik birliÄŸinin temelinden sarsÄ±lmasÄ±...', required: true },
            { key: 'NAFAKA_TALEP', label: 'Nafaka Talebi (TL/ay)', type: 'number', placeholder: 'Ã–rn: 5000' },
            { key: 'VELAYET_TALEP', label: 'Velayet Talebi', type: 'text', placeholder: 'Ã–rn: MÃ¼ÅŸterek Ã§ocuklarÄ±n velayetinin davacÄ± anneye verilmesi' },
        ],
        content: `{{MAHKEME}} BAÅKANLIÄINA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}

**VEKÄ°LÄ°:** {{DAVACI_VEKIL_AD}}
{{DAVACI_VEKIL_BARO}}

**DAVALI:** {{DAVALI_AD}}
TC Kimlik No: {{DAVALI_TC}}
Adres: {{DAVALI_ADRES}}

**KONU:** BoÅŸanma davasÄ± hakkÄ±ndadÄ±r.

---

**AÃ‡IKLAMALAR:**

1. MÃ¼vekkilim ile davalÄ± {{EVLILIK_TARIHI}} tarihinde {{EVLILIK_YERI}}'de evlenmiÅŸlerdir.

2. TaraflarÄ±n bu evlilikten doÄŸan mÃ¼ÅŸterek Ã§ocuklarÄ±:
{{COCUK_BILGI}}

3. {{BOSANMA_SEBEPLERI}}

4. Evlilik birliÄŸinin temelinden sarsÄ±lmasÄ± nedeniyle taraflar arasÄ±ndaki evliliÄŸin devamÄ± mÃ¼mkÃ¼n deÄŸildir. Ortak hayatÄ±n yeniden kurulmasÄ± ihtimali bulunmamaktadÄ±r.

---

**HUKUKÄ° SEBEPLER:**

- 4721 sayÄ±lÄ± TÃ¼rk Medeni Kanunu m.166 (Evlilik birliÄŸinin sarsÄ±lmasÄ±)
- 4721 sayÄ±lÄ± TÃ¼rk Medeni Kanunu m.169 (BoÅŸanmada velayet)
- 4721 sayÄ±lÄ± TÃ¼rk Medeni Kanunu m.175 (Yoksulluk nafakasÄ±)
- 4721 sayÄ±lÄ± TÃ¼rk Medeni Kanunu m.182 (Ã‡ocuk nafakasÄ±)

---

**DELÄ°LLER:**

1. NÃ¼fus kayÄ±t Ã¶rneÄŸi
2. VukuatlÄ± nÃ¼fus kayÄ±t Ã¶rneÄŸi
3. Evlilik cÃ¼zdanÄ± sureti
4. TanÄ±k beyanlarÄ±
5. Ekonomik durum araÅŸtÄ±rmasÄ±
6. Her tÃ¼rlÃ¼ yasal delil

---

**SONUÃ‡ VE Ä°STEM:**

YukarÄ±da arz ve izah edilen sebeplerle;

1. TaraflarÄ±n TMK m.166 uyarÄ±nca BOÅANMALARINA,
2. MÃ¼ÅŸterek Ã§ocuklarÄ±n velayetinin davacÄ± tarafa verilmesine ({{VELAYET_TALEP}}),
3. DavalÄ±nÄ±n aylÄ±k {{NAFAKA_TALEP}} TL iÅŸtirak nafakasÄ± Ã¶demesine,
4. YargÄ±lama giderlerinin davalÄ±ya yÃ¼kletilmesine,

karar verilmesini vekaleten saygÄ±larÄ±mla arz ve talep ederim. {{TARIH}}

DavacÄ± Vekili
{{DAVACI_VEKIL_AD}}
`,
        isPremium: false,
        usageCount: 156
    },
    {
        id: '2',
        category: 'Hukuk',
        subcategory: 'BorÃ§lar Hukuku',
        title: 'Tazminat DavasÄ± DilekÃ§esi',
        description: 'Maddi ve manevi tazminat talepli dava dilekÃ§esi',
        icon: 'Banknote',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme AdÄ±', type: 'text', placeholder: 'Asliye Hukuk Mahkemesi' },
            { key: 'DAVACI_AD', label: 'DavacÄ± AdÄ± SoyadÄ±', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'DavacÄ± TC No', type: 'text', required: true },
            { key: 'DAVALI_AD', label: 'DavalÄ±/Kurum AdÄ±', type: 'text', required: true },
            { key: 'OLAY_TARIHI', label: 'Olay Tarihi', type: 'date', required: true },
            { key: 'OLAY_ACIKLAMASI', label: 'OlayÄ±n AÃ§Ä±klamasÄ±', type: 'textarea', required: true },
            { key: 'MADDI_TAZMINAT', label: 'Maddi Tazminat TutarÄ± (TL)', type: 'number' },
            { key: 'MANEVI_TAZMINAT', label: 'Manevi Tazminat TutarÄ± (TL)', type: 'number' },
        ],
        content: `{{MAHKEME}} BAÅKANLIÄINA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}

**DAVALI:** {{DAVALI_AD}}

**KONU:** Maddi ve manevi tazminat talepli dava dilekÃ§esidir.

**DAVA DEÄERÄ°:** {{MADDI_TAZMINAT}} TL (Maddi) + {{MANEVI_TAZMINAT}} TL (Manevi)

---

**AÃ‡IKLAMALAR:**

1. {{OLAY_TARIHI}} tarihinde aÅŸaÄŸÄ±da aÃ§Ä±klanan olay meydana gelmiÅŸtir.

2. {{OLAY_ACIKLAMASI}}

3. Bu olay nedeniyle mÃ¼vekkilim maddi ve manevi zarara uÄŸramÄ±ÅŸtÄ±r. ZararÄ±n tazmini iÃ§in iÅŸbu dava aÃ§Ä±lmÄ±ÅŸtÄ±r.

---

**HUKUKÄ° SEBEPLER:**

- 6098 sayÄ±lÄ± TÃ¼rk BorÃ§lar Kanunu m.49-76 (HaksÄ±z fiil)
- 6098 sayÄ±lÄ± TÃ¼rk BorÃ§lar Kanunu m.56 (Manevi tazminat)

---

**DELÄ°LLER:**

1. Olay tutanaklarÄ±
2. Fatura ve belgeler
3. TanÄ±k beyanlarÄ±
4. BilirkiÅŸi incelemesi
5. Her tÃ¼rlÃ¼ yasal delil

---

**SONUÃ‡ VE Ä°STEM:**

1. {{MADDI_TAZMINAT}} TL MADDÄ° TAZMÄ°NATIN olay tarihinden itibaren iÅŸleyecek yasal faiziyle birlikte davalÄ±dan tahsiline,
2. {{MANEVI_TAZMINAT}} TL MANEVÄ° TAZMÄ°NATIN davalÄ±dan tahsiline,
3. YargÄ±lama giderlerinin davalÄ±ya yÃ¼kletilmesine,

karar verilmesini saygÄ±larÄ±mla arz ve talep ederim. {{TARIH}}

DavacÄ±
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 203
    },
    {
        id: '3',
        category: 'Ä°cra',
        subcategory: 'Ä°cra Takibi',
        title: 'Ä°cra Takibine Ä°tiraz DilekÃ§esi',
        description: 'HaksÄ±z icra takibine karÅŸÄ± itiraz dilekÃ§esi',
        icon: 'Gavel',
        variables: [
            { key: 'ICRA_MUDURLUGU', label: 'Ä°cra MÃ¼dÃ¼rlÃ¼ÄŸÃ¼', type: 'text', required: true },
            { key: 'DOSYA_NO', label: 'Ä°cra Dosya No', type: 'text', required: true },
            { key: 'BORCLU_AD', label: 'BorÃ§lu AdÄ± SoyadÄ±', type: 'text', required: true },
            { key: 'ALACAKLI_AD', label: 'AlacaklÄ± AdÄ±', type: 'text', required: true },
            { key: 'ITIRAZ_SEBEPLERI', label: 'Ä°tiraz Sebepleri', type: 'textarea', required: true },
        ],
        content: `## {{ICRA_MUDURLUGU}}'NE

**DOSYA NO:** {{DOSYA_NO}}

**BORÃ‡LU (Ä°TÄ°RAZ EDEN):** {{BORCLU_AD}}

**ALACAKLI:** {{ALACAKLI_AD}}

**KONU:** Ã–deme emrine itirazÄ±mÄ±z hakkÄ±ndadÄ±r.

---

## AÃ‡IKLAMALAR

1. MÃ¼dÃ¼rlÃ¼ÄŸÃ¼nÃ¼zce yÃ¼rÃ¼tÃ¼len {{DOSYA_NO}} sayÄ±lÄ± icra takip dosyasÄ±nda tarafÄ±ma Ã¶deme emri tebliÄŸ edilmiÅŸtir.

2. {{ITIRAZ_SEBEPLERI}}

3. YukarÄ±da aÃ§Ä±klanan nedenlerle sÃ¶z konusu borca itiraz etme zorunluluÄŸu doÄŸmuÅŸtur.

---

## HUKUKÄ° SEBEPLER

- 2004 sayÄ±lÄ± Ä°cra ve Ä°flas Kanunu m.62 (Ä°tiraz)
- 2004 sayÄ±lÄ± Ä°cra ve Ä°flas Kanunu m.66 (Ä°tirazÄ±n hÃ¼kÃ¼mleri)

---

## SONUÃ‡ VE Ä°STEM

YukarÄ±da aÃ§Ä±klanan sebeplerle;

1. BORCA Ä°TÄ°RAZ EDÄ°YORUM,
2. Takibin durdurulmasÄ±na,

karar verilmesini arz ve talep ederim.

{{TARIH}}
{{BORCLU_AD}}
`,
        isPremium: false,
        usageCount: 312
    },
    {
        id: '4',
        category: 'Hukuk',
        subcategory: 'Kira Hukuku',
        title: 'Kira Tahliye DavasÄ± DilekÃ§esi',
        description: 'KiracÄ±nÄ±n tahliyesi iÃ§in dava dilekÃ§esi',
        icon: 'Home',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme AdÄ±', type: 'text', placeholder: 'Sulh Hukuk Mahkemesi' },
            { key: 'KIRAYA_VEREN', label: 'Kiraya Veren AdÄ±', type: 'text', required: true },
            { key: 'KIRACI', label: 'KiracÄ± AdÄ±', type: 'text', required: true },
            { key: 'TASINMAZ_ADRES', label: 'TaÅŸÄ±nmaz Adresi', type: 'textarea', required: true },
            { key: 'KIRA_BEDELI', label: 'AylÄ±k Kira Bedeli', type: 'number' },
            { key: 'TAHLIYE_SEBEBI', label: 'Tahliye Sebebi', type: 'textarea', required: true },
        ],
        content: `## {{MAHKEME}} BAÅKANLIÄINA

**DAVACI (KÄ°RAYA VEREN):** {{KIRAYA_VEREN}}

**DAVALI (KÄ°RACI):** {{KIRACI}}

**KONU:** KiralananÄ±n tahliyesi talebimiz hakkÄ±ndadÄ±r.

---

## AÃ‡IKLAMALAR

1. DavalÄ±, aÅŸaÄŸÄ±da adresi belirtilen taÅŸÄ±nmazda kiracÄ± olarak ikamet etmektedir:
   **Adres:** {{TASINMAZ_ADRES}}

2. AylÄ±k kira bedeli {{KIRA_BEDELI}} TL olarak belirlenmiÅŸtir.

3. {{TAHLIYE_SEBEBI}}

4. Bu nedenlerle taÅŸÄ±nmazÄ±n tahliyesi gerekmektedir.

---

## HUKUKÄ° SEBEPLER

- 6098 sayÄ±lÄ± TÃ¼rk BorÃ§lar Kanunu m.347-356 (Kira sÃ¶zleÅŸmesi)
- 6098 sayÄ±lÄ± TÃ¼rk BorÃ§lar Kanunu m.352 (KiracÄ±nÄ±n temerrÃ¼dÃ¼)

---

## DELÄ°LLER

1. Kira sÃ¶zleÅŸmesi
2. Ä°htar belgeleri
3. Ã–deme kayÄ±tlarÄ±
4. TanÄ±k beyanlarÄ±

---

## SONUÃ‡ VE Ä°STEM

1. KiralananÄ±n TAHLÄ°YESÄ°NE,
2. BirikmiÅŸ kira bedellerinin tahsiline,
3. YargÄ±lama giderlerinin davalÄ±ya yÃ¼kletilmesine,

karar verilmesini saygÄ±larÄ±mla arz ve talep ederim.

{{TARIH}}
{{KIRAYA_VEREN}}
`,
        isPremium: false,
        usageCount: 178
    },
    {
        id: '5',
        category: 'Ä°dari',
        subcategory: 'Ä°ptal DavasÄ±',
        title: 'Ä°dari Ä°ÅŸlemin Ä°ptali DavasÄ±',
        description: 'Hukuka aykÄ±rÄ± idari iÅŸlemlerin iptali iÃ§in dava dilekÃ§esi',
        icon: 'Building2',
        variables: [
            { key: 'IDARE_MAHKEMESI', label: 'Ä°dare Mahkemesi', type: 'text', placeholder: 'Ä°stanbul Ä°dare Mahkemesi' },
            { key: 'DAVACI_AD', label: 'DavacÄ± AdÄ±', type: 'text', required: true },
            { key: 'DAVALI_IDARE', label: 'DavalÄ± Ä°dare', type: 'text', required: true },
            { key: 'ISLEM_TARIHI', label: 'Ä°ÅŸlem Tarihi', type: 'date', required: true },
            { key: 'ISLEM_KONUSU', label: 'Ä°ptali Ä°stenen Ä°ÅŸlem', type: 'textarea', required: true },
            { key: 'HUKUKA_AYKIRILIK', label: 'Hukuka AykÄ±rÄ±lÄ±k Nedenleri', type: 'textarea', required: true },
        ],
        content: `## {{IDARE_MAHKEMESI}} BAÅKANLIÄINA

**DAVACI:** {{DAVACI_AD}}

**DAVALI:** {{DAVALI_IDARE}}

**KONU:** Ä°dari iÅŸlemin iptali talebimiz hakkÄ±ndadÄ±r.

**Ä°PTALÄ° Ä°STENEN Ä°ÅLEM:** {{ISLEM_KONUSU}}
**Ä°ÅLEM TARÄ°HÄ°:** {{ISLEM_TARIHI}}

---

## AÃ‡IKLAMALAR

1. DavalÄ± idare tarafÄ±ndan {{ISLEM_TARIHI}} tarihinde tesis edilen iÅŸlem hukuka aykÄ±rÄ±dÄ±r.

2. {{HUKUKA_AYKIRILIK}}

3. SÃ¶z konusu iÅŸlem telafisi gÃ¼Ã§ zararlara neden olmaktadÄ±r.

---

## HUKUKÄ° SEBEPLER

- 2577 sayÄ±lÄ± Ä°dari YargÄ±lama UsulÃ¼ Kanunu
- Anayasa m.125 (YargÄ± yolu)
- Ä°lgili mevzuat hÃ¼kÃ¼mleri

---

## SONUÃ‡ VE Ä°STEM

1. Dava konusu idari iÅŸlemin Ä°PTALÄ°NE,
2. YÃ¼rÃ¼tmenin durdurulmasÄ±na,
3. YargÄ±lama giderlerinin davalÄ±ya yÃ¼kletilmesine,

karar verilmesini saygÄ±larÄ±mla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: true,
        usageCount: 89
    },
    {
        id: '6',
        category: 'Ceza',
        subcategory: 'Åikayet',
        title: 'SuÃ§ Duyurusu DilekÃ§esi',
        description: 'Cumhuriyet SavcÄ±lÄ±ÄŸÄ±na suÃ§ duyurusu dilekÃ§esi',
        icon: 'Siren',
        variables: [
            { key: 'SAVCILIK', label: 'Cumhuriyet BaÅŸsavcÄ±lÄ±ÄŸÄ±', type: 'text', required: true },
            { key: 'SIKAYET_EDEN', label: 'Åikayet Eden (MÃ¼ÅŸteki)', type: 'text', required: true },
            { key: 'SUPHELI', label: 'ÅÃ¼pheli', type: 'text', required: true },
            { key: 'SUC_TARIHI', label: 'SuÃ§ Tarihi', type: 'date', required: true },
            { key: 'SUC_KONUSU', label: 'SuÃ§ Konusu Olay', type: 'textarea', required: true },
            { key: 'ISTENEN_CEZA', label: 'Talep Edilen Ä°ÅŸlem', type: 'textarea' },
        ],
        content: `## {{SAVCILIK}}'NA

**ÅÄ°KAYET EDEN (MÃœÅTEKÄ°):** {{SIKAYET_EDEN}}

**ÅÃœPHELÄ°:** {{SUPHELI}}

**SUÃ‡ TARÄ°HÄ°:** {{SUC_TARIHI}}

**KONU:** SuÃ§ duyurusu hakkÄ±ndadÄ±r.

---

## AÃ‡IKLAMALAR

1. {{SUC_TARIHI}} tarihinde aÅŸaÄŸÄ±da aÃ§Ä±klanan olay meydana gelmiÅŸtir:

2. {{SUC_KONUSU}}

3. Bu eylemler TÃ¼rk Ceza Kanunu kapsamÄ±nda suÃ§ teÅŸkil etmektedir.

---

## SUÃ‡ VE CEZA

- Ä°lgili TÃ¼rk Ceza Kanunu maddeleri
- Cezai yaptÄ±rÄ±m talep edilmektedir

---

## DELÄ°LLER

1. Olay tutanaklarÄ±
2. GÃ¶rÃ¼ntÃ¼/Ses kayÄ±tlarÄ±
3. TanÄ±k beyanlarÄ±
4. DiÄŸer deliller

---

## SONUÃ‡ VE Ä°STEM

1. {{ISTENEN_CEZA}}

ÅÃ¼phelinin yakalanarak cezalandÄ±rÄ±lmasÄ± iÃ§in gerekli soruÅŸturmanÄ±n yapÄ±lmasÄ±nÄ± saygÄ±larÄ±mla arz ve talep ederim.

{{TARIH}}
{{SIKAYET_EDEN}}
`,
        isPremium: false,
        usageCount: 245
    }
    ,
    {
        "id": "7",
        "category": "Ä°cra",
        "subcategory": "Ä°cra Takibi",
        "title": "Ä°lamsÄ±z Ä°cra Takip Talebi",
        "description": "Genel haciz yoluyla ilamsÄ±z icra takibi baÅŸlatma talebi",
        "icon": "Gavel",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "Ä°cra Dairesi",
                "type": "text",
                "required": true,
                "placeholder": "Ä°stanbul 1. Ä°cra Dairesi"
            },
            {
                "key": "ALACAKLI_AD",
                "label": "AlacaklÄ± AdÄ± SoyadÄ±",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_TC",
                "label": "AlacaklÄ± TC No",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_ADRES",
                "label": "AlacaklÄ± Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "BorÃ§lu AdÄ± SoyadÄ±",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_TC",
                "label": "BorÃ§lu TC No",
                "type": "text"
            },
            {
                "key": "BORCLU_ADRES",
                "label": "BorÃ§lu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ALACAK_TUTARI",
                "label": "Alacak TutarÄ± (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALACAK_NEDENI",
                "label": "AlacaÄŸÄ±n Nedeni",
                "type": "textarea",
                "required": true
            },
            {
                "key": "VADE_TARIHI",
                "label": "Vade Tarihi",
                "type": "date"
            }
        ],
        "content": "## {{ICRA_DAIRESI}}'NE\n\n## TAKÄ°P TALEBÄ°\n\n**ALACAKLI:** {{ALACAKLI_AD}}\nTC Kimlik No: {{ALACAKLI_TC}}\nAdres: {{ALACAKLI_ADRES}}\n\n**BORÃ‡LU:** {{BORCLU_AD}}\nTC Kimlik No: {{BORCLU_TC}}\nAdres: {{BORCLU_ADRES}}\n\n---\n\n**TAKÄ°P KONUSU ALACAK:**\n\n| AÃ§Ä±klama | Tutar |\n|----------|-------|\n| AsÄ±l Alacak | {{ALACAK_TUTARI}} TL |\n| Faiz (Vade Tarihinden Ä°tibaren) | Hesaplanacak |\n| **TOPLAM** | {{ALACAK_TUTARI}} TL + Faiz |\n\n**ALACAÄIN NEDENÄ°:** {{ALACAK_NEDENI}}\n\n**VADE TARÄ°HÄ°:** {{VADE_TARIHI}}\n\n---\n\n## TALEP\n\nYukarÄ±da belirtilen alacaÄŸÄ±mÄ±n tahsili iÃ§in borÃ§lu aleyhine **genel haciz yoluyla ilamsÄ±z icra takibi** baÅŸlatÄ±lmasÄ±nÄ± talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 523
    },
    {
        "id": "8",
        "category": "Ä°cra",
        "subcategory": "Ä°cra Takibi",
        "title": "Kambiyo Senedi Ä°cra Takibi",
        "description": "Ã‡ek, senet veya poliÃ§e ile icra takibi baÅŸlatma",
        "icon": "Receipt",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "Ä°cra Dairesi",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_AD",
                "label": "AlacaklÄ± AdÄ±",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_ADRES",
                "label": "AlacaklÄ± Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "BorÃ§lu AdÄ±",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_ADRES",
                "label": "BorÃ§lu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "SENET_TURU",
                "label": "Senet TÃ¼rÃ¼",
                "type": "text",
                "placeholder": "Bono / Ã‡ek / PoliÃ§e"
            },
            {
                "key": "SENET_TARIHI",
                "label": "Senet Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "SENET_TUTARI",
                "label": "Senet TutarÄ± (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "VADE_TARIHI",
                "label": "Vade Tarihi",
                "type": "date",
                "required": true
            }
        ],
        "content": "## {{ICRA_DAIRESI}}'NE\n\n## KAMBÄ°YO SENETLERÄ°NE MAHSUS HACÄ°Z YOLUYLA TAKÄ°P TALEBÄ°\n\n**ALACAKLI:** {{ALACAKLI_AD}}\nAdres: {{ALACAKLI_ADRES}}\n\n**BORÃ‡LU:** {{BORCLU_AD}}\nAdres: {{BORCLU_ADRES}}\n\n---\n\n**TAKÄ°BE KONU KAMBÄ°YO SENEDÄ°:**\n\n| Bilgi | DeÄŸer |\n|-------|-------|\n| Senet TÃ¼rÃ¼ | {{SENET_TURU}} |\n| DÃ¼zenleme Tarihi | {{SENET_TARIHI}} |\n| Vade Tarihi | {{VADE_TARIHI}} |\n| Senet TutarÄ± | {{SENET_TUTARI}} TL |\n\n---\n\n## TALEP\n\nEkte sunulan kambiyo senedine dayalÄ± olarak, Ä°Ä°K m.167 ve devamÄ± maddeleri uyarÄ±nca borÃ§lu aleyhine **kambiyo senetlerine mahsus haciz yoluyla takip** baÅŸlatÄ±lmasÄ±nÄ± talep ederim.\n\n**EKLER:**\n1. Kambiyo senedi aslÄ±\n2. Protesto belgesi (varsa)\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 412
    },
    {
        "id": "9",
        "category": "Ä°cra",
        "subcategory": "Ä°cra Ä°tiraz",
        "title": "Borca Ä°tiraz DilekÃ§esi",
        "description": "Ä°cra takibine karÅŸÄ± borca itiraz",
        "icon": "ShieldX",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "Ä°cra Dairesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "Ä°cra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "BorÃ§lu (Ä°tiraz Eden)",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_TC",
                "label": "TC Kimlik No",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_ADRES",
                "label": "Adres",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ALACAKLI_AD",
                "label": "AlacaklÄ±",
                "type": "text",
                "required": true
            },
            {
                "key": "ITIRAZ_NEDENI",
                "label": "Ä°tiraz Nedeni",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_DAIRESI}}'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**Ä°TÄ°RAZ EDEN (BORÃ‡LU):** {{BORCLU_AD}}\nTC Kimlik No: {{BORCLU_TC}}\nAdres: {{BORCLU_ADRES}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**KONU:** Ã–deme emrine itirazÄ±mdÄ±r.\n\n---\n\n## AÃ‡IKLAMALAR\n\n1. MÃ¼dÃ¼rlÃ¼ÄŸÃ¼nÃ¼zÃ¼n yukarÄ±da numarasÄ± yazÄ±lÄ± dosyasÄ±ndan tarafÄ±ma Ã¶deme emri tebliÄŸ edilmiÅŸtir.\n\n2. **Ä°TÄ°RAZ NEDENÄ°M:**\n{{ITIRAZ_NEDENI}}\n\n3. Bu nedenlerle sÃ¶z konusu takibe sÃ¼resinde itiraz ediyorum.\n\n---\n\n## HUKUKÄ° DAYANAK\n\n- 2004 sayÄ±lÄ± Ä°cra ve Ä°flas Kanunu m.62 (Ä°tiraz)\n- 2004 sayÄ±lÄ± Ä°cra ve Ä°flas Kanunu m.66 (Ä°tirazÄ±n hÃ¼kÃ¼mleri)\n\n---\n\n## SONUÃ‡ VE Ä°STEM\n\n**BORCA Ä°TÄ°RAZ EDÄ°YORUM.**\n\nTakibin durdurulmasÄ±nÄ± saygÄ±larÄ±mla arz ve talep ederim.\n\n{{TARIH}}\n{{BORCLU_AD}}\n",
        "isPremium": false,
        "usageCount": 678
    },
    {
        "id": "10",
        "category": "Ä°cra",
        "subcategory": "Ä°cra Ä°tiraz",
        "title": "Ä°mzaya Ä°tiraz DilekÃ§esi",
        "description": "Kambiyo senedindeki imzaya itiraz",
        "icon": "PenOff",
        "variables": [
            {
                "key": "ICRA_MAHKEMESI",
                "label": "Ä°cra Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "Ä°cra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "DavacÄ± (BorÃ§lu)",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_TC",
                "label": "TC Kimlik No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_AD",
                "label": "DavalÄ± (AlacaklÄ±)",
                "type": "text",
                "required": true
            },
            {
                "key": "SENET_BILGI",
                "label": "Senet Bilgileri",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_MAHKEMESI}} BAÅKANLIÄINA\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**DAVACI (BORÃ‡LU):** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI (ALACAKLI):** {{DAVALI_AD}}\n\n**KONU:** Kambiyo senedindeki imzaya itiraz hakkÄ±ndadÄ±r.\n\n---\n\n## AÃ‡IKLAMALAR\n\n1. DavalÄ± tarafÄ±ndan aleyhime baÅŸlatÄ±lan icra takibinde dayanak gÃ¶sterilen senedin bilgileri aÅŸaÄŸÄ±daki gibidir:\n{{SENET_BILGI}}\n\n2. **SÃ¶z konusu senetteki imza tarafÄ±ma ait deÄŸildir.**\n\n3. Senedin altÄ±ndaki imza ile benim gerÃ§ek imzam arasÄ±nda aÃ§Ä±k fark bulunmakta olup, bu husus bilirkiÅŸi incelemesiyle de ortaya konulacaktÄ±r.\n\n---\n\n## HUKUKÄ° SEBEPLER\n\n- 2004 sayÄ±lÄ± Ä°cra ve Ä°flas Kanunu m.170 (Ä°mzaya itiraz)\n- 6100 sayÄ±lÄ± HMK m.211 (Ä°mza incelemesi)\n\n---\n\n## DELÄ°LLER\n\n1. Ä°cra dosyasÄ±\n2. Senet aslÄ±\n3. Ä°mza Ã¶rnekleri\n4. BilirkiÅŸi incelemesi\n5. NÃ¼fus kayÄ±t Ã¶rneÄŸi\n\n---\n\n## SONUÃ‡ VE Ä°STEM\n\n1. **Senetteki imzanÄ±n tarafÄ±ma ait olmadÄ±ÄŸÄ±nÄ±n tespitine,**\n2. Ä°cra takibinin iptaline,\n3. %20 oranÄ±nda kÃ¶tÃ¼niyet tazminatÄ±na hÃ¼kmedilmesine,\n4. YargÄ±lama giderlerinin davalÄ±ya yÃ¼kletilmesine,\n\nkarar verilmesini saygÄ±larÄ±mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 234
    },
    {
        "id": "11",
        "category": "Ä°cra",
        "subcategory": "Haciz",
        "title": "Haciz KaldÄ±rma Talebi",
        "description": "Haczedilen mal Ã¼zerindeki haczin kaldÄ±rÄ±lmasÄ± talebi",
        "icon": "Unlock",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "Ä°cra Dairesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "TALEP_EDEN",
                "label": "Talep Eden",
                "type": "text",
                "required": true
            },
            {
                "key": "HACIZLI_MAL",
                "label": "Haczedilen Mal/EÅŸya",
                "type": "textarea",
                "required": true
            },
            {
                "key": "KALDIRMA_NEDENI",
                "label": "Haczin KaldÄ±rÄ±lma Nedeni",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_DAIRESI}} MÃœDÃœRLÃœÄÃœ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**TALEP EDEN:** {{TALEP_EDEN}}\n\n**KONU:** Haciz kaldÄ±rma talebimdir.\n\n---\n\n## AÃ‡IKLAMALAR\n\n1. MÃ¼dÃ¼rlÃ¼ÄŸÃ¼nÃ¼zÃ¼n yukarÄ±da numarasÄ± yazÄ±lÄ± dosyasÄ±nda aÅŸaÄŸÄ±da belirtilen mal/eÅŸya Ã¼zerine haciz konulmuÅŸtur:\n\n**HACZEDÄ°LEN MAL/EÅYA:**\n{{HACIZLI_MAL}}\n\n2. **HACZÄ°N KALDIRILMASI GEREKÃ‡ESÄ°:**\n{{KALDIRMA_NEDENI}}\n\n---\n\n## HUKUKÄ° DAYANAK\n\n- 2004 sayÄ±lÄ± Ä°cra ve Ä°flas Kanunu m.82 (Haczedilemezlik)\n- 2004 sayÄ±lÄ± Ä°cra ve Ä°flas Kanunu m.85 (TaÅŸÄ±nÄ±r haczi)\n\n---\n\n## SONUÃ‡ VE Ä°STEM\n\nYukarÄ±da aÃ§Ä±klanan nedenlerle, sÃ¶z konusu mal/eÅŸya Ã¼zerindeki haczin kaldÄ±rÄ±lmasÄ±nÄ± saygÄ±larÄ±mla talep ederim.\n\n{{TARIH}}\n{{TALEP_EDEN}}\n",
        "isPremium": false,
        "usageCount": 189
    },
    {
        "id": "12",
        "category": "Ä°cra",
        "subcategory": "Haciz",
        "title": "Ä°stihkak DavasÄ± DilekÃ§esi",
        "description": "Haczedilen malÄ±n Ã¼Ã§Ã¼ncÃ¼ kiÅŸiye ait olduÄŸunun tespiti",
        "icon": "FileWarning",
        "variables": [
            {
                "key": "ICRA_MAHKEMESI",
                "label": "Ä°cra Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "Ä°cra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "DavacÄ± (3. KiÅŸi)",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_TC",
                "label": "TC Kimlik No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_AD",
                "label": "DavalÄ± (AlacaklÄ±)",
                "type": "text",
                "required": true
            },
            {
                "key": "HACIZLI_MAL",
                "label": "Haczedilen Mal",
                "type": "textarea",
                "required": true
            },
            {
                "key": "MULKIYET_DELILI",
                "label": "MÃ¼lkiyet Delilleri",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_MAHKEMESI}} BAÅKANLIÄINA\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**DAVACI (3. KÄ°ÅÄ°):** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI (ALACAKLI):** {{DAVALI_AD}}\n\n**KONU:** Ä°stihkak davasÄ± hakkÄ±ndadÄ±r.\n\n---\n\n## AÃ‡IKLAMALAR\n\n1. DavalÄ± tarafÄ±ndan yÃ¼rÃ¼tÃ¼len icra takibinde, borÃ§lunun evinde/iÅŸyerinde yapÄ±lan haciz iÅŸlemi sÄ±rasÄ±nda **bana ait olan** aÅŸaÄŸÄ±daki mal haczedilmiÅŸtir:\n\n**HACZEDÄ°LEN MAL:**\n{{HACIZLI_MAL}}\n\n2. **Bu mal bana aittir ve borÃ§lu ile hiÃ§bir ilgisi yoktur.**\n\n3. MÃ¼lkiyetimi ispatlayan deliller:\n{{MULKIYET_DELILI}}\n\n---\n\n## HUKUKÄ° SEBEPLER\n\n- 2004 sayÄ±lÄ± Ä°cra ve Ä°flas Kanunu m.96-99 (Ä°stihkak davasÄ±)\n\n---\n\n## DELÄ°LLER\n\n1. Fatura ve satÄ±ÅŸ belgeleri\n2. Banka kayÄ±tlarÄ±\n3. TanÄ±k beyanlarÄ±\n4. BilirkiÅŸi incelemesi\n5. DiÄŸer yasal deliller\n\n---\n\n## SONUÃ‡ VE Ä°STEM\n\n1. **Haczedilen malÄ±n tarafÄ±ma ait olduÄŸunun tespitine,**\n2. SÃ¶z konusu mal Ã¼zerindeki haczin kaldÄ±rÄ±lmasÄ±na,\n3. YargÄ±lama giderlerinin davalÄ±ya yÃ¼kletilmesine,\n\nkarar verilmesini saygÄ±larÄ±mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 156
    },
    {
        "id": "13",
        "category": "Ä°ÅŸ Hukuku",
        "subcategory": "Ä°ÅŸe Ä°ade",
        "title": "Ä°ÅŸe Ä°ade DavasÄ± DilekÃ§esi",
        "description": "HaksÄ±z fesih nedeniyle iÅŸe iade talebi",
        "icon": "UserCheck",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "Ä°ÅŸ Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "DavacÄ± (Ä°ÅŸÃ§i)",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_TC",
                "label": "TC Kimlik No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_ADRES",
                "label": "Adres",
                "type": "textarea",
                "required": true
            },
            {
                "key": "DAVALI_AD",
                "label": "DavalÄ± (Ä°ÅŸveren)",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "Ä°ÅŸveren Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ISE_GIRIS_TARIHI",
                "label": "Ä°ÅŸe GiriÅŸ Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "FESIH_TARIHI",
                "label": "Fesih Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "GOREV",
                "label": "GÃ¶revi/Pozisyonu",
                "type": "text",
                "required": true
            },
            {
                "key": "FESIH_GEREKCESI",
                "label": "Ä°ÅŸverenin Fesih GerekÃ§esi",
                "type": "textarea"
            }
        ],
        "content": "## {{MAHKEME}} BAÅKANLIÄINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Feshin geÃ§ersizliÄŸi ve iÅŸe iade talebimizdir.\n\n---\n\n## AÃ‡IKLAMALAR\n\n1. MÃ¼vekkilim {{ISE_GIRIS_TARIHI}} tarihinden {{FESIH_TARIHI}} tarihine kadar davalÄ± iÅŸyerinde **{{GOREV}}** olarak Ã§alÄ±ÅŸmÄ±ÅŸtÄ±r.\n\n2. Ä°ÅŸ sÃ¶zleÅŸmesi {{FESIH_TARIHI}} tarihinde iÅŸveren tarafÄ±ndan **haksÄ±z ve geÃ§ersiz ÅŸekilde** feshedilmiÅŸtir.\n\n3. Ä°ÅŸverenin ileri sÃ¼rdÃ¼ÄŸÃ¼ fesih gerekÃ§esi:\n{{FESIH_GEREKCESI}}\n\n4. Bu gerekÃ§e gerÃ§eÄŸi yansÄ±tmamakta olup, fesih haksÄ±z ve geÃ§ersizdir.\n\n---\n\n## HUKUKÄ° SEBEPLER\n\n- 4857 sayÄ±lÄ± Ä°ÅŸ Kanunu m.18 (Feshin geÃ§erli sebebe dayandÄ±rÄ±lmasÄ±)\n- 4857 sayÄ±lÄ± Ä°ÅŸ Kanunu m.20 (Fesih bildirimine itiraz)\n- 4857 sayÄ±lÄ± Ä°ÅŸ Kanunu m.21 (GeÃ§ersiz sebeple feshin sonuÃ§larÄ±)\n\n---\n\n## DELÄ°LLER\n\n1. Ä°ÅŸ sÃ¶zleÅŸmesi\n2. Bordro ve SGK kayÄ±tlarÄ±\n3. Fesih bildirimi\n4. TanÄ±k beyanlarÄ±\n5. Ä°ÅŸyeri dosyasÄ±\n\n---\n\n## SONUÃ‡ VE Ä°STEM\n\n1. **Feshin geÃ§ersizliÄŸine ve iÅŸe iadeye,**\n2. Ä°ÅŸe baÅŸlatmama halinde 4-8 aylÄ±k brÃ¼t Ã¼cret tutarÄ±nda tazminata,\n3. BoÅŸta geÃ§en sÃ¼re Ã¼cretinin (4 aya kadar) Ã¶denmesine,\n4. YargÄ±lama giderlerinin davalÄ±ya yÃ¼kletilmesine,\n\nkarar verilmesini saygÄ±larÄ±mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 445
    },
    {
        "id": "14",
        "category": "Ä°ÅŸ Hukuku",
        "subcategory": "Tazminat",
        "title": "KÄ±dem ve Ä°hbar TazminatÄ± DavasÄ±",
        "description": "Ä°ÅŸ akdi feshi sonrasÄ± tazminat talebi",
        "icon": "Banknote",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "Ä°ÅŸ Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "DavacÄ± (Ä°ÅŸÃ§i)",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_TC",
                "label": "TC Kimlik No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_AD",
                "label": "DavalÄ± (Ä°ÅŸveren)",
                "type": "text",
                "required": true
            },
            {
                "key": "ISE_GIRIS",
                "label": "Ä°ÅŸe GiriÅŸ Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "CIKIS_TARIHI",
                "label": "Ä°ÅŸten Ã‡Ä±kÄ±ÅŸ Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "SON_UCRET",
                "label": "GiydirilmiÅŸ BrÃ¼t Ãœcret (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "KIDEM_TAZMINATI",
                "label": "KÄ±dem TazminatÄ± Talebi (TL)",
                "type": "number"
            },
            {
                "key": "IHBAR_TAZMINATI",
                "label": "Ä°hbar TazminatÄ± Talebi (TL)",
                "type": "number"
            }
        ],
        "content": "## {{MAHKEME}} BAÅKANLIÄINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI:** {{DAVALI_AD}}\n\n**KONU:** KÄ±dem ve ihbar tazminatÄ± talebimizdir.\n\n**DAVA DEÄERÄ°:** {{KIDEM_TAZMINATI}} TL + {{IHBAR_TAZMINATI}} TL\n\n---\n\n## AÃ‡IKLAMALAR\n\n1. MÃ¼vekkilim {{ISE_GIRIS}} - {{CIKIS_TARIHI}} tarihleri arasÄ±nda davalÄ± iÅŸyerinde Ã§alÄ±ÅŸmÄ±ÅŸtÄ±r.\n\n2. **Son aylÄ±k giydirilmiÅŸ brÃ¼t Ã¼creti:** {{SON_UCRET}} TL\n\n3. Ä°ÅŸ akdi iÅŸveren tarafÄ±ndan haksÄ±z olarak feshedilmiÅŸ, ancak tazminatlarÄ± Ã¶denmemiÅŸtir.\n\n---\n\n## TALEP EDÄ°LEN ALACAKLAR\n\n| Alacak Kalemi | Tutar |\n|---------------|-------|\n| KÄ±dem TazminatÄ± | {{KIDEM_TAZMINATI}} TL |\n| Ä°hbar TazminatÄ± | {{IHBAR_TAZMINATI}} TL |\n| **TOPLAM** | Hesaplanacak |\n\n---\n\n## HUKUKÄ° SEBEPLER\n\n- 1475 sayÄ±lÄ± Ä°ÅŸ Kanunu m.14 (KÄ±dem tazminatÄ±)\n- 4857 sayÄ±lÄ± Ä°ÅŸ Kanunu m.17 (SÃ¼reli fesih / Ä°hbar)\n\n---\n\n## SONUÃ‡ VE Ä°STEM\n\n1. **{{KIDEM_TAZMINATI}} TL kÄ±dem tazminatÄ±nÄ±n** fesih tarihinden itibaren en yÃ¼ksek mevduat faiziyle birlikte,\n2. **{{IHBAR_TAZMINATI}} TL ihbar tazminatÄ±nÄ±n** yasal faiziyle birlikte davalÄ±dan tahsiline,\n3. YargÄ±lama giderlerinin davalÄ±ya yÃ¼kletilmesine,\n\nkarar verilmesini saygÄ±larÄ±mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 567
    },
    {
        "id": "15",
        "category": "Hukuk",
        "subcategory": "TÃ¼ketici Hukuku",
        "title": "TÃ¼ketici Hakem Heyeti BaÅŸvurusu",
        "description": "AyÄ±plÄ± mal/hizmet iÃ§in tÃ¼ketici hakem heyetine baÅŸvuru",
        "icon": "ShoppingCart",
        "variables": [
            {
                "key": "HAKEM_HEYETI",
                "label": "TÃ¼ketici Hakem Heyeti",
                "type": "text",
                "required": true
            },
            {
                "key": "BASVURAN_AD",
                "label": "BaÅŸvuran AdÄ±",
                "type": "text",
                "required": true
            },
            {
                "key": "BASVURAN_TC",
                "label": "TC Kimlik No",
                "type": "text",
                "required": true
            },
            {
                "key": "BASVURAN_ADRES",
                "label": "Adres",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BASVURAN_TEL",
                "label": "Telefon",
                "type": "text"
            },
            {
                "key": "SATICI_AD",
                "label": "SatÄ±cÄ±/Firma AdÄ±",
                "type": "text",
                "required": true
            },
            {
                "key": "SATICI_ADRES",
                "label": "SatÄ±cÄ± Adresi",
                "type": "textarea"
            },
            {
                "key": "URUN_ADI",
                "label": "ÃœrÃ¼n/Hizmet AdÄ±",
                "type": "text",
                "required": true
            },
            {
                "key": "SATIN_ALMA_TARIHI",
                "label": "SatÄ±n Alma Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "URUN_BEDELI",
                "label": "ÃœrÃ¼n Bedeli (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "SIKAYET_KONUSU",
                "label": "Åikayet Konusu",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{HAKEM_HEYETI}}'NE\n\n## TÃœKETÄ°CÄ° ÅÄ°KAYET BAÅVURUSU\n\n**BAÅVURAN (TÃœKETÄ°CÄ°):**\nAd Soyad: {{BASVURAN_AD}}\nTC Kimlik No: {{BASVURAN_TC}}\nAdres: {{BASVURAN_ADRES}}\nTelefon: {{BASVURAN_TEL}}\n\n**ÅÄ°KAYET EDÄ°LEN (SATICI):**\nFirma AdÄ±: {{SATICI_AD}}\nAdres: {{SATICI_ADRES}}\n\n---\n\n**ÅÄ°KAYETE KONU ÃœRÃœN/HÄ°ZMET:**\n\n| Bilgi | DeÄŸer |\n|-------|-------|\n| ÃœrÃ¼n/Hizmet | {{URUN_ADI}} |\n| SatÄ±n Alma Tarihi | {{SATIN_ALMA_TARIHI}} |\n| Bedel | {{URUN_BEDELI}} TL |\n\n---\n\n## ÅÄ°KAYET KONUSU\n\n{{SIKAYET_KONUSU}}\n\n---\n\n## TALEP\n\n6502 sayÄ±lÄ± TÃ¼keticinin KorunmasÄ± HakkÄ±nda Kanun uyarÄ±nca;\n\n1. AyÄ±plÄ± Ã¼rÃ¼nÃ¼n/hizmetin bedelinin iadesi,\n2. Alternatif olarak Ã¼rÃ¼nÃ¼n deÄŸiÅŸtirilmesi veya Ã¼cretsiz onarÄ±mÄ±,\n\nhususlarÄ±nda karar verilmesini saygÄ±larÄ±mla arz ve talep ederim.\n\n**EKLER:**\n1. Fatura/fiÅŸ sureti\n2. ÃœrÃ¼n fotoÄŸraflarÄ±\n3. YazÄ±ÅŸma Ã¶rnekleri\n\n{{TARIH}}\n{{BASVURAN_AD}}\n",
        "isPremium": false,
        "usageCount": 892
    },
    {
        "id": "16",
        "category": "Hukuk",
        "subcategory": "TÃ¼ketici Hukuku",
        "title": "TÃ¼ketici Mahkemesi Dava DilekÃ§esi",
        "description": "TÃ¼ketici uyuÅŸmazlÄ±klarÄ± iÃ§in dava dilekÃ§esi",
        "icon": "Scale",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "TÃ¼ketici Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "DavacÄ± AdÄ±",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_TC",
                "label": "TC Kimlik No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_ADRES",
                "label": "DavacÄ± Adresi",
                "type": "textarea"
            },
            {
                "key": "DAVALI_AD",
                "label": "DavalÄ± Firma",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "DavalÄ± Adresi",
                "type": "textarea"
            },
            {
                "key": "DAVA_DEGERI",
                "label": "Dava DeÄŸeri (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "OLAY_ACIKLAMASI",
                "label": "OlayÄ±n AÃ§Ä±klamasÄ±",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{MAHKEME}} BAÅKANLIÄINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** TÃ¼ketici iÅŸleminden kaynaklanan tazminat talebimizdir.\n\n**DAVA DEÄERÄ°:** {{DAVA_DEGERI}} TL\n\n---\n\n## AÃ‡IKLAMALAR\n\n{{OLAY_ACIKLAMASI}}\n\n---\n\n## HUKUKÄ° SEBEPLER\n\n- 6502 sayÄ±lÄ± TÃ¼keticinin KorunmasÄ± HakkÄ±nda Kanun\n- 6098 sayÄ±lÄ± TÃ¼rk BorÃ§lar Kanunu\n\n---\n\n## DELÄ°LLER\n\n1. Fatura ve satÄ±ÅŸ belgeleri\n2. SÃ¶zleÅŸme Ã¶rnekleri\n3. YazÄ±ÅŸmalar\n4. TanÄ±k beyanlarÄ±\n5. BilirkiÅŸi incelemesi\n\n---\n\n## SONUÃ‡ VE Ä°STEM\n\n1. {{DAVA_DEGERI}} TL'nin yasal faiziyle birlikte davalÄ±dan tahsiline,\n2. YargÄ±lama giderlerinin davalÄ±ya yÃ¼kletilmesine,\n\nkarar verilmesini saygÄ±larÄ±mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 334
    },
    {
        "id": "17",
        "category": "Hukuk",
        "subcategory": "Ticaret Hukuku",
        "title": "Alacak DavasÄ± DilekÃ§esi (Ticari)",
        "description": "Ticari alacak tahsili iÃ§in dava dilekÃ§esi",
        "icon": "Briefcase",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "Asliye Ticaret Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "DavacÄ± Åirket/KiÅŸi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_VKN",
                "label": "Vergi/TC No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_ADRES",
                "label": "Adres",
                "type": "textarea"
            },
            {
                "key": "DAVALI_AD",
                "label": "DavalÄ± Åirket/KiÅŸi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "DavalÄ± Adresi",
                "type": "textarea"
            },
            {
                "key": "ALACAK_TUTARI",
                "label": "Alacak TutarÄ± (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALACAK_KAYNAK",
                "label": "AlacaÄŸÄ±n KaynaÄŸÄ±",
                "type": "textarea",
                "required": true
            },
            {
                "key": "VADE_TARIHI",
                "label": "Vade Tarihi",
                "type": "date"
            }
        ],
        "content": "## {{MAHKEME}} BAÅKANLIÄINA\n\n**DAVACI:** {{DAVACI_AD}}\nVergi/TC No: {{DAVACI_VKN}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Alacak davasÄ± hakkÄ±ndadÄ±r.\n\n**DAVA DEÄERÄ°:** {{ALACAK_TUTARI}} TL\n\n---\n\n## AÃ‡IKLAMALAR\n\n1. MÃ¼vekkilim ile davalÄ± arasÄ±nda ticari iliÅŸki bulunmaktadÄ±r.\n\n2. **AlacaÄŸÄ±n KaynaÄŸÄ±:**\n{{ALACAK_KAYNAK}}\n\n3. Vade tarihi: {{VADE_TARIHI}}\n\n4. TÃ¼m ihtarlara raÄŸmen davalÄ± borcunu Ã¶dememiÅŸtir.\n\n---\n\n## HUKUKÄ° SEBEPLER\n\n- 6102 sayÄ±lÄ± TÃ¼rk Ticaret Kanunu\n- 6098 sayÄ±lÄ± TÃ¼rk BorÃ§lar Kanunu\n\n---\n\n## DELÄ°LLER\n\n1. Faturalar\n2. SÃ¶zleÅŸmeler\n3. Ä°rsaliyeler\n4. Banka kayÄ±tlarÄ±\n5. Ä°htarname\n6. Ticari defterler\n\n---\n\n## SONUÃ‡ VE Ä°STEM\n\n1. {{ALACAK_TUTARI}} TL alacaÄŸÄ±n vade tarihinden itibaren avans faiziyle birlikte davalÄ±dan tahsiline,\n2. YargÄ±lama giderlerinin davalÄ±ya yÃ¼kletilmesine,\n\nkarar verilmesini saygÄ±larÄ±mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 445
    },
    {
        "id": "18",
        "category": "Hukuk",
        "subcategory": "Ticaret Hukuku",
        "title": "Ä°htarname (Ã–deme)",
        "description": "Ticari borÃ§ iÃ§in Ã¶deme ihtarnamesi",
        "icon": "Mail",
        "variables": [
            {
                "key": "NOTER",
                "label": "Noter",
                "type": "text",
                "placeholder": "Ä°stanbul 5. NoterliÄŸi"
            },
            {
                "key": "GONDEREN_AD",
                "label": "GÃ¶nderen (AlacaklÄ±)",
                "type": "text",
                "required": true
            },
            {
                "key": "GONDEREN_ADRES",
                "label": "AlacaklÄ± Adresi",
                "type": "textarea"
            },
            {
                "key": "MUHATAP_AD",
                "label": "Muhatap (BorÃ§lu)",
                "type": "text",
                "required": true
            },
            {
                "key": "MUHATAP_ADRES",
                "label": "BorÃ§lu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORC_TUTARI",
                "label": "BorÃ§ TutarÄ± (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "BORC_KONUSU",
                "label": "BorÃ§ Konusu",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ODEME_SURESI",
                "label": "Ã–deme SÃ¼resi (GÃ¼n)",
                "type": "number",
                "placeholder": "7"
            }
        ],
        "content": "## Ä°HTARNAME\n\n**KeÅŸideci (Ä°htar Eden):** {{GONDEREN_AD}}\nAdres: {{GONDEREN_ADRES}}\n\n**Muhatap (Ä°htar Edilen):** {{MUHATAP_AD}}\nAdres: {{MUHATAP_ADRES}}\n\n---\n\n## Ä°HTARIN KONUSU\n\nAÅŸaÄŸÄ±da belirtilen borcunuzun Ã¶denmesi hakkÄ±ndadÄ±r.\n\n---\n\n**SayÄ±n {{MUHATAP_AD}},**\n\n**1.** TarafÄ±nÄ±za aÅŸaÄŸÄ±da detaylarÄ± verilen alacaÄŸÄ±mÄ±z bulunmaktadÄ±r:\n\n**BorÃ§ Konusu:** {{BORC_KONUSU}}\n\n**BorÃ§ TutarÄ±:** {{BORC_TUTARI}} TL\n\n**2.** SÃ¶z konusu borcunuzu defalarca hatÄ±rlatmamÄ±za raÄŸmen hÃ¢lÃ¢ Ã¶demediniz.\n\n**3.** Ä°ÅŸbu ihtarnamenin tarafÄ±nÄ±za tebliÄŸinden itibaren **{{ODEME_SURESI}} gÃ¼n** iÃ§inde yukarÄ±da belirtilen borcunuzu Ã¶demenizi,\n\n**4.** Aksi takdirde aleyhinize yasal yollara (icra takibi ve/veya dava) baÅŸvurulacaÄŸÄ±nÄ±, bu durumda doÄŸacak tÃ¼m masraf, faiz ve avukatlÄ±k Ã¼cretlerinin tarafÄ±nÄ±zdan tahsil edileceÄŸini,\n\n**Ä°HTAR EDERÄ°M.**\n\n{{TARIH}}\n{{GONDEREN_AD}}\n\n---\n\n*Bu ihtarname noter kanalÄ±yla tebliÄŸ edilmek Ã¼zere hazÄ±rlanmÄ±ÅŸtÄ±r.*\n",
        "isPremium": false,
        "usageCount": 723
    },
    {
        "id": "19",
        "category": "Hukuk",
        "subcategory": "Miras Hukuku",
        "title": "MirasÃ§Ä±lÄ±k Belgesi (Veraset Ä°lamÄ±) Talebi",
        "description": "Sulh hukuk mahkemesinden veraset ilamÄ± talebi",
        "icon": "Users",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "Sulh Hukuk Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "DavacÄ± (MirasÃ§Ä±)",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_TC",
                "label": "TC Kimlik No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_ADRES",
                "label": "Adres",
                "type": "textarea"
            },
            {
                "key": "MURIS_AD",
                "label": "Murisin (Ã–lenin) AdÄ±",
                "type": "text",
                "required": true
            },
            {
                "key": "MURIS_TC",
                "label": "Murisin TC No",
                "type": "text"
            },
            {
                "key": "OLUM_TARIHI",
                "label": "Ã–lÃ¼m Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "OLUM_YERI",
                "label": "Ã–lÃ¼m Yeri",
                "type": "text"
            },
            {
                "key": "MIRASCILAR",
                "label": "DiÄŸer MirasÃ§Ä±lar",
                "type": "textarea"
            }
        ],
        "content": "## {{MAHKEME}} BAÅKANLIÄINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**KONU:** MirasÃ§Ä±lÄ±k belgesi (veraset ilamÄ±) verilmesi talebimdir.\n\n---\n\n## AÃ‡IKLAMALAR\n\n1. Muris **{{MURIS_AD}}** (TC: {{MURIS_TC}}) {{OLUM_TARIHI}} tarihinde {{OLUM_YERI}}'de vefat etmiÅŸtir.\n\n2. Ben mÃ¼teveffanÄ±n mirasÃ§Ä±sÄ±yÄ±m.\n\n3. DiÄŸer mirasÃ§Ä±lar:\n{{MIRASCILAR}}\n\n4. MÃ¼teveffanÄ±n terekesi Ã¼zerinde iÅŸlem yapabilmek iÃ§in mirasÃ§Ä±lÄ±k belgesi alÄ±nmasÄ± gerekmektedir.\n\n---\n\n## HUKUKÄ° SEBEPLER\n\n- 4721 sayÄ±lÄ± TÃ¼rk Medeni Kanunu m.598 (MirasÃ§Ä±lÄ±k belgesi)\n\n---\n\n## DELÄ°LLER\n\n1. Veraset ve intikal vergisi beyannamesi\n2. NÃ¼fus kayÄ±t Ã¶rneÄŸi (muris ve mirasÃ§Ä±lar)\n3. Ã–lÃ¼m belgesi\n4. VukuatlÄ± nÃ¼fus kayÄ±t Ã¶rneÄŸi\n\n---\n\n## SONUÃ‡ VE Ä°STEM\n\nMÃ¼teveffa {{MURIS_AD}}'in mirasÃ§Ä±larÄ±nÄ± ve miras paylarÄ±nÄ± gÃ¶steren **MÄ°RASÃ‡ILIK BELGESÄ°** verilmesini saygÄ±larÄ±mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 567
    },
    {
        "id": "20",
        "category": "Hukuk",
        "subcategory": "Miras Hukuku",
        "title": "Mirastan Feragat SÃ¶zleÅŸmesi",
        "description": "Noterde dÃ¼zenlenecek mirastan feragat belgesi",
        "icon": "FileX",
        "variables": [
            {
                "key": "NOTER",
                "label": "Noter",
                "type": "text"
            },
            {
                "key": "FERAGAT_EDEN",
                "label": "Feragat Eden",
                "type": "text",
                "required": true
            },
            {
                "key": "FERAGAT_EDEN_TC",
                "label": "TC Kimlik No",
                "type": "text",
                "required": true
            },
            {
                "key": "MURIS_AD",
                "label": "Muris (Miras BÄ±rakan)",
                "type": "text",
                "required": true
            },
            {
                "key": "BEDEL",
                "label": "KarÅŸÄ±lÄ±k Bedel (varsa)",
                "type": "text"
            }
        ],
        "content": "## MÄ°RASTAN FERAGAT SÃ–ZLEÅMESÄ°\n\n**FERAGAT EDEN:**\nAd Soyad: {{FERAGAT_EDEN}}\nTC Kimlik No: {{FERAGAT_EDEN_TC}}\n\n**MURÄ°S:**\nAd Soyad: {{MURIS_AD}}\n\n---\n\n## BEYAN\n\nBen {{FERAGAT_EDEN}}, {{MURIS_AD}}'Ä±n ileride gerÃ§ekleÅŸecek Ã¶lÃ¼mÃ¼ halinde terekesinden payÄ±ma dÃ¼ÅŸecek tÃ¼m miras haklarÄ±ndan, TMK m.528 uyarÄ±nca, aÅŸaÄŸÄ±daki ÅŸartlarla **FERAGAT ETTÄ°ÄÄ°MÄ°** beyan ederim.\n\n**KarÅŸÄ±lÄ±k:** {{BEDEL}}\n\n**Feragatin KapsamÄ±:** Tam feragat (hem kendim hem altsoyum adÄ±na)\n\nBu sÃ¶zleÅŸme, murisin saÄŸlÄ±ÄŸÄ±nda, resmi ÅŸekilde yapÄ±lmÄ±ÅŸ olup, tarafÄ±mca Ã¶zgÃ¼r iradeyle imzalanmÄ±ÅŸtÄ±r.\n\n---\n\n## HUKUKÄ° DAYANAK\n\n- 4721 sayÄ±lÄ± TÃ¼rk Medeni Kanunu m.528 (Mirastan feragat sÃ¶zleÅŸmesi)\n\n---\n\n{{TARIH}}\n\n**Feragat Eden:**\n{{FERAGAT_EDEN}}\n\n**Muris:**\n{{MURIS_AD}}\n\n---\n\n*Bu sÃ¶zleÅŸme noter huzurunda dÃ¼zenleme ÅŸeklinde yapÄ±lmalÄ±dÄ±r.*\n",
        "isPremium": true,
        "usageCount": 123
    },
    {
        "id": "21",
        "category": "Ä°cra",
        "subcategory": "Tahsilat",
        "title": "Haricen Tahsil Bildirimi",
        "description": "Ä°cra dosyasÄ± dÄ±ÅŸÄ±nda yapÄ±lan tahsilatÄ±n bildirilmesi",
        "icon": "HandCoins",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ä°cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "AlacaklÄ±", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "BorÃ§lu", "type": "text", "required": true },
            { "key": "TAHSIL_TUTARI", "label": "Tahsil Edilen Tutar (TL)", "type": "number", "required": true },
            { "key": "TAHSIL_TARIHI", "label": "Tahsil Tarihi", "type": "date", "required": true },
            { "key": "KALAN_ALACAK", "label": "Kalan Alacak (varsa)", "type": "number" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÃœDÃœRLÃœÄÃœ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÃ‡LU:** {{BORCLU_AD}}\n\n**KONU:** Haricen tahsil bildirimi\n\n---\n\n## AÃ‡IKLAMA\n\nMÃ¼dÃ¼rlÃ¼ÄŸÃ¼nÃ¼zÃ¼n yukarÄ±da numarasÄ± yazÄ±lÄ± dosyasÄ±nda takip edilen alacaÄŸÄ±mÄ±n bir kÄ±smÄ±/tamamÄ± borÃ§lu tarafÄ±ndan **haricen (icra dairesi dÄ±ÅŸÄ±nda)** tarafÄ±ma Ã¶denmiÅŸtir.\n\n**TAHSÄ°LAT BÄ°LGÄ°LERÄ°:**\n\n| Bilgi | DeÄŸer |\n|-------|-------|\n| Tahsil Edilen Tutar | {{TAHSIL_TUTARI}} TL |\n| Tahsil Tarihi | {{TAHSIL_TARIHI}} |\n| Kalan Alacak | {{KALAN_ALACAK}} TL |\n\n---\n\n## TALEP\n\nYukarÄ±da belirtilen haricen tahsilatÄ±n dosyaya iÅŸlenmesini ve dosyanÄ±n buna gÃ¶re gÃ¼ncellenmesini talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1245
    },
    {
        "id": "22",
        "category": "Ä°cra",
        "subcategory": "Dosya Ä°ÅŸlemleri",
        "title": "Dosya Kapama (Takipten VazgeÃ§me) Talebi",
        "description": "AlacaklÄ±nÄ±n takipten vazgeÃ§erek dosyayÄ± kapatma talebi",
        "icon": "FolderX",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ä°cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "AlacaklÄ±", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "BorÃ§lu", "type": "text", "required": true },
            { "key": "VAZGECME_NEDENI", "label": "VazgeÃ§me Nedeni", "type": "textarea" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÃœDÃœRLÃœÄÃœ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÃ‡LU:** {{BORCLU_AD}}\n\n**KONU:** Takipten vazgeÃ§me ve dosyanÄ±n kapatÄ±lmasÄ± talebi\n\n---\n\n## AÃ‡IKLAMA\n\nMÃ¼dÃ¼rlÃ¼ÄŸÃ¼nÃ¼zÃ¼n yukarÄ±da numarasÄ± yazÄ±lÄ± dosyasÄ±nda yÃ¼rÃ¼tÃ¼len icra takibinden **VAZGEÃ‡Ä°YORUM.**\n\n**VazgeÃ§me Nedeni:** {{VAZGECME_NEDENI}}\n\n---\n\n## TALEP\n\nÄ°Ä°K m.129 uyarÄ±nca takipten vazgeÃ§tiÄŸimi beyan eder, takibin durdurularak dosyanÄ±n kapatÄ±lmasÄ±nÄ± talep ederim.\n\n**Not:** Dosyadaki tÃ¼m hacizlerin kaldÄ±rÄ±lmasÄ±nÄ± da talep ediyorum.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 876
    },
    {
        "id": "23",
        "category": "Ä°cra",
        "subcategory": "Haciz",
        "title": "MaaÅŸ Haczi (MaaÅŸ Kesintisi) Talebi",
        "description": "BorÃ§lunun maaÅŸÄ±na haciz konulmasÄ± talebi",
        "icon": "Wallet",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ä°cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "AlacaklÄ±", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "BorÃ§lu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "BorÃ§lu TC No", "type": "text", "required": true },
            { "key": "ISVEREN_AD", "label": "Ä°ÅŸveren/Kurum AdÄ±", "type": "text", "required": true },
            { "key": "ISVEREN_ADRES", "label": "Ä°ÅŸveren Adresi", "type": "textarea", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} MÃœDÃœRLÃœÄÃœ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÃ‡LU:** {{BORCLU_AD}} (TC: {{BORCLU_TC}})\n\n**KONU:** MaaÅŸ haczi (maaÅŸ kesintisi) talebi\n\n---\n\n## AÃ‡IKLAMA\n\nBorÃ§lunun aÅŸaÄŸÄ±da belirtilen iÅŸyerinde Ã§alÄ±ÅŸtÄ±ÄŸÄ± tespit edilmiÅŸtir:\n\n**Ä°ÅVEREN BÄ°LGÄ°LERÄ°:**\n- **Kurum/Åirket:** {{ISVEREN_AD}}\n- **Adres:** {{ISVEREN_ADRES}}\n\n---\n\n## TALEP\n\nÄ°Ä°K m.83 ve m.355 uyarÄ±nca;\n\n1. BorÃ§lunun maaÅŸ ve Ã¼cretinin **1/4'Ã¼nÃ¼n** haciz kesintisi yapÄ±larak dosyaya gÃ¶nderilmesi iÃ§in ilgili iÅŸverene **maaÅŸ haczi mÃ¼zekkeresi** yazÄ±lmasÄ±nÄ±,\n\n2. Kesinti yapÄ±lÄ±ncaya kadar iÅŸverene sorumluluk bildiriminde bulunulmasÄ±nÄ±,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1567
    },
    {
        "id": "24",
        "category": "Ä°cra",
        "subcategory": "Haciz",
        "title": "TaÅŸÄ±nmaz (Gayrimenkul) Haczi Talebi",
        "description": "BorÃ§lunun taÅŸÄ±nmazÄ±na haciz ÅŸerhi konulmasÄ± talebi",
        "icon": "Home",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ä°cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "AlacaklÄ±", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "BorÃ§lu", "type": "text", "required": true },
            { "key": "TASINMAZ_BILGI", "label": "TaÅŸÄ±nmaz Bilgileri (Ä°l/Ä°lÃ§e/Ada/Parsel)", "type": "textarea", "required": true },
            { "key": "TAPU_MUDURLUGU", "label": "Tapu MÃ¼dÃ¼rlÃ¼ÄŸÃ¼", "type": "text", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} MÃœDÃœRLÃœÄÃœ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÃ‡LU:** {{BORCLU_AD}}\n\n**KONU:** TaÅŸÄ±nmaz haczi talebi\n\n---\n\n## AÃ‡IKLAMA\n\nBorÃ§lunun aÅŸaÄŸÄ±da belirtilen taÅŸÄ±nmaz/taÅŸÄ±nmazlar Ã¼zerinde mÃ¼lkiyeti bulunmaktadÄ±r:\n\n**TAÅINMAZ BÄ°LGÄ°LERÄ°:**\n{{TASINMAZ_BILGI}}\n\n**Ä°LGÄ°LÄ° TAPU MÃœDÃœRLÃœÄÃœ:** {{TAPU_MUDURLUGU}}\n\n---\n\n## TALEP\n\nÄ°Ä°K m.79 ve m.91 uyarÄ±nca;\n\n1. YukarÄ±da belirtilen taÅŸÄ±nmaz/taÅŸÄ±nmazlar Ã¼zerine **HACÄ°Z ÅERHÄ°** konulmasÄ± iÃ§in ilgili Tapu MÃ¼dÃ¼rlÃ¼ÄŸÃ¼'ne mÃ¼zekkere yazÄ±lmasÄ±nÄ±,\n\n2. Haciz ÅŸerhinin tapu kaydÄ±na iÅŸlenmesini,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 934
    },
    {
        "id": "25",
        "category": "Ä°cra",
        "subcategory": "Haciz",
        "title": "Haciz Fekki (Haciz KaldÄ±rma) Talebi - AlacaklÄ±",
        "description": "AlacaklÄ±nÄ±n haczi kaldÄ±rma talebi",
        "icon": "KeyRound",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ä°cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "AlacaklÄ±", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "BorÃ§lu", "type": "text", "required": true },
            { "key": "HACIZLI_MAL", "label": "Haczin KaldÄ±rÄ±lacaÄŸÄ± Mal/KayÄ±t", "type": "textarea", "required": true },
            { "key": "FEKK_NEDENI", "label": "Haciz Fekki Nedeni", "type": "textarea" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÃœDÃœRLÃœÄÃœ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÃ‡LU:** {{BORCLU_AD}}\n\n**KONU:** Haciz fekki (haciz kaldÄ±rma) talebi\n\n---\n\n## AÃ‡IKLAMA\n\nMÃ¼dÃ¼rlÃ¼ÄŸÃ¼nÃ¼zÃ¼n yukarÄ±da numarasÄ± yazÄ±lÄ± dosyasÄ±nda borÃ§luya ait aÅŸaÄŸÄ±daki mal/kayÄ±t Ã¼zerine haciz konulmuÅŸtur:\n\n**HACÄ°ZLÄ° MAL/KAYIT:**\n{{HACIZLI_MAL}}\n\n**HACÄ°Z FEKKÄ° NEDENÄ°:**\n{{FEKK_NEDENI}}\n\n---\n\n## TALEP\n\nYukarÄ±da belirtilen mal/kayÄ±t Ã¼zerindeki haczin **FEKKÄ°NÄ° (KALDIRILMASINI)** ve ilgili kurumlara haciz fekki mÃ¼zekkeresi yazÄ±lmasÄ±nÄ± talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1123
    },
    {
        "id": "26",
        "category": "Ä°cra",
        "subcategory": "Mal BeyanÄ±",
        "title": "Mal BeyanÄ± Talepli Ã–deme Emri Talebi",
        "description": "BorÃ§ludan mal beyanÄ± istenmesi talebi",
        "icon": "ClipboardList",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ä°cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "AlacaklÄ±", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "BorÃ§lu", "type": "text", "required": true },
            { "key": "BORCLU_ADRES", "label": "BorÃ§lu Adresi", "type": "textarea", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} MÃœDÃœRLÃœÄÃœ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÃ‡LU:** {{BORCLU_AD}}\nAdres: {{BORCLU_ADRES}}\n\n**KONU:** Mal beyanÄ± talebinde bulunulmasÄ±\n\n---\n\n## AÃ‡IKLAMA\n\nMÃ¼dÃ¼rlÃ¼ÄŸÃ¼nÃ¼zÃ¼n yukarÄ±da numarasÄ± yazÄ±lÄ± dosyasÄ±nda borÃ§luya gÃ¶nderilen Ã¶deme emri tebliÄŸ edilmiÅŸ, ancak borÃ§lu Ã¶deme yapmamÄ±ÅŸ ve itirazda da bulunmamÄ±ÅŸtÄ±r.\n\n---\n\n## TALEP\n\nÄ°Ä°K m.74 uyarÄ±nca;\n\n1. BorÃ§luya **MAL BEYANI** iÃ§in davetiye Ã§Ä±karÄ±lmasÄ±nÄ±,\n\n2. BorÃ§lunun mal beyanÄ±nda bulunmamasÄ± veya gerÃ§eÄŸe aykÄ±rÄ± beyanda bulunmasÄ± halinde Ä°Ä°K m.337 kapsamÄ±nda ÅŸikayet hakkÄ±mÄ±n saklÄ± tutulmasÄ±nÄ±,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 789
    },
    {
        "id": "27",
        "category": "Ä°cra",
        "subcategory": "AraÃ§",
        "title": "AraÃ§ Haczi Talebi",
        "description": "BorÃ§lunun aracÄ±na haciz konulmasÄ± talebi",
        "icon": "Car",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ä°cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "AlacaklÄ±", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "BorÃ§lu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "BorÃ§lu TC No", "type": "text", "required": true },
            { "key": "ARAC_PLAKA", "label": "AraÃ§ PlakasÄ± (biliniyorsa)", "type": "text" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÃœDÃœRLÃœÄÃœ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÃ‡LU:** {{BORCLU_AD}} (TC: {{BORCLU_TC}})\n\n**KONU:** AraÃ§ haczi talebi\n\n---\n\n## TALEP\n\nBorÃ§lunun adÄ±na kayÄ±tlÄ± araÃ§/araÃ§lar Ã¼zerine haciz konulmasÄ± iÃ§in;\n\n1. **Emniyet Genel MÃ¼dÃ¼rlÃ¼ÄŸÃ¼ Trafik BaÅŸkanlÄ±ÄŸÄ±'na** (EGM) haciz mÃ¼zekkeresi yazÄ±lmasÄ±nÄ±,\n\n2. BorÃ§lu adÄ±na kayÄ±tlÄ± tÃ¼m araÃ§larÄ±n tespit edilmesini ve haciz ÅŸerhi konulmasÄ±nÄ±,\n\n3. Yakalama ÅŸerhi konulmasÄ±nÄ±,\n\ntalep ederim.\n\n**Bilinen AraÃ§ PlakasÄ± (varsa):** {{ARAC_PLAKA}}\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1456
    },
    {
        "id": "28",
        "category": "Ä°cra",
        "subcategory": "Banka",
        "title": "Banka HesabÄ± Haczi Talebi",
        "description": "BorÃ§lunun banka hesaplarÄ±na haciz konulmasÄ±",
        "icon": "Landmark",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ä°cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "AlacaklÄ±", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "BorÃ§lu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "BorÃ§lu TC/VKN", "type": "text", "required": true },
            { "key": "BANKA_ADI", "label": "Banka AdÄ± (biliniyorsa)", "type": "text" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÃœDÃœRLÃœÄÃœ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÃ‡LU:** {{BORCLU_AD}} (TC/VKN: {{BORCLU_TC}})\n\n**KONU:** Banka hesaplarÄ±na haciz talebi\n\n---\n\n## TALEP\n\nBorÃ§lunun banka hesaplarÄ±na haciz konulmasÄ± iÃ§in;\n\n1. **TÃ¼m bankalara** (UYAP Ã¼zerinden toplu) haciz mÃ¼zekkeresi gÃ¶nderilmesini,\n\n2. BorÃ§lunun tÃ¼m banka hesaplarÄ±ndaki mevduatÄ±n haczedilmesini,\n\n3. Haczedilen tutarlarÄ±n dosyaya aktarÄ±lmasÄ±nÄ±,\n\ntalep ederim.\n\n**Bilinen Banka (varsa):** {{BANKA_ADI}}\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 2134
    }
];

// Get all templates
app.get('/api/templates', (req, res) => {
    const { category } = req.query;

    let filteredTemplates = TEMPLATES.map(t => ({
        id: t.id,
        category: t.category,
        subcategory: t.subcategory,
        title: t.title,
        description: t.description,
        icon: t.icon,
        isPremium: t.isPremium,
        usageCount: t.usageCount,
        variableCount: t.variables.length
    }));

    if (category) {
        filteredTemplates = filteredTemplates.filter(t => t.category === category);
    }

    res.json({ templates: filteredTemplates });
});

// Get single template with full content
app.get('/api/templates/:id', (req, res) => {
    const template = TEMPLATES.find(t => t.id === req.params.id);

    if (!template) {
        return res.status(404).json({ error: 'Åablon bulunamadÄ±' });
    }

    res.json({ template });
});

// Use template - fill variables and generate content
app.post('/api/templates/:id/use', (req, res) => {
    const template = TEMPLATES.find(t => t.id === req.params.id);

    if (!template) {
        return res.status(404).json({ error: 'Åablon bulunamadÄ±' });
    }

    const { variables } = req.body;
    console.log(`[TEMPLATE USE] ID: ${req.params.id}, Variables received:`, JSON.stringify(variables, null, 2));

    let content = template.content;


    // Add current date
    const today = new Date().toLocaleDateString('tr-TR');
    content = content.replace(/\{\{TARIH\}\}/g, today);

    // Replace all variables
    if (variables) {
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = '{{' + key + '}}';
            console.log('[TEMPLATE] Replacing:', placeholder, '->', value);
            content = content.split(placeholder).join(value || '');
        }
    }

    // Remove any remaining unreplaced variables
    content = content.replace(/\{\{[A-Z_]+\}\}/g, '[...]');

    res.json({
        success: true,
        content,
        title: template.title
    });
});

// Admin Users API - Get users with email from Supabase Auth
app.get('/api/admin-users', async (req, res) => {
    try {
        // Use service role key to access auth.users
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;

        if (!serviceRoleKey) {
            console.error('Service role key not configured');
            return res.status(500).json({ error: 'Service role key not configured' });
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        // Get query params
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const search = req.query.search || '';

        // Fetch users from auth.users using admin API
        const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers({
            page: page,
            perPage: pageSize
        });

        if (authError) {
            console.error('Auth error:', authError);
            throw authError;
        }

        // Filter by search if provided
        let filteredUsers = users || [];
        if (search) {
            const searchLower = search.toLowerCase();
            filteredUsers = filteredUsers.filter(u =>
                (u.email && u.email.toLowerCase().includes(searchLower)) ||
                (u.user_metadata?.full_name && u.user_metadata.full_name.toLowerCase().includes(searchLower))
            );
        }

        // Get profiles data for additional info
        const userIds = filteredUsers.map(u => u.id);
        const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        // Get petition counts
        const { data: petitionCounts } = await supabaseAdmin
            .from('petitions')
            .select('user_id')
            .in('user_id', userIds);

        const countMap = new Map();
        petitionCounts?.forEach(p => {
            countMap.set(p.user_id, (countMap.get(p.user_id) || 0) + 1);
        });

        // Combine data
        const combinedUsers = filteredUsers.map(user => {
            const profile = profileMap.get(user.id) || {};
            return {
                id: user.id,
                email: user.email,
                full_name: profile.full_name || user.user_metadata?.full_name || null,
                office_name: null,
                created_at: user.created_at,
                last_sign_in_at: user.last_sign_in_at,
                petition_count: countMap.get(user.id) || 0
            };
        });

        // Get total count
        const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000
        });

        res.json({
            users: combinedUsers,
            total: allUsers?.length || 0,
            page,
            pageSize
        });

    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Announcements CRUD API
app.get('/api/announcements', async (req, res) => {
    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

        if (!serviceRoleKey) {
            return res.status(500).json({ error: 'Service role key not configured' });
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        const activeOnly = req.query.active === 'true';

        let query = supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false });

        if (activeOnly) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({ announcements: data || [] });
    } catch (error) {
        console.error('Announcements GET error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/announcements', async (req, res) => {
    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        const { title, content, type, is_active, show_on_login, expires_at } = req.body;

        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required' });
        }

        const { data, error } = await supabase
            .from('announcements')
            .insert([{
                title,
                content,
                type: type || 'info',
                is_active: is_active !== false,
                show_on_login: show_on_login || false,
                expires_at: expires_at || null
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ announcement: data });
    } catch (error) {
        console.error('Announcements POST error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/announcements', async (req, res) => {
    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        const { id, ...updates } = req.body;

        if (!id) {
            return res.status(400).json({ error: 'Announcement ID is required' });
        }

        const { data, error } = await supabase
            .from('announcements')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ announcement: data });
    } catch (error) {
        console.error('Announcements PUT error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/announcements', async (req, res) => {
    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        const { id } = req.body;

        if (!id) {
            return res.status(400).json({ error: 'Announcement ID is required' });
        }

        const { error } = await supabase
            .from('announcements')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Announcements DELETE error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


