import express from 'express';
import htmlToDocx from 'html-to-docx';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import hpp from 'hpp';
import xss from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';
import { body, param, validationResult } from 'express-validator';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { AI_CONFIG, SERVER_CONFIG } from './config.js';
import templatesHandler from './api/templates.js';
import announcementsHandler from './api/announcements.js';
import {
    cancelStripeSubscriptionForUser,
    constructStripeWebhookEvent,
    createStripeCheckoutSession,
    normalizePaidPlan,
    parseRequestBody,
    processStripeWebhookEvent
} from './lib/api/stripeCheckout.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = SERVER_CONFIG.PORT;
const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
    console.error('âŒ GEMINI_API_KEY (or VITE_GEMINI_API_KEY) is not defined in .env file');
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
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'stripe-signature'],
    optionsSuccessStatus: 204,
    maxAge: 60 * 60
};

const getSafeErrorMessage = (error, fallbackMessage) => {
    if (process.env.NODE_ENV === 'production') {
        return fallbackMessage;
    }
    return error?.message || fallbackMessage;
};

const validateRequest = (validations) => [
    ...validations,
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Gecersiz istek verisi.',
                details: errors.array({ onlyFirstError: true }).map((item) => ({
                    field: item.path,
                    message: item.msg,
                })),
            });
        }
        return next();
    },
];

const createCheckoutIdempotencyKey = ({ userId, plan }) => {
    const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const rawKey = `${String(userId || '').trim()}:${String(plan || '').trim()}:${bucket}`;
    return crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 64);
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

const requireUserAuth = async (req, res, next) => {
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

        req.authUser = {
            id: user.id,
            email: user.email || null,
            user,
        };
        return next();
    } catch (error) {
        console.error('User auth error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
    }
};

// Shared helper for Supabase service role client validation
const createServiceRoleClient = () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
        throw new Error('VITE_SUPABASE_URL not configured');
    }
    if (!serviceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
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
app.set('trust proxy', 1);
app.use(helmet());
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

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
});

const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 50,
    delayMs: () => 500,
});

const aiRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: {
        error: 'Çok fazla istek gönderdiniz. Lütfen bir dakika bekleyip tekrar deneyin.',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        console.warn(`âš ï¸ Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json(options.message);
    }
});

app.use('/api/', apiLimiter);
app.use('/api/', speedLimiter);
app.use('/api/gemini', aiRateLimiter);

// Stripe webhook signature verification requires raw request body.
const handleStripeWebhook = async (req, res) => {
    try {
        const signatureHeader = Array.isArray(req.headers['stripe-signature'])
            ? req.headers['stripe-signature'][0]
            : req.headers['stripe-signature'];

        const event = constructStripeWebhookEvent({
            rawBody: req.body,
            signature: signatureHeader,
        });

        const result = await processStripeWebhookEvent(event);
        return res.status(200).json({
            received: true,
            handled: result?.handled !== false,
            eventType: event?.type || null,
            reason: result?.reason || null,
        });
    } catch (error) {
        console.error('Stripe webhook error:', error);
        return res.status(error.status || 500).json({
            error: getSafeErrorMessage(error, 'Stripe webhook islenemedi.'),
            details: process.env.NODE_ENV === 'production' ? null : (error.details || null),
        });
    }
};

app.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), handleStripeWebhook);
app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), handleStripeWebhook);

// Route-level body limits for heavier payload endpoints
app.use('/api/gemini/analyze', express.json({ limit: process.env.UPLOAD_JSON_BODY_LIMIT || '15mb' }));
app.use('/api/gemini/chat', express.json({ limit: process.env.UPLOAD_JSON_BODY_LIMIT || '15mb' }));
app.use('/api/html-to-docx', express.json({ limit: process.env.DOC_JSON_BODY_LIMIT || '1mb' }));

// Default body limits
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '100kb' }));
app.use(express.urlencoded({ extended: false, limit: process.env.URLENCODED_BODY_LIMIT || '100kb' }));

// Input sanitization middleware
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(xss());
app.use(hpp());


// --- Helper Functions (Copied from geminiService.ts) ---

const formatChatHistoryForPrompt = (history) => {
    if (!history || history.length === 0) return "Sohbet geçmiþi yok.";
    return history.map(msg => `${msg.role === 'user' ? 'Kullanýcý' : 'Asistan'}: ${msg.text}`).join('\n');
};

const formatPartiesForPrompt = (parties) => {
    if (!parties) return "Taraf bilgisi saðlanmadý.";
    const partyEntries = Object.entries(parties).filter(([, value]) => value && value.trim() !== '');
    if (partyEntries.length === 0) return "Taraf bilgisi saðlanmadý.";

    const labelMap = {
        plaintiff: 'Davacý',
        defendant: 'Davalý',
        appellant: 'Baþvuran / Ýtiraz Eden',
        counterparty: 'Karþý Taraf',
        complainant: 'Müþteki / Þikayetçi',
        suspect: 'Þüpheli',
        party1: 'Taraf 1',
        party2: 'Taraf 2',
    };

    return partyEntries
        .map(([key, value]) => `${labelMap[key] || key}: ${value}`)
        .join('\n');
};

const formatCaseDetailsForPrompt = (details) => {
    if (!details) return "Dava künye bilgisi saðlanmadý.";
    const detailEntries = [
        details.court && `Mahkeme: ${details.court}`,
        details.fileNumber && `Dosya Numarasý (Esas No): ${details.fileNumber}`,
        details.decisionNumber && `Karar Numarasý: ${details.decisionNumber}`,
        details.decisionDate && `Karar Tarihi: ${details.decisionDate}`,
    ].filter(Boolean);

    if (detailEntries.length === 0) return "Dava künye bilgisi saðlanmadý.";
    return detailEntries.join('\n');
}

const formatLawyerInfoForPrompt = (lawyerInfo) => {
    if (!lawyerInfo || !lawyerInfo.name) return "Vekil bilgisi saðlanmadý.";

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
    if (!contactInfo || contactInfo.length === 0) return "Ýletiþim bilgisi saðlanmadý.";

    return contactInfo.map((contact, index) => {
        const entries = [
            `--- Kiþi/Kurum ${index + 1} ---`,
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
    'olan', 'olanlar', 'olarak', 'bu', 'su', 'þu', 'o', 'bir', 'iki', 'uc', 'üç',
    'de', 'da', 'mi', 'mu', 'mü', 'mý', 'ki', 'ya', 'yada', 'hem',
    'en', 'cok', 'çok', 'az', 'sonra', 'once', 'önce', 'son', 'ilk', 'her', 'tum',
    'tüm', 'hakkinda', 'hakkýnda', 'oldu', 'olur', 'olsun'
]);

const normalizeRagText = (value = '') => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çðýöþü\s]/gi, ' ')
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
app.use('/api/gemini', authMiddleware, requireUserAuth);
app.use('/api/html-to-docx', authMiddleware, requireUserAuth);

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
        console.warn('Analyze Request Received');

        const model = AI_CONFIG.MODEL_NAME;
        const systemInstruction = `Sen Türk hukukunda uzmanlaþmýþ bir hukuk asistanýsýn. Görevin, saðlanan belgeleri, resimleri ve metinleri titizlikle analiz etmektir. Temel bilgileri çýkar, tüm potansiyel taraflarý (þahýslar, þirketler) belirle ve eðer varsa dava künyesi bilgilerini (mahkeme adý, dosya/esas no, karar no, karar tarihi) tespit et. Ayrýca belgelerden avukat/vekil bilgilerini (isim, baro, baro sicil no, adres, telefon, email) ve diðer iletiþim bilgilerini çýkar. Çýktýný JSON nesnesi olarak yapýlandýr. Analiz özetinin HER ZAMAN Türkçe olmasýný saðla.`;

        const promptText = `
Lütfen SANA GÖNDERÝLEN PDF belgelerini, resim dosyalarýný ve aþaðýdaki metin olarak saðlanan UDF ve Word belgelerinin içeriðini titizlikle analiz et.

**ANA GÖREVLER:**
1. Olayýn detaylý ve Türkçe bir özetini oluþtur. **ÖZETÝ MUTLAKA PARAGRAFLARA BÖLEREK YAZ (paragraflar arasýnda '\\n\\n' boþluklarý býrak)**, tek parça blok yazý KESÝNLÝKLE kullanma.
2. Metinde adý geçen tüm potansiyel taraflarý listele
3. Dava künyesi bilgilerini çýkar (mahkeme, dosya numarasý, karar numarasý, karar tarihi)
4. **ÖNEMLÝ:** Avukat/vekil bilgilerini bul ve çýkar:
   - Avukat adý soyadý (genellikle "Av." veya "Avukat" ile baþlar)
   - Baro adý ("... Barosu" formatýnda)
   - Baro sicil numarasý
   - Ýþ adresi
   - Telefon numarasý
   - Email adresi
5. Diðer iletiþim bilgilerini çýkar (taraflarýn adres, telefon, email bilgileri)

**UDF Belge Ýçerikleri:**
${udfTextContent || "UDF belgesi yüklenmedi."}

**Word Belge Ýçerikleri:**
${wordTextContent || "Word belgesi yüklenmedi."}

**ÇIKTI FORMATI:**
Sonucu 'summary', 'potentialParties', 'caseDetails', 'lawyerInfo' ve 'contactInfo' anahtarlarýna sahip bir JSON nesnesi olarak döndür.
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
                        summary: { type: Type.STRING, description: 'Documentslarýn detaylý Türkçe özeti.' },
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
                            description: 'Avukat/vekil bilgileri (eðer belgede varsa)',
                            properties: {
                                name: { type: Type.STRING, description: 'Avukatýn tam adý' },
                                address: { type: Type.STRING, description: 'Avukatýn iþ adresi' },
                                phone: { type: Type.STRING, description: 'Telefon numarasý' },
                                email: { type: Type.STRING, description: 'Email adresi' },
                                barNumber: { type: Type.STRING, description: 'Baro sicil numarasý' },
                                bar: { type: Type.STRING, description: 'Baro adý (örn: Ankara Barosu)' },
                                title: { type: Type.STRING, description: 'Unvan (örn: Avukat)' },
                                tcNo: { type: Type.STRING, description: 'TC Kimlik No (eðer varsa)' }
                            }
                        },
                        contactInfo: {
                            type: Type.ARRAY,
                            description: 'Diðer iletiþim bilgileri (taraflarýn adresleri, telefonlarý)',
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING, description: 'Kiþi/Kurum adý' },
                                    address: { type: Type.STRING, description: 'Adres' },
                                    phone: { type: Type.STRING, description: 'Telefon' },
                                    email: { type: Type.STRING, description: 'Email' },
                                    tcNo: { type: Type.STRING, description: 'TC Kimlik No (eðer varsa)' }
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
        res.status(500).json({ error: getSafeErrorMessage(error, 'Internal Server Error') });
    }
});

// 2. Generate Keywords
app.post('/api/gemini/keywords', async (req, res) => {
    try {
        const { analysisText, userRole } = req.body;
        const model = AI_CONFIG.MODEL_NAME;
        const systemInstruction = `Sen Türk Hukuku alanýnda uzman, stratejik bir araþtýrma asistanýsýn. Görevin, verilen vaka özetini analiz ederek, kullanýcýnýn '${userRole}' olan rolünü hukuki olarak en güçlü konuma getirecek anahtar kelimeleri belirlemektir. Oluþturacaðýn anahtar kelimeler, kullanýcýnýn lehine olan Yargýtay kararlarýný, mevzuatý ve hukuki argümanlarý bulmaya odaklanmalýdýr. Çýktý olarak SADECE 'keywords' anahtarýný içeren ve bu anahtarýn deðerinin bir string dizisi olduðu bir JSON nesnesi döndür.`;
        const promptText = `Saðlanan vaka özeti:\n\n"${analysisText}"\n\nBu özete dayanarak... (kýsaltýldý)`; // Simplified prompt for brevity in this file context

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
        res.status(500).json({ error: getSafeErrorMessage(error, 'Metin yeniden yazilamadi.') });
    }
});

// 3. Web Search - Enhanced for Yargýtay Decisions
app.post('/api/gemini/web-search', async (req, res) => {
    try {
        const { keywords, query } = req.body;

        // Handle both keywords array and single query string
        const searchTerms = keywords || (query ? [query] : []);

        if (!Array.isArray(searchTerms) || searchTerms.length === 0) {
            return res.status(400).json({ error: 'Keywords veya query parametresi gerekli' });
        }

        const model = AI_CONFIG.MODEL_NAME;

        const systemInstruction = `Sen, Türk hukuku alanýnda uzman bir araþtýrma asistanýsýn. 
Görevin özellikle YARGITAY KARARLARI bulmak ve bunlarý dilekçede kullanýlabilir formatta sunmaktýr.

## KRÝTÝK GÖREV: YARGITAY KARARLARI BULMA

Her aramada þunlarý tespit etmeye çalýþ:
1. **Karar Künyesi:** Daire, Esas No, Karar No, Tarih (örn: "Yargýtay 9. HD., E. 2023/1234, K. 2023/5678, T. 15.03.2023")
2. **Karar Özeti:** 1-2 cümlelik özet
3. **Ýlgili Kanun Maddesi:** Kararda atýf yapýlan mevzuat

## ÇIKTI FORMATI

Çýktýný þu þekilde yapýlandýr:

### EMSAL YARGITAY KARARLARI

**1. [Yargýtay X. HD., E. XXXX/XXXX, K. XXXX/XXXX, T. XX.XX.XXXX]**
Özet: [Kararýn özeti]
Ýlgili Mevzuat: [Kanun maddesi]

**2. [Diðer karar]**
...

### ÝLGÝLÝ MEVZUAT

- [Kanun Adý] m. [madde no]: [madde özeti]

### ARAÞTIRMA ÖZETÝ

[Bulunan karar ve mevzuata dayalý genel hukuki deðerlendirme]

NOT: En az 3-5 emsal karar bulmaya çalýþ. Bulamazsan "Bu konuda emsal karar bulunamadý" yaz.`;

        // Generate search queries for Yargýtay and legislation
        const yargitayQueries = searchTerms.map(kw => `"${kw}" Yargýtay karar emsal`);
        const mevzuatQueries = searchTerms.map(kw => `"${kw}" kanun maddesi hüküm`);
        const uyapQueries = searchTerms.map(kw => `"${kw}" site:karararama.yargitay.gov.tr`);

        const promptText = `
## ARAMA GÖREVÝ: YARGITAY KARARLARI VE MEVZUAT

Aþaðýdaki konularda kapsamlý bir hukuki araþtýrma yap:

### ANAHTAR KELÝMELER
${searchTerms.join(', ')}

### ARAMA STRATEJÝSÝ

**1. Yargýtay Kararlarý (Öncelikli)**
${yargitayQueries.map(q => `- ${q}`).join('\n')}

**2. UYAP Karar Arama**
${uyapQueries.map(q => `- ${q}`).join('\n')}

**3. Mevzuat Aramasý**
${mevzuatQueries.map(q => `- ${q}`).join('\n')}

---

## BEKLENTÝLER

1. **En az 3-5 Yargýtay kararý** bul (mümkünse)
2. Her karar için TAM KÜNYESÝNÝ yaz (Daire, E., K., Tarih)
3. Ýlgili kanun maddelerini listele
4. Araþtýrma özetini hazýrla

âš ï¸ ÖNEMLÝ: Karar künyelerini doðru ve eksiksiz yaz. Bu bilgiler dilekçede referans olarak kullanýlacak.
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
        res.status(500).json({ error: getSafeErrorMessage(error, 'Dilekce gozden gecirilemedi.') });
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

        const systemInstruction = `Sen, Türk hukuk sisteminde 20+ yýl deneyime sahip, üst düzey bir hukuk danýþmaný ve dilekçe yazým uzmanýsýn.

## SENÝN GÖREVÝN
Saðlanan ham verileri, profesyonel ve ikna edici bir hukuki anlatýya dönüþtürmek. Ham bilgileri olduðu gibi kopyalamak DEÐÝL, bunlarý hukuki bir dil ve mantýksal akýþ içinde sentezlemek.

## KRÝTÝK YAZIM KURALLARI

### 1. AÇIKLAMALAR BÖLÜMÜ NASIL YAZILMALI
âŒ YANLIÞ (Ham veri dökümü):
"Davalý kurum tarafýndan müvekkil HÜSEYÝN ÇELÝK adýna 'kaçak elektrik tahakkuk hesap detayý' düzenlenmiþ olup, bu belge müvekkilime teblið edilmiþtir. Ýþbu tahakkukta, müvekkilimin Tesisat No (4004311180), Müþteri No (205539133), TC Kimlik No (41038011064)..."

âœ… DOÐRU (Profesyonel hukuki anlatý):
"1. Müvekkilim, davalý kurumun abonesi olup, söz konusu taþýnmazda ikamet etmektedir.

2. Davalý kurum, müvekkilim aleyhine "kaçak elektrik kullanýmý" iddiasýyla tahakkuk iþlemi baþlatmýþ ve 25.275,55 TL tutarýnda borç çýkarmýþtýr.

3. Yapýlan incelemede, müvekkilimin sayacýnýn (Seri No: CE000624281) herhangi bir müdahale izine rastlanmamýþ olup, iddia edilen kaçak kullaným tespiti usulsüz bir þekilde gerçekleþtirilmiþtir.

4. Þöyle ki; [olay detaylarý kronolojik sýrayla anlatýlmalý]..."

### 2. âš ï¸ EMSAL KARARLARIN KULLANIMI (ÇOK ÖNEMLÝ)
Yargýtay/Danýþtay kararlarý SADECE "HUKUKÝ SEBEPLER" bölümüne listelenmemeli!

âŒ YANLIÞ (Sadece listeleme):
"## HUKUKÝ SEBEPLER
- Yargýtay 9. HD., E. 2023/1234, K. 2023/5678
- Yargýtay 3. HD., E. 2022/5678, K. 2022/9999"

âœ… DOÐRU (Ýlgili argümanla entegre):
"## AÇIKLAMALAR
...
4. Davalý kurumun iddia ettiði kaçak elektrik kullanýmýnýn somut delilleri bulunmamaktadýr. Nitekim Yargýtay 3. Hukuk Dairesi'nin E. 2022/5678, K. 2022/9999, T. 15.03.2023 tarihli kararýnda: 'Kaçak elektrik kullanýmý iddiasýnýn ispatý davalýya aittir. Sayaç mührü üzerinde herhangi bir müdahale izi tespit edilememiþse kaçak elektrik kullanýmýndan söz edilemez' þeklinde hükmedilmiþtir. Somut olayda da sayaçta herhangi bir müdahale izi tespit edilememiþtir.

5. Ayrýca tahakkuk edilen miktar da fahiþtir. Yargýtay 3. HD., E. 2021/4567 kararýnda da belirtildiði üzere, 'Tüketim miktarýnýn belirlenmesinde gerçek tüketim deðerleri esas alýnmalýdýr.'
..."

### 3. BÖLÜM YAPISI (Kesin sýra)
Her dilekçede þu bölümler MUTLAKA bulunmalý ve bu sýrayla yazýlmalý:

## [MAHKEME/MAKAM ADI - BÜYÜK HARFLERLE, ORTALI]

**DOSYA NO:** [varsa]

---

**DAVACI/BAÞVURAN:**
[Ad Soyad]
TC: [Kimlik No]
Adres: [Adres]

**VEKÝLÝ:** [varsa]
[Avukat bilgileri]

**DAVALI/KARÞI TARAF:**
[Kurum/Kiþi adý]
Adres: [Adres]

---

**KONU:** [Tek cümlelik özet - örn: "Kaçak elektrik tahakkuku iddiasýna itiraz hakkýndadýr."]

---

## AÇIKLAMALAR

[Numaralý maddeler halinde, her madde ayrý paragraf]

1. [Giriþ: Taraflarýn tanýtýmý ve temel iliþki]

2. [Olay: Ne oldu, kronolojik anlatým]

3. [Sorun: Neden haksýz/hukuka aykýrý + DESTEKLEYÝCÝ EMSAL KARAR]

4. [Deliller ve destekleyici argümanlar + ÝLGÝLÝ YARGITAY KARARI]

5. [Sonuç çýkarýmý]

---

## HUKUKÝ SEBEPLER

- [Ýlgili Kanun maddesi ve açýklamasý]
- [Yukarýda atýf yapýlan emsal kararlarýn özet listesi]

---

## DELÝLLER

1. [Delil listesi]

---

## SONUÇ VE ÝSTEM

Yukarýda arz ve izah edilen sebeplerle;
- [Talep 1]
- [Talep 2]
... kararý verilmesini saygýlarýmla arz ve talep ederim.

[Tarih]
[Ad Soyad / Vekil]

### 4. DÝL VE ÜSLUP KURALLARI
- "Müvekkil" kelimesini tutarlý kullan
- Resmi hitap formu kullan: "Sayýn Mahkemeniz", "arz ve talep ederim"
- Teknik verileri (TC No, dosya no) akýcý cümle içinde yerleþtir, liste olarak deðil
- Hukuki terimler kullan: "haksýz fiil", "usulsüz iþlem", "hukuka aykýrýlýk" vb.
- Her paragraf bir ana fikir içermeli
- Gereksiz tekrarlardan kaçýn
- EMSAL KARARLARI ilgili argümana entegre et, ayrý liste yapma`;

        const promptText = `
## DÝLEKÇE OLUÞTURMA TALÝMATI

Aþaðýdaki HAM VERÝLERÝ kullanarak PROFESYONEL bir Türk hukuk dilekçesi hazýrla.

âš ï¸ ÖNEMLÝ: Ham verileri olduðu gibi kopyalama! Bunlarý hukuki bir anlatýya dönüþtür.

---

### GÝRDÝ VERÝLERÝ

**Dilekçe Türü:** ${params.petitionType}
**Kullanýcýnýn Rolü:** ${params.userRole}

**Dava Künyesi:**
${formatCaseDetailsForPrompt(params.caseDetails)}

**Vekil Bilgileri:**
${formatLawyerInfoForPrompt(params.lawyerInfo)}

**Taraflar:**
${formatPartiesForPrompt(params.parties)}

**Olay Özeti (Ham):**
${params.analysisSummary || "Olay özeti saðlanmadý."}

**Hukuki Araþtýrma:**
${params.webSearchResult || "Web araþtýrmasý sonucu saðlanmadý."}

**Emsal Yargýtay/Danýþtay Kararlarý:**
${params.legalSearchResult || "Emsal karar araþtýrmasý yapýlmadý."}

**Ek Notlar:**
${params.docContent || "Ek metin saðlanmadý."}

**Özel Talimatlar:**
${params.specifics || "Özel talimat saðlanmadý."}

**Sohbet Geçmiþi:**
${formatChatHistoryForPrompt(params.chatHistory)}

**RAG Destek Baglami (ilgili parcalar):**
${ragContext || "RAG baglami bulunamadi."}

---

## BEKLENEN ÇIKTI

Yukarýdaki ham verileri kullanarak:
1. Profesyonel, ikna edici bir hukuki anlatý oluþtur
2. Her bölümü (AÇIKLAMALAR, HUKUKÝ SEBEPLER, DELÝLLER, SONUÇ VE ÝSTEM) ayrý ayrý formatla
3. Numaralý maddelerde akýcý paragraflar kullan, ham veri listesi deðil
4. Mahkemeye sunulmaya hazýr, resmi bir dilekçe formatýnda yaz
5. Markdown formatýný kullan (## baþlýklar, **kalýn**, 1. 2. 3. listeler)
6. âš ï¸ EMSAL KARARLARI: Yargýtay kararlarýný ilgili argümanla birlikte AÇIKLAMALAR bölümünde kullan. "Nitekim Yargýtay X. HD., E. .../..., K. .../... kararýnda '...' þeklinde hükmedilmiþtir" formatýnda entegre et.
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
        res.status(statusCode).json({ error: getSafeErrorMessage(error, 'Belge uretimi sirasinda hata olustu.') });
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

        const now = new Date();
        const systemDateIstanbul = new Intl.DateTimeFormat('tr-TR', {
            timeZone: 'Europe/Istanbul',
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        }).format(now);
        const systemTimeIstanbul = new Intl.DateTimeFormat('tr-TR', {
            timeZone: 'Europe/Istanbul',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }).format(now);
        const systemUtcIso = now.toISOString();

        const contextPrompt = `
**MEVCUT DURUM VE BAÐLAM:**
- **Vaka Özeti:** ${analysisSummary || "Henüz analiz yapýlmadý."}
- **Mevcut Arama Anahtar Kelimeleri:** ${safeContext.keywords || "Henüz anahtar kelime oluþturulmadý."}
- **Web Araþtýrma Özeti:** ${safeContext.searchSummary || "Henüz web araþtýrmasý yapýlmadý."}
- **Emsal Karar Özeti:** ${safeContext.legalSummary || "Henüz emsal karar özeti saðlanmadý."}
- **Kullanýcýnýn Ek Metinleri:** ${safeContext.docContent || "Ek metin saðlanmadý."}
- **Kullanýcýnýn Özel Talimatlarý:** ${safeContext.specifics || "Özel talimat saðlanmadý."}
- **RAG Destek Baglami:** ${ragContext || "RAG baglami bulunamadi."}
- **Sistem Tarihi (Europe/Istanbul):** ${systemDateIstanbul}
- **Sistem Saati (Europe/Istanbul):** ${systemTimeIstanbul}
- **UTC Zaman Damgasi:** ${systemUtcIso}
${requestFiles.length > 0 ? `- **Yüklenen Belgeler:** ${requestFiles.length} adet dosya yüklendi (${requestFiles.map(f => f.name).join(', ')})` : ''}
`;

        const systemInstruction = `Sen, Türk Hukuku konusunda uzman, yardýmsever ve proaktif bir hukuk asistanýsýn.

**SENÝN GÖREVLERÝN:**
1. Kullanýcýnýn hukuki sorularýný yanýtlamak
2. Dava stratejisi konusunda beyin fýrtýnasý yapmak
3. Hukuki terimleri açýklamak
4. **BELGE ANALÝZÝ: Kullanýcý dosya yüklediðinde, bu dosyalarý analiz et ve sorularýný yanýtla**
5. **ÖNEMLÝ: Kullanýcý belge/dilekçe/talep hazýrlamaný istediðinde, generate_document fonksiyonunu kullan**
6. **KRÝTÝK: Kullanýcý Yargýtay kararý/emsal karar aramasý istediðinde, GERÇEK bir Google aramasý yap**

**BELGE ANALÝZÝ KURALLARI:**
Kullanýcý dosya yüklediðinde:
- PDF veya resim dosyalarýný dikkatlice incele
- Ýçeriði özetle ve anahtar bilgileri çýkar
- Hukuki açýdan önemli noktalarý vurgula
- Kullanýcýnýn sorularýný belge içeriðine göre yanýtla

**YARGITAY KARARI ARAMA KURALLARI:**
Kullanýcý sorusunu once analiz et; sadece gerekliyse GERCEK bir web aramasi yap:
- "Yargýtay kararý ara", "emsal karar bul", "içtihat araþtýr"
- "Bu konuda Yargýtay ne diyor?", "Yargýtay kararlarýný bul"
- "Karar künyesi ver", "emsal karar listele"

Arama yaparken:
1. Mevcut baðlamdaki anahtar kelimeleri kullan
2. "site:karararama.yargitay.gov.tr" veya "Yargýtay" anahtar kelimesi ekle
3. Bulunan kararlarýn TAM KÜNYESÝNÝ ver (Daire, Esas No, Karar No, Tarih)
4. Her karar için kýsa bir özet yaz

**ÇIKTI FORMATI (Yargýtay Aramasý):**
### BULUNAN YARGITAY KARARLARI

**1. Yargýtay X. HD., E. XXXX/XXXX, K. XXXX/XXXX, T. XX.XX.XXXX**
Özet: [Karar özeti]
Kaynak: [URL varsa]

**2. ...**

**BELGE TALEBÝ TESPÝT KURALLARI:**
Kullanýcý þunlarý söylediðinde generate_document fonksiyonunu MUTLAKA çaðýr:
- "... hazýrla", "... oluþtur", "... yaz" (dilekçe, talep, itiraz vb. ile birlikte)
- "haricen tahsil talebi", "ihtarname", "feragat dilekçesi" vb. belge isimleri
- "bana bir ... hazýrla"
- "... için dilekçe lazým"

**BELGE TÜRÜ ÖRNEKLERÝ:**
- harici_tahsil_talebi: Haricen tahsil talebi/yazýsý
- ihtarname: Ýhtarname
- dava_dilekçesi: Dava dilekçesi
- itiraz_dilekçesi: Ýtiraz dilekçesi
- feragat_dilekçesi: Feragat dilekçesi
- cevap_dilekçesi: Cevap dilekçesi
- temyiz_dilekçesi: Temyiz dilekçesi
- icra_takip_talebi: Ýcra takip talebi
- genel_dilekçe: Genel dilekçe/belge

**LIMIT KURALI:**
- Belge olustururken mutlaka generate_document fonksiyonunu kullan.
- generate_document fonksiyonu cagirmadan tam belge metni verme.

Ýþte mevcut davanýn baðlamý:
${contextPrompt}

Türkçe yanýt ver. Soruyu once analiz et; tanim/genel sorularda aramayi zorunlu tutma ve kisa mevzuat cevabi ver. Uygulama/uyusmazlik sorularinda gerekli gordugunde arama yap. Tarih/saat sorularinda, baglamdaki sistem tarih-saat bilgisini esas al.`;

        // Function for updating keywords
        const updateKeywordsFunction = {
            name: 'update_search_keywords',
            description: 'Kullanýcý anahtar kelime eklenmesini istediðinde bu fonksiyonu kullan.',
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
            description: 'Kullanýcý bir belge, dilekçe veya resmi yazý hazýrlanmasýný istediðinde bu fonksiyonu kullan. Örnek: "harici tahsil talebi hazýrla", "ihtarname yaz", "feragat dilekçesi oluþtur".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    documentType: {
                        type: Type.STRING,
                        description: 'Belge türü: harici_tahsil_talebi, ihtarname, dava_dilekçesi, itiraz_dilekçesi, feragat_dilekçesi, cevap_dilekçesi, temyiz_dilekçesi, icra_takip_talebi, genel_dilekçe'
                    },
                    documentTitle: {
                        type: Type.STRING,
                        description: 'Belgenin baþlýðý (örn: "HARÝCEN TAHSÝL TALEBÝ", "ÝHTARNAME")'
                    },
                    documentContent: {
                        type: Type.STRING,
                        description: 'Belgenin tam içeriði - Türk hukuk formatýna uygun, markdown formatýnda, bölümlere ayrýlmýþ. Mevcut baðlam bilgilerini kullan.'
                    }
                },
                required: ['documentType', 'documentTitle', 'documentContent'],
            },
        };
        // Function for searching Yargýtay decisions
        const searchYargitayFunction = {
            name: 'search_yargitay',
            description: 'Kullanýcý Yargýtay kararý aramasý istediðinde bu fonksiyonu kullan. Örnek: "Yargýtay kararý ara", "emsal karar bul", "içtihat araþtýr".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    searchQuery: {
                        type: Type.STRING,
                        description: 'Aranacak konu. Mevcut baðlamdaki anahtar kelimeleri ve konuyu içermeli.'
                    },
                    keywords: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Arama için kullanýlacak anahtar kelimeler listesi'
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

        const pendingFunctionCalls = [];
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
                                text: '\n\n?? Gunluk trial belge uretim limitine ulastiniz. Yarin tekrar deneyin veya bir pakete gecin.\n',
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
                    console.warn(`ðŸ” AI requesting legal search: "${searchQuery}"`);

                    // Execute the legal search using existing function
                    const searchResult = await searchEmsalFallback(searchQuery);

                    // Format results for the AI
                    let formattedResults = '\n\n### ðŸ“š BULUNAN YARGITAY KARARLARI\n\n';
                    if (searchResult.results && searchResult.results.length > 0) {
                        searchResult.results.forEach((result, index) => {
                            formattedResults += `**${index + 1}. ${result.title || 'Yargýtay Kararý'}**\n`;
                            if (result.esasNo) formattedResults += `E. ${result.esasNo} `;
                            if (result.kararNo) formattedResults += `K. ${result.kararNo} `;
                            if (result.tarih) formattedResults += `T. ${result.tarih}`;
                            formattedResults += '\n';
                            if (result.ozet) formattedResults += `Özet: ${result.ozet}\n`;
                            formattedResults += '\n';
                        });
                    } else {
                        formattedResults += 'Bu konuda emsal karar bulunamadý.\n';
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
                    const errorChunk = { text: '\n\nâš ï¸ Emsal karar aramasý sýrasýnda bir hata oluþtu.\n' };
                    res.write(JSON.stringify(errorChunk) + '\n');
                }
            }
        }

        res.end();

    } catch (error) {
        console.error('Chat Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: getSafeErrorMessage(error, 'Sohbet servisi gecici olarak kullanilamiyor.') });
        } else {
            res.end();
        }
    }
});

// 8. HTML to DOCX
app.post('/api/html-to-docx', validateRequest([
    body('html')
        .isString()
        .isLength({ min: 1, max: 500000 })
        .withMessage('HTML content is required and must be under 500000 chars.'),
    body('options')
        .optional()
        .isObject()
        .withMessage('options bir nesne olmalidir.'),
]), async (req, res) => {
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
        res.status(500).json({ error: getSafeErrorMessage(error, 'DOCX olusturulamadi.') });
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
    const hasDocumentIntent = /(dilekce|dilekçe|sozlesme|sözleþme|ihtarname|belge|taslak|metin|talep)/i.test(text);
    const hasGenerationVerb = /(olustur|oluþtur|uret|üret|hazirla|hazýrla|yaz)/i.test(text);
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
    if (req?.authUser?.user) {
        return req.authUser.user;
    }

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

    req.authUser = {
        id: user.id,
        email: user.email || null,
        user,
    };

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
        res.status(500).json({ error: getSafeErrorMessage(error, 'Anahtar kelime uretilirken hata olustu.') });
    }
});

// 7. Review Petition
app.post('/api/gemini/review', async (req, res) => {
    try {
        const params = req.body;
        const model = AI_CONFIG.MODEL_NAME;
        const systemInstruction = `You are a senior Turkish legal editor...`;

        const promptText = `
**GÖREV: AÞAÐIDAKÝ MEVCUT DÝLEKÇE TASLAÐINI, SAÐLANAN BAÐLAM BÝLGÝLERÝNÝ KULLANARAK GÖZDEN GEÇÝR VE ÝYÝLEÞTÝR.**

**1. ÝYÝLEÞTÝRÝLECEK MEVCUT DÝLEKÇE TASLAÐI:**
---
${params.currentPetition}
---

**2. DÝLEKÇENÝN HAZIRLANMASINDA KULLANILAN ORÝJÝNAL BAÐLAM BÝLGÝLERÝ:**
- **KULLANICININ ROLÜ:** ${params.userRole}
- **DÝLEKÇE TÜRÜ:** ${params.petitionType}
- **DAVA KÜNYESÝ:** ${formatCaseDetailsForPrompt(params.caseDetails)}
- **VEKÝL BÝLGÝLERÝ:** ${formatLawyerInfoForPrompt(params.lawyerInfo)}
- **ÝLETÝÞÝM BÝLGÝLERÝ:** ${formatContactInfoForPrompt(params.contactInfo)}
- **OLAYIN ÖZETÝ:** ${params.analysisSummary}
- **TARAFLAR:** ${formatPartiesForPrompt(params.parties)}
- **ÝLGÝLÝ HUKUKÝ ARAÞTIRMA:** ${params.webSearchResult}
- **EK METÝN VE NOTLAR:** ${params.docContent}
- **ÖZEL TALÝMATLAR:** ${params.specifics}
- **ÖNCEKÝ SOHBET GEÇMÝÞÝ:** ${formatChatHistoryForPrompt(params.chatHistory)}

**ÝYÝLEÞTÝRÝLMÝÞ NÝHAÝ DÝLEKÇE METNÝ:**
[Buraya, yukarýdaki taslaðý tüm baðlamý dikkate alarak daha güçlü, ikna edici ve hukuken saðlam hale getirilmiþ tam dilekçe metnini yaz.]
`;

        const response = await ai.models.generateContent({
            model,
            contents: promptText,
            config: { systemInstruction },
        });

        res.json({ text: response.text.trim() });
    } catch (error) {
        console.error('Review Error:', error);
        res.status(500).json({ error: getSafeErrorMessage(error, 'Dilekce gozden gecirilemedi.') });
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
                        text: `Aþaðýdaki hukuk karar PDF içeriðini düz metin olarak çýkar.\nKurallar:\n- Link veya açýklama ekleme.\n- Kararýn görülen metnini mümkün olduðunca eksiksiz döndür.\n- Metni Türkçe karakterleri koruyarak yaz.\nBelge Kimliði: ${documentId || 'bilinmiyor'}`
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
            contents: `Türkiye'de "${keyword}" konusunda emsal Yargýtay ve Danýþtay kararlarý bul.

Her karar için þu alanlarý üret:
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
            contents: `Aþaðýdaki karar künyesine ait karar METNÝNÝ resmi kaynaklardan bul:
${query}

Kurallar:
- Cevapta URL/link verme.
- Giriþ/yorum ekleme.
- Sadece karar metnini düz yazý olarak döndür.
- Tam metin bulunamazsa, bulunabilen en detaylý metni döndür.`,
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
app.post('/api/legal/search-decisions', authMiddleware, validateRequest([
    body('source')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 0, max: 40 })
        .withMessage('source gecersiz.'),
    body('keyword')
        .isString()
        .trim()
        .isLength({ min: 2, max: 300 })
        .withMessage('Arama kelimesi (keyword) 2-300 karakter arasinda olmalidir.'),
    body('filters')
        .optional()
        .isObject()
        .withMessage('filters bir nesne olmalidir.'),
]), async (req, res) => {
    try {
        await getAuthenticatedUserFromRequest(req);
        const { source, keyword, filters = {} } = req.body;

        console.warn(`ðŸ“š Legal Search: "${keyword}" (source: ${source || 'all'})`);

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
            error: 'Ýçtihat arama sýrasýnda bir hata oluþtu.',
            details: process.env.NODE_ENV === 'production' ? undefined : error.message
        });
    }
});

// Get specific legal document endpoint
app.post('/api/legal/get-document', authMiddleware, validateRequest([
    body('source')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 0, max: 40 })
        .withMessage('source gecersiz.'),
    body('documentId')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 240 })
        .withMessage('documentId gecersiz.'),
    body('documentUrl')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 1000 })
        .withMessage('documentUrl gecersiz.'),
]), async (req, res) => {
    try {
        await getAuthenticatedUserFromRequest(req);
        const { source, documentId, documentUrl, title, esasNo, kararNo, tarih, daire, ozet, snippet } = req.body;

        if (!documentId && !documentUrl) {
            return res.status(400).json({ error: 'documentId veya documentUrl gereklidir.' });
        }

        console.warn(`ðŸ“„ Get Document: ${documentId || documentUrl}`);

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
            content = 'Karar metni getirilemedi. Lütfen farklý bir karar seçip tekrar deneyin.';
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
            error: 'Belge alýnýrken bir hata oluþtu.',
            details: process.env.NODE_ENV === 'production' ? undefined : error.message
        });
    }
});

// List available legal sources
app.get('/api/legal/sources', (req, res) => {
    res.json({
        sources: [
            { id: 'yargitay', name: 'Yargýtay', description: 'Yargýtay Kararlarý (Bedesten API)' },
            { id: 'danistay', name: 'Danýþtay', description: 'Danýþtay Kararlarý (Bedesten API)' },
            { id: 'uyap', name: 'Emsal (UYAP)', description: 'Emsal Kararlar (UYAP Sistemi)' },
            { id: 'anayasa', name: 'Anayasa Mahkemesi', description: 'AYM Norm Denetimi ve Bireysel Baþvuru' },
            { id: 'kik', name: 'Kamu Ýhale Kurulu', description: 'KÝK Kararlarý' },
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
        title: 'Boþanma Davasý Dilekçesi',
        description: 'Anlaþmalý veya çekiþmeli boþanma davalarý için temel dilekçe þablonu',
        icon: 'HeartCrack',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Adý', type: 'text', placeholder: 'Örn: Ýstanbul Anadolu 5. Aile Mahkemesi', required: true },
            { key: 'DAVACI_AD', label: 'Davacý Adý Soyadý', type: 'text', placeholder: 'Örn: Ayþe YILMAZ', required: true },
            { key: 'DAVACI_TC', label: 'Davacý TC Kimlik No', type: 'text', placeholder: 'Örn: 12345678901', required: true },
            { key: 'DAVACI_ADRES', label: 'Davacý Adresi', type: 'textarea', placeholder: 'Örn: Atatürk Mah. Cumhuriyet Cad. No:15/3 Kadýköy/Ýstanbul' },
            { key: 'DAVACI_VEKIL_AD', label: 'Davacý Vekili (Avukat)', type: 'text', placeholder: 'Örn: Av. Mehmet KAYA' },
            { key: 'DAVACI_VEKIL_BARO', label: 'Baro Sicil No', type: 'text', placeholder: 'Örn: Ýstanbul Barosu 54321' },
            { key: 'DAVALI_AD', label: 'Davalý Adý Soyadý', type: 'text', placeholder: 'Örn: Ali YILMAZ', required: true },
            { key: 'DAVALI_TC', label: 'Davalý TC Kimlik No', type: 'text', placeholder: 'Örn: 98765432109' },
            { key: 'DAVALI_ADRES', label: 'Davalý Adresi', type: 'textarea', placeholder: 'Örn: Bahçelievler Mah. Ýnönü Sok. No:7 Bakýrköy/Ýstanbul' },
            { key: 'EVLILIK_TARIHI', label: 'Evlilik Tarihi', type: 'date', required: true },
            { key: 'EVLILIK_YERI', label: 'Evlenme Yeri', type: 'text', placeholder: 'Örn: Kadýköy Evlendirme Dairesi' },
            { key: 'COCUK_BILGI', label: 'Müþterek Çocuk Bilgileri (varsa)', type: 'textarea', placeholder: 'Örn: 1. Zeynep YILMAZ (D: 01.01.2015, TC: 11122233344)' },
            { key: 'BOSANMA_SEBEPLERI', label: 'Boþanma Sebepleri', type: 'textarea', placeholder: 'Þiddetli geçimsizlik, evlilik birliðinin temelinden sarsýlmasý...', required: true },
            { key: 'NAFAKA_TALEP', label: 'Nafaka Talebi (TL/ay)', type: 'number', placeholder: 'Örn: 5000' },
            { key: 'VELAYET_TALEP', label: 'Velayet Talebi', type: 'text', placeholder: 'Örn: Müþterek çocuklarýn velayetinin davacý anneye verilmesi' },
        ],
        content: `{{MAHKEME}} BAÞKANLIÐINA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}

**VEKÝLÝ:** {{DAVACI_VEKIL_AD}}
{{DAVACI_VEKIL_BARO}}

**DAVALI:** {{DAVALI_AD}}
TC Kimlik No: {{DAVALI_TC}}
Adres: {{DAVALI_ADRES}}

**KONU:** Boþanma davasý hakkýndadýr.

---

**AÇIKLAMALAR:**

1. Müvekkilim ile davalý {{EVLILIK_TARIHI}} tarihinde {{EVLILIK_YERI}}'de evlenmiþlerdir.

2. Taraflarýn bu evlilikten doðan müþterek çocuklarý:
{{COCUK_BILGI}}

3. {{BOSANMA_SEBEPLERI}}

4. Evlilik birliðinin temelinden sarsýlmasý nedeniyle taraflar arasýndaki evliliðin devamý mümkün deðildir. Ortak hayatýn yeniden kurulmasý ihtimali bulunmamaktadýr.

---

**HUKUKÝ SEBEPLER:**

- 4721 sayýlý Türk Medeni Kanunu m.166 (Evlilik birliðinin sarsýlmasý)
- 4721 sayýlý Türk Medeni Kanunu m.169 (Boþanmada velayet)
- 4721 sayýlý Türk Medeni Kanunu m.175 (Yoksulluk nafakasý)
- 4721 sayýlý Türk Medeni Kanunu m.182 (Çocuk nafakasý)

---

**DELÝLLER:**

1. Nüfus kayýt örneði
2. Vukuatlý nüfus kayýt örneði
3. Evlilik cüzdaný sureti
4. Tanýk beyanlarý
5. Ekonomik durum araþtýrmasý
6. Her türlü yasal delil

---

**SONUÇ VE ÝSTEM:**

Yukarýda arz ve izah edilen sebeplerle;

1. Taraflarýn TMK m.166 uyarýnca BOÞANMALARINA,
2. Müþterek çocuklarýn velayetinin davacý tarafa verilmesine ({{VELAYET_TALEP}}),
3. Davalýnýn aylýk {{NAFAKA_TALEP}} TL iþtirak nafakasý ödemesine,
4. Yargýlama giderlerinin davalýya yükletilmesine,

karar verilmesini vekaleten saygýlarýmla arz ve talep ederim. {{TARIH}}

Davacý Vekili
{{DAVACI_VEKIL_AD}}
`,
        isPremium: false,
        usageCount: 156
    },
    {
        id: '2',
        category: 'Hukuk',
        subcategory: 'Borçlar Hukuku',
        title: 'Tazminat Davasý Dilekçesi',
        description: 'Maddi ve manevi tazminat talepli dava dilekçesi',
        icon: 'Banknote',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Adý', type: 'text', placeholder: 'Asliye Hukuk Mahkemesi' },
            { key: 'DAVACI_AD', label: 'Davacý Adý Soyadý', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'Davacý TC No', type: 'text', required: true },
            { key: 'DAVALI_AD', label: 'Davalý/Kurum Adý', type: 'text', required: true },
            { key: 'OLAY_TARIHI', label: 'Olay Tarihi', type: 'date', required: true },
            { key: 'OLAY_ACIKLAMASI', label: 'Olayýn Açýklamasý', type: 'textarea', required: true },
            { key: 'MADDI_TAZMINAT', label: 'Maddi Tazminat Tutarý (TL)', type: 'number' },
            { key: 'MANEVI_TAZMINAT', label: 'Manevi Tazminat Tutarý (TL)', type: 'number' },
        ],
        content: `{{MAHKEME}} BAÞKANLIÐINA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}

**DAVALI:** {{DAVALI_AD}}

**KONU:** Maddi ve manevi tazminat talepli dava dilekçesidir.

**DAVA DEÐERÝ:** {{MADDI_TAZMINAT}} TL (Maddi) + {{MANEVI_TAZMINAT}} TL (Manevi)

---

**AÇIKLAMALAR:**

1. {{OLAY_TARIHI}} tarihinde aþaðýda açýklanan olay meydana gelmiþtir.

2. {{OLAY_ACIKLAMASI}}

3. Bu olay nedeniyle müvekkilim maddi ve manevi zarara uðramýþtýr. Zararýn tazmini için iþbu dava açýlmýþtýr.

---

**HUKUKÝ SEBEPLER:**

- 6098 sayýlý Türk Borçlar Kanunu m.49-76 (Haksýz fiil)
- 6098 sayýlý Türk Borçlar Kanunu m.56 (Manevi tazminat)

---

**DELÝLLER:**

1. Olay tutanaklarý
2. Fatura ve belgeler
3. Tanýk beyanlarý
4. Bilirkiþi incelemesi
5. Her türlü yasal delil

---

**SONUÇ VE ÝSTEM:**

1. {{MADDI_TAZMINAT}} TL MADDÝ TAZMÝNATIN olay tarihinden itibaren iþleyecek yasal faiziyle birlikte davalýdan tahsiline,
2. {{MANEVI_TAZMINAT}} TL MANEVÝ TAZMÝNATIN davalýdan tahsiline,
3. Yargýlama giderlerinin davalýya yükletilmesine,

karar verilmesini saygýlarýmla arz ve talep ederim. {{TARIH}}

Davacý
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 203
    },
    {
        id: '3',
        category: 'Ýcra',
        subcategory: 'Ýcra Takibi',
        title: 'Ýcra Takibine Ýtiraz Dilekçesi',
        description: 'Haksýz icra takibine karþý itiraz dilekçesi',
        icon: 'Gavel',
        variables: [
            { key: 'ICRA_MUDURLUGU', label: 'Ýcra Müdürlüðü', type: 'text', required: true },
            { key: 'DOSYA_NO', label: 'Ýcra Dosya No', type: 'text', required: true },
            { key: 'BORCLU_AD', label: 'Borçlu Adý Soyadý', type: 'text', required: true },
            { key: 'ALACAKLI_AD', label: 'Alacaklý Adý', type: 'text', required: true },
            { key: 'ITIRAZ_SEBEPLERI', label: 'Ýtiraz Sebepleri', type: 'textarea', required: true },
        ],
        content: `## {{ICRA_MUDURLUGU}}'NE

**DOSYA NO:** {{DOSYA_NO}}

**BORÇLU (ÝTÝRAZ EDEN):** {{BORCLU_AD}}

**ALACAKLI:** {{ALACAKLI_AD}}

**KONU:** Ödeme emrine itirazýmýz hakkýndadýr.

---

## AÇIKLAMALAR

1. Müdürlüðünüzce yürütülen {{DOSYA_NO}} sayýlý icra takip dosyasýnda tarafýma ödeme emri teblið edilmiþtir.

2. {{ITIRAZ_SEBEPLERI}}

3. Yukarýda açýklanan nedenlerle söz konusu borca itiraz etme zorunluluðu doðmuþtur.

---

## HUKUKÝ SEBEPLER

- 2004 sayýlý Ýcra ve Ýflas Kanunu m.62 (Ýtiraz)
- 2004 sayýlý Ýcra ve Ýflas Kanunu m.66 (Ýtirazýn hükümleri)

---

## SONUÇ VE ÝSTEM

Yukarýda açýklanan sebeplerle;

1. BORCA ÝTÝRAZ EDÝYORUM,
2. Takibin durdurulmasýna,

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
        title: 'Kira Tahliye Davasý Dilekçesi',
        description: 'Kiracýnýn tahliyesi için dava dilekçesi',
        icon: 'Home',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Adý', type: 'text', placeholder: 'Sulh Hukuk Mahkemesi' },
            { key: 'KIRAYA_VEREN', label: 'Kiraya Veren Adý', type: 'text', required: true },
            { key: 'KIRACI', label: 'Kiracý Adý', type: 'text', required: true },
            { key: 'TASINMAZ_ADRES', label: 'Taþýnmaz Adresi', type: 'textarea', required: true },
            { key: 'KIRA_BEDELI', label: 'Aylýk Kira Bedeli', type: 'number' },
            { key: 'TAHLIYE_SEBEBI', label: 'Tahliye Sebebi', type: 'textarea', required: true },
        ],
        content: `## {{MAHKEME}} BAÞKANLIÐINA

**DAVACI (KÝRAYA VEREN):** {{KIRAYA_VEREN}}

**DAVALI (KÝRACI):** {{KIRACI}}

**KONU:** Kiralananýn tahliyesi talebimiz hakkýndadýr.

---

## AÇIKLAMALAR

1. Davalý, aþaðýda adresi belirtilen taþýnmazda kiracý olarak ikamet etmektedir:
   **Adres:** {{TASINMAZ_ADRES}}

2. Aylýk kira bedeli {{KIRA_BEDELI}} TL olarak belirlenmiþtir.

3. {{TAHLIYE_SEBEBI}}

4. Bu nedenlerle taþýnmazýn tahliyesi gerekmektedir.

---

## HUKUKÝ SEBEPLER

- 6098 sayýlý Türk Borçlar Kanunu m.347-356 (Kira sözleþmesi)
- 6098 sayýlý Türk Borçlar Kanunu m.352 (Kiracýnýn temerrüdü)

---

## DELÝLLER

1. Kira sözleþmesi
2. Ýhtar belgeleri
3. Ödeme kayýtlarý
4. Tanýk beyanlarý

---

## SONUÇ VE ÝSTEM

1. Kiralananýn TAHLÝYESÝNE,
2. Birikmiþ kira bedellerinin tahsiline,
3. Yargýlama giderlerinin davalýya yükletilmesine,

karar verilmesini saygýlarýmla arz ve talep ederim.

{{TARIH}}
{{KIRAYA_VEREN}}
`,
        isPremium: false,
        usageCount: 178
    },
    {
        id: '5',
        category: 'Ýdari',
        subcategory: 'Ýptal Davasý',
        title: 'Ýdari Ýþlemin Ýptali Davasý',
        description: 'Hukuka aykýrý idari iþlemlerin iptali için dava dilekçesi',
        icon: 'Building2',
        variables: [
            { key: 'IDARE_MAHKEMESI', label: 'Ýdare Mahkemesi', type: 'text', placeholder: 'Ýstanbul Ýdare Mahkemesi' },
            { key: 'DAVACI_AD', label: 'Davacý Adý', type: 'text', required: true },
            { key: 'DAVALI_IDARE', label: 'Davalý Ýdare', type: 'text', required: true },
            { key: 'ISLEM_TARIHI', label: 'Ýþlem Tarihi', type: 'date', required: true },
            { key: 'ISLEM_KONUSU', label: 'Ýptali Ýstenen Ýþlem', type: 'textarea', required: true },
            { key: 'HUKUKA_AYKIRILIK', label: 'Hukuka Aykýrýlýk Nedenleri', type: 'textarea', required: true },
        ],
        content: `## {{IDARE_MAHKEMESI}} BAÞKANLIÐINA

**DAVACI:** {{DAVACI_AD}}

**DAVALI:** {{DAVALI_IDARE}}

**KONU:** Ýdari iþlemin iptali talebimiz hakkýndadýr.

**ÝPTALÝ ÝSTENEN ÝÞLEM:** {{ISLEM_KONUSU}}
**ÝÞLEM TARÝHÝ:** {{ISLEM_TARIHI}}

---

## AÇIKLAMALAR

1. Davalý idare tarafýndan {{ISLEM_TARIHI}} tarihinde tesis edilen iþlem hukuka aykýrýdýr.

2. {{HUKUKA_AYKIRILIK}}

3. Söz konusu iþlem telafisi güç zararlara neden olmaktadýr.

---

## HUKUKÝ SEBEPLER

- 2577 sayýlý Ýdari Yargýlama Usulü Kanunu
- Anayasa m.125 (Yargý yolu)
- Ýlgili mevzuat hükümleri

---

## SONUÇ VE ÝSTEM

1. Dava konusu idari iþlemin ÝPTALÝNE,
2. Yürütmenin durdurulmasýna,
3. Yargýlama giderlerinin davalýya yükletilmesine,

karar verilmesini saygýlarýmla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: true,
        usageCount: 89
    },
    {
        id: '6',
        category: 'Ceza',
        subcategory: 'Þikayet',
        title: 'Suç Duyurusu Dilekçesi',
        description: 'Cumhuriyet Savcýlýðýna suç duyurusu dilekçesi',
        icon: 'Siren',
        variables: [
            { key: 'SAVCILIK', label: 'Cumhuriyet Baþsavcýlýðý', type: 'text', required: true },
            { key: 'SIKAYET_EDEN', label: 'Þikayet Eden (Müþteki)', type: 'text', required: true },
            { key: 'SUPHELI', label: 'Þüpheli', type: 'text', required: true },
            { key: 'SUC_TARIHI', label: 'Suç Tarihi', type: 'date', required: true },
            { key: 'SUC_KONUSU', label: 'Suç Konusu Olay', type: 'textarea', required: true },
            { key: 'ISTENEN_CEZA', label: 'Talep Edilen Ýþlem', type: 'textarea' },
        ],
        content: `## {{SAVCILIK}}'NA

**ÞÝKAYET EDEN (MÜÞTEKÝ):** {{SIKAYET_EDEN}}

**ÞÜPHELÝ:** {{SUPHELI}}

**SUÇ TARÝHÝ:** {{SUC_TARIHI}}

**KONU:** Suç duyurusu hakkýndadýr.

---

## AÇIKLAMALAR

1. {{SUC_TARIHI}} tarihinde aþaðýda açýklanan olay meydana gelmiþtir:

2. {{SUC_KONUSU}}

3. Bu eylemler Türk Ceza Kanunu kapsamýnda suç teþkil etmektedir.

---

## SUÇ VE CEZA

- Ýlgili Türk Ceza Kanunu maddeleri
- Cezai yaptýrým talep edilmektedir

---

## DELÝLLER

1. Olay tutanaklarý
2. Görüntü/Ses kayýtlarý
3. Tanýk beyanlarý
4. Diðer deliller

---

## SONUÇ VE ÝSTEM

1. {{ISTENEN_CEZA}}

Þüphelinin yakalanarak cezalandýrýlmasý için gerekli soruþturmanýn yapýlmasýný saygýlarýmla arz ve talep ederim.

{{TARIH}}
{{SIKAYET_EDEN}}
`,
        isPremium: false,
        usageCount: 245
    }
    ,
    {
        "id": "7",
        "category": "Ýcra",
        "subcategory": "Ýcra Takibi",
        "title": "Ýlamsýz Ýcra Takip Talebi",
        "description": "Genel haciz yoluyla ilamsýz icra takibi baþlatma talebi",
        "icon": "Gavel",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "Ýcra Dairesi",
                "type": "text",
                "required": true,
                "placeholder": "Ýstanbul 1. Ýcra Dairesi"
            },
            {
                "key": "ALACAKLI_AD",
                "label": "Alacaklý Adý Soyadý",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_TC",
                "label": "Alacaklý TC No",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_ADRES",
                "label": "Alacaklý Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Borçlu Adý Soyadý",
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
                "label": "Alacak Tutarý (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALACAK_NEDENI",
                "label": "Alacaðýn Nedeni",
                "type": "textarea",
                "required": true
            },
            {
                "key": "VADE_TARIHI",
                "label": "Vade Tarihi",
                "type": "date"
            }
        ],
        "content": "## {{ICRA_DAIRESI}}'NE\n\n## TAKÝP TALEBÝ\n\n**ALACAKLI:** {{ALACAKLI_AD}}\nTC Kimlik No: {{ALACAKLI_TC}}\nAdres: {{ALACAKLI_ADRES}}\n\n**BORÇLU:** {{BORCLU_AD}}\nTC Kimlik No: {{BORCLU_TC}}\nAdres: {{BORCLU_ADRES}}\n\n---\n\n**TAKÝP KONUSU ALACAK:**\n\n| Açýklama | Tutar |\n|----------|-------|\n| Asýl Alacak | {{ALACAK_TUTARI}} TL |\n| Faiz (Vade Tarihinden Ýtibaren) | Hesaplanacak |\n| **TOPLAM** | {{ALACAK_TUTARI}} TL + Faiz |\n\n**ALACAÐIN NEDENÝ:** {{ALACAK_NEDENI}}\n\n**VADE TARÝHÝ:** {{VADE_TARIHI}}\n\n---\n\n## TALEP\n\nYukarýda belirtilen alacaðýmýn tahsili için borçlu aleyhine **genel haciz yoluyla ilamsýz icra takibi** baþlatýlmasýný talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 523
    },
    {
        "id": "8",
        "category": "Ýcra",
        "subcategory": "Ýcra Takibi",
        "title": "Kambiyo Senedi Ýcra Takibi",
        "description": "Çek, senet veya poliçe ile icra takibi baþlatma",
        "icon": "Receipt",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "Ýcra Dairesi",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_AD",
                "label": "Alacaklý Adý",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_ADRES",
                "label": "Alacaklý Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Borçlu Adý",
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
                "label": "Senet Tutarý (TL)",
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
        "content": "## {{ICRA_DAIRESI}}'NE\n\n## KAMBÝYO SENETLERÝNE MAHSUS HACÝZ YOLUYLA TAKÝP TALEBÝ\n\n**ALACAKLI:** {{ALACAKLI_AD}}\nAdres: {{ALACAKLI_ADRES}}\n\n**BORÇLU:** {{BORCLU_AD}}\nAdres: {{BORCLU_ADRES}}\n\n---\n\n**TAKÝBE KONU KAMBÝYO SENEDÝ:**\n\n| Bilgi | Deðer |\n|-------|-------|\n| Senet Türü | {{SENET_TURU}} |\n| Düzenleme Tarihi | {{SENET_TARIHI}} |\n| Vade Tarihi | {{VADE_TARIHI}} |\n| Senet Tutarý | {{SENET_TUTARI}} TL |\n\n---\n\n## TALEP\n\nEkte sunulan kambiyo senedine dayalý olarak, ÝÝK m.167 ve devamý maddeleri uyarýnca borçlu aleyhine **kambiyo senetlerine mahsus haciz yoluyla takip** baþlatýlmasýný talep ederim.\n\n**EKLER:**\n1. Kambiyo senedi aslý\n2. Protesto belgesi (varsa)\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 412
    },
    {
        "id": "9",
        "category": "Ýcra",
        "subcategory": "Ýcra Ýtiraz",
        "title": "Borca Ýtiraz Dilekçesi",
        "description": "Ýcra takibine karþý borca itiraz",
        "icon": "ShieldX",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "Ýcra Dairesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "Ýcra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Borçlu (Ýtiraz Eden)",
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
                "label": "Alacaklý",
                "type": "text",
                "required": true
            },
            {
                "key": "ITIRAZ_NEDENI",
                "label": "Ýtiraz Nedeni",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_DAIRESI}}'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ÝTÝRAZ EDEN (BORÇLU):** {{BORCLU_AD}}\nTC Kimlik No: {{BORCLU_TC}}\nAdres: {{BORCLU_ADRES}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**KONU:** Ödeme emrine itirazýmdýr.\n\n---\n\n## AÇIKLAMALAR\n\n1. Müdürlüðünüzün yukarýda numarasý yazýlý dosyasýndan tarafýma ödeme emri teblið edilmiþtir.\n\n2. **ÝTÝRAZ NEDENÝM:**\n{{ITIRAZ_NEDENI}}\n\n3. Bu nedenlerle söz konusu takibe süresinde itiraz ediyorum.\n\n---\n\n## HUKUKÝ DAYANAK\n\n- 2004 sayýlý Ýcra ve Ýflas Kanunu m.62 (Ýtiraz)\n- 2004 sayýlý Ýcra ve Ýflas Kanunu m.66 (Ýtirazýn hükümleri)\n\n---\n\n## SONUÇ VE ÝSTEM\n\n**BORCA ÝTÝRAZ EDÝYORUM.**\n\nTakibin durdurulmasýný saygýlarýmla arz ve talep ederim.\n\n{{TARIH}}\n{{BORCLU_AD}}\n",
        "isPremium": false,
        "usageCount": 678
    },
    {
        "id": "10",
        "category": "Ýcra",
        "subcategory": "Ýcra Ýtiraz",
        "title": "Ýmzaya Ýtiraz Dilekçesi",
        "description": "Kambiyo senedindeki imzaya itiraz",
        "icon": "PenOff",
        "variables": [
            {
                "key": "ICRA_MAHKEMESI",
                "label": "Ýcra Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "Ýcra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacý (Borçlu)",
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
                "label": "Davalý (Alacaklý)",
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
        "content": "## {{ICRA_MAHKEMESI}} BAÞKANLIÐINA\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**DAVACI (BORÇLU):** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI (ALACAKLI):** {{DAVALI_AD}}\n\n**KONU:** Kambiyo senedindeki imzaya itiraz hakkýndadýr.\n\n---\n\n## AÇIKLAMALAR\n\n1. Davalý tarafýndan aleyhime baþlatýlan icra takibinde dayanak gösterilen senedin bilgileri aþaðýdaki gibidir:\n{{SENET_BILGI}}\n\n2. **Söz konusu senetteki imza tarafýma ait deðildir.**\n\n3. Senedin altýndaki imza ile benim gerçek imzam arasýnda açýk fark bulunmakta olup, bu husus bilirkiþi incelemesiyle de ortaya konulacaktýr.\n\n---\n\n## HUKUKÝ SEBEPLER\n\n- 2004 sayýlý Ýcra ve Ýflas Kanunu m.170 (Ýmzaya itiraz)\n- 6100 sayýlý HMK m.211 (Ýmza incelemesi)\n\n---\n\n## DELÝLLER\n\n1. Ýcra dosyasý\n2. Senet aslý\n3. Ýmza örnekleri\n4. Bilirkiþi incelemesi\n5. Nüfus kayýt örneði\n\n---\n\n## SONUÇ VE ÝSTEM\n\n1. **Senetteki imzanýn tarafýma ait olmadýðýnýn tespitine,**\n2. Ýcra takibinin iptaline,\n3. %20 oranýnda kötüniyet tazminatýna hükmedilmesine,\n4. Yargýlama giderlerinin davalýya yükletilmesine,\n\nkarar verilmesini saygýlarýmla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 234
    },
    {
        "id": "11",
        "category": "Ýcra",
        "subcategory": "Haciz",
        "title": "Haciz Kaldýrma Talebi",
        "description": "Haczedilen mal üzerindeki haczin kaldýrýlmasý talebi",
        "icon": "Unlock",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "Ýcra Dairesi",
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
                "label": "Haczedilen Mal/Eþya",
                "type": "textarea",
                "required": true
            },
            {
                "key": "KALDIRMA_NEDENI",
                "label": "Haczin Kaldýrýlma Nedeni",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜÐÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**TALEP EDEN:** {{TALEP_EDEN}}\n\n**KONU:** Haciz kaldýrma talebimdir.\n\n---\n\n## AÇIKLAMALAR\n\n1. Müdürlüðünüzün yukarýda numarasý yazýlý dosyasýnda aþaðýda belirtilen mal/eþya üzerine haciz konulmuþtur:\n\n**HACZEDÝLEN MAL/EÞYA:**\n{{HACIZLI_MAL}}\n\n2. **HACZÝN KALDIRILMASI GEREKÇESÝ:**\n{{KALDIRMA_NEDENI}}\n\n---\n\n## HUKUKÝ DAYANAK\n\n- 2004 sayýlý Ýcra ve Ýflas Kanunu m.82 (Haczedilemezlik)\n- 2004 sayýlý Ýcra ve Ýflas Kanunu m.85 (Taþýnýr haczi)\n\n---\n\n## SONUÇ VE ÝSTEM\n\nYukarýda açýklanan nedenlerle, söz konusu mal/eþya üzerindeki haczin kaldýrýlmasýný saygýlarýmla talep ederim.\n\n{{TARIH}}\n{{TALEP_EDEN}}\n",
        "isPremium": false,
        "usageCount": 189
    },
    {
        "id": "12",
        "category": "Ýcra",
        "subcategory": "Haciz",
        "title": "Ýstihkak Davasý Dilekçesi",
        "description": "Haczedilen malýn üçüncü kiþiye ait olduðunun tespiti",
        "icon": "FileWarning",
        "variables": [
            {
                "key": "ICRA_MAHKEMESI",
                "label": "Ýcra Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "Ýcra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacý (3. Kiþi)",
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
                "label": "Davalý (Alacaklý)",
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
        "content": "## {{ICRA_MAHKEMESI}} BAÞKANLIÐINA\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**DAVACI (3. KÝÞÝ):** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI (ALACAKLI):** {{DAVALI_AD}}\n\n**KONU:** Ýstihkak davasý hakkýndadýr.\n\n---\n\n## AÇIKLAMALAR\n\n1. Davalý tarafýndan yürütülen icra takibinde, borçlunun evinde/iþyerinde yapýlan haciz iþlemi sýrasýnda **bana ait olan** aþaðýdaki mal haczedilmiþtir:\n\n**HACZEDÝLEN MAL:**\n{{HACIZLI_MAL}}\n\n2. **Bu mal bana aittir ve borçlu ile hiçbir ilgisi yoktur.**\n\n3. Mülkiyetimi ispatlayan deliller:\n{{MULKIYET_DELILI}}\n\n---\n\n## HUKUKÝ SEBEPLER\n\n- 2004 sayýlý Ýcra ve Ýflas Kanunu m.96-99 (Ýstihkak davasý)\n\n---\n\n## DELÝLLER\n\n1. Fatura ve satýþ belgeleri\n2. Banka kayýtlarý\n3. Tanýk beyanlarý\n4. Bilirkiþi incelemesi\n5. Diðer yasal deliller\n\n---\n\n## SONUÇ VE ÝSTEM\n\n1. **Haczedilen malýn tarafýma ait olduðunun tespitine,**\n2. Söz konusu mal üzerindeki haczin kaldýrýlmasýna,\n3. Yargýlama giderlerinin davalýya yükletilmesine,\n\nkarar verilmesini saygýlarýmla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 156
    },
    {
        "id": "13",
        "category": "Ýþ Hukuku",
        "subcategory": "Ýþe Ýade",
        "title": "Ýþe Ýade Davasý Dilekçesi",
        "description": "Haksýz fesih nedeniyle iþe iade talebi",
        "icon": "UserCheck",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "Ýþ Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacý (Ýþçi)",
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
                "label": "Davalý (Ýþveren)",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "Ýþveren Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ISE_GIRIS_TARIHI",
                "label": "Ýþe Giriþ Tarihi",
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
                "label": "Ýþverenin Fesih Gerekçesi",
                "type": "textarea"
            }
        ],
        "content": "## {{MAHKEME}} BAÞKANLIÐINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Feshin geçersizliði ve iþe iade talebimizdir.\n\n---\n\n## AÇIKLAMALAR\n\n1. Müvekkilim {{ISE_GIRIS_TARIHI}} tarihinden {{FESIH_TARIHI}} tarihine kadar davalý iþyerinde **{{GOREV}}** olarak çalýþmýþtýr.\n\n2. Ýþ sözleþmesi {{FESIH_TARIHI}} tarihinde iþveren tarafýndan **haksýz ve geçersiz þekilde** feshedilmiþtir.\n\n3. Ýþverenin ileri sürdüðü fesih gerekçesi:\n{{FESIH_GEREKCESI}}\n\n4. Bu gerekçe gerçeði yansýtmamakta olup, fesih haksýz ve geçersizdir.\n\n---\n\n## HUKUKÝ SEBEPLER\n\n- 4857 sayýlý Ýþ Kanunu m.18 (Feshin geçerli sebebe dayandýrýlmasý)\n- 4857 sayýlý Ýþ Kanunu m.20 (Fesih bildirimine itiraz)\n- 4857 sayýlý Ýþ Kanunu m.21 (Geçersiz sebeple feshin sonuçlarý)\n\n---\n\n## DELÝLLER\n\n1. Ýþ sözleþmesi\n2. Bordro ve SGK kayýtlarý\n3. Fesih bildirimi\n4. Tanýk beyanlarý\n5. Ýþyeri dosyasý\n\n---\n\n## SONUÇ VE ÝSTEM\n\n1. **Feshin geçersizliðine ve iþe iadeye,**\n2. Ýþe baþlatmama halinde 4-8 aylýk brüt ücret tutarýnda tazminata,\n3. Boþta geçen süre ücretinin (4 aya kadar) ödenmesine,\n4. Yargýlama giderlerinin davalýya yükletilmesine,\n\nkarar verilmesini saygýlarýmla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 445
    },
    {
        "id": "14",
        "category": "Ýþ Hukuku",
        "subcategory": "Tazminat",
        "title": "Kýdem ve Ýhbar Tazminatý Davasý",
        "description": "Ýþ akdi feshi sonrasý tazminat talebi",
        "icon": "Banknote",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "Ýþ Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacý (Ýþçi)",
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
                "label": "Davalý (Ýþveren)",
                "type": "text",
                "required": true
            },
            {
                "key": "ISE_GIRIS",
                "label": "Ýþe Giriþ Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "CIKIS_TARIHI",
                "label": "Ýþten Çýkýþ Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "SON_UCRET",
                "label": "Giydirilmiþ Brüt Ücret (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "KIDEM_TAZMINATI",
                "label": "Kýdem Tazminatý Talebi (TL)",
                "type": "number"
            },
            {
                "key": "IHBAR_TAZMINATI",
                "label": "Ýhbar Tazminatý Talebi (TL)",
                "type": "number"
            }
        ],
        "content": "## {{MAHKEME}} BAÞKANLIÐINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI:** {{DAVALI_AD}}\n\n**KONU:** Kýdem ve ihbar tazminatý talebimizdir.\n\n**DAVA DEÐERÝ:** {{KIDEM_TAZMINATI}} TL + {{IHBAR_TAZMINATI}} TL\n\n---\n\n## AÇIKLAMALAR\n\n1. Müvekkilim {{ISE_GIRIS}} - {{CIKIS_TARIHI}} tarihleri arasýnda davalý iþyerinde çalýþmýþtýr.\n\n2. **Son aylýk giydirilmiþ brüt ücreti:** {{SON_UCRET}} TL\n\n3. Ýþ akdi iþveren tarafýndan haksýz olarak feshedilmiþ, ancak tazminatlarý ödenmemiþtir.\n\n---\n\n## TALEP EDÝLEN ALACAKLAR\n\n| Alacak Kalemi | Tutar |\n|---------------|-------|\n| Kýdem Tazminatý | {{KIDEM_TAZMINATI}} TL |\n| Ýhbar Tazminatý | {{IHBAR_TAZMINATI}} TL |\n| **TOPLAM** | Hesaplanacak |\n\n---\n\n## HUKUKÝ SEBEPLER\n\n- 1475 sayýlý Ýþ Kanunu m.14 (Kýdem tazminatý)\n- 4857 sayýlý Ýþ Kanunu m.17 (Süreli fesih / Ýhbar)\n\n---\n\n## SONUÇ VE ÝSTEM\n\n1. **{{KIDEM_TAZMINATI}} TL kýdem tazminatýnýn** fesih tarihinden itibaren en yüksek mevduat faiziyle birlikte,\n2. **{{IHBAR_TAZMINATI}} TL ihbar tazminatýnýn** yasal faiziyle birlikte davalýdan tahsiline,\n3. Yargýlama giderlerinin davalýya yükletilmesine,\n\nkarar verilmesini saygýlarýmla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 567
    },
    {
        "id": "15",
        "category": "Hukuk",
        "subcategory": "Tüketici Hukuku",
        "title": "Tüketici Hakem Heyeti Baþvurusu",
        "description": "Ayýplý mal/hizmet için tüketici hakem heyetine baþvuru",
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
                "label": "Baþvuran Adý",
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
                "label": "Satýcý/Firma Adý",
                "type": "text",
                "required": true
            },
            {
                "key": "SATICI_ADRES",
                "label": "Satýcý Adresi",
                "type": "textarea"
            },
            {
                "key": "URUN_ADI",
                "label": "Ürün/Hizmet Adý",
                "type": "text",
                "required": true
            },
            {
                "key": "SATIN_ALMA_TARIHI",
                "label": "Satýn Alma Tarihi",
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
                "label": "Þikayet Konusu",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{HAKEM_HEYETI}}'NE\n\n## TÜKETÝCÝ ÞÝKAYET BAÞVURUSU\n\n**BAÞVURAN (TÜKETÝCÝ):**\nAd Soyad: {{BASVURAN_AD}}\nTC Kimlik No: {{BASVURAN_TC}}\nAdres: {{BASVURAN_ADRES}}\nTelefon: {{BASVURAN_TEL}}\n\n**ÞÝKAYET EDÝLEN (SATICI):**\nFirma Adý: {{SATICI_AD}}\nAdres: {{SATICI_ADRES}}\n\n---\n\n**ÞÝKAYETE KONU ÜRÜN/HÝZMET:**\n\n| Bilgi | Deðer |\n|-------|-------|\n| Ürün/Hizmet | {{URUN_ADI}} |\n| Satýn Alma Tarihi | {{SATIN_ALMA_TARIHI}} |\n| Bedel | {{URUN_BEDELI}} TL |\n\n---\n\n## ÞÝKAYET KONUSU\n\n{{SIKAYET_KONUSU}}\n\n---\n\n## TALEP\n\n6502 sayýlý Tüketicinin Korunmasý Hakkýnda Kanun uyarýnca;\n\n1. Ayýplý ürünün/hizmetin bedelinin iadesi,\n2. Alternatif olarak ürünün deðiþtirilmesi veya ücretsiz onarýmý,\n\nhususlarýnda karar verilmesini saygýlarýmla arz ve talep ederim.\n\n**EKLER:**\n1. Fatura/fiþ sureti\n2. Ürün fotoðraflarý\n3. Yazýþma örnekleri\n\n{{TARIH}}\n{{BASVURAN_AD}}\n",
        "isPremium": false,
        "usageCount": 892
    },
    {
        "id": "16",
        "category": "Hukuk",
        "subcategory": "Tüketici Hukuku",
        "title": "Tüketici Mahkemesi Dava Dilekçesi",
        "description": "Tüketici uyuþmazlýklarý için dava dilekçesi",
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
                "label": "Davacý Adý",
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
                "label": "Davacý Adresi",
                "type": "textarea"
            },
            {
                "key": "DAVALI_AD",
                "label": "Davalý Firma",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "Davalý Adresi",
                "type": "textarea"
            },
            {
                "key": "DAVA_DEGERI",
                "label": "Dava Deðeri (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "OLAY_ACIKLAMASI",
                "label": "Olayýn Açýklamasý",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{MAHKEME}} BAÞKANLIÐINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Tüketici iþleminden kaynaklanan tazminat talebimizdir.\n\n**DAVA DEÐERÝ:** {{DAVA_DEGERI}} TL\n\n---\n\n## AÇIKLAMALAR\n\n{{OLAY_ACIKLAMASI}}\n\n---\n\n## HUKUKÝ SEBEPLER\n\n- 6502 sayýlý Tüketicinin Korunmasý Hakkýnda Kanun\n- 6098 sayýlý Türk Borçlar Kanunu\n\n---\n\n## DELÝLLER\n\n1. Fatura ve satýþ belgeleri\n2. Sözleþme örnekleri\n3. Yazýþmalar\n4. Tanýk beyanlarý\n5. Bilirkiþi incelemesi\n\n---\n\n## SONUÇ VE ÝSTEM\n\n1. {{DAVA_DEGERI}} TL'nin yasal faiziyle birlikte davalýdan tahsiline,\n2. Yargýlama giderlerinin davalýya yükletilmesine,\n\nkarar verilmesini saygýlarýmla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 334
    },
    {
        "id": "17",
        "category": "Hukuk",
        "subcategory": "Ticaret Hukuku",
        "title": "Alacak Davasý Dilekçesi (Ticari)",
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
                "label": "Davacý Þirket/Kiþi",
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
                "label": "Davalý Þirket/Kiþi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "Davalý Adresi",
                "type": "textarea"
            },
            {
                "key": "ALACAK_TUTARI",
                "label": "Alacak Tutarý (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALACAK_KAYNAK",
                "label": "Alacaðýn Kaynaðý",
                "type": "textarea",
                "required": true
            },
            {
                "key": "VADE_TARIHI",
                "label": "Vade Tarihi",
                "type": "date"
            }
        ],
        "content": "## {{MAHKEME}} BAÞKANLIÐINA\n\n**DAVACI:** {{DAVACI_AD}}\nVergi/TC No: {{DAVACI_VKN}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Alacak davasý hakkýndadýr.\n\n**DAVA DEÐERÝ:** {{ALACAK_TUTARI}} TL\n\n---\n\n## AÇIKLAMALAR\n\n1. Müvekkilim ile davalý arasýnda ticari iliþki bulunmaktadýr.\n\n2. **Alacaðýn Kaynaðý:**\n{{ALACAK_KAYNAK}}\n\n3. Vade tarihi: {{VADE_TARIHI}}\n\n4. Tüm ihtarlara raðmen davalý borcunu ödememiþtir.\n\n---\n\n## HUKUKÝ SEBEPLER\n\n- 6102 sayýlý Türk Ticaret Kanunu\n- 6098 sayýlý Türk Borçlar Kanunu\n\n---\n\n## DELÝLLER\n\n1. Faturalar\n2. Sözleþmeler\n3. Ýrsaliyeler\n4. Banka kayýtlarý\n5. Ýhtarname\n6. Ticari defterler\n\n---\n\n## SONUÇ VE ÝSTEM\n\n1. {{ALACAK_TUTARI}} TL alacaðýn vade tarihinden itibaren avans faiziyle birlikte davalýdan tahsiline,\n2. Yargýlama giderlerinin davalýya yükletilmesine,\n\nkarar verilmesini saygýlarýmla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 445
    },
    {
        "id": "18",
        "category": "Hukuk",
        "subcategory": "Ticaret Hukuku",
        "title": "Ýhtarname (Ödeme)",
        "description": "Ticari borç için ödeme ihtarnamesi",
        "icon": "Mail",
        "variables": [
            {
                "key": "NOTER",
                "label": "Noter",
                "type": "text",
                "placeholder": "Ýstanbul 5. Noterliði"
            },
            {
                "key": "GONDEREN_AD",
                "label": "Gönderen (Alacaklý)",
                "type": "text",
                "required": true
            },
            {
                "key": "GONDEREN_ADRES",
                "label": "Alacaklý Adresi",
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
                "label": "Borç Tutarý (TL)",
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
        "content": "## ÝHTARNAME\n\n**Keþideci (Ýhtar Eden):** {{GONDEREN_AD}}\nAdres: {{GONDEREN_ADRES}}\n\n**Muhatap (Ýhtar Edilen):** {{MUHATAP_AD}}\nAdres: {{MUHATAP_ADRES}}\n\n---\n\n## ÝHTARIN KONUSU\n\nAþaðýda belirtilen borcunuzun ödenmesi hakkýndadýr.\n\n---\n\n**Sayýn {{MUHATAP_AD}},**\n\n**1.** Tarafýnýza aþaðýda detaylarý verilen alacaðýmýz bulunmaktadýr:\n\n**Borç Konusu:** {{BORC_KONUSU}}\n\n**Borç Tutarý:** {{BORC_TUTARI}} TL\n\n**2.** Söz konusu borcunuzu defalarca hatýrlatmamýza raðmen hâlâ ödemediniz.\n\n**3.** Ýþbu ihtarnamenin tarafýnýza tebliðinden itibaren **{{ODEME_SURESI}} gün** içinde yukarýda belirtilen borcunuzu ödemenizi,\n\n**4.** Aksi takdirde aleyhinize yasal yollara (icra takibi ve/veya dava) baþvurulacaðýný, bu durumda doðacak tüm masraf, faiz ve avukatlýk ücretlerinin tarafýnýzdan tahsil edileceðini,\n\n**ÝHTAR EDERÝM.**\n\n{{TARIH}}\n{{GONDEREN_AD}}\n\n---\n\n*Bu ihtarname noter kanalýyla teblið edilmek üzere hazýrlanmýþtýr.*\n",
        "isPremium": false,
        "usageCount": 723
    },
    {
        "id": "19",
        "category": "Hukuk",
        "subcategory": "Miras Hukuku",
        "title": "Mirasçýlýk Belgesi (Veraset Ýlamý) Talebi",
        "description": "Sulh hukuk mahkemesinden veraset ilamý talebi",
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
                "label": "Davacý (Mirasçý)",
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
                "label": "Murisin (Ölenin) Adý",
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
                "label": "Diðer Mirasçýlar",
                "type": "textarea"
            }
        ],
        "content": "## {{MAHKEME}} BAÞKANLIÐINA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**KONU:** Mirasçýlýk belgesi (veraset ilamý) verilmesi talebimdir.\n\n---\n\n## AÇIKLAMALAR\n\n1. Muris **{{MURIS_AD}}** (TC: {{MURIS_TC}}) {{OLUM_TARIHI}} tarihinde {{OLUM_YERI}}'de vefat etmiþtir.\n\n2. Ben müteveffanýn mirasçýsýyým.\n\n3. Diðer mirasçýlar:\n{{MIRASCILAR}}\n\n4. Müteveffanýn terekesi üzerinde iþlem yapabilmek için mirasçýlýk belgesi alýnmasý gerekmektedir.\n\n---\n\n## HUKUKÝ SEBEPLER\n\n- 4721 sayýlý Türk Medeni Kanunu m.598 (Mirasçýlýk belgesi)\n\n---\n\n## DELÝLLER\n\n1. Veraset ve intikal vergisi beyannamesi\n2. Nüfus kayýt örneði (muris ve mirasçýlar)\n3. Ölüm belgesi\n4. Vukuatlý nüfus kayýt örneði\n\n---\n\n## SONUÇ VE ÝSTEM\n\nMüteveffa {{MURIS_AD}}'in mirasçýlarýný ve miras paylarýný gösteren **MÝRASÇILIK BELGESÝ** verilmesini saygýlarýmla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 567
    },
    {
        "id": "20",
        "category": "Hukuk",
        "subcategory": "Miras Hukuku",
        "title": "Mirastan Feragat Sözleþmesi",
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
                "label": "Muris (Miras Býrakan)",
                "type": "text",
                "required": true
            },
            {
                "key": "BEDEL",
                "label": "Karþýlýk Bedel (varsa)",
                "type": "text"
            }
        ],
        "content": "## MÝRASTAN FERAGAT SÖZLEÞMESÝ\n\n**FERAGAT EDEN:**\nAd Soyad: {{FERAGAT_EDEN}}\nTC Kimlik No: {{FERAGAT_EDEN_TC}}\n\n**MURÝS:**\nAd Soyad: {{MURIS_AD}}\n\n---\n\n## BEYAN\n\nBen {{FERAGAT_EDEN}}, {{MURIS_AD}}'ýn ileride gerçekleþecek ölümü halinde terekesinden payýma düþecek tüm miras haklarýndan, TMK m.528 uyarýnca, aþaðýdaki þartlarla **FERAGAT ETTÝÐÝMÝ** beyan ederim.\n\n**Karþýlýk:** {{BEDEL}}\n\n**Feragatin Kapsamý:** Tam feragat (hem kendim hem altsoyum adýna)\n\nBu sözleþme, murisin saðlýðýnda, resmi þekilde yapýlmýþ olup, tarafýmca özgür iradeyle imzalanmýþtýr.\n\n---\n\n## HUKUKÝ DAYANAK\n\n- 4721 sayýlý Türk Medeni Kanunu m.528 (Mirastan feragat sözleþmesi)\n\n---\n\n{{TARIH}}\n\n**Feragat Eden:**\n{{FERAGAT_EDEN}}\n\n**Muris:**\n{{MURIS_AD}}\n\n---\n\n*Bu sözleþme noter huzurunda düzenleme þeklinde yapýlmalýdýr.*\n",
        "isPremium": true,
        "usageCount": 123
    },
    {
        "id": "21",
        "category": "Ýcra",
        "subcategory": "Tahsilat",
        "title": "Haricen Tahsil Bildirimi",
        "description": "Ýcra dosyasý dýþýnda yapýlan tahsilatýn bildirilmesi",
        "icon": "HandCoins",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ýcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklý", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "TAHSIL_TUTARI", "label": "Tahsil Edilen Tutar (TL)", "type": "number", "required": true },
            { "key": "TAHSIL_TARIHI", "label": "Tahsil Tarihi", "type": "date", "required": true },
            { "key": "KALAN_ALACAK", "label": "Kalan Alacak (varsa)", "type": "number" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜÐÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}}\n\n**KONU:** Haricen tahsil bildirimi\n\n---\n\n## AÇIKLAMA\n\nMüdürlüðünüzün yukarýda numarasý yazýlý dosyasýnda takip edilen alacaðýmýn bir kýsmý/tamamý borçlu tarafýndan **haricen (icra dairesi dýþýnda)** tarafýma ödenmiþtir.\n\n**TAHSÝLAT BÝLGÝLERÝ:**\n\n| Bilgi | Deðer |\n|-------|-------|\n| Tahsil Edilen Tutar | {{TAHSIL_TUTARI}} TL |\n| Tahsil Tarihi | {{TAHSIL_TARIHI}} |\n| Kalan Alacak | {{KALAN_ALACAK}} TL |\n\n---\n\n## TALEP\n\nYukarýda belirtilen haricen tahsilatýn dosyaya iþlenmesini ve dosyanýn buna göre güncellenmesini talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1245
    },
    {
        "id": "22",
        "category": "Ýcra",
        "subcategory": "Dosya Ýþlemleri",
        "title": "Dosya Kapama (Takipten Vazgeçme) Talebi",
        "description": "Alacaklýnýn takipten vazgeçerek dosyayý kapatma talebi",
        "icon": "FolderX",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ýcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklý", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "VAZGECME_NEDENI", "label": "Vazgeçme Nedeni", "type": "textarea" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜÐÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}}\n\n**KONU:** Takipten vazgeçme ve dosyanýn kapatýlmasý talebi\n\n---\n\n## AÇIKLAMA\n\nMüdürlüðünüzün yukarýda numarasý yazýlý dosyasýnda yürütülen icra takibinden **VAZGEÇÝYORUM.**\n\n**Vazgeçme Nedeni:** {{VAZGECME_NEDENI}}\n\n---\n\n## TALEP\n\nÝÝK m.129 uyarýnca takipten vazgeçtiðimi beyan eder, takibin durdurularak dosyanýn kapatýlmasýný talep ederim.\n\n**Not:** Dosyadaki tüm hacizlerin kaldýrýlmasýný da talep ediyorum.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 876
    },
    {
        "id": "23",
        "category": "Ýcra",
        "subcategory": "Haciz",
        "title": "Maaþ Haczi (Maaþ Kesintisi) Talebi",
        "description": "Borçlunun maaþýna haciz konulmasý talebi",
        "icon": "Wallet",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ýcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklý", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Borçlu TC No", "type": "text", "required": true },
            { "key": "ISVEREN_AD", "label": "Ýþveren/Kurum Adý", "type": "text", "required": true },
            { "key": "ISVEREN_ADRES", "label": "Ýþveren Adresi", "type": "textarea", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜÐÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}} (TC: {{BORCLU_TC}})\n\n**KONU:** Maaþ haczi (maaþ kesintisi) talebi\n\n---\n\n## AÇIKLAMA\n\nBorçlunun aþaðýda belirtilen iþyerinde çalýþtýðý tespit edilmiþtir:\n\n**ÝÞVEREN BÝLGÝLERÝ:**\n- **Kurum/Þirket:** {{ISVEREN_AD}}\n- **Adres:** {{ISVEREN_ADRES}}\n\n---\n\n## TALEP\n\nÝÝK m.83 ve m.355 uyarýnca;\n\n1. Borçlunun maaþ ve ücretinin **1/4'ünün** haciz kesintisi yapýlarak dosyaya gönderilmesi için ilgili iþverene **maaþ haczi müzekkeresi** yazýlmasýný,\n\n2. Kesinti yapýlýncaya kadar iþverene sorumluluk bildiriminde bulunulmasýný,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1567
    },
    {
        "id": "24",
        "category": "Ýcra",
        "subcategory": "Haciz",
        "title": "Taþýnmaz (Gayrimenkul) Haczi Talebi",
        "description": "Borçlunun taþýnmazýna haciz þerhi konulmasý talebi",
        "icon": "Home",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ýcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklý", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "TASINMAZ_BILGI", "label": "Taþýnmaz Bilgileri (Ýl/Ýlçe/Ada/Parsel)", "type": "textarea", "required": true },
            { "key": "TAPU_MUDURLUGU", "label": "Tapu Müdürlüðü", "type": "text", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜÐÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}}\n\n**KONU:** Taþýnmaz haczi talebi\n\n---\n\n## AÇIKLAMA\n\nBorçlunun aþaðýda belirtilen taþýnmaz/taþýnmazlar üzerinde mülkiyeti bulunmaktadýr:\n\n**TAÞINMAZ BÝLGÝLERÝ:**\n{{TASINMAZ_BILGI}}\n\n**ÝLGÝLÝ TAPU MÜDÜRLÜÐÜ:** {{TAPU_MUDURLUGU}}\n\n---\n\n## TALEP\n\nÝÝK m.79 ve m.91 uyarýnca;\n\n1. Yukarýda belirtilen taþýnmaz/taþýnmazlar üzerine **HACÝZ ÞERHÝ** konulmasý için ilgili Tapu Müdürlüðü'ne müzekkere yazýlmasýný,\n\n2. Haciz þerhinin tapu kaydýna iþlenmesini,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 934
    },
    {
        "id": "25",
        "category": "Ýcra",
        "subcategory": "Haciz",
        "title": "Haciz Fekki (Haciz Kaldýrma) Talebi - Alacaklý",
        "description": "Alacaklýnýn haczi kaldýrma talebi",
        "icon": "KeyRound",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ýcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklý", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "HACIZLI_MAL", "label": "Haczin Kaldýrýlacaðý Mal/Kayýt", "type": "textarea", "required": true },
            { "key": "FEKK_NEDENI", "label": "Haciz Fekki Nedeni", "type": "textarea" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜÐÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}}\n\n**KONU:** Haciz fekki (haciz kaldýrma) talebi\n\n---\n\n## AÇIKLAMA\n\nMüdürlüðünüzün yukarýda numarasý yazýlý dosyasýnda borçluya ait aþaðýdaki mal/kayýt üzerine haciz konulmuþtur:\n\n**HACÝZLÝ MAL/KAYIT:**\n{{HACIZLI_MAL}}\n\n**HACÝZ FEKKÝ NEDENÝ:**\n{{FEKK_NEDENI}}\n\n---\n\n## TALEP\n\nYukarýda belirtilen mal/kayýt üzerindeki haczin **FEKKÝNÝ (KALDIRILMASINI)** ve ilgili kurumlara haciz fekki müzekkeresi yazýlmasýný talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1123
    },
    {
        "id": "26",
        "category": "Ýcra",
        "subcategory": "Mal Beyaný",
        "title": "Mal Beyaný Talepli Ödeme Emri Talebi",
        "description": "Borçludan mal beyaný istenmesi talebi",
        "icon": "ClipboardList",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ýcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklý", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "BORCLU_ADRES", "label": "Borçlu Adresi", "type": "textarea", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜÐÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}}\nAdres: {{BORCLU_ADRES}}\n\n**KONU:** Mal beyaný talebinde bulunulmasý\n\n---\n\n## AÇIKLAMA\n\nMüdürlüðünüzün yukarýda numarasý yazýlý dosyasýnda borçluya gönderilen ödeme emri teblið edilmiþ, ancak borçlu ödeme yapmamýþ ve itirazda da bulunmamýþtýr.\n\n---\n\n## TALEP\n\nÝÝK m.74 uyarýnca;\n\n1. Borçluya **MAL BEYANI** için davetiye çýkarýlmasýný,\n\n2. Borçlunun mal beyanýnda bulunmamasý veya gerçeðe aykýrý beyanda bulunmasý halinde ÝÝK m.337 kapsamýnda þikayet hakkýmýn saklý tutulmasýný,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 789
    },
    {
        "id": "27",
        "category": "Ýcra",
        "subcategory": "Araç",
        "title": "Araç Haczi Talebi",
        "description": "Borçlunun aracýna haciz konulmasý talebi",
        "icon": "Car",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ýcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklý", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Borçlu TC No", "type": "text", "required": true },
            { "key": "ARAC_PLAKA", "label": "Araç Plakasý (biliniyorsa)", "type": "text" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜÐÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}} (TC: {{BORCLU_TC}})\n\n**KONU:** Araç haczi talebi\n\n---\n\n## TALEP\n\nBorçlunun adýna kayýtlý araç/araçlar üzerine haciz konulmasý için;\n\n1. **Emniyet Genel Müdürlüðü Trafik Baþkanlýðý'na** (EGM) haciz müzekkeresi yazýlmasýný,\n\n2. Borçlu adýna kayýtlý tüm araçlarýn tespit edilmesini ve haciz þerhi konulmasýný,\n\n3. Yakalama þerhi konulmasýný,\n\ntalep ederim.\n\n**Bilinen Araç Plakasý (varsa):** {{ARAC_PLAKA}}\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1456
    },
    {
        "id": "28",
        "category": "Ýcra",
        "subcategory": "Banka",
        "title": "Banka Hesabý Haczi Talebi",
        "description": "Borçlunun banka hesaplarýna haciz konulmasý",
        "icon": "Landmark",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "Ýcra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklý", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borçlu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Borçlu TC/VKN", "type": "text", "required": true },
            { "key": "BANKA_ADI", "label": "Banka Adý (biliniyorsa)", "type": "text" }
        ],
        "content": "## {{ICRA_DAIRESI}} MÜDÜRLÜÐÜ'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORÇLU:** {{BORCLU_AD}} (TC/VKN: {{BORCLU_TC}})\n\n**KONU:** Banka hesaplarýna haciz talebi\n\n---\n\n## TALEP\n\nBorçlunun banka hesaplarýna haciz konulmasý için;\n\n1. **Tüm bankalara** (UYAP üzerinden toplu) haciz müzekkeresi gönderilmesini,\n\n2. Borçlunun tüm banka hesaplarýndaki mevduatýn haczedilmesini,\n\n3. Haczedilen tutarlarýn dosyaya aktarýlmasýný,\n\ntalep ederim.\n\n**Bilinen Banka (varsa):** {{BANKA_ADI}}\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
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
        return res.status(404).json({ error: 'Þablon bulunamadý' });
    }

    res.json({ template });
});

// Use template - fill variables and generate content
app.post('/api/templates/:id/use', validateRequest([
    param('id')
        .trim()
        .matches(/^[a-zA-Z0-9_-]{2,120}$/)
        .withMessage('Gecersiz sablon kimligi.'),
    body('variables')
        .optional()
        .isObject()
        .withMessage('variables bir nesne olmalidir.'),
]), (req, res) => {
    const template = SANITIZED_TEMPLATES.find(t => t.id === req.params.id);

    if (!template) {
        return res.status(404).json({ error: 'Þablon bulunamadý' });
    }

    const { variables } = req.body;
    console.warn(`[TEMPLATE USE] ID: ${req.params.id}, variableCount: ${variables ? Object.keys(variables).length : 0}`);

    let content = template.content;


    // Add current date
    const today = new Date().toLocaleDateString('tr-TR');
    content = content.replace(/\{\{TARIH\}\}/g, today);

    // Replace all variables
    if (variables) {
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = '{{' + key + '}}';
            const safeValue = String(value ?? '').slice(0, 2000);
            content = content.split(placeholder).join(safeValue);
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

// Authenticated checkout session creation for paid plan upgrades
app.post('/api/billing/create-checkout-session', validateRequest([
    body('plan')
        .trim()
        .toLowerCase()
        .isIn(['pro', 'team'])
        .withMessage('Gecersiz plan secimi.'),
]), async (req, res) => {
    try {
        const user = await getAuthenticatedUserFromRequest(req);
        const body = parseRequestBody(req);
        const plan = normalizePaidPlan(body?.plan);

        if (!plan) {
            return res.status(400).json({ error: 'Gecersiz plan secimi. Yalnizca pro veya team desteklenir.' });
        }

        const idempotencyKey = createCheckoutIdempotencyKey({ userId: user.id, plan });
        const session = await createStripeCheckoutSession({ req, user, plan, idempotencyKey });
        return res.json({
            sessionId: session.id,
            url: session.url,
        });
    } catch (error) {
        console.error('Stripe checkout create session error:', error);
        return res.status(error.status || 500).json({
            error: getSafeErrorMessage(error, 'Odeme oturumu olusturulamadi.'),
        });
    }
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
        res.status(error.status || 500).json({ error: getSafeErrorMessage(error, 'Plan ozeti alinamadi') });
    }
});

// Authenticated user subscription cancellation
app.post('/api/user-plan-cancel', async (req, res) => {
    try {
        const user = await getAuthenticatedUserFromRequest(req);
        const serviceClient = createServiceRoleClient();
        const stripeCancellation = await cancelStripeSubscriptionForUser({
            userId: user.id,
            email: user.email || '',
        });

        const summary = await buildPlanUsageSummary(serviceClient, user.id);
        res.json({ success: true, summary, stripeCancellation });
    } catch (error) {
        console.error('User plan cancel error:', error);
        res.status(error.status || 500).json({ error: getSafeErrorMessage(error, 'Abonelik iptal edilemedi') });
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
        res.status(500).json({ error: getSafeErrorMessage(error, 'Web arastirmasi sirasinda hata olustu.') });
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
        res.status(500).json({ error: getSafeErrorMessage(error, 'Kullanici haklari guncellenemedi.') });
    }
});

// Announcements API (shared handler)
app.all('/api/announcements', (req, res) => announcementsHandler(req, res));

app.listen(PORT, () => {
    console.warn(`Server running on http://localhost:${PORT}`);
});






