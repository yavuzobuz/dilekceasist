import express from 'express';
import htmlToDocx from 'html-to-docx';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { AI_CONFIG, SERVER_CONFIG } from './config.js';
import templatesHandler from './api/templates.js';
import announcementsHandler from './api/announcements.js';

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
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'kibrit74@gmail.com')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
const TRIAL_DURATION_DAYS = Math.max(1, Number.parseInt(process.env.TRIAL_DURATION_DAYS || '14', 10));
const TRIAL_DAILY_GENERATION_LIMIT = Math.max(1, Number.parseInt(process.env.TRIAL_DAILY_GENERATION_LIMIT || '10', 10));

// CORS configuration
const normalizeOrigin = (origin = '') => origin.trim().replace(/\/+$/, '').toLowerCase();

const parseOriginList = (...values) => values
    .filter(Boolean)
    .flatMap(value => String(value).split(','))
    .map(normalizeOrigin)
    .filter(Boolean);

const isLocalDevOrigin = (origin) => {
    try {
        const parsed = new URL(origin);
        const host = (parsed.hostname || '').toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    } catch {
        return false;
    }
};

const allowedOriginSet = new Set(parseOriginList(
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGINS
));

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        const normalizedOrigin = normalizeOrigin(origin);
        const isAllowed = allowedOriginSet.has(normalizedOrigin);
        const isAllowedDevOrigin = process.env.NODE_ENV !== 'production' && isLocalDevOrigin(origin);

        if (isAllowed || isAllowedDevOrigin) {
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

const getBearerToken = (authorizationHeader = '') => {
    if (typeof authorizationHeader !== 'string') return null;
    const [scheme, token] = authorizationHeader.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
        return null;
    }
    return token.trim();
};

// Shared helper for Supabase service role client validation
const createServiceRoleClient = () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
        throw new Error('VITE_SUPABASE_URL not configured');
    }
    if (!serviceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
};

const isAdminUser = (user) => {
    const email = (user?.email || '').toLowerCase();
    const role = String(user?.app_metadata?.role || '').toLowerCase();
    const hasAdminClaim = user?.app_metadata?.is_admin === true || user?.user_metadata?.is_admin === true;

    return hasAdminClaim || role === 'admin' || role === 'super_admin' || ADMIN_EMAILS.includes(email);
};

const requireAdminAuth = async (req, res, next) => {
    try {
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return res.status(500).json({ error: 'Supabase auth config missing on server' });
        }

        const token = getBearerToken(req.headers.authorization);
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized: Bearer token required' });
        }

        const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        if (!isAdminUser(user)) {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }

        req.adminUser = { id: user.id, email: user.email || null };
        next();
    } catch (error) {
        console.error('Admin auth error:', error);
        return res.status(500).json({ error: 'Admin auth failed' });
    }
};

// Middleware
app.use(cors(corsOptions));
app.use((err, req, res, next) => {
    if (err?.message === 'CORS: Origin not allowed') {
        return res.status(403).json({
            error: 'CORS: Origin not allowed',
            origin: req.headers.origin || null
        });
    }
    return next(err);
});
app.use(express.json({ limit: '50mb' })); // Increased limit for file uploads

// Rate Limiting Configuration
const aiRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 30, // Max 30 requests per minute per IP
    message: {
        error: 'Çok fazla istek gönderdiniz. Lütfen bir dakika bekleyip tekrar deneyin.',
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
    if (!history || history.length === 0) return "Sohbet geçmişi yok.";
    return history.map(msg => `${msg.role === 'user' ? 'Kullanıcı' : 'Asistan'}: ${msg.text}`).join('\n');
};

const formatPartiesForPrompt = (parties) => {
    if (!parties) return "Taraf bilgisi sağlanmadı.";
    const partyEntries = Object.entries(parties).filter(([, value]) => value && value.trim() !== '');
    if (partyEntries.length === 0) return "Taraf bilgisi sağlanmadı.";

    const labelMap = {
        plaintiff: 'Davacı',
        defendant: 'Davalı',
        appellant: 'Başvuran / İtiraz Eden',
        counterparty: 'Karşı Taraf',
        complainant: 'Müşteki / Şikayetçi',
        suspect: 'Şüpheli',
        party1: 'Taraf 1',
        party2: 'Taraf 2',
    };

    return partyEntries
        .map(([key, value]) => `${labelMap[key] || key}: ${value}`)
        .join('\n');
};

const formatCaseDetailsForPrompt = (details) => {
    if (!details) return "Dava künye bilgisi sağlanmadı.";
    const detailEntries = [
        details.court && `Mahkeme: ${details.court}`,
        details.fileNumber && `Dosya Numarası (Esas No): ${details.fileNumber}`,
        details.decisionNumber && `Karar Numarası: ${details.decisionNumber}`,
        details.decisionDate && `Karar Tarihi: ${details.decisionDate}`,
    ].filter(Boolean);

    if (detailEntries.length === 0) return "Dava künye bilgisi sağlanmadı.";
    return detailEntries.join('\n');
}

const formatLawyerInfoForPrompt = (lawyerInfo) => {
    if (!lawyerInfo || !lawyerInfo.name) return "Vekil bilgisi sağlanmadı.";

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
    if (!contactInfo || contactInfo.length === 0) return "İletişim bilgisi sağlanmadı.";

    return contactInfo.map((contact, index) => {
        const entries = [
            `--- Kişi/Kurum ${index + 1} ---`,
            contact.name && `Ad: ${contact.name}`,
            contact.address && `Adres: ${contact.address}`,
            contact.phone && `Telefon: ${contact.phone}`,
            contact.email && `Email: ${contact.email}`,
            contact.tcNo && `TC No: ${contact.tcNo}`,
        ].filter(Boolean);
        return entries.join('\n');
    }).join('\n\n');
}

const RAG_CHUNK_SIZE = Math.max(300, Number.parseInt(process.env.RAG_CHUNK_SIZE || '900', 10));
const RAG_CHUNK_OVERLAP = Math.max(40, Number.parseInt(process.env.RAG_CHUNK_OVERLAP || '120', 10));
const RAG_MAX_CHUNKS = Math.max(3, Number.parseInt(process.env.RAG_MAX_CHUNKS || '8', 10));
const RAG_MAX_TOTAL_CHARS = Math.max(1200, Number.parseInt(process.env.RAG_MAX_TOTAL_CHARS || '7000', 10));
const RAG_TEMPLATE_TOP_K = Math.max(1, Number.parseInt(process.env.RAG_TEMPLATE_TOP_K || '4', 10));
const RAG_MAX_QUERY_TOKENS = Math.max(6, Number.parseInt(process.env.RAG_MAX_QUERY_TOKENS || '22', 10));

const RAG_STOPWORDS = new Set([
    've', 'veya', 'ile', 'icin', 'için', 'ama', 'fakat', 'gibi', 'daha', 'kadar',
    'olan', 'olanlar', 'olarak', 'bu', 'su', 'şu', 'o', 'bir', 'iki', 'uc', 'üç',
    'de', 'da', 'mi', 'mu', 'mü', 'mı', 'ki', 'ya', 'yada', 'hem',
    'en', 'cok', 'çok', 'az', 'sonra', 'once', 'önce', 'son', 'ilk', 'her', 'tum',
    'tüm', 'hakkinda', 'hakkında', 'oldu', 'olur', 'olsun'
]);

const normalizeRagText = (value = '') => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenizeRagText = (value = '') => {
    const normalized = normalizeRagText(value);
    if (!normalized) return [];
    const seen = new Set();
    const tokens = [];

    normalized.split(' ').forEach((token) => {
        const t = token.trim();
        if (!t || t.length < 2) return;
        if (RAG_STOPWORDS.has(t)) return;
        if (seen.has(t)) return;
        seen.add(t);
        tokens.push(t);
    });

    return tokens;
};

const scoreRagText = (normalizedHaystack = '', queryTokens = []) => {
    if (!normalizedHaystack || !Array.isArray(queryTokens) || queryTokens.length === 0) return 0;
    let score = 0;

    for (const token of queryTokens) {
        if (!token) continue;
        if (normalizedHaystack.includes(token)) {
            score += token.length >= 7 ? 4 : token.length >= 5 ? 3 : 2;
        }
    }

    return score;
};

const chunkTextForRag = (text = '', source = 'source') => {
    const normalized = String(text || '').replace(/\r/g, '').trim();
    if (!normalized) return [];

    if (normalized.length <= RAG_CHUNK_SIZE) {
        return [{ source, text: normalized }];
    }

    const chunks = [];
    let start = 0;
    let index = 0;

    while (start < normalized.length) {
        const end = Math.min(normalized.length, start + RAG_CHUNK_SIZE);
        const chunkText = normalized.slice(start, end).trim();
        if (chunkText) {
            chunks.push({ source: `${source}#${index + 1}`, text: chunkText });
            index += 1;
        }
        if (end >= normalized.length) break;
        start = Math.max(0, end - RAG_CHUNK_OVERLAP);
    }

    return chunks;
};

const buildTemplateRagDocs = (queryTokens = []) => {
    const templates = Array.isArray(SANITIZED_TEMPLATES) ? SANITIZED_TEMPLATES : [];
    if (templates.length === 0) return [];

    const ranked = templates
        .map((template) => {
            const lookupText = [
                template?.title || '',
                template?.description || '',
                template?.category || '',
                template?.subcategory || '',
                Array.isArray(template?.variables)
                    ? template.variables.map(v => `${v?.key || ''} ${v?.label || ''}`).join(' ')
                    : '',
                String(template?.content || '').slice(0, 1800),
            ].join('\n');

            return {
                template,
                score: scoreRagText(normalizeRagText(lookupText), queryTokens),
            };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, RAG_TEMPLATE_TOP_K);

    return ranked.map(({ template }) => ({
        source: `template:${template.id}:${template.title || 'untitled'}`,
        text: [
            `Template Title: ${template.title || ''}`,
            `Category: ${template.category || ''} / ${template.subcategory || ''}`,
            `Description: ${template.description || ''}`,
            `Variables: ${Array.isArray(template.variables) ? template.variables.map(v => v?.key).filter(Boolean).join(', ') : ''}`,
            `Content: ${String(template.content || '').slice(0, 2600)}`,
        ].filter(Boolean).join('\n'),
    }));
};

const buildLightweightRagContext = ({
    queryText = '',
    analysisSummary = '',
    context = {},
    chatHistory = [],
    petitionPayload = null,
} = {}) => {
    let queryTokens = tokenizeRagText(queryText).slice(0, RAG_MAX_QUERY_TOKENS);
    if (queryTokens.length === 0) {
        queryTokens = tokenizeRagText(`${analysisSummary || ''} ${context?.specifics || ''}`).slice(0, RAG_MAX_QUERY_TOKENS);
    }

    const docs = [];
    const pushDoc = (source, text) => {
        if (typeof text !== 'string') return;
        const cleaned = text.trim();
        if (!cleaned) return;
        docs.push({ source, text: cleaned });
    };

    pushDoc('analysis_summary', analysisSummary);
    pushDoc('keywords', context?.keywords || '');
    pushDoc('web_summary', context?.searchSummary || '');
    pushDoc('legal_summary', context?.legalSummary || '');
    pushDoc('doc_content', context?.docContent || '');
    pushDoc('specifics', context?.specifics || '');

    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
        const recent = chatHistory.slice(-8);
        recent.forEach((message, idx) => {
            if (message?.role !== 'user') return;
            if (typeof message?.text !== 'string') return;
            pushDoc(`chat_user_${idx + 1}`, message.text);
        });
    }

    if (petitionPayload && typeof petitionPayload === 'object') {
        pushDoc('petition_web_research', String(petitionPayload.webSearchResult || ''));
        pushDoc('petition_legal_research', String(petitionPayload.legalSearchResult || ''));
    }

    const templateDocs = buildTemplateRagDocs(queryTokens);
    templateDocs.forEach(doc => docs.push(doc));

    if (docs.length === 0) return '';

    const chunkCandidates = docs.flatMap(doc => chunkTextForRag(doc.text, doc.source));
    const scored = chunkCandidates
        .map(chunk => {
            const normalizedChunk = normalizeRagText(chunk.text);
            return {
                ...chunk,
                score: scoreRagText(normalizedChunk, queryTokens),
            };
        })
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.text.length - a.text.length;
        });

    let selected = scored.filter(item => item.score > 0);
    if (selected.length === 0) {
        selected = scored.slice(0, RAG_MAX_CHUNKS);
    }

    const lines = [];
    let totalChars = 0;
    let emitted = 0;

    for (const item of selected) {
        if (emitted >= RAG_MAX_CHUNKS) break;
        const compact = item.text.replace(/\s+/g, ' ').trim();
        if (!compact) continue;

        const bounded = compact.length > 900 ? `${compact.slice(0, 900)}...` : compact;
        const line = `[${emitted + 1}] ${item.source}: ${bounded}`;

        if (totalChars + line.length > RAG_MAX_TOTAL_CHARS && emitted > 0) {
            break;
        }

        lines.push(line);
        totalChars += line.length;
        emitted += 1;
    }

    return lines.join('\n');
};

// --- API Endpoints ---

// Apply auth middleware to all /api/gemini routes
app.use('/api/gemini', authMiddleware);
app.use('/api/html-to-docx', authMiddleware);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Templates endpoint
app.all('/api/templates', (req, res) => templatesHandler(req, res));

// 1. Analyze Documents
app.post('/api/gemini/analyze', async (req, res) => {
    try {
        const { uploadedFiles, udfTextContent, wordTextContent } = req.body;
        console.log('Analyze Request Received');

        const model = AI_CONFIG.MODEL_NAME;
        const systemInstruction = `Sen Türk hukukunda uzmanlaşmış bir hukuk asistanısın. Görevin, sağlanan belgeleri, resimleri ve metinleri titizlikle analiz etmektir. Temel bilgileri çıkar, tüm potansiyel tarafları (şahıslar, şirketler) belirle ve eğer varsa dava künyesi bilgilerini (mahkeme adı, dosya/esas no, karar no, karar tarihi) tespit et. Ayrıca belgelerden avukat/vekil bilgilerini (isim, baro, baro sicil no, adres, telefon, email) ve diğer iletişim bilgilerini çıkar. Çıktını JSON nesnesi olarak yapılandır. Analiz özetinin HER ZAMAN Türkçe olmasını sağla.`;

        const promptText = `
Lütfen SANA GÖNDERİLEN PDF belgelerini, resim dosyalarını ve aşağıdaki metin olarak sağlanan UDF ve Word belgelerinin içeriğini titizlikle analiz et.

**ANA GÖREVLER:**
1. Olayın detaylı ve Türkçe bir özetini oluştur. **ÖZETİ MUTLAKA PARAGRAFLARA BÖLEREK YAZ (paragraflar arasında '\\n\\n' boşlukları bırak)**, tek parça blok yazı KESİNLİKLE kullanma.
2. Metinde adı geçen tüm potansiyel tarafları listele
3. Dava künyesi bilgilerini çıkar (mahkeme, dosya numarası, karar numarası, karar tarihi)
4. **ÖNEMLİ:** Avukat/vekil bilgilerini bul ve çıkar:
   - Avukat adı soyadı (genellikle "Av." veya "Avukat" ile başlar)
   - Baro adı ("... Barosu" formatında)
   - Baro sicil numarası
   - İş adresi
   - Telefon numarası
   - Email adresi
5. Diğer iletişim bilgilerini çıkar (tarafların adres, telefon, email bilgileri)

**UDF Belge İçerikleri:**
${udfTextContent || "UDF belgesi yüklenmedi."}

**Word Belge İçerikleri:**
${wordTextContent || "Word belgesi yüklenmedi."}

**ÇIKTI FORMATI:**
Sonucu 'summary', 'potentialParties', 'caseDetails', 'lawyerInfo' ve 'contactInfo' anahtarlarına sahip bir JSON nesnesi olarak döndür.
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
                        summary: { type: Type.STRING, description: 'Documentsların detaylı Türkçe özeti.' },
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
                            description: 'Avukat/vekil bilgileri (eğer belgede varsa)',
                            properties: {
                                name: { type: Type.STRING, description: 'Avukatın tam adı' },
                                address: { type: Type.STRING, description: 'Avukatın iş adresi' },
                                phone: { type: Type.STRING, description: 'Telefon numarası' },
                                email: { type: Type.STRING, description: 'Email adresi' },
                                barNumber: { type: Type.STRING, description: 'Baro sicil numarası' },
                                bar: { type: Type.STRING, description: 'Baro adı (örn: Ankara Barosu)' },
                                title: { type: Type.STRING, description: 'Unvan (örn: Avukat)' },
                                tcNo: { type: Type.STRING, description: 'TC Kimlik No (eğer varsa)' }
                            }
                        },
                        contactInfo: {
                            type: Type.ARRAY,
                            description: 'Diğer iletişim bilgileri (tarafların adresleri, telefonları)',
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING, description: 'Kişi/Kurum adı' },
                                    address: { type: Type.STRING, description: 'Adres' },
                                    phone: { type: Type.STRING, description: 'Telefon' },
                                    email: { type: Type.STRING, description: 'Email' },
                                    tcNo: { type: Type.STRING, description: 'TC Kimlik No (eğer varsa)' }
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
        const systemInstruction = `Sen Türk Hukuku alanında uzman, stratejik bir araştırma asistanısın. Görevin, verilen vaka özetini analiz ederek, kullanıcının '${userRole}' olan rolünü hukuki olarak en güçlü konuma getirecek anahtar kelimeleri belirlemektir. Oluşturacağın anahtar kelimeler, kullanıcının lehine olan Yargıtay kararlarını, mevzuatı ve hukuki argümanları bulmaya odaklanmalıdır. Çıktı olarak SADECE 'keywords' anahtarını içeren ve bu anahtarın değerinin bir string dizisi olduğu bir JSON nesnesi döndür.`;
        const promptText = `Sağlanan vaka özeti:\n\n"${analysisText}"\n\nBu özete dayanarak... (kısaltıldı)`; // Simplified prompt for brevity in this file context

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

// 3. Web Search - Enhanced for Yargıtay Decisions
app.post('/api/gemini/web-search', async (req, res) => {
    try {
        const { keywords, query } = req.body;

        // Handle both keywords array and single query string
        const searchTerms = keywords || (query ? [query] : []);

        if (!Array.isArray(searchTerms) || searchTerms.length === 0) {
            return res.status(400).json({ error: 'Keywords veya query parametresi gerekli' });
        }

        const model = AI_CONFIG.MODEL_NAME;

        const systemInstruction = `Sen, Türk hukuku alanında uzman bir araştırma asistanısın. 
Görevin özellikle YARGITAY KARARLARI bulmak ve bunları dilekçede kullanılabilir formatta sunmaktır.

## KRİTİK GÖREV: YARGITAY KARARLARI BULMA

Her aramada şunları tespit etmeye çalış:
1. **Karar Künyesi:** Daire, Esas No, Karar No, Tarih (örn: "Yargıtay 9. HD., E. 2023/1234, K. 2023/5678, T. 15.03.2023")
2. **Karar Özeti:** 1-2 cümlelik özet
3. **İlgili Kanun Maddesi:** Kararda atıf yapılan mevzuat

## ÇIKTI FORMATI

Çıktını şu şekilde yapılandır:

### EMSAL YARGITAY KARARLARI

**1. [Yargıtay X. HD., E. XXXX/XXXX, K. XXXX/XXXX, T. XX.XX.XXXX]**
Özet: [Kararın özeti]
İlgili Mevzuat: [Kanun maddesi]

**2. [Diğer karar]**
...

### İLGİLİ MEVZUAT

- [Kanun Adı] m. [madde no]: [madde özeti]

### ARAŞTIRMA ÖZETİ

[Bulunan karar ve mevzuata dayalı genel hukuki değerlendirme]

NOT: En az 3-5 emsal karar bulmaya çalış. Bulamazsan "Bu konuda emsal karar bulunamadı" yaz.`;

        // Generate search queries for Yargıtay and legislation
        const yargitayQueries = searchTerms.map(kw => `"${kw}" Yargıtay karar emsal`);
        const mevzuatQueries = searchTerms.map(kw => `"${kw}" kanun maddesi hüküm`);
        const uyapQueries = searchTerms.map(kw => `"${kw}" site:karararama.yargitay.gov.tr`);

        const promptText = `
## ARAMA GÖREVİ: YARGITAY KARARLARI VE MEVZUAT

Aşağıdaki konularda kapsamlı bir hukuki araştırma yap:

### ANAHTAR KELİMELER
${searchTerms.join(', ')}

### ARAMA STRATEJİSİ

**1. Yargıtay Kararları (Öncelikli)**
${yargitayQueries.map(q => `- ${q}`).join('\n')}

**2. UYAP Karar Arama**
${uyapQueries.map(q => `- ${q}`).join('\n')}

**3. Mevzuat Araması**
${mevzuatQueries.map(q => `- ${q}`).join('\n')}

---

## BEKLENTİLER

1. **En az 3-5 Yargıtay kararı** bul (mümkünse)
2. Her karar için TAM KÜNYESİNİ yaz (Daire, E., K., Tarih)
3. İlgili kanun maddelerini listele
4. Araştırma özetini hazırla

âš ï¸ ÖNEMLİ: Karar künyelerini doğru ve eksiksiz yaz. Bu bilgiler dilekçede referans olarak kullanılacak.
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
        const generationCredit = await consumeGenerationCredit(req, 'generate_petition');
        if (!generationCredit.allowed) {
            return res.status(generationCredit.status).json(generationCredit.payload);
        }

        const params = req.body;
        const model = AI_CONFIG.MODEL_NAME;
        const ragContext = buildLightweightRagContext({
            queryText: [
                params?.petitionType || '',
                params?.userRole || '',
                params?.analysisSummary || '',
                params?.specifics || '',
                params?.webSearchResult || '',
                params?.legalSearchResult || '',
            ].join(' '),
            analysisSummary: params?.analysisSummary || '',
            context: {
                keywords: '',
                searchSummary: params?.webSearchResult || '',
                legalSummary: params?.legalSearchResult || '',
                docContent: params?.docContent || '',
                specifics: params?.specifics || '',
            },
            chatHistory: Array.isArray(params?.chatHistory) ? params.chatHistory : [],
            petitionPayload: params,
        });

        const systemInstruction = `Sen, Türk hukuk sisteminde 20+ yıl deneyime sahip, üst düzey bir hukuk danışmanı ve dilekçe yazım uzmanısın.

## SENİN GÖREVİN
Sağlanan ham verileri, profesyonel ve ikna edici bir hukuki anlatıya dönüştürmek. Ham bilgileri olduğu gibi kopyalamak DEĞİL, bunları hukuki bir dil ve mantıksal akış içinde sentezlemek.

## KRİTİK YAZIM KURALLARI

### 1. AÇIKLAMALAR BÖLÜMÜ NASIL YAZILMALI
âŒ YANLIŞ (Ham veri dökümü):
"Davalı kurum tarafından müvekkil HÜSEYİN ÇELİK adına 'kaçak elektrik tahakkuk hesap detayı' düzenlenmiş olup, bu belge müvekkilime tebliğ edilmiştir. İşbu tahakkukta, müvekkilimin Tesisat No (4004311180), Müşteri No (205539133), TC Kimlik No (41038011064)..."

âœ… DOĞRU (Profesyonel hukuki anlatı):
"1. Müvekkilim, davalı kurumun abonesi olup, söz konusu taşınmazda ikamet etmektedir.

2. Davalı kurum, müvekkilim aleyhine "kaçak elektrik kullanımı" iddiasıyla tahakkuk işlemi başlatmış ve 25.275,55 TL tutarında borç çıkarmıştır.

3. Yapılan incelemede, müvekkilimin sayacının (Seri No: CE000624281) herhangi bir müdahale izine rastlanmamış olup, iddia edilen kaçak kullanım tespiti usulsüz bir şekilde gerçekleştirilmiştir.

4. Şöyle ki; [olay detayları kronolojik sırayla anlatılmalı]..."

### 2. âš ï¸ EMSAL KARARLARIN KULLANIMI (ÇOK ÖNEMLİ)
Yargıtay/Danıştay kararları SADECE "HUKUKİ SEBEPLER" bölümüne listelenmemeli!

âŒ YANLIŞ (Sadece listeleme):
"## HUKUKİ SEBEPLER
- Yargıtay 9. HD., E. 2023/1234, K. 2023/5678
- Yargıtay 3. HD., E. 2022/5678, K. 2022/9999"

âœ… DOĞRU (İlgili argümanla entegre):
"## AÇIKLAMALAR
...
4. Davalı kurumun iddia ettiği kaçak elektrik kullanımının somut delilleri bulunmamaktadır. Nitekim Yargıtay 3. Hukuk Dairesi'nin E. 2022/5678, K. 2022/9999, T. 15.03.2023 tarihli kararında: 'Kaçak elektrik kullanımı iddiasının ispatı davalıya aittir. Sayaç mührü üzerinde herhangi bir müdahale izi tespit edilememişse kaçak elektrik kullanımından söz edilemez' şeklinde hükmedilmiştir. Somut olayda da sayaçta herhangi bir müdahale izi tespit edilememiştir.

5. Ayrıca tahakkuk edilen miktar da fahiştir. Yargıtay 3. HD., E. 2021/4567 kararında da belirtildiği üzere, 'Tüketim miktarının belirlenmesinde gerçek tüketim değerleri esas alınmalıdır.'
..."

### 3. BÖLÜM YAPISI (Kesin sıra)
Her dilekçede şu bölümler MUTLAKA bulunmalı ve bu sırayla yazılmalı:

## [MAHKEME/MAKAM ADI - BÜYÜK HARFLERLE, ORTALI]

**DOSYA NO:** [varsa]

---

**DAVACI/BAŞVURAN:**
[Ad Soyad]
TC: [Kimlik No]
Adres: [Adres]

**VEKİLİ:** [varsa]
[Avukat bilgileri]

**DAVALI/KARŞI TARAF:**
[Kurum/Kişi adı]
Adres: [Adres]

---

**KONU:** [Tek cümlelik özet - örn: "Kaçak elektrik tahakkuku iddiasına itiraz hakkındadır."]

---

## AÇIKLAMALAR

[Numaralı maddeler halinde, her madde ayrı paragraf]

1. [Giriş: Tarafların tanıtımı ve temel ilişki]

2. [Olay: Ne oldu, kronolojik anlatım]

3. [Sorun: Neden haksız/hukuka aykırı + DESTEKLEYİCİ EMSAL KARAR]

4. [Deliller ve destekleyici argümanlar + İLGİLİ YARGITAY KARARI]

5. [Sonuç çıkarımı]

---

## HUKUKİ SEBEPLER

- [İlgili Kanun maddesi ve açıklaması]
- [Yukarıda atıf yapılan emsal kararların özet listesi]

---

## DELİLLER

1. [Delil listesi]

---

## SONUÇ VE İSTEM

Yukarıda arz ve izah edilen sebeplerle;
- [Talep 1]
- [Talep 2]
... kararı verilmesini saygılarımla arz ve talep ederim.

[Tarih]
[Ad Soyad / Vekil]

### 4. DİL VE ÜSLUP KURALLARI
- "Müvekkil" kelimesini tutarlı kullan
- Resmi hitap formu kullan: "Sayın Mahkemeniz", "arz ve talep ederim"
- Teknik verileri (TC No, dosya no) akıcı cümle içinde yerleştir, liste olarak değil
- Hukuki terimler kullan: "haksız fiil", "usulsüz işlem", "hukuka aykırılık" vb.
- Her paragraf bir ana fikir içermeli
- Gereksiz tekrarlardan kaçın
- EMSAL KARARLARI ilgili argümana entegre et, ayrı liste yapma`;

        const promptText = `
## DİLEKÇE OLUŞTURMA TALİMATI

Aşağıdaki HAM VERİLERİ kullanarak PROFESYONEL bir Türk hukuk dilekçesi hazırla.

âš ï¸ ÖNEMLİ: Ham verileri olduğu gibi kopyalama! Bunları hukuki bir anlatıya dönüştür.

---

### GİRDİ VERİLERİ

**Dilekçe Türü:** ${params.petitionType}
**Kullanıcının Rolü:** ${params.userRole}

**Dava Künyesi:**
${formatCaseDetailsForPrompt(params.caseDetails)}

**Vekil Bilgileri:**
${formatLawyerInfoForPrompt(params.lawyerInfo)}

**Taraflar:**
${formatPartiesForPrompt(params.parties)}

**Olay Özeti (Ham):**
${params.analysisSummary || "Olay özeti sağlanmadı."}

**Hukuki Araştırma:**
${params.webSearchResult || "Web araştırması sonucu sağlanmadı."}

**Emsal Yargıtay/Danıştay Kararları:**
${params.legalSearchResult || "Emsal karar araştırması yapılmadı."}

**Ek Notlar:**
${params.docContent || "Ek metin sağlanmadı."}

**Özel Talimatlar:**
${params.specifics || "Özel talimat sağlanmadı."}

**Sohbet Geçmişi:**
${formatChatHistoryForPrompt(params.chatHistory)}

**RAG Destek Baglami (ilgili parcalar):**
${ragContext || "RAG baglami bulunamadi."}

---

## BEKLENEN ÇIKTI

Yukarıdaki ham verileri kullanarak:
1. Profesyonel, ikna edici bir hukuki anlatı oluştur
2. Her bölümü (AÇIKLAMALAR, HUKUKİ SEBEPLER, DELİLLER, SONUÇ VE İSTEM) ayrı ayrı formatla
3. Numaralı maddelerde akıcı paragraflar kullan, ham veri listesi değil
4. Mahkemeye sunulmaya hazır, resmi bir dilekçe formatında yaz
5. Markdown formatını kullan (## başlıklar, **kalın**, 1. 2. 3. listeler)
6. âš ï¸ EMSAL KARARLARI: Yargıtay kararlarını ilgili argümanla birlikte AÇIKLAMALAR bölümünde kullan. "Nitekim Yargıtay X. HD., E. .../..., K. .../... kararında '...' şeklinde hükmedilmiştir" formatında entegre et.
`;

        const response = await ai.models.generateContent({
            model,
            contents: promptText,
            config: { systemInstruction },
        });

        res.json({
            text: response.text,
            usage: generationCredit.usage || null,
        });
    } catch (error) {
        console.error('Generate Petition Error:', error);
        const statusCode = Number(error?.status || 500);
        res.status(statusCode).json({ error: error.message });
    }
});

const GEMINI_INLINE_SUPPORTED_MIME_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif',
]);

const MAX_GEMINI_TEXT_FILE_CHARS = 12000;

const normalizeGeminiMimeType = (value = '') => String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

const decodeBase64Utf8 = (base64Value = '') => {
    try {
        return Buffer.from(String(base64Value || ''), 'base64').toString('utf8').replace(/\0/g, '').trim();
    } catch {
        return '';
    }
};

const appendGeminiFileParts = (parts, files = []) => {
    if (!Array.isArray(parts) || !Array.isArray(files)) return;

    files.forEach((file, index) => {
        const mimeType = normalizeGeminiMimeType(file?.mimeType || '');
        const data = typeof file?.data === 'string' ? file.data.trim() : '';
        const safeName = String(file?.name || `dosya-${index + 1}`).trim();
        if (!data) return;

        if (GEMINI_INLINE_SUPPORTED_MIME_TYPES.has(mimeType)) {
            parts.push({
                inlineData: {
                    mimeType,
                    data,
                }
            });
            return;
        }

        if (mimeType.startsWith('text/')) {
            const decodedText = decodeBase64Utf8(data);
            if (decodedText) {
                parts.push({
                    text: `[Yuklenen Metin Dosyasi: ${safeName}]\n${decodedText.slice(0, MAX_GEMINI_TEXT_FILE_CHARS)}`
                });
                return;
            }
        }

        parts.push({
            text: `[Desteklenmeyen dosya turu atlandi: ${safeName} (${mimeType || 'bilinmiyor'})]`
        });
    });
};

// 5. Chat Stream - Enhanced with document generation capability
app.post('/api/gemini/chat', async (req, res) => {
    try {
        const { chatHistory, analysisSummary, context, files } = req.body;
        const safeChatHistory = Array.isArray(chatHistory) ? chatHistory : [];
        const safeContext = context && typeof context === 'object' ? context : {};
        const requestFiles = Array.isArray(files) ? files : [];
        const model = AI_CONFIG.MODEL_NAME;
        const latestUserMessage = extractLatestUserMessage(safeChatHistory);
        const ragContext = buildLightweightRagContext({
            queryText: [
                latestUserMessage || '',
                safeContext?.keywords || '',
                safeContext?.specifics || '',
                safeContext?.docContent || '',
            ].join(' '),
            analysisSummary: analysisSummary || '',
            context: safeContext,
            chatHistory: safeChatHistory,
        });
        let hasConsumedDocumentCredit = false;

        if (isLikelyDocumentGenerationRequest(latestUserMessage)) {
            const initialCredit = await consumeGenerationCredit(req, 'chat_document_generation');
            if (!initialCredit.allowed) {
                return res.status(initialCredit.status).json(initialCredit.payload);
            }
            hasConsumedDocumentCredit = true;
        }

        const contextPrompt = `
**MEVCUT DURUM VE BAĞLAM:**
- **Vaka Özeti:** ${analysisSummary || "Henüz analiz yapılmadı."}
- **Mevcut Arama Anahtar Kelimeleri:** ${safeContext.keywords || "Henüz anahtar kelime oluşturulmadı."}
- **Web Araştırma Özeti:** ${safeContext.searchSummary || "Henüz web araştırması yapılmadı."}
- **Emsal Karar Özeti:** ${safeContext.legalSummary || "Henüz emsal karar özeti sağlanmadı."}
- **Kullanıcının Ek Metinleri:** ${safeContext.docContent || "Ek metin sağlanmadı."}
- **Kullanıcının Özel Talimatları:** ${safeContext.specifics || "Özel talimat sağlanmadı."}
- **RAG Destek Baglami:** ${ragContext || "RAG baglami bulunamadi."}
${requestFiles.length > 0 ? `- **Yüklenen Belgeler:** ${requestFiles.length} adet dosya yüklendi (${requestFiles.map(f => f.name).join(', ')})` : ''}
`;

        const systemInstruction = `Sen, Türk Hukuku konusunda uzman, yardımsever ve proaktif bir hukuk asistanısın.

**SENİN GÖREVLERİN:**
1. Kullanıcının hukuki sorularını yanıtlamak
2. Dava stratejisi konusunda beyin fırtınası yapmak
3. Hukuki terimleri açıklamak
4. **BELGE ANALİZİ: Kullanıcı dosya yüklediğinde, bu dosyaları analiz et ve sorularını yanıtla**
5. **ÖNEMLİ: Kullanıcı belge/dilekçe/talep hazırlamanı istediğinde, generate_document fonksiyonunu kullan**
6. **KRİTİK: Kullanıcı Yargıtay kararı/emsal karar araması istediğinde, GERÇEK bir Google araması yap**

**BELGE ANALİZİ KURALLARI:**
Kullanıcı dosya yüklediğinde:
- PDF veya resim dosyalarını dikkatlice incele
- İçeriği özetle ve anahtar bilgileri çıkar
- Hukuki açıdan önemli noktaları vurgula
- Kullanıcının sorularını belge içeriğine göre yanıtla

**YARGITAY KARARI ARAMA KURALLARI:**
Kullanıcı şunları söylediğinde GERÇEK bir web araması yap:
- "Yargıtay kararı ara", "emsal karar bul", "içtihat araştır"
- "Bu konuda Yargıtay ne diyor?", "Yargıtay kararlarını bul"
- "Karar künyesi ver", "emsal karar listele"

Arama yaparken:
1. Mevcut bağlamdaki anahtar kelimeleri kullan
2. "site:karararama.yargitay.gov.tr" veya "Yargıtay" anahtar kelimesi ekle
3. Bulunan kararların TAM KÜNYESİNİ ver (Daire, Esas No, Karar No, Tarih)
4. Her karar için kısa bir özet yaz

**ÇIKTI FORMATI (Yargıtay Araması):**
### BULUNAN YARGITAY KARARLARI

**1. Yargıtay X. HD., E. XXXX/XXXX, K. XXXX/XXXX, T. XX.XX.XXXX**
Özet: [Karar özeti]
Kaynak: [URL varsa]

**2. ...**

**BELGE TALEBİ TESPİT KURALLARI:**
Kullanıcı şunları söylediğinde generate_document fonksiyonunu MUTLAKA çağır:
- "... hazırla", "... oluştur", "... yaz" (dilekçe, talep, itiraz vb. ile birlikte)
- "haricen tahsil talebi", "ihtarname", "feragat dilekçesi" vb. belge isimleri
- "bana bir ... hazırla"
- "... için dilekçe lazım"

**BELGE TÜRÜ ÖRNEKLERİ:**
- harici_tahsil_talebi: Haricen tahsil talebi/yazısı
- ihtarname: İhtarname
- dava_dilekçesi: Dava dilekçesi
- itiraz_dilekçesi: İtiraz dilekçesi
- feragat_dilekçesi: Feragat dilekçesi
- cevap_dilekçesi: Cevap dilekçesi
- temyiz_dilekçesi: Temyiz dilekçesi
- icra_takip_talebi: İcra takip talebi
- genel_dilekçe: Genel dilekçe/belge

**LIMIT KURALI:**
- Belge olustururken mutlaka generate_document fonksiyonunu kullan.
- generate_document fonksiyonu cagirmadan tam belge metni verme.

İşte mevcut davanın bağlamı:
${contextPrompt}

Türkçe yanıt ver. Yargıtay kararı aranması istendiğinde Google Search ile GERÇEK arama yap ve künyeli sonuçlar sun.`;

        // Function for updating keywords
        const updateKeywordsFunction = {
            name: 'update_search_keywords',
            description: 'Kullanıcı anahtar kelime eklenmesini istediğinde bu fonksiyonu kullan.',
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
            description: 'Kullanıcı bir belge, dilekçe veya resmi yazı hazırlanmasını istediğinde bu fonksiyonu kullan. Örnek: "harici tahsil talebi hazırla", "ihtarname yaz", "feragat dilekçesi oluştur".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    documentType: {
                        type: Type.STRING,
                        description: 'Belge türü: harici_tahsil_talebi, ihtarname, dava_dilekçesi, itiraz_dilekçesi, feragat_dilekçesi, cevap_dilekçesi, temyiz_dilekçesi, icra_takip_talebi, genel_dilekçe'
                    },
                    documentTitle: {
                        type: Type.STRING,
                        description: 'Belgenin başlığı (örn: "HARİCEN TAHSİL TALEBİ", "İHTARNAME")'
                    },
                    documentContent: {
                        type: Type.STRING,
                        description: 'Belgenin tam içeriği - Türk hukuk formatına uygun, markdown formatında, bölümlere ayrılmış. Mevcut bağlam bilgilerini kullan.'
                    }
                },
                required: ['documentType', 'documentTitle', 'documentContent'],
            },
        };
        // Function for searching Yargıtay decisions
        const searchYargitayFunction = {
            name: 'search_yargitay',
            description: 'Kullanıcı Yargıtay kararı araması istediğinde bu fonksiyonu kullan. Örnek: "Yargıtay kararı ara", "emsal karar bul", "içtihat araştır".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    searchQuery: {
                        type: Type.STRING,
                        description: 'Aranacak konu. Mevcut bağlamdaki anahtar kelimeleri ve konuyu içermeli.'
                    },
                    keywords: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Arama için kullanılacak anahtar kelimeler listesi'
                    }
                },
                required: ['searchQuery'],
            },
        };

        // Build contents array - include files if provided
        const contents = safeChatHistory.map(msg => {
            const parts = [{ text: msg.text }];

            // If this message has files attached, add them as inline data
            if (msg.files && msg.files.length > 0) {
                appendGeminiFileParts(parts, msg.files);
            }

            return {
                role: msg.role === 'user' ? 'user' : 'model',
                parts: parts
            };
        });

        // Also add files from request body to the last user message if present
        if (requestFiles.length > 0 && contents.length > 0) {
            const lastUserMsgIndex = contents.length - 1;
            if (contents[lastUserMsgIndex].role === 'user') {
                appendGeminiFileParts(contents[lastUserMsgIndex].parts, requestFiles);
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
        let streamBlockedByQuota = false;

        for await (const chunk of responseStream) {
            // Check for function calls
            const candidate = chunk.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.functionCall && part.functionCall.name === 'search_yargitay') {
                        pendingFunctionCalls.push(part.functionCall);
                    }
                    if (part.functionCall && part.functionCall.name === 'generate_document' && !hasConsumedDocumentCredit) {
                        const credit = await consumeGenerationCredit(req, 'chat_document_generation');
                        if (!credit.allowed) {
                            streamBlockedByQuota = true;
                            const quotaChunk = {
                                text: '\n\n⚠️ Gunluk trial belge uretim limitine ulastiniz. Yarin tekrar deneyin veya bir pakete gecin.\n',
                                error: true,
                                code: credit.payload?.code || 'TRIAL_DAILY_LIMIT_REACHED',
                                quotaBlocked: true,
                                usage: {
                                    dailyLimit: credit.payload?.dailyLimit || TRIAL_DAILY_GENERATION_LIMIT,
                                    usedToday: credit.payload?.usedToday || TRIAL_DAILY_GENERATION_LIMIT,
                                    remainingToday: credit.payload?.remainingToday || 0,
                                    trialEndsAt: credit.payload?.trialEndsAt || null,
                                }
                            };
                            res.write(JSON.stringify(quotaChunk) + '\n');
                            break;
                        }
                        hasConsumedDocumentCredit = true;
                    }
                }
            }

            if (streamBlockedByQuota) {
                break;
            }

            // Send chunk as JSON string to handle both text and function calls
            const data = JSON.stringify(chunk);
            res.write(data + '\n'); // Newline delimited JSON
        }

        if (streamBlockedByQuota) {
            res.end();
            return;
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
                            formattedResults += `**${index + 1}. ${result.title || 'Yargıtay Kararı'}**\n`;
                            if (result.esasNo) formattedResults += `E. ${result.esasNo} `;
                            if (result.kararNo) formattedResults += `K. ${result.kararNo} `;
                            if (result.tarih) formattedResults += `T. ${result.tarih}`;
                            formattedResults += '\n';
                            if (result.ozet) formattedResults += `Özet: ${result.ozet}\n`;
                            formattedResults += '\n';
                        });
                    } else {
                        formattedResults += 'Bu konuda emsal karar bulunamadı.\n';
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
                    const errorChunk = { text: '\n\nâš ï¸ Emsal karar araması sırasında bir hata oluştu.\n' };
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
const REWRITE_MODE_CONFIG = {
    fix: {
        systemInstruction: 'Sen Turkce hukuk metni editorusun. Anlami degistirmeden yalnizca dil bilgisi, imla, noktalama ve anlatim netligini duzelt.',
        taskTitle: 'DUZELT',
        taskDescription: 'Metnin anlamini koruyarak imla, noktalama ve ifade sorunlarini duzelt.'
    },
    strengthen: {
        systemInstruction: 'Sen Turkce hukuk metni editorusun. Metni daha ikna edici, tutarli ve profesyonel hale getir; yeni olgu uydurma.',
        taskTitle: 'GUCLENDIR',
        taskDescription: 'Metni hukuki uslup ve ikna gucu acisindan guclendir.'
    },
    rewrite: {
        systemInstruction: 'Sen Turkce hukuk metni editorusun. Metni profesyonel, acik ve resmi bir dille yeniden yaz.',
        taskTitle: 'YENIDEN_YAZ',
        taskDescription: 'Metni profesyonel hukuki dille yeniden yaz.'
    }
};

const isLikelyDocumentGenerationRequest = (rawMessage = '') => {
    if (!rawMessage) return false;
    const text = String(rawMessage).toLocaleLowerCase('tr-TR');
    const hasDocumentIntent = /(dilekce|dilekçe|sozlesme|sözleşme|ihtarname|belge|taslak|metin|talep)/i.test(text);
    const hasGenerationVerb = /(olustur|oluştur|uret|üret|hazirla|hazırla|yaz)/i.test(text);
    return hasDocumentIntent && hasGenerationVerb;
};

const extractLatestUserMessage = (chatHistory = []) => {
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) return '';
    for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
        const item = chatHistory[i];
        if (item?.role === 'user' && typeof item?.text === 'string') {
            return item.text;
        }
    }
    return '';
};

const buildQuotaErrorPayload = ({ trialEndsAt, dailyLimit, usedToday, reason }) => ({
    error: reason === 'trial_expired'
        ? 'Ucretsiz deneme suresi bitti. Belge uretimine devam etmek icin bir pakete gecin.'
        : 'Gunluk trial limitinize ulastiniz. Yarin tekrar deneyin veya bir pakete gecin.',
    code: reason === 'trial_expired' ? 'TRIAL_EXPIRED' : 'TRIAL_DAILY_LIMIT_REACHED',
    trialEndsAt,
    dailyLimit,
    usedToday,
    remainingToday: Math.max(0, (dailyLimit || 0) - (usedToday || 0)),
});

const getAuthenticatedUserFromRequest = async (req) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        const err = new Error('Supabase auth config missing on server');
        err.status = 500;
        throw err;
    }

    const token = getBearerToken(req.headers.authorization);
    if (!token) {
        const err = new Error('Belge uretimi icin giris yapmaniz gerekiyor.');
        err.status = 401;
        throw err;
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
        const err = new Error('Gecersiz oturum. Lutfen tekrar giris yapin.');
        err.status = 401;
        throw err;
    }

    return user;
};

const getOrCreateUserPlan = async (serviceClient, userId) => {
    const { data: existingPlan, error: planError } = await serviceClient
        .from('user_usage_plans')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (planError) {
        throw planError;
    }
    if (existingPlan) {
        return existingPlan;
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const payload = {
        user_id: userId,
        plan_code: 'trial',
        status: 'active',
        trial_starts_at: now.toISOString(),
        trial_ends_at: trialEndsAt,
        daily_limit: TRIAL_DAILY_GENERATION_LIMIT,
    };

    const { data: insertedPlan, error: insertError } = await serviceClient
        .from('user_usage_plans')
        .insert(payload)
        .select('*')
        .single();

    if (insertError) {
        const { data: fallbackPlan, error: fallbackError } = await serviceClient
            .from('user_usage_plans')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
        if (fallbackError || !fallbackPlan) {
            throw insertError;
        }
        return fallbackPlan;
    }

    return insertedPlan;
};

const getTodayIsoDate = () => new Date().toISOString().slice(0, 10);

const parsePositiveLimit = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return Math.floor(parsed);
};

const getUsageCountForDate = async (serviceClient, userId, usageDate) => {
    const { count, error } = await serviceClient
        .from('ai_generation_usage')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('usage_date', usageDate);

    if (error) {
        throw error;
    }

    return count || 0;
};

const buildPlanUsageSummary = async (serviceClient, userId) => {
    const plan = await getOrCreateUserPlan(serviceClient, userId);
    const planCode = String(plan?.plan_code || 'trial').toLowerCase();
    const status = String(plan?.status || 'active').toLowerCase();
    const dailyLimit = parsePositiveLimit(plan?.daily_limit);
    const today = getTodayIsoDate();
    const usedToday = await getUsageCountForDate(serviceClient, userId, today);
    const remainingToday = dailyLimit === null ? null : Math.max(0, dailyLimit - usedToday);

    return {
        user_id: userId,
        plan_code: planCode,
        status,
        daily_limit: dailyLimit,
        used_today: usedToday,
        remaining_today: remainingToday,
        trial_starts_at: plan?.trial_starts_at || null,
        trial_ends_at: plan?.trial_ends_at || null,
    };
};

const consumeGenerationCredit = async (req, actionType = 'document_generation') => {
    const user = await getAuthenticatedUserFromRequest(req);
    const serviceClient = createServiceRoleClient();
    const plan = await getOrCreateUserPlan(serviceClient, user.id);
    const planCode = String(plan?.plan_code || 'trial').toLowerCase();
    const status = String(plan?.status || 'active').toLowerCase();
    const today = getTodayIsoDate();
    const configuredDailyLimit = parsePositiveLimit(plan?.daily_limit);

    if (status !== 'active') {
        return {
            allowed: false,
            status: 403,
            payload: {
                error: 'Paketiniz aktif degil. Lutfen hesap yoneticinizle iletisime gecin.',
                code: 'PLAN_INACTIVE'
            }
        };
    }

    const isTrialPlan = planCode === 'trial';
    const dailyLimit = isTrialPlan
        ? (configuredDailyLimit || TRIAL_DAILY_GENERATION_LIMIT)
        : configuredDailyLimit;
    const usedToday = dailyLimit ? await getUsageCountForDate(serviceClient, user.id, today) : 0;

    if (isTrialPlan) {
        const now = new Date();
        const trialEndsAt = plan?.trial_ends_at ? new Date(plan.trial_ends_at) : null;

        if (trialEndsAt && now > trialEndsAt) {
            return {
                allowed: false,
                status: 403,
                payload: buildQuotaErrorPayload({
                    trialEndsAt: plan.trial_ends_at,
                    dailyLimit,
                    usedToday: usedToday || 0,
                    reason: 'trial_expired'
                })
            };
        }
    }

    if (dailyLimit && usedToday >= dailyLimit) {
        if (isTrialPlan) {
            return {
                allowed: false,
                status: 429,
                payload: buildQuotaErrorPayload({
                    trialEndsAt: plan.trial_ends_at,
                    dailyLimit,
                    usedToday,
                    reason: 'daily_limit'
                })
            };
        }

        return {
            allowed: false,
            status: 429,
            payload: {
                error: 'Paketinizin gunluk belge uretim limitine ulastiniz.',
                code: 'PLAN_DAILY_LIMIT_REACHED',
                dailyLimit,
                usedToday,
                remainingToday: 0
            }
        };
    }

    const { error: usageInsertError } = await serviceClient
        .from('ai_generation_usage')
        .insert({
            user_id: user.id,
            usage_date: today,
            action_type: actionType,
            plan_code: planCode,
        });

    if (usageInsertError) {
        throw usageInsertError;
    }

    if (isTrialPlan) {
        return {
            allowed: true,
            user,
            plan,
            usage: {
                dailyLimit,
                usedToday: usedToday + 1,
                remainingToday: Math.max(0, dailyLimit - (usedToday + 1)),
                trialEndsAt: plan.trial_ends_at,
            }
        };
    }

    return {
        allowed: true,
        user,
        plan,
        usage: dailyLimit ? {
            dailyLimit,
            usedToday: usedToday + 1,
            remainingToday: Math.max(0, dailyLimit - (usedToday + 1)),
            trialEndsAt: null,
        } : null
    };
};

const normalizeRewriteMode = (mode) => {
    const normalized = String(mode || 'rewrite').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(REWRITE_MODE_CONFIG, normalized) ? normalized : 'rewrite';
};

app.post('/api/gemini/rewrite', async (req, res) => {
    try {
        const { textToRewrite, mode } = req.body || {};
        if (typeof textToRewrite !== 'string' || textToRewrite.trim().length === 0) {
            return res.status(400).json({ error: 'textToRewrite is required' });
        }
        if (textToRewrite.length > 20000) {
            return res.status(413).json({ error: 'textToRewrite exceeds 20000 characters' });
        }

        const normalizedMode = normalizeRewriteMode(mode);
        const modeConfig = REWRITE_MODE_CONFIG[normalizedMode];
        const model = AI_CONFIG.MODEL_NAME;
        const promptText = `
GOREV: ${modeConfig.taskTitle}
ACIKLAMA: ${modeConfig.taskDescription}

KURALLAR:
- Turkce yaz.
- Ek bilgi uydurma.
- Yalnizca duzenlenmis metni dondur.

METIN:
"""${textToRewrite}"""
`;

        const response = await ai.models.generateContent({
            model,
            contents: promptText,
            config: { systemInstruction: modeConfig.systemInstruction },
        });

        const output = typeof response.text === 'string' ? response.text.trim() : '';
        if (!output) {
            return res.status(502).json({ error: 'Rewrite model returned empty output' });
        }

        res.json({ text: output, mode: normalizedMode });
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
**GÖREV: AŞAĞIDAKİ MEVCUT DİLEKÇE TASLAĞINI, SAĞLANAN BAĞLAM BİLGİLERİNİ KULLANARAK GÖZDEN GEÇİR VE İYİLEŞTİR.**

**1. İYİLEŞTİRİLECEK MEVCUT DİLEKÇE TASLAĞI:**
---
${params.currentPetition}
---

**2. DİLEKÇENİN HAZIRLANMASINDA KULLANILAN ORİJİNAL BAĞLAM BİLGİLERİ:**
- **KULLANICININ ROLÜ:** ${params.userRole}
- **DİLEKÇE TÜRÜ:** ${params.petitionType}
- **DAVA KÜNYESİ:** ${formatCaseDetailsForPrompt(params.caseDetails)}
- **VEKİL BİLGİLERİ:** ${formatLawyerInfoForPrompt(params.lawyerInfo)}
- **İLETİŞİM BİLGİLERİ:** ${formatContactInfoForPrompt(params.contactInfo)}
- **OLAYIN ÖZETİ:** ${params.analysisSummary}
- **TARAFLAR:** ${formatPartiesForPrompt(params.parties)}
- **İLGİLİ HUKUKİ ARAŞTIRMA:** ${params.webSearchResult}
- **EK METİN VE NOTLAR:** ${params.docContent}
- **ÖZEL TALİMATLAR:** ${params.specifics}
- **ÖNCEKİ SOHBET GEÇMİŞİ:** ${formatChatHistoryForPrompt(params.chatHistory)}

**İYİLEŞTİRİLMİŞ NİHAİ DİLEKÇE METNİ:**
[Buraya, yukarıdaki taslağı tüm bağlamı dikkate alarak daha güçlü, ikna edici ve hukuken sağlam hale getirilmiş tam dilekçe metnini yaz.]
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableAiError = (error) => {
    const message = [
        error?.message || '',
        error?.cause?.message || '',
        error?.stack || '',
    ].join(' ').toLowerCase();

    return [
        'fetch failed',
        'etimedout',
        'econnreset',
        'socket hang up',
        'temporary failure',
        'network error',
        '503',
        '429',
    ].some(token => message.includes(token));
};

async function generateContentWithRetry(requestPayload) {
    const maxRetries = Number.isFinite(AI_CONFIG.MAX_RETRIES) ? AI_CONFIG.MAX_RETRIES : 2;
    const initialDelayMs = Number.isFinite(AI_CONFIG.INITIAL_RETRY_DELAY_MS) ? AI_CONFIG.INITIAL_RETRY_DELAY_MS : 1000;

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            return await ai.models.generateContent(requestPayload);
        } catch (error) {
            lastError = error;
            const canRetry = attempt < maxRetries && isRetryableAiError(error);
            if (!canRetry) {
                throw error;
            }

            const backoffDelay = initialDelayMs * (2 ** attempt);
            const jitter = Math.floor(Math.random() * 200);
            const waitMs = backoffDelay + jitter;
            console.warn(`AI request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${waitMs}ms...`);
            await sleep(waitMs);
        }
    }

    throw lastError || new Error('AI request failed');
}

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
        const response = await generateContentWithRetry({
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
        return {
            success: false,
            results: [],
            error: error?.message || 'AI fallback failed',
        };
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
        const response = await generateContentWithRetry({
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

            if (!fallback.success && results.length === 0) {
                return res.json({
                    success: true,
                    source: source || 'all',
                    keyword,
                    provider,
                    results: [],
                    warning: 'Emsal arama servislerine gecici olarak ulasilamiyor. Lutfen kisa bir sure sonra tekrar deneyin.',
                });
            }
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
            error: 'İçtihat arama sırasında bir hata oluştu.',
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
            error: 'Belge alınırken bir hata oluştu.',
            details: error.message
        });
    }
});

// List available legal sources
app.get('/api/legal/sources', (req, res) => {
    res.json({
        sources: [
            { id: 'yargitay', name: 'Yargıtay', description: 'Yargıtay Kararları (Bedesten API)' },
            { id: 'danistay', name: 'Danıştay', description: 'Danıştay Kararları (Bedesten API)' },
            { id: 'uyap', name: 'Emsal (UYAP)', description: 'Emsal Kararlar (UYAP Sistemi)' },
            { id: 'anayasa', name: 'Anayasa Mahkemesi', description: 'AYM Norm Denetimi ve Bireysel Başvuru' },
            { id: 'kik', name: 'Kamu İhale Kurulu', description: 'KİK Kararları' },
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
        title: 'Boşanma Davası Dilekçesi',
        description: 'Anlaşmalı veya çekişmeli boşanma davaları için temel dilekçe şablonu',
        icon: 'HeartCrack',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Adı', type: 'text', placeholder: 'Örn: İstanbul Anadolu 5. Aile Mahkemesi', required: true },
            { key: 'DAVACI_AD', label: 'Davacı Adı Soyadı', type: 'text', placeholder: 'Örn: Ayşe YILMAZ', required: true },
            { key: 'DAVACI_TC', label: 'Davacı TC Kimlik No', type: 'text', placeholder: 'Örn: 12345678901', required: true },
            { key: 'DAVACI_ADRES', label: 'Davacı Adresi', type: 'textarea', placeholder: 'Örn: Atatürk Mah. Cumhuriyet Cad. No:15/3 Kadıköy/İstanbul' },
            { key: 'DAVACI_VEKIL_AD', label: 'Davacı Vekili (Avukat)', type: 'text', placeholder: 'Örn: Av. Mehmet KAYA' },
            { key: 'DAVACI_VEKIL_BARO', label: 'Baro Sicil No', type: 'text', placeholder: 'Örn: İstanbul Barosu 54321' },
            { key: 'DAVALI_AD', label: 'Davalı Adı Soyadı', type: 'text', placeholder: 'Örn: Ali YILMAZ', required: true },
            { key: 'DAVALI_TC', label: 'Davalı TC Kimlik No', type: 'text', placeholder: 'Örn: 98765432109' },
            { key: 'DAVALI_ADRES', label: 'Davalı Adresi', type: 'textarea', placeholder: 'Örn: Bahçelievler Mah. İnönü Sok. No:7 Bakırköy/İstanbul' },
            { key: 'EVLILIK_TARIHI', label: 'Evlilik Tarihi', type: 'date', required: true },
            { key: 'EVLILIK_YERI', label: 'Evlenme Yeri', type: 'text', placeholder: 'Örn: Kadıköy Evlendirme Dairesi' },
            { key: 'COCUK_BILGI', label: 'Müşterek Çocuk Bilgileri (varsa)', type: 'textarea', placeholder: 'Örn: 1. Zeynep YILMAZ (D: 01.01.2015, TC: 11122233344)' },
            { key: 'BOSANMA_SEBEPLERI', label: 'Boşanma Sebepleri', type: 'textarea', placeholder: 'Şiddetli geçimsizlik, evlilik birliğinin temelinden sarsılması...', required: true },
            { key: 'NAFAKA_TALEP', label: 'Nafaka Talebi (TL/ay)', type: 'number', placeholder: 'Örn: 5000' },
            { key: 'VELAYET_TALEP', label: 'Velayet Talebi', type: 'text', placeholder: 'Örn: Müşterek çocukların velayetinin davacı anneye verilmesi' },
        ],
        content: `{{MAHKEME}} BAŞKANLIĞINA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}

**VEKİLİ:** {{DAVACI_VEKIL_AD}}
{{DAVACI_VEKIL_BARO}}

**DAVALI:** {{DAVALI_AD}}
TC Kimlik No: {{DAVALI_TC}}
Adres: {{DAVALI_ADRES}}

**KONU:** Boşanma davası hakkındadır.

---

**AÇIKLAMALAR:**

1. Müvekkilim ile davalı {{EVLILIK_TARIHI}} tarihinde {{EVLILIK_YERI}}'de evlenmişlerdir.

2. Tarafların bu evlilikten doğan müşterek çocukları:
{{COCUK_BILGI}}

3. {{BOSANMA_SEBEPLERI}}

4. Evlilik birliğinin temelinden sarsılması nedeniyle taraflar arasındaki evliliğin devamı mümkün değildir. Ortak hayatın yeniden kurulması ihtimali bulunmamaktadır.

---

**HUKUKİ SEBEPLER:**

- 4721 sayılı Türk Medeni Kanunu m.166 (Evlilik birliğinin sarsılması)
- 4721 sayılı Türk Medeni Kanunu m.169 (Boşanmada velayet)
- 4721 sayılı Türk Medeni Kanunu m.175 (Yoksulluk nafakası)
- 4721 sayılı Türk Medeni Kanunu m.182 (Çocuk nafakası)

---

**DELİLLER:**

1. Nüfus kayıt örneği
2. Vukuatlı nüfus kayıt örneği
3. Evlilik cüzdanı sureti
4. Tanık beyanları
5. Ekonomik durum araştırması
6. Her türlü yasal delil

---

**SONUÇ VE İSTEM:**

Yukarıda arz ve izah edilen sebeplerle;

1. Tarafların TMK m.166 uyarınca BOŞANMALARINA,
2. Müşterek çocukların velayetinin davacı tarafa verilmesine ({{VELAYET_TALEP}}),
3. Davalının aylık {{NAFAKA_TALEP}} TL iştirak nafakası ödemesine,
4. Yargılama giderlerinin davalıya yükletilmesine,

karar verilmesini vekaleten saygılarımla arz ve talep ederim. {{TARIH}}

Davacı Vekili
{{DAVACI_VEKIL_AD}}
`,
        isPremium: false,
        usageCount: 156
    },
    {
        id: '2',
        category: 'Hukuk',
        subcategory: 'Borçlar Hukuku',
        title: 'Tazminat Davası Dilekçesi',
        description: 'Maddi ve manevi tazminat talepli dava dilekçesi',
        icon: 'Banknote',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Adı', type: 'text', placeholder: 'Asliye Hukuk Mahkemesi' },
            { key: 'DAVACI_AD', label: 'Davacı Adı Soyadı', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'Davacı TC No', type: 'text', required: true },
            { key: 'DAVALI_AD', label: 'Davalı/Kurum Adı', type: 'text', required: true },
            { key: 'OLAY_TARIHI', label: 'Olay Tarihi', type: 'date', required: true },
            { key: 'OLAY_ACIKLAMASI', label: 'Olayın Açıklaması', type: 'textarea', required: true },
            { key: 'MADDI_TAZMINAT', label: 'Maddi Tazminat Tutarı (TL)', type: 'number' },
            { key: 'MANEVI_TAZMINAT', label: 'Manevi Tazminat Tutarı (TL)', type: 'number' },
        ],
        content: `{{MAHKEME}} BAŞKANLIĞINA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}

**DAVALI:** {{DAVALI_AD}}

**KONU:** Maddi ve manevi tazminat talepli dava dilekçesidir.

**DAVA DEĞERİ:** {{MADDI_TAZMINAT}} TL (Maddi) + {{MANEVI_TAZMINAT}} TL (Manevi)

---

**AÇIKLAMALAR:**

1. {{OLAY_TARIHI}} tarihinde aşağıda açıklanan olay meydana gelmiştir.

2. {{OLAY_ACIKLAMASI}}

3. Bu olay nedeniyle müvekkilim maddi ve manevi zarara uğramıştır. Zararın tazmini için işbu dava açılmıştır.

---

**HUKUKİ SEBEPLER:**

- 6098 sayılı Türk Borçlar Kanunu m.49-76 (Haksız fiil)
- 6098 sayılı Türk Borçlar Kanunu m.56 (Manevi tazminat)

---

**DELİLLER:**

1. Olay tutanakları
2. Fatura ve belgeler
3. Tanık beyanları
4. Bilirkişi incelemesi
5. Her türlü yasal delil

---

**SONUÇ VE İSTEM:**

1. {{MADDI_TAZMINAT}} TL MADDİ TAZMİNATIN olay tarihinden itibaren işleyecek yasal faiziyle birlikte davalıdan tahsiline,
2. {{MANEVI_TAZMINAT}} TL MANEVİ TAZMİNATIN davalıdan tahsiline,
3. Yargılama giderlerinin davalıya yükletilmesine,

karar verilmesini saygılarımla arz ve talep ederim. {{TARIH}}

Davacı
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 203
    },
    {
        id: '3',
        category: 'İcra',
        subcategory: 'İcra Takibi',
        title: 'İcra Takibine İtiraz Dilekçesi',
        description: 'Haksız icra takibine karşı itiraz dilekçesi',
        icon: 'Gavel',
        variables: [
            { key: 'ICRA_MUDURLUGU', label: 'İcra Müdürlüğü', type: 'text', required: true },
            { key: 'DOSYA_NO', label: 'İcra Dosya No', type: 'text', required: true },
            { key: 'BORCLU_AD', label: 'Borçlu Adı Soyadı', type: 'text', required: true },
            { key: 'ALACAKLI_AD', label: 'Alacaklı Adı', type: 'text', required: true },
            { key: 'ITIRAZ_SEBEPLERI', label: 'İtiraz Sebepleri', type: 'textarea', required: true },
        ],
        content: `## {{ICRA_MUDURLUGU}}'NE

**DOSYA NO:** {{DOSYA_NO}}

**BORÇLU (İTİRAZ EDEN):** {{BORCLU_AD}}

**ALACAKLI:** {{ALACAKLI_AD}}

**KONU:** Ödeme emrine itirazımız hakkındadır.

---

## AÇIKLAMALAR

1. Müdürlüğünüzce yürütülen {{DOSYA_NO}} sayılı icra takip dosyasında tarafıma ödeme emri tebliğ edilmiştir.

2. {{ITIRAZ_SEBEPLERI}}

3. Yukarıda açıklanan nedenlerle söz konusu borca itiraz etme zorunluluğu doğmuştur.

---

## HUKUKİ SEBEPLER

- 2004 sayılı İcra ve İflas Kanunu m.62 (İtiraz)
- 2004 sayılı İcra ve İflas Kanunu m.66 (İtirazın hükümleri)

---

## SONUÇ VE İSTEM

Yukarıda açıklanan sebeplerle;

1. BORCA İTİRAZ EDİYORUM,
2. Takibin durdurulmasına,

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
        title: 'Kira Tahliye Davası Dilekçesi',
        description: 'Kiracının tahliyesi için dava dilekçesi',
        icon: 'Home',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Adı', type: 'text', placeholder: 'Sulh Hukuk Mahkemesi' },
            { key: 'KIRAYA_VEREN', label: 'Kiraya Veren Adı', type: 'text', required: true },
            { key: 'KIRACI', label: 'Kiracı Adı', type: 'text', required: true },
            { key: 'TASINMAZ_ADRES', label: 'Taşınmaz Adresi', type: 'textarea', required: true },
            { key: 'KIRA_BEDELI', label: 'Aylık Kira Bedeli', type: 'number' },
            { key: 'TAHLIYE_SEBEBI', label: 'Tahliye Sebebi', type: 'textarea', required: true },
        ],
        content: `## {{MAHKEME}} BAŞKANLIĞINA

**DAVACI (KİRAYA VEREN):** {{KIRAYA_VEREN}}

**DAVALI (KİRACI):** {{KIRACI}}

**KONU:** Kiralananın tahliyesi talebimiz hakkındadır.

---

## AÇIKLAMALAR

1. Davalı, aşağıda adresi belirtilen taşınmazda kiracı olarak ikamet etmektedir:
   **Adres:** {{TASINMAZ_ADRES}}

2. Aylık kira bedeli {{KIRA_BEDELI}} TL olarak belirlenmiştir.

3. {{TAHLIYE_SEBEBI}}

4. Bu nedenlerle taşınmazın tahliyesi gerekmektedir.

---

## HUKUKİ SEBEPLER

- 6098 sayılı Türk Borçlar Kanunu m.347-356 (Kira sözleşmesi)
- 6098 sayılı Türk Borçlar Kanunu m.352 (Kiracının temerrüdü)

---

## DELİLLER

1. Kira sözleşmesi
2. İhtar belgeleri
3. Ödeme kayıtları
4. Tanık beyanları

---

## SONUÇ VE İSTEM

1. Kiralananın TAHLİYESİNE,
2. Birikmiş kira bedellerinin tahsiline,
3. Yargılama giderlerinin davalıya yükletilmesine,

karar verilmesini saygılarımla arz ve talep ederim.

{{TARIH}}
{{KIRAYA_VEREN}}
`,
        isPremium: false,
        usageCount: 178
    },
    {
        id: '5',
        category: 'İdari',
        subcategory: 'İptal Davası',
        title: 'İdari İşlemin İptali Davası',
        description: 'Hukuka aykırı idari işlemlerin iptali için dava dilekçesi',
        icon: 'Building2',
        variables: [
            { key: 'IDARE_MAHKEMESI', label: 'İdare Mahkemesi', type: 'text', placeholder: 'İstanbul İdare Mahkemesi' },
            { key: 'DAVACI_AD', label: 'Davacı Adı', type: 'text', required: true },
            { key: 'DAVALI_IDARE', label: 'Davalı İdare', type: 'text', required: true },
            { key: 'ISLEM_TARIHI', label: 'İşlem Tarihi', type: 'date', required: true },
            { key: 'ISLEM_KONUSU', label: 'İptali İstenen İşlem', type: 'textarea', required: true },
            { key: 'HUKUKA_AYKIRILIK', label: 'Hukuka Aykırılık Nedenleri', type: 'textarea', required: true },
        ],
        content: `## {{IDARE_MAHKEMESI}} BAŞKANLIĞINA

**DAVACI:** {{DAVACI_AD}}

**DAVALI:** {{DAVALI_IDARE}}

**KONU:** İdari işlemin iptali talebimiz hakkındadır.

**İPTALİ İSTENEN İŞLEM:** {{ISLEM_KONUSU}}
**İŞLEM TARİHİ:** {{ISLEM_TARIHI}}

---

## AÇIKLAMALAR

1. Davalı idare tarafından {{ISLEM_TARIHI}} tarihinde tesis edilen işlem hukuka aykırıdır.

2. {{HUKUKA_AYKIRILIK}}

3. Söz konusu işlem telafisi güç zararlara neden olmaktadır.

---

## HUKUKİ SEBEPLER

- 2577 sayılı İdari Yargılama Usulü Kanunu
- Anayasa m.125 (Yargı yolu)
- İlgili mevzuat hükümleri

---

## SONUÇ VE İSTEM

1. Dava konusu idari işlemin İPTALİNE,
2. Yürütmenin durdurulmasına,
3. Yargılama giderlerinin davalıya yükletilmesine,

karar verilmesini saygılarımla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: true,
        usageCount: 89
    },
    {
        id: '6',
        category: 'Ceza',
        subcategory: 'Şikayet',
        title: 'Suç Duyurusu Dilekçesi',
        description: 'Cumhuriyet Savcılığına suç duyurusu dilekçesi',
        icon: 'Siren',
        variables: [
            { key: 'SAVCILIK', label: 'Cumhuriyet Başsavcılığı', type: 'text', required: true },
            { key: 'SIKAYET_EDEN', label: 'Şikayet Eden (Müşteki)', type: 'text', required: true },
            { key: 'SUPHELI', label: 'Şüpheli', type: 'text', required: true },
            { key: 'SUC_TARIHI', label: 'Suç Tarihi', type: 'date', required: true },
            { key: 'SUC_KONUSU', label: 'Suç Konusu Olay', type: 'textarea', required: true },
            { key: 'ISTENEN_CEZA', label: 'Talep Edilen İşlem', type: 'textarea' },
        ],
        content: `## {{SAVCILIK}}'NA

**ŞİKAYET EDEN (MÜŞTEKİ):** {{SIKAYET_EDEN}}

**ŞÜPHELİ:** {{SUPHELI}}

**SUÇ TARİHİ:** {{SUC_TARIHI}}

**KONU:** Suç duyurusu hakkındadır.

---

## AÇIKLAMALAR

1. {{SUC_TARIHI}} tarihinde aşağıda açıklanan olay meydana gelmiştir:

2. {{SUC_KONUSU}}

3. Bu eylemler Türk Ceza Kanunu kapsamında suç teşkil etmektedir.

---

## SUÇ VE CEZA

- İlgili Türk Ceza Kanunu maddeleri
- Cezai yaptırım talep edilmektedir

---

## DELİLLER

1. Olay tutanakları
2. Görüntü/Ses kayıtları
3. Tanık beyanları
4. Diğer deliller

---

## SONUÇ VE İSTEM

1. {{ISTENEN_CEZA}}

Şüphelinin yakalanarak cezalandırılması için gerekli soruşturmanın yapılmasını saygılarımla arz ve talep ederim.

{{TARIH}}
{{SIKAYET_EDEN}}
`,
        isPremium: false,
        usageCount: 245
    }
    ,
    {
        "id": "7",
        "category": "İcra",
        "subcategory": "İcra Takibi",
        "title": "İlamsız İcra Takip Talebi",
        "description": "Genel haciz yoluyla ilamsız icra takibi başlatma talebi",
        "icon": "Gavel",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "İcra Dairesi",
                "type": "text",
                "required": true,
                "placeholder": "İstanbul 1. İcra Dairesi"
            },
            {
                "key": "ALACAKLI_AD",
                "label": "Alacaklı Adı Soyadı",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_TC",
                "label": "Alacaklı TC No",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_ADRES",
                "label": "Alacaklı Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Borçlu Adı Soyadı",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_TC",
                "label": "Borçlu TC No",
                "type": "text"
            },
            {
                "key": "BORCLU_ADRES",
                "label": "Borçlu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ALACAK_TUTARI",
                "label": "Alacak Tutarı (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALACAK_NEDENI",
                "label": "Alacağın Nedeni",
                "type": "textarea",
                "required": true
            },
            {
                "key": "VADE_TARIHI",
                "label": "Vade Tarihi",
                "type": "date"
            }
        ],
        "content": "## {{ICRA_DAIRESI}}'NE\n\n## TAKİP TALEBİ\n\n**ALACAKLI:** {{ALACAKLI_AD}}\nTC Kimlik No: {{ALACAKLI_TC}}\nAdres: {{ALACAKLI_ADRES}}\n\n**BORÇLU:** {{BORCLU_AD}}\nTC Kimlik No: {{BORCLU_TC}}\nAdres: {{BORCLU_ADRES}}\n\n---\n\n**TAKİP KONUSU ALACAK:**\n\n| Açıklama | Tutar |\n|----------|-------|\n| Asıl Alacak | {{ALACAK_TUTARI}} TL |\n| Faiz (Vade Tarihinden İtibaren) | Hesaplanacak |\n| **TOPLAM** | {{ALACAK_TUTARI}} TL + Faiz |\n\n**ALACAĞIN NEDENİ:** {{ALACAK_NEDENI}}\n\n**VADE TARİHİ:** {{VADE_TARIHI}}\n\n---\n\n## TALEP\n\nYukarıda belirtilen alacağımın tahsili için borçlu aleyhine **genel haciz yoluyla ilamsız icra takibi** başlatılmasını talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 523
    },
    {
        "id": "8",
        "category": "İcra",
        "subcategory": "İcra Takibi",
        "title": "Kambiyo Senedi İcra Takibi",
        "description": "Çek, senet veya poliçe ile icra takibi başlatma",
        "icon": "Receipt",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "İcra Dairesi",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_AD",
                "label": "Alacaklı Adı",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_ADRES",
                "label": "Alacaklı Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Borçlu Adı",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_ADRES",
                "label": "Borçlu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "SENET_TURU",
                "label": "Senet Türü",
                "type": "text",
                "placeholder": "Bono / Çek / Poliçe"
            },
            {
                "key": "SENET_TARIHI",
                "label": "Senet Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "SENET_TUTARI",
                "label": "Senet Tutarı (TL)",
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
        "content": "## {{ICRA_DAIRESI}}'NE\n\n## KAMBİYO SENETLERİNE MAHSUS HACİZ YOLUYLA TAKİP TALEBİ\n\n**ALACAKLI:** {{ALACAKLI_AD}}\nAdres: {{ALACAKLI_ADRES}}\n\n**BORÇLU:** {{BORCLU_AD}}\nAdres: {{BORCLU_ADRES}}\n\n---\n\n**TAKİBE KONU KAMBİYO SENEDİ:**\n\n| Bilgi | Değer |\n|-------|-------|\n| Senet Türü | {{SENET_TURU}} |\n| Düzenleme Tarihi | {{SENET_TARIHI}} |\n| Vade Tarihi | {{VADE_TARIHI}} |\n| Senet Tutarı | {{SENET_TUTARI}} TL |\n\n---\n\n## TALEP\n\nEkte sunulan kambiyo senedine dayalı olarak, İİK m.167 ve devamı maddeleri uyarınca borçlu aleyhine **kambiyo senetlerine mahsus haciz yoluyla takip** başlatılmasını talep ederim.\n\n**EKLER:**\n1. Kambiyo senedi aslı\n2. Protesto belgesi (varsa)\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 412
    },
    {
        "id": "9",
        "category": "İcra",
        "subcategory": "İcra İtiraz",
        "title": "Borca İtiraz Dilekçesi",
        "description": "İcra takibine karşı borca itiraz",
        "icon": "ShieldX",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "İcra Dairesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "İcra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Borçlu (İtiraz Eden)",
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
                "label": "Alacaklı",
                "type": "text",
                "required": true
            },
            {
                "key": "ITIRAZ_NEDENI",
                "label": "İtiraz Nedeni",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_DAIRESI}}'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**İTİRAZ EDEN (BORÇLU):** {{BORCLU_AD}}\nTC Kimlik No: {{BORCLU_TC}}\nAdres: {{BORCLU_ADRES}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**KONU:** Ödeme emrine itirazımdır.\n\n---\n\n## AÇIKLAMALAR\n\n1. Müdürlüğünüzün yukarıda numarası yazılı dosyasından tarafıma ödeme emri tebliğ edilmiştir.\n\n2. **İTİRAZ NEDENİM:**\n{{ITIRAZ_NEDENI}}\n\n3. Bu nedenlerle söz konusu takibe süresinde itiraz ediyorum.\n\n---\n\n## HUKUKİ DAYANAK\n\n- 2004 sayılı İcra ve İflas Kanunu m.62 (İtiraz)\n- 2004 sayılı İcra ve İflas Kanunu m.66 (İtirazın hükümleri)\n\n---\n\n## SONUÇ VE İSTEM\n\n**BORCA İTİRAZ EDİYORUM.**\n\nTakibin durdurulmasını saygılarımla arz ve talep ederim.\n\n{{TARIH}}\n{{BORCLU_AD}}\n",
        "isPremium": false,
        "usageCount": 678
    },
    {
        "id": "10",
        "category": "İcra",
        "subcategory": "İcra İtiraz",
        "title": "İmzaya İtiraz Dilekçesi",
        "description": "Kambiyo senedindeki imzaya itiraz",
        "icon": "PenOff",
        "variables": [
            {
                "key": "ICRA_MAHKEMESI",
                "label": "İcra Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "İcra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacı (Borçlu)",
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
                "label": "Davalı (Alacaklı)",
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
        "content": "## {{ICRA_MAHKEMESI}} BAŞKANLIĞINA\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**DAVACI (BORÇLU):** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI (ALACAKLI):** {{DAVALI_AD}}\n\n**KONU:** Kambiyo senedindeki imzaya itiraz hakkındadır.\n\n---\n\n## AÇIKLAMALAR\n\n1. Davalı tarafından aleyhime başlatılan icra takibinde dayanak gösterilen senedin bilgileri aşağıdaki gibidir:\n{{SENET_BILGI}}\n\n2. **Söz konusu senetteki imza tarafıma ait değildir.**\n\n3. Senedin altındaki imza ile benim gerçek imzam arasında açık fark bulunmakta olup, bu husus bilirkişi incelemesiyle de ortaya konulacaktır.\n\n---\n\n## HUKUKİ SEBEPLER\n\n- 2004 sayılı İcra ve İflas Kanunu m.170 (İmzaya itiraz)\n- 6100 sayılı HMK m.211 (İmza incelemesi)\n\n---\n\n## DELİLLER\n\n1. İcra dosyası\n2. Senet aslı\n3. İmza örnekleri\n4. Bilirkişi incelemesi\n5. Nüfus kayıt örneği\n\n---\n\n## SONUÇ VE İSTEM\n\n1. **Senetteki imzanın tarafıma ait olmadığının tespitine,**\n2. İcra takibinin iptaline,\n3. %20 oranında kötüniyet tazminatına hükmedilmesine,\n4. Yargılama giderlerinin davalıya yükletilmesine,\n\nkarar verilmesini saygılarımla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 234
    },
    {
        "id": "11",
        "category": "İcra",
        "subcategory": "Haciz",
        "title": "Haciz Kaldırma Talebi",
        "description": "Haczedilen mal üzerindeki haczin kaldırılması talebi",
        "icon": "Unlock",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "İcra Dairesi",
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
                "label": "Haczedilen Mal/Eşya",
                "type": "textarea",
                "required": true
            },
            {
                "key": "KALDIRMA_NEDENI",
                "label": "Haczin Kaldırılma Nedeni",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜĞÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**TALEP EDEN:** {{TALEP_EDEN}}\n\n**KONU:** Haciz kaldırma talebimdir.\n\n---\n\n## AÇIKLAMALAR\n\n1. Müdürlüğünüzün yukarıda numarası yazılı dosyasında aşağıda belirtilen mal/eşya üzerine haciz konulmuştur:\n\n**HACZEDİLEN MAL/EŞYA:**\n{{HACIZLI_MAL}}\n\n2. **HACZİN KALDIRILMASI GEREKÇESİ:**\n{{KALDIRMA_NEDENI}}\n\n---\n\n## HUKUKİ DAYANAK\n\n- 2004 sayılı İcra ve İflas Kanunu m.82 (Haczedilemezlik)\n- 2004 sayılı İcra ve İflas Kanunu m.85 (Taşınır haczi)\n\n---\n\n## SONUÇ VE İSTEM\n\nYukarıda açıklanan nedenlerle, söz konusu mal/eşya üzerindeki haczin kaldırılmasını saygılarımla talep ederim.\n\n{{TARIH}}\n{{TALEP_EDEN}}\n",
        "isPremium": false,
        "usageCount": 189
    },
    {
        "id": "12",
        "category": "İcra",
        "subcategory": "Haciz",
        "title": "İstihkak Davası Dilekçesi",
        "description": "Haczedilen malın üçüncü kişiye ait olduğunun tespiti",
        "icon": "FileWarning",
        "variables": [
            {
                "key": "ICRA_MAHKEMESI",
                "label": "İcra Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "İcra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacı (3. Kişi)",
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
                "label": "Davalı (Alacaklı)",
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
                "label": "Mülkiyet Delilleri",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_MAHKEMESI}} BAŞKANLIĞINA\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**DAVACI (3. KİŞİ):** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI (ALACAKLI):** {{DAVALI_AD}}\n\n**KONU:** İstihkak davası hakkındadır.\n\n---\n\n## AÇIKLAMALAR\n\n1. Davalı tarafından yürütülen icra takibinde, borçlunun evinde/işyerinde yapılan haciz işlemi sırasında **bana ait olan** aşağıdaki mal haczedilmiştir:\n\n**HACZEDİLEN MAL:**\n{{HACIZLI_MAL}}\n\n2. **Bu mal bana aittir ve borçlu ile hiçbir ilgisi yoktur.**\n\n3. Mülkiyetimi ispatlayan deliller:\n{{MULKIYET_DELILI}}\n\n---\n\n## HUKUKİ SEBEPLER\n\n- 2004 sayılı İcra ve İflas Kanunu m.96-99 (İstihkak davası)\n\n---\n\n## DELİLLER\n\n1. Fatura ve satış belgeleri\n2. Banka kayıtları\n3. Tanık beyanları\n4. Bilirkişi incelemesi\n5. Diğer yasal deliller\n\n---\n\n## SONUÇ VE İSTEM\n\n1. **Haczedilen malın tarafıma ait olduğunun tespitine,**\n2. Söz konusu mal üzerindeki haczin kaldırılmasına,\n3. Yargılama giderlerinin davalıya yükletilmesine,\n\nkarar verilmesini saygılarımla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 156
    },
    {
        "id": "13",
        "category": "İş Hukuku",
        "subcategory": "İşe İade",
        "title": "İşe İade Davası Dilekçesi",
        "description": "Haksız fesih nedeniyle işe iade talebi",
        "icon": "UserCheck",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "İş Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacı (İşçi)",
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
                "label": "Davalı (İşveren)",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "İşveren Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ISE_GIRIS_TARIHI",
                "label": "İşe Giriş Tarihi",
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
                "label": "Görevi/Pozisyonu",
                "type": "text",
                "required": true
            },
            {
                "key": "FESIH_GEREKCESI",
                "label": "İşverenin Fesih Gerekçesi",
                "type": "textarea"
            }
        ],
        "content": "## {{MAHKEME}} BAŞKANLIĞINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Feshin geçersizliği ve işe iade talebimizdir.\n\n---\n\n## AÇIKLAMALAR\n\n1. Müvekkilim {{ISE_GIRIS_TARIHI}} tarihinden {{FESIH_TARIHI}} tarihine kadar davalı işyerinde **{{GOREV}}** olarak çalışmıştır.\n\n2. İş sözleşmesi {{FESIH_TARIHI}} tarihinde işveren tarafından **haksız ve geçersiz şekilde** feshedilmiştir.\n\n3. İşverenin ileri sürdüğü fesih gerekçesi:\n{{FESIH_GEREKCESI}}\n\n4. Bu gerekçe gerçeği yansıtmamakta olup, fesih haksız ve geçersizdir.\n\n---\n\n## HUKUKİ SEBEPLER\n\n- 4857 sayılı İş Kanunu m.18 (Feshin geçerli sebebe dayandırılması)\n- 4857 sayılı İş Kanunu m.20 (Fesih bildirimine itiraz)\n- 4857 sayılı İş Kanunu m.21 (Geçersiz sebeple feshin sonuçları)\n\n---\n\n## DELİLLER\n\n1. İş sözleşmesi\n2. Bordro ve SGK kayıtları\n3. Fesih bildirimi\n4. Tanık beyanları\n5. İşyeri dosyası\n\n---\n\n## SONUÇ VE İSTEM\n\n1. **Feshin geçersizliğine ve işe iadeye,**\n2. İşe başlatmama halinde 4-8 aylık brüt ücret tutarında tazminata,\n3. Boşta geçen süre ücretinin (4 aya kadar) ödenmesine,\n4. Yargılama giderlerinin davalıya yükletilmesine,\n\nkarar verilmesini saygılarımla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 445
    },
    {
        "id": "14",
        "category": "İş Hukuku",
        "subcategory": "Tazminat",
        "title": "Kıdem ve İhbar Tazminatı Davası",
        "description": "İş akdi feshi sonrası tazminat talebi",
        "icon": "Banknote",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "İş Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacı (İşçi)",
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
                "label": "Davalı (İşveren)",
                "type": "text",
                "required": true
            },
            {
                "key": "ISE_GIRIS",
                "label": "İşe Giriş Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "CIKIS_TARIHI",
                "label": "İşten Çıkış Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "SON_UCRET",
                "label": "Giydirilmiş Brüt Ücret (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "KIDEM_TAZMINATI",
                "label": "Kıdem Tazminatı Talebi (TL)",
                "type": "number"
            },
            {
                "key": "IHBAR_TAZMINATI",
                "label": "İhbar Tazminatı Talebi (TL)",
                "type": "number"
            }
        ],
        "content": "## {{MAHKEME}} BAŞKANLIĞINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI:** {{DAVALI_AD}}\n\n**KONU:** Kıdem ve ihbar tazminatı talebimizdir.\n\n**DAVA DEĞERİ:** {{KIDEM_TAZMINATI}} TL + {{IHBAR_TAZMINATI}} TL\n\n---\n\n## AÇIKLAMALAR\n\n1. Müvekkilim {{ISE_GIRIS}} - {{CIKIS_TARIHI}} tarihleri arasında davalı işyerinde çalışmıştır.\n\n2. **Son aylık giydirilmiş brüt ücreti:** {{SON_UCRET}} TL\n\n3. İş akdi işveren tarafından haksız olarak feshedilmiş, ancak tazminatları ödenmemiştir.\n\n---\n\n## TALEP EDİLEN ALACAKLAR\n\n| Alacak Kalemi | Tutar |\n|---------------|-------|\n| Kıdem Tazminatı | {{KIDEM_TAZMINATI}} TL |\n| İhbar Tazminatı | {{IHBAR_TAZMINATI}} TL |\n| **TOPLAM** | Hesaplanacak |\n\n---\n\n## HUKUKİ SEBEPLER\n\n- 1475 sayılı İş Kanunu m.14 (Kıdem tazminatı)\n- 4857 sayılı İş Kanunu m.17 (Süreli fesih / İhbar)\n\n---\n\n## SONUÇ VE İSTEM\n\n1. **{{KIDEM_TAZMINATI}} TL kıdem tazminatının** fesih tarihinden itibaren en yüksek mevduat faiziyle birlikte,\n2. **{{IHBAR_TAZMINATI}} TL ihbar tazminatının** yasal faiziyle birlikte davalıdan tahsiline,\n3. Yargılama giderlerinin davalıya yükletilmesine,\n\nkarar verilmesini saygılarımla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 567
    },
    {
        "id": "15",
        "category": "Hukuk",
        "subcategory": "Tüketici Hukuku",
        "title": "Tüketici Hakem Heyeti Başvurusu",
        "description": "Ayıplı mal/hizmet için tüketici hakem heyetine başvuru",
        "icon": "ShoppingCart",
        "variables": [
            {
                "key": "HAKEM_HEYETI",
                "label": "Tüketici Hakem Heyeti",
                "type": "text",
                "required": true
            },
            {
                "key": "BASVURAN_AD",
                "label": "Başvuran Adı",
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
                "label": "Satıcı/Firma Adı",
                "type": "text",
                "required": true
            },
            {
                "key": "SATICI_ADRES",
                "label": "Satıcı Adresi",
                "type": "textarea"
            },
            {
                "key": "URUN_ADI",
                "label": "Ürün/Hizmet Adı",
                "type": "text",
                "required": true
            },
            {
                "key": "SATIN_ALMA_TARIHI",
                "label": "Satın Alma Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "URUN_BEDELI",
                "label": "Ürün Bedeli (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "SIKAYET_KONUSU",
                "label": "Şikayet Konusu",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{HAKEM_HEYETI}}'NE\n\n## TÜKETİCİ ŞİKAYET BAŞVURUSU\n\n**BAŞVURAN (TÜKETİCİ):**\nAd Soyad: {{BASVURAN_AD}}\nTC Kimlik No: {{BASVURAN_TC}}\nAdres: {{BASVURAN_ADRES}}\nTelefon: {{BASVURAN_TEL}}\n\n**ŞİKAYET EDİLEN (SATICI):**\nFirma Adı: {{SATICI_AD}}\nAdres: {{SATICI_ADRES}}\n\n---\n\n**ŞİKAYETE KONU ÜRÜN/HİZMET:**\n\n| Bilgi | Değer |\n|-------|-------|\n| Ürün/Hizmet | {{URUN_ADI}} |\n| Satın Alma Tarihi | {{SATIN_ALMA_TARIHI}} |\n| Bedel | {{URUN_BEDELI}} TL |\n\n---\n\n## ŞİKAYET KONUSU\n\n{{SIKAYET_KONUSU}}\n\n---\n\n## TALEP\n\n6502 sayılı Tüketicinin Korunması Hakkında Kanun uyarınca;\n\n1. Ayıplı ürünün/hizmetin bedelinin iadesi,\n2. Alternatif olarak ürünün değiştirilmesi veya ücretsiz onarımı,\n\nhususlarında karar verilmesini saygılarımla arz ve talep ederim.\n\n**EKLER:**\n1. Fatura/fiş sureti\n2. Ürün fotoğrafları\n3. Yazışma örnekleri\n\n{{TARIH}}\n{{BASVURAN_AD}}\n",
        "isPremium": false,
        "usageCount": 892
    },
    {
        "id": "16",
        "category": "Hukuk",
        "subcategory": "Tüketici Hukuku",
        "title": "Tüketici Mahkemesi Dava Dilekçesi",
        "description": "Tüketici uyuşmazlıkları için dava dilekçesi",
        "icon": "Scale",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "Tüketici Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacı Adı",
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
                "label": "Davacı Adresi",
                "type": "textarea"
            },
            {
                "key": "DAVALI_AD",
                "label": "Davalı Firma",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "Davalı Adresi",
                "type": "textarea"
            },
            {
                "key": "DAVA_DEGERI",
                "label": "Dava Değeri (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "OLAY_ACIKLAMASI",
                "label": "Olayın Açıklaması",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{MAHKEME}} BAŞKANLIĞINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Tüketici işleminden kaynaklanan tazminat talebimizdir.\n\n**DAVA DEĞERİ:** {{DAVA_DEGERI}} TL\n\n---\n\n## AÇIKLAMALAR\n\n{{OLAY_ACIKLAMASI}}\n\n---\n\n## HUKUKİ SEBEPLER\n\n- 6502 sayılı Tüketicinin Korunması Hakkında Kanun\n- 6098 sayılı Türk Borçlar Kanunu\n\n---\n\n## DELİLLER\n\n1. Fatura ve satış belgeleri\n2. Sözleşme örnekleri\n3. Yazışmalar\n4. Tanık beyanları\n5. Bilirkişi incelemesi\n\n---\n\n## SONUÇ VE İSTEM\n\n1. {{DAVA_DEGERI}} TL'nin yasal faiziyle birlikte davalıdan tahsiline,\n2. Yargılama giderlerinin davalıya yükletilmesine,\n\nkarar verilmesini saygılarımla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 334
    },
    {
        "id": "17",
        "category": "Hukuk",
        "subcategory": "Ticaret Hukuku",
        "title": "Alacak Davası Dilekçesi (Ticari)",
        "description": "Ticari alacak tahsili için dava dilekçesi",
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
                "label": "Davacı Şirket/Kişi",
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
                "label": "Davalı Şirket/Kişi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "Davalı Adresi",
                "type": "textarea"
            },
            {
                "key": "ALACAK_TUTARI",
                "label": "Alacak Tutarı (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALACAK_KAYNAK",
                "label": "Alacağın Kaynağı",
                "type": "textarea",
                "required": true
            },
            {
                "key": "VADE_TARIHI",
                "label": "Vade Tarihi",
                "type": "date"
            }
        ],
        "content": "## {{MAHKEME}} BAŞKANLIĞINA\n\n**DAVACI:** {{DAVACI_AD}}\nVergi/TC No: {{DAVACI_VKN}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Alacak davası hakkındadır.\n\n**DAVA DEĞERİ:** {{ALACAK_TUTARI}} TL\n\n---\n\n## AÇIKLAMALAR\n\n1. Müvekkilim ile davalı arasında ticari ilişki bulunmaktadır.\n\n2. **Alacağın Kaynağı:**\n{{ALACAK_KAYNAK}}\n\n3. Vade tarihi: {{VADE_TARIHI}}\n\n4. Tüm ihtarlara rağmen davalı borcunu ödememiştir.\n\n---\n\n## HUKUKİ SEBEPLER\n\n- 6102 sayılı Türk Ticaret Kanunu\n- 6098 sayılı Türk Borçlar Kanunu\n\n---\n\n## DELİLLER\n\n1. Faturalar\n2. Sözleşmeler\n3. İrsaliyeler\n4. Banka kayıtları\n5. İhtarname\n6. Ticari defterler\n\n---\n\n## SONUÇ VE İSTEM\n\n1. {{ALACAK_TUTARI}} TL alacağın vade tarihinden itibaren avans faiziyle birlikte davalıdan tahsiline,\n2. Yargılama giderlerinin davalıya yükletilmesine,\n\nkarar verilmesini saygılarımla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 445
    },
    {
        "id": "18",
        "category": "Hukuk",
        "subcategory": "Ticaret Hukuku",
        "title": "İhtarname (Ödeme)",
        "description": "Ticari borç için ödeme ihtarnamesi",
        "icon": "Mail",
        "variables": [
            {
                "key": "NOTER",
                "label": "Noter",
                "type": "text",
                "placeholder": "İstanbul 5. Noterliği"
            },
            {
                "key": "GONDEREN_AD",
                "label": "Gönderen (Alacaklı)",
                "type": "text",
                "required": true
            },
            {
                "key": "GONDEREN_ADRES",
                "label": "Alacaklı Adresi",
                "type": "textarea"
            },
            {
                "key": "MUHATAP_AD",
                "label": "Muhatap (Borçlu)",
                "type": "text",
                "required": true
            },
            {
                "key": "MUHATAP_ADRES",
                "label": "Borçlu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORC_TUTARI",
                "label": "Borç Tutarı (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "BORC_KONUSU",
                "label": "Borç Konusu",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ODEME_SURESI",
                "label": "Ödeme Süresi (Gün)",
                "type": "number",
                "placeholder": "7"
            }
        ],
        "content": "## İHTARNAME\n\n**Keşideci (İhtar Eden):** {{GONDEREN_AD}}\nAdres: {{GONDEREN_ADRES}}\n\n**Muhatap (İhtar Edilen):** {{MUHATAP_AD}}\nAdres: {{MUHATAP_ADRES}}\n\n---\n\n## İHTARIN KONUSU\n\nAşağıda belirtilen borcunuzun ödenmesi hakkındadır.\n\n---\n\n**Sayın {{MUHATAP_AD}},**\n\n**1.** Tarafınıza aşağıda detayları verilen alacağımız bulunmaktadır:\n\n**Borç Konusu:** {{BORC_KONUSU}}\n\n**Borç Tutarı:** {{BORC_TUTARI}} TL\n\n**2.** Söz konusu borcunuzu defalarca hatırlatmamıza rağmen hâlâ ödemediniz.\n\n**3.** İşbu ihtarnamenin tarafınıza tebliğinden itibaren **{{ODEME_SURESI}} gün** içinde yukarıda belirtilen borcunuzu ödemenizi,\n\n**4.** Aksi takdirde aleyhinize yasal yollara (icra takibi ve/veya dava) başvurulacağını, bu durumda doğacak tüm masraf, faiz ve avukatlık ücretlerinin tarafınızdan tahsil edileceğini,\n\n**İHTAR EDERİM.**\n\n{{TARIH}}\n{{GONDEREN_AD}}\n\n---\n\n*Bu ihtarname noter kanalıyla tebliğ edilmek üzere hazırlanmıştır.*\n",
        "isPremium": false,
        "usageCount": 723
    },
    {
        "id": "19",
        "category": "Hukuk",
        "subcategory": "Miras Hukuku",
        "title": "Mirasçılık Belgesi (Veraset İlamı) Talebi",
        "description": "Sulh hukuk mahkemesinden veraset ilamı talebi",
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
                "label": "Davacı (Mirasçı)",
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
                "label": "Murisin (Ölenin) Adı",
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
                "label": "Ölüm Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "OLUM_YERI",
                "label": "Ölüm Yeri",
                "type": "text"
            },
            {
                "key": "MIRASCILAR",
                "label": "Diğer Mirasçılar",
                "type": "textarea"
            }
        ],
        "content": "## {{MAHKEME}} BAŞKANLIĞINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**KONU:** Mirasçılık belgesi (veraset ilamı) verilmesi talebimdir.\n\n---\n\n## AÇIKLAMALAR\n\n1. Muris **{{MURIS_AD}}** (TC: {{MURIS_TC}}) {{OLUM_TARIHI}} tarihinde {{OLUM_YERI}}'de vefat etmiştir.\n\n2. Ben müteveffanın mirasçısıyım.\n\n3. Diğer mirasçılar:\n{{MIRASCILAR}}\n\n4. Müteveffanın terekesi üzerinde işlem yapabilmek için mirasçılık belgesi alınması gerekmektedir.\n\n---\n\n## HUKUKİ SEBEPLER\n\n- 4721 sayılı Türk Medeni Kanunu m.598 (Mirasçılık belgesi)\n\n---\n\n## DELİLLER\n\n1. Veraset ve intikal vergisi beyannamesi\n2. Nüfus kayıt örneği (muris ve mirasçılar)\n3. Ölüm belgesi\n4. Vukuatlı nüfus kayıt örneği\n\n---\n\n## SONUÇ VE İSTEM\n\nMüteveffa {{MURIS_AD}}'in mirasçılarını ve miras paylarını gösteren **MİRASÇILIK BELGESİ** verilmesini saygılarımla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 567
    },
    {
        "id": "20",
        "category": "Hukuk",
        "subcategory": "Miras Hukuku",
        "title": "Mirastan Feragat Sözleşmesi",
        "description": "Noterde düzenlenecek mirastan feragat belgesi",
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
                "label": "Muris (Miras Bırakan)",
                "type": "text",
                "required": true
            },
            {
                "key": "BEDEL",
                "label": "Karşılık Bedel (varsa)",
                "type": "text"
            }
        ],
        "content": "## MİRASTAN FERAGAT SÖZLEŞMESİ\n\n**FERAGAT EDEN:**\nAd Soyad: {{FERAGAT_EDEN}}\nTC Kimlik No: {{FERAGAT_EDEN_TC}}\n\n**MURİS:**\nAd Soyad: {{MURIS_AD}}\n\n---\n\n## BEYAN\n\nBen {{FERAGAT_EDEN}}, {{MURIS_AD}}'ın ileride gerçekleşecek ölümü halinde terekesinden payıma düşecek tüm miras haklarından, TMK m.528 uyarınca, aşağıdaki şartlarla **FERAGAT ETTİĞİMİ** beyan ederim.\n\n**Karşılık:** {{BEDEL}}\n\n**Feragatin Kapsamı:** Tam feragat (hem kendim hem altsoyum adına)\n\nBu sözleşme, murisin sağlığında, resmi şekilde yapılmış olup, tarafımca özgür iradeyle imzalanmıştır.\n\n---\n\n## HUKUKİ DAYANAK\n\n- 4721 sayılı Türk Medeni Kanunu m.528 (Mirastan feragat sözleşmesi)\n\n---\n\n{{TARIH}}\n\n**Feragat Eden:**\n{{FERAGAT_EDEN}}\n\n**Muris:**\n{{MURIS_AD}}\n\n---\n\n*Bu sözleşme noter huzurunda düzenleme şeklinde yapılmalıdır.*\n",
        "isPremium": true,
        "usageCount": 123
    },
    {
        "id": "21",
        "category": "İcra",
        "subcategory": "Tahsilat",
        "title": "Haricen Tahsil Bildirimi",
        "description": "İcra dosyası dışında yapılan tahsilatın bildirilmesi",
        "icon": "HandCoins",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "İcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklı", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "TAHSIL_TUTARI", "label": "Tahsil Edilen Tutar (TL)", "type": "number", "required": true },
            { "key": "TAHSIL_TARIHI", "label": "Tahsil Tarihi", "type": "date", "required": true },
            { "key": "KALAN_ALACAK", "label": "Kalan Alacak (varsa)", "type": "number" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜĞÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}}\n\n**KONU:** Haricen tahsil bildirimi\n\n---\n\n## AÇIKLAMA\n\nMüdürlüğünüzün yukarıda numarası yazılı dosyasında takip edilen alacağımın bir kısmı/tamamı borçlu tarafından **haricen (icra dairesi dışında)** tarafıma ödenmiştir.\n\n**TAHSİLAT BİLGİLERİ:**\n\n| Bilgi | Değer |\n|-------|-------|\n| Tahsil Edilen Tutar | {{TAHSIL_TUTARI}} TL |\n| Tahsil Tarihi | {{TAHSIL_TARIHI}} |\n| Kalan Alacak | {{KALAN_ALACAK}} TL |\n\n---\n\n## TALEP\n\nYukarıda belirtilen haricen tahsilatın dosyaya işlenmesini ve dosyanın buna göre güncellenmesini talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1245
    },
    {
        "id": "22",
        "category": "İcra",
        "subcategory": "Dosya İşlemleri",
        "title": "Dosya Kapama (Takipten Vazgeçme) Talebi",
        "description": "Alacaklının takipten vazgeçerek dosyayı kapatma talebi",
        "icon": "FolderX",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "İcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklı", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "VAZGECME_NEDENI", "label": "Vazgeçme Nedeni", "type": "textarea" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜĞÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}}\n\n**KONU:** Takipten vazgeçme ve dosyanın kapatılması talebi\n\n---\n\n## AÇIKLAMA\n\nMüdürlüğünüzün yukarıda numarası yazılı dosyasında yürütülen icra takibinden **VAZGEÇİYORUM.**\n\n**Vazgeçme Nedeni:** {{VAZGECME_NEDENI}}\n\n---\n\n## TALEP\n\nİİK m.129 uyarınca takipten vazgeçtiğimi beyan eder, takibin durdurularak dosyanın kapatılmasını talep ederim.\n\n**Not:** Dosyadaki tüm hacizlerin kaldırılmasını da talep ediyorum.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 876
    },
    {
        "id": "23",
        "category": "İcra",
        "subcategory": "Haciz",
        "title": "Maaş Haczi (Maaş Kesintisi) Talebi",
        "description": "Borçlunun maaşına haciz konulması talebi",
        "icon": "Wallet",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "İcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklı", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Borçlu TC No", "type": "text", "required": true },
            { "key": "ISVEREN_AD", "label": "İşveren/Kurum Adı", "type": "text", "required": true },
            { "key": "ISVEREN_ADRES", "label": "İşveren Adresi", "type": "textarea", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜĞÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}} (TC: {{BORCLU_TC}})\n\n**KONU:** Maaş haczi (maaş kesintisi) talebi\n\n---\n\n## AÇIKLAMA\n\nBorçlunun aşağıda belirtilen işyerinde çalıştığı tespit edilmiştir:\n\n**İŞVEREN BİLGİLERİ:**\n- **Kurum/Şirket:** {{ISVEREN_AD}}\n- **Adres:** {{ISVEREN_ADRES}}\n\n---\n\n## TALEP\n\nİİK m.83 ve m.355 uyarınca;\n\n1. Borçlunun maaş ve ücretinin **1/4'ünün** haciz kesintisi yapılarak dosyaya gönderilmesi için ilgili işverene **maaş haczi müzekkeresi** yazılmasını,\n\n2. Kesinti yapılıncaya kadar işverene sorumluluk bildiriminde bulunulmasını,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1567
    },
    {
        "id": "24",
        "category": "İcra",
        "subcategory": "Haciz",
        "title": "Taşınmaz (Gayrimenkul) Haczi Talebi",
        "description": "Borçlunun taşınmazına haciz şerhi konulması talebi",
        "icon": "Home",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "İcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklı", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "TASINMAZ_BILGI", "label": "Taşınmaz Bilgileri (İl/İlçe/Ada/Parsel)", "type": "textarea", "required": true },
            { "key": "TAPU_MUDURLUGU", "label": "Tapu Müdürlüğü", "type": "text", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜĞÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}}\n\n**KONU:** Taşınmaz haczi talebi\n\n---\n\n## AÇIKLAMA\n\nBorçlunun aşağıda belirtilen taşınmaz/taşınmazlar üzerinde mülkiyeti bulunmaktadır:\n\n**TAŞINMAZ BİLGİLERİ:**\n{{TASINMAZ_BILGI}}\n\n**İLGİLİ TAPU MÜDÜRLÜĞÜ:** {{TAPU_MUDURLUGU}}\n\n---\n\n## TALEP\n\nİİK m.79 ve m.91 uyarınca;\n\n1. Yukarıda belirtilen taşınmaz/taşınmazlar üzerine **HACİZ ŞERHİ** konulması için ilgili Tapu Müdürlüğü'ne müzekkere yazılmasını,\n\n2. Haciz şerhinin tapu kaydına işlenmesini,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 934
    },
    {
        "id": "25",
        "category": "İcra",
        "subcategory": "Haciz",
        "title": "Haciz Fekki (Haciz Kaldırma) Talebi - Alacaklı",
        "description": "Alacaklının haczi kaldırma talebi",
        "icon": "KeyRound",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "İcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklı", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "HACIZLI_MAL", "label": "Haczin Kaldırılacağı Mal/Kayıt", "type": "textarea", "required": true },
            { "key": "FEKK_NEDENI", "label": "Haciz Fekki Nedeni", "type": "textarea" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜĞÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}}\n\n**KONU:** Haciz fekki (haciz kaldırma) talebi\n\n---\n\n## AÇIKLAMA\n\nMüdürlüğünüzün yukarıda numarası yazılı dosyasında borçluya ait aşağıdaki mal/kayıt üzerine haciz konulmuştur:\n\n**HACİZLİ MAL/KAYIT:**\n{{HACIZLI_MAL}}\n\n**HACİZ FEKKİ NEDENİ:**\n{{FEKK_NEDENI}}\n\n---\n\n## TALEP\n\nYukarıda belirtilen mal/kayıt üzerindeki haczin **FEKKİNİ (KALDIRILMASINI)** ve ilgili kurumlara haciz fekki müzekkeresi yazılmasını talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1123
    },
    {
        "id": "26",
        "category": "İcra",
        "subcategory": "Mal Beyanı",
        "title": "Mal Beyanı Talepli Ödeme Emri Talebi",
        "description": "Borçludan mal beyanı istenmesi talebi",
        "icon": "ClipboardList",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "İcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklı", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "BORCLU_ADRES", "label": "Borçlu Adresi", "type": "textarea", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜĞÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}}\nAdres: {{BORCLU_ADRES}}\n\n**KONU:** Mal beyanı talebinde bulunulması\n\n---\n\n## AÇIKLAMA\n\nMüdürlüğünüzün yukarıda numarası yazılı dosyasında borçluya gönderilen ödeme emri tebliğ edilmiş, ancak borçlu ödeme yapmamış ve itirazda da bulunmamıştır.\n\n---\n\n## TALEP\n\nİİK m.74 uyarınca;\n\n1. Borçluya **MAL BEYANI** için davetiye çıkarılmasını,\n\n2. Borçlunun mal beyanında bulunmaması veya gerçeğe aykırı beyanda bulunması halinde İİK m.337 kapsamında şikayet hakkımın saklı tutulmasını,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 789
    },
    {
        "id": "27",
        "category": "İcra",
        "subcategory": "Araç",
        "title": "Araç Haczi Talebi",
        "description": "Borçlunun aracına haciz konulması talebi",
        "icon": "Car",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "İcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklı", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Borçlu TC No", "type": "text", "required": true },
            { "key": "ARAC_PLAKA", "label": "Araç Plakası (biliniyorsa)", "type": "text" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜĞÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}} (TC: {{BORCLU_TC}})\n\n**KONU:** Araç haczi talebi\n\n---\n\n## TALEP\n\nBorçlunun adına kayıtlı araç/araçlar üzerine haciz konulması için;\n\n1. **Emniyet Genel Müdürlüğü Trafik Başkanlığı'na** (EGM) haciz müzekkeresi yazılmasını,\n\n2. Borçlu adına kayıtlı tüm araçların tespit edilmesini ve haciz şerhi konulmasını,\n\n3. Yakalama şerhi konulmasını,\n\ntalep ederim.\n\n**Bilinen Araç Plakası (varsa):** {{ARAC_PLAKA}}\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1456
    },
    {
        "id": "28",
        "category": "İcra",
        "subcategory": "Banka",
        "title": "Banka Hesabı Haczi Talebi",
        "description": "Borçlunun banka hesaplarına haciz konulması",
        "icon": "Landmark",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "İcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklı", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Borçlu TC/VKN", "type": "text", "required": true },
            { "key": "BANKA_ADI", "label": "Banka Adı (biliniyorsa)", "type": "text" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜĞÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}} (TC/VKN: {{BORCLU_TC}})\n\n**KONU:** Banka hesaplarına haciz talebi\n\n---\n\n## TALEP\n\nBorçlunun banka hesaplarına haciz konulması için;\n\n1. **Tüm bankalara** (UYAP üzerinden toplu) haciz müzekkeresi gönderilmesini,\n\n2. Borçlunun tüm banka hesaplarındaki mevduatın haczedilmesini,\n\n3. Haczedilen tutarların dosyaya aktarılmasını,\n\ntalep ederim.\n\n**Bilinen Banka (varsa):** {{BANKA_ADI}}\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 2134
    }
];

const CP1252_REVERSE_BYTE_MAP = new Map([
    [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
    [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88],
    [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
    [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
    [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
    [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F],
]);

const MOJIBAKE_DETECTION = /[ÃÄÅ]/;

const decodePotentialMojibake = (value) => {
    if (typeof value !== 'string' || !MOJIBAKE_DETECTION.test(value)) return value;

    const bytes = [];
    for (const char of value) {
        const codePoint = char.codePointAt(0);
        if (codePoint == null) continue;

        if (codePoint <= 0xFF) {
            bytes.push(codePoint);
            continue;
        }

        const cp1252Byte = CP1252_REVERSE_BYTE_MAP.get(codePoint);
        if (cp1252Byte == null) {
            return value;
        }
        bytes.push(cp1252Byte);
    }

    try {
        return Buffer.from(bytes).toString('utf8');
    } catch {
        return value;
    }
};

const deepSanitizeText = (input) => {
    if (typeof input === 'string') return decodePotentialMojibake(input);
    if (Array.isArray(input)) return input.map(item => deepSanitizeText(item));
    if (input && typeof input === 'object') {
        return Object.fromEntries(
            Object.entries(input).map(([key, value]) => [key, deepSanitizeText(value)])
        );
    }
    return input;
};

const SANITIZED_TEMPLATES = TEMPLATES.map(template => deepSanitizeText(template));

// Get all templates
app.get('/api/templates', (req, res) => {
    const { category } = req.query;

    let filteredTemplates = SANITIZED_TEMPLATES.map(t => ({
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
    const template = SANITIZED_TEMPLATES.find(t => t.id === req.params.id);

    if (!template) {
        return res.status(404).json({ error: 'Şablon bulunamadı' });
    }

    res.json({ template });
});

// Use template - fill variables and generate content
app.post('/api/templates/:id/use', (req, res) => {
    const template = SANITIZED_TEMPLATES.find(t => t.id === req.params.id);

    if (!template) {
        return res.status(404).json({ error: 'Şablon bulunamadı' });
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

const normalizePlanCode = (planCode) => {
    const normalized = String(planCode || '').trim().toLowerCase();
    if (!normalized) return null;
    if (!/^[a-z0-9_-]{2,32}$/.test(normalized)) return null;
    return normalized;
};

const normalizePlanStatus = (planStatus) => {
    const normalized = String(planStatus || '').trim().toLowerCase();
    if (!normalized) return null;
    if (!['active', 'inactive', 'suspended'].includes(normalized)) return null;
    return normalized;
};

// Authenticated user plan summary
app.get('/api/user-plan-summary', async (req, res) => {
    try {
        const user = await getAuthenticatedUserFromRequest(req);
        const serviceClient = createServiceRoleClient();
        const summary = await buildPlanUsageSummary(serviceClient, user.id);
        res.json({ summary });
    } catch (error) {
        console.error('User plan summary error:', error);
        res.status(error.status || 500).json({ error: error.message || 'Plan ozeti alinamadi' });
    }
});

// Authenticated user subscription cancellation
app.post('/api/user-plan-cancel', async (req, res) => {
    try {
        const user = await getAuthenticatedUserFromRequest(req);
        const serviceClient = createServiceRoleClient();
        await getOrCreateUserPlan(serviceClient, user.id);

        const { error: updateError } = await serviceClient
            .from('user_usage_plans')
            .update({ status: 'inactive' })
            .eq('user_id', user.id);

        if (updateError) {
            throw updateError;
        }

        const summary = await buildPlanUsageSummary(serviceClient, user.id);
        res.json({ success: true, summary });
    } catch (error) {
        console.error('User plan cancel error:', error);
        res.status(error.status || 500).json({ error: error.message || 'Abonelik iptal edilemedi' });
    }
});

// Admin Users API - Get users with email from Supabase Auth
app.get('/api/admin-users', requireAdminAuth, async (req, res) => {
    try {
        const supabaseAdmin = createServiceRoleClient();

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

        const userIds = filteredUsers.map(u => u.id);
        if (userIds.length === 0) {
            return res.json({
                users: [],
                total: 0,
                page,
                pageSize
            });
        }

        // Get profiles data for additional info
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

        const petitionCountMap = new Map();
        petitionCounts?.forEach(p => {
            petitionCountMap.set(p.user_id, (petitionCountMap.get(p.user_id) || 0) + 1);
        });

        // Get plan data
        const { data: plans } = await supabaseAdmin
            .from('user_usage_plans')
            .select('user_id, plan_code, status, daily_limit, trial_starts_at, trial_ends_at')
            .in('user_id', userIds);
        const planMap = new Map(plans?.map(plan => [plan.user_id, plan]) || []);

        // Get today's usage for visible users
        const today = getTodayIsoDate();
        const { data: usageRows } = await supabaseAdmin
            .from('ai_generation_usage')
            .select('user_id')
            .in('user_id', userIds)
            .eq('usage_date', today);
        const usageCountMap = new Map();
        usageRows?.forEach(row => {
            usageCountMap.set(row.user_id, (usageCountMap.get(row.user_id) || 0) + 1);
        });

        // Combine data
        const combinedUsers = filteredUsers.map(user => {
            const profile = profileMap.get(user.id) || {};
            const plan = planMap.get(user.id);
            const planCode = String(plan?.plan_code || 'trial').toLowerCase();
            const planStatus = String(plan?.status || 'active').toLowerCase();
            const dailyLimit = parsePositiveLimit(plan?.daily_limit);
            const usedToday = usageCountMap.get(user.id) || 0;
            const remainingToday = dailyLimit === null ? null : Math.max(0, dailyLimit - usedToday);

            return {
                id: user.id,
                email: user.email,
                full_name: profile.full_name || user.user_metadata?.full_name || null,
                office_name: null,
                created_at: user.created_at,
                last_sign_in_at: user.last_sign_in_at,
                petition_count: petitionCountMap.get(user.id) || 0,
                plan_code: planCode,
                plan_status: planStatus,
                daily_limit: dailyLimit,
                used_today: usedToday,
                remaining_today: remainingToday,
                trial_starts_at: plan?.trial_starts_at || null,
                trial_ends_at: plan?.trial_ends_at || null,
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

// Admin Users API - Assign package and document generation rights
app.patch('/api/admin-users', requireAdminAuth, async (req, res) => {
    try {
        const { userId, planCode, status, dailyLimit, resetTodayUsage } = req.body || {};

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({ error: 'userId zorunludur.' });
        }

        const serviceClient = createServiceRoleClient();
        const existingPlan = await getOrCreateUserPlan(serviceClient, userId);
        const updates = {};

        if (planCode !== undefined) {
            const normalizedPlanCode = normalizePlanCode(planCode);
            if (!normalizedPlanCode) {
                return res.status(400).json({ error: 'Gecersiz planCode degeri.' });
            }
            updates.plan_code = normalizedPlanCode;
        }

        if (status !== undefined) {
            const normalizedStatus = normalizePlanStatus(status);
            if (!normalizedStatus) {
                return res.status(400).json({ error: 'Gecersiz status degeri.' });
            }
            updates.status = normalizedStatus;
        }

        if (dailyLimit !== undefined) {
            if (dailyLimit === null || dailyLimit === '') {
                updates.daily_limit = null;
            } else {
                const normalizedLimit = parsePositiveLimit(dailyLimit);
                if (!normalizedLimit) {
                    return res.status(400).json({ error: 'dailyLimit pozitif bir sayi olmali veya null olmalidir.' });
                }
                updates.daily_limit = normalizedLimit;
            }
        }

        if ((updates.plan_code || existingPlan?.plan_code) === 'trial') {
            const now = new Date();
            updates.trial_starts_at = existingPlan?.trial_starts_at || now.toISOString();
            updates.trial_ends_at = existingPlan?.trial_ends_at
                || new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

            if (updates.daily_limit === undefined && !parsePositiveLimit(existingPlan?.daily_limit)) {
                updates.daily_limit = TRIAL_DAILY_GENERATION_LIMIT;
            }
        }

        if (Object.keys(updates).length > 0) {
            const { error: updateError } = await serviceClient
                .from('user_usage_plans')
                .update(updates)
                .eq('user_id', userId);

            if (updateError) {
                throw updateError;
            }
        }

        if (resetTodayUsage) {
            const today = getTodayIsoDate();
            const { error: resetError } = await serviceClient
                .from('ai_generation_usage')
                .delete()
                .eq('user_id', userId)
                .eq('usage_date', today);

            if (resetError) {
                throw resetError;
            }
        }

        const summary = await buildPlanUsageSummary(serviceClient, userId);
        res.json({ success: true, summary });
    } catch (error) {
        console.error('Admin user rights update error:', error);
        res.status(500).json({ error: error.message || 'Kullanici haklari guncellenemedi.' });
    }
});

// Announcements API (shared handler)
app.all('/api/announcements', (req, res) => announcementsHandler(req, res));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
