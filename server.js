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
    console.error('❌ GEMINI_API_KEY (or VITE_GEMINI_API_KEY) is not defined in .env file');
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
            console.warn(`⚠️ CORS blocked request from: ${origin}`);
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
        console.warn('⚠️ Unauthorized request attempt');
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
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
        throw new Error('SUPABASE_URL (or VITE_SUPABASE_URL) not configured');
    }
    if (!serviceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_SERVICE_ROLE_KEY) not configured');
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
        error: '�ok fazla istek g�nderdiniz. L�tfen bir dakika bekleyip tekrar deneyin.',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        console.warn(`⚠️ Rate limit exceeded for IP: ${req.ip}`);
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
    if (!history || history.length === 0) return "Sohbet ge�mi�i yok.";
    return history.map(msg => `${msg.role === 'user' ? 'Kullan�c�' : 'Asistan'}: ${msg.text}`).join('\n');
};

const formatPartiesForPrompt = (parties) => {
    if (!parties) return "Taraf bilgisi sa�lanmad�.";
    const partyEntries = Object.entries(parties).filter(([, value]) => value && value.trim() !== '');
    if (partyEntries.length === 0) return "Taraf bilgisi sa�lanmad�.";

    const labelMap = {
        plaintiff: 'Davac�',
        defendant: 'Daval�',
        appellant: 'Ba�vuran / �tiraz Eden',
        counterparty: 'Kar�� Taraf',
        complainant: 'M��teki / �ikayet�i',
        suspect: '��pheli',
        party1: 'Taraf 1',
        party2: 'Taraf 2',
    };

    return partyEntries
        .map(([key, value]) => `${labelMap[key] || key}: ${value}`)
        .join('\n');
};

const formatCaseDetailsForPrompt = (details) => {
    if (!details) return "Dava k�nye bilgisi sa�lanmad�.";
    const detailEntries = [
        details.court && `Mahkeme: ${details.court}`,
        details.fileNumber && `Dosya Numaras� (Esas No): ${details.fileNumber}`,
        details.decisionNumber && `Karar Numaras�: ${details.decisionNumber}`,
        details.decisionDate && `Karar Tarihi: ${details.decisionDate}`,
    ].filter(Boolean);

    if (detailEntries.length === 0) return "Dava k�nye bilgisi sa�lanmad�.";
    return detailEntries.join('\n');
}

const formatLawyerInfoForPrompt = (lawyerInfo) => {
    if (!lawyerInfo || !lawyerInfo.name) return "Vekil bilgisi sa�lanmad�.";

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
    if (!contactInfo || contactInfo.length === 0) return "�leti�im bilgisi sa�lanmad�.";

    return contactInfo.map((contact, index) => {
        const entries = [
            `--- Ki�i/Kurum ${index + 1} ---`,
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
    've', 'veya', 'ile', 'icin', 'i�in', 'ama', 'fakat', 'gibi', 'daha', 'kadar',
    'olan', 'olanlar', 'olarak', 'bu', 'su', '�u', 'o', 'bir', 'iki', 'uc', '��',
    'de', 'da', 'mi', 'mu', 'm�', 'm�', 'ki', 'ya', 'yada', 'hem',
    'en', 'cok', '�ok', 'az', 'sonra', 'once', '�nce', 'son', 'ilk', 'her', 'tum',
    't�m', 'hakkinda', 'hakk�nda', 'oldu', 'olur', 'olsun'
]);

const normalizeRagText = (value = '') => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9������\s]/gi, ' ')
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
        const systemInstruction = `Sen T�rk hukukunda uzmanla�m�� bir hukuk asistan�s�n. G�revin, sa�lanan belgeleri, resimleri ve metinleri titizlikle analiz etmektir. Temel bilgileri ��kar, t�m potansiyel taraflar� (�ah�slar, �irketler) belirle ve e�er varsa dava k�nyesi bilgilerini (mahkeme ad�, dosya/esas no, karar no, karar tarihi) tespit et. Ayr�ca belgelerden avukat/vekil bilgilerini (isim, baro, baro sicil no, adres, telefon, email) ve di�er ileti�im bilgilerini ��kar. ��kt�n� JSON nesnesi olarak yap�land�r. Analiz �zetinin HER ZAMAN T�rk�e olmas�n� sa�la.`;

        const promptText = `
L�tfen SANA G�NDER�LEN PDF belgelerini, resim dosyalar�n� ve a�a��daki metin olarak sa�lanan UDF ve Word belgelerinin i�eri�ini titizlikle analiz et.

**ANA G�REVLER:**
1. Olay�n detayl� ve T�rk�e bir �zetini olu�tur. **�ZET� MUTLAKA PARAGRAFLARA B�LEREK YAZ (paragraflar aras�nda '\\n\\n' bo�luklar� b�rak)**, tek par�a blok yaz� KES�NL�KLE kullanma.
2. Metinde ad� ge�en t�m potansiyel taraflar� listele
3. Dava k�nyesi bilgilerini ��kar (mahkeme, dosya numaras�, karar numaras�, karar tarihi)
4. **�NEML�:** Avukat/vekil bilgilerini bul ve ��kar:
   - Avukat ad� soyad� (genellikle "Av." veya "Avukat" ile ba�lar)
   - Baro ad� ("... Barosu" format�nda)
   - Baro sicil numaras�
   - �� adresi
   - Telefon numaras�
   - Email adresi
5. Di�er ileti�im bilgilerini ��kar (taraflar�n adres, telefon, email bilgileri)

**UDF Belge ��erikleri:**
${udfTextContent || "UDF belgesi y�klenmedi."}

**Word Belge ��erikleri:**
${wordTextContent || "Word belgesi y�klenmedi."}

**�IKTI FORMATI:**
Sonucu 'summary', 'potentialParties', 'caseDetails', 'lawyerInfo' ve 'contactInfo' anahtarlar�na sahip bir JSON nesnesi olarak d�nd�r.
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
                        summary: { type: Type.STRING, description: 'Documentslar�n detayl� T�rk�e �zeti.' },
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
                            description: 'Avukat/vekil bilgileri (e�er belgede varsa)',
                            properties: {
                                name: { type: Type.STRING, description: 'Avukat�n tam ad�' },
                                address: { type: Type.STRING, description: 'Avukat�n i� adresi' },
                                phone: { type: Type.STRING, description: 'Telefon numaras�' },
                                email: { type: Type.STRING, description: 'Email adresi' },
                                barNumber: { type: Type.STRING, description: 'Baro sicil numaras�' },
                                bar: { type: Type.STRING, description: 'Baro ad� (�rn: Ankara Barosu)' },
                                title: { type: Type.STRING, description: 'Unvan (�rn: Avukat)' },
                                tcNo: { type: Type.STRING, description: 'TC Kimlik No (e�er varsa)' }
                            }
                        },
                        contactInfo: {
                            type: Type.ARRAY,
                            description: 'Di�er ileti�im bilgileri (taraflar�n adresleri, telefonlar�)',
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING, description: 'Ki�i/Kurum ad�' },
                                    address: { type: Type.STRING, description: 'Adres' },
                                    phone: { type: Type.STRING, description: 'Telefon' },
                                    email: { type: Type.STRING, description: 'Email' },
                                    tcNo: { type: Type.STRING, description: 'TC Kimlik No (e�er varsa)' }
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
        const systemInstruction = `Sen T�rk Hukuku alan�nda uzman, stratejik bir ara�t�rma asistan�s�n. G�revin, verilen vaka �zetini analiz ederek, kullan�c�n�n '${userRole}' olan rol�n� hukuki olarak en g��l� konuma getirecek anahtar kelimeleri belirlemektir. Olu�turaca��n anahtar kelimeler, kullan�c�n�n lehine olan Yarg�tay kararlar�n�, mevzuat� ve hukuki arg�manlar� bulmaya odaklanmal�d�r. ��kt� olarak SADECE 'keywords' anahtar�n� i�eren ve bu anahtar�n de�erinin bir string dizisi oldu�u bir JSON nesnesi d�nd�r.`;
        const promptText = `Sa�lanan vaka �zeti:\n\n"${analysisText}"\n\nBu �zete dayanarak... (k�salt�ld�)`; // Simplified prompt for brevity in this file context

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

// 3. Web Search - Enhanced for Yarg�tay Decisions
app.post('/api/gemini/web-search', async (req, res) => {
    try {
        const { keywords, query } = req.body;

        // Handle both keywords array and single query string
        const searchTerms = keywords || (query ? [query] : []);

        if (!Array.isArray(searchTerms) || searchTerms.length === 0) {
            return res.status(400).json({ error: 'Keywords veya query parametresi gerekli' });
        }

        const model = AI_CONFIG.MODEL_NAME;

        const systemInstruction = `Sen, T�rk hukuku alan�nda uzman bir ara�t�rma asistan�s�n. 
G�revin �zellikle YARGITAY KARARLARI bulmak ve bunlar� dilek�ede kullan�labilir formatta sunmakt�r.

## KR�T�K G�REV: YARGITAY KARARLARI BULMA

Her aramada �unlar� tespit etmeye �al��:
1. **Karar K�nyesi:** Daire, Esas No, Karar No, Tarih (�rn: "Yarg�tay 9. HD., E. 2023/1234, K. 2023/5678, T. 15.03.2023")
2. **Karar �zeti:** 1-2 c�mlelik �zet
3. **�lgili Kanun Maddesi:** Kararda at�f yap�lan mevzuat

## �IKTI FORMATI

��kt�n� �u �ekilde yap�land�r:

### EMSAL YARGITAY KARARLARI

**1. [Yarg�tay X. HD., E. XXXX/XXXX, K. XXXX/XXXX, T. XX.XX.XXXX]**
�zet: [Karar�n �zeti]
�lgili Mevzuat: [Kanun maddesi]

**2. [Di�er karar]**
...

### �LG�L� MEVZUAT

- [Kanun Ad�] m. [madde no]: [madde �zeti]

### ARA�TIRMA �ZET�

[Bulunan karar ve mevzuata dayal� genel hukuki de�erlendirme]

NOT: En az 3-5 emsal karar bulmaya �al��. Bulamazsan "Bu konuda emsal karar bulunamad�" yaz.`;

        // Generate search queries for Yarg�tay and legislation
        const yargitayQueries = searchTerms.map(kw => `"${kw}" Yarg�tay karar emsal`);
        const mevzuatQueries = searchTerms.map(kw => `"${kw}" kanun maddesi h�k�m`);
        const uyapQueries = searchTerms.map(kw => `"${kw}" site:karararama.yargitay.gov.tr`);

        const promptText = `
## ARAMA G�REV�: YARGITAY KARARLARI VE MEVZUAT

A�a��daki konularda kapsaml� bir hukuki ara�t�rma yap:

### ANAHTAR KEL�MELER
${searchTerms.join(', ')}

### ARAMA STRATEJ�S�

**1. Yarg�tay Kararlar� (�ncelikli)**
${yargitayQueries.map(q => `- ${q}`).join('\n')}

**2. UYAP Karar Arama**
${uyapQueries.map(q => `- ${q}`).join('\n')}

**3. Mevzuat Aramas�**
${mevzuatQueries.map(q => `- ${q}`).join('\n')}

---

## BEKLENT�LER

1. **En az 3-5 Yarg�tay karar�** bul (m�mk�nse)
2. Her karar i�in TAM K�NYES�N� yaz (Daire, E., K., Tarih)
3. �lgili kanun maddelerini listele
4. Ara�t�rma �zetini haz�rla

⚠️ �NEML�: Karar k�nyelerini do�ru ve eksiksiz yaz. Bu bilgiler dilek�ede referans olarak kullan�lacak.
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

        const systemInstruction = `Sen, T�rk hukuk sisteminde 20+ y�l deneyime sahip, �st d�zey bir hukuk dan��man� ve dilek�e yaz�m uzman�s�n.

## SEN�N G�REV�N
Sa�lanan ham verileri, profesyonel ve ikna edici bir hukuki anlat�ya d�n��t�rmek. Ham bilgileri oldu�u gibi kopyalamak DE��L, bunlar� hukuki bir dil ve mant�ksal ak�� i�inde sentezlemek.

## KR�T�K YAZIM KURALLARI

### 1. A�IKLAMALAR B�L�M� NASIL YAZILMALI
❌ YANLI� (Ham veri d�k�m�):
"Daval� kurum taraf�ndan m�vekkil H�SEY�N �EL�K ad�na 'ka�ak elektrik tahakkuk hesap detay�' d�zenlenmi� olup, bu belge m�vekkilime tebli� edilmi�tir. ��bu tahakkukta, m�vekkilimin Tesisat No (4004311180), M��teri No (205539133), TC Kimlik No (41038011064)..."

✅ DO�RU (Profesyonel hukuki anlat�):
"1. M�vekkilim, daval� kurumun abonesi olup, s�z konusu ta��nmazda ikamet etmektedir.

2. Daval� kurum, m�vekkilim aleyhine "ka�ak elektrik kullan�m�" iddias�yla tahakkuk i�lemi ba�latm�� ve 25.275,55 TL tutar�nda bor� ��karm��t�r.

3. Yap�lan incelemede, m�vekkilimin sayac�n�n (Seri No: CE000624281) herhangi bir m�dahale izine rastlanmam�� olup, iddia edilen ka�ak kullan�m tespiti usuls�z bir �ekilde ger�ekle�tirilmi�tir.

4. ��yle ki; [olay detaylar� kronolojik s�rayla anlat�lmal�]..."

### 2. ⚠️ EMSAL KARARLARIN KULLANIMI (�OK �NEML�)
Yarg�tay/Dan��tay kararlar� SADECE "HUKUK� SEBEPLER" b�l�m�ne listelenmemeli!

❌ YANLI� (Sadece listeleme):
"## HUKUK� SEBEPLER
- Yarg�tay 9. HD., E. 2023/1234, K. 2023/5678
- Yarg�tay 3. HD., E. 2022/5678, K. 2022/9999"

✅ DO�RU (�lgili arg�manla entegre):
"## A�IKLAMALAR
...
4. Daval� kurumun iddia etti�i ka�ak elektrik kullan�m�n�n somut delilleri bulunmamaktad�r. Nitekim Yarg�tay 3. Hukuk Dairesi'nin E. 2022/5678, K. 2022/9999, T. 15.03.2023 tarihli karar�nda: 'Ka�ak elektrik kullan�m� iddias�n�n ispat� daval�ya aittir. Saya� m�hr� �zerinde herhangi bir m�dahale izi tespit edilememi�se ka�ak elektrik kullan�m�ndan s�z edilemez' �eklinde h�kmedilmi�tir. Somut olayda da saya�ta herhangi bir m�dahale izi tespit edilememi�tir.

5. Ayr�ca tahakkuk edilen miktar da fahi�tir. Yarg�tay 3. HD., E. 2021/4567 karar�nda da belirtildi�i �zere, 'T�ketim miktar�n�n belirlenmesinde ger�ek t�ketim de�erleri esas al�nmal�d�r.'
..."

### 3. B�L�M YAPISI (Kesin s�ra)
Her dilek�ede �u b�l�mler MUTLAKA bulunmal� ve bu s�rayla yaz�lmal�:

## [MAHKEME/MAKAM ADI - B�Y�K HARFLERLE, ORTALI]

**DOSYA NO:** [varsa]

---

**DAVACI/BA�VURAN:**
[Ad Soyad]
TC: [Kimlik No]
Adres: [Adres]

**VEK�L�:** [varsa]
[Avukat bilgileri]

**DAVALI/KAR�I TARAF:**
[Kurum/Ki�i ad�]
Adres: [Adres]

---

**KONU:** [Tek c�mlelik �zet - �rn: "Ka�ak elektrik tahakkuku iddias�na itiraz hakk�ndad�r."]

---

## A�IKLAMALAR

[Numaral� maddeler halinde, her madde ayr� paragraf]

1. [Giri�: Taraflar�n tan�t�m� ve temel ili�ki]

2. [Olay: Ne oldu, kronolojik anlat�m]

3. [Sorun: Neden haks�z/hukuka ayk�r� + DESTEKLEY�C� EMSAL KARAR]

4. [Deliller ve destekleyici arg�manlar + �LG�L� YARGITAY KARARI]

5. [Sonu� ��kar�m�]

---

## HUKUK� SEBEPLER

- [�lgili Kanun maddesi ve a��klamas�]
- [Yukar�da at�f yap�lan emsal kararlar�n �zet listesi]

---

## DEL�LLER

1. [Delil listesi]

---

## SONU� VE �STEM

Yukar�da arz ve izah edilen sebeplerle;
- [Talep 1]
- [Talep 2]
... karar� verilmesini sayg�lar�mla arz ve talep ederim.

[Tarih]
[Ad Soyad / Vekil]

### 4. D�L VE �SLUP KURALLARI
- "M�vekkil" kelimesini tutarl� kullan
- Resmi hitap formu kullan: "Say�n Mahkemeniz", "arz ve talep ederim"
- Teknik verileri (TC No, dosya no) ak�c� c�mle i�inde yerle�tir, liste olarak de�il
- Hukuki terimler kullan: "haks�z fiil", "usuls�z i�lem", "hukuka ayk�r�l�k" vb.
- Her paragraf bir ana fikir i�ermeli
- Gereksiz tekrarlardan ka��n
- EMSAL KARARLARI ilgili arg�mana entegre et, ayr� liste yapma`;

        const promptText = `
## D�LEK�E OLU�TURMA TAL�MATI

A�a��daki HAM VER�LER� kullanarak PROFESYONEL bir T�rk hukuk dilek�esi haz�rla.

⚠️ �NEML�: Ham verileri oldu�u gibi kopyalama! Bunlar� hukuki bir anlat�ya d�n��t�r.

---

### G�RD� VER�LER�

**Dilek�e T�r�:** ${params.petitionType}
**Kullan�c�n�n Rol�:** ${params.userRole}

**Dava K�nyesi:**
${formatCaseDetailsForPrompt(params.caseDetails)}

**Vekil Bilgileri:**
${formatLawyerInfoForPrompt(params.lawyerInfo)}

**Taraflar:**
${formatPartiesForPrompt(params.parties)}

**Olay �zeti (Ham):**
${params.analysisSummary || "Olay �zeti sa�lanmad�."}

**Hukuki Ara�t�rma:**
${params.webSearchResult || "Web ara�t�rmas� sonucu sa�lanmad�."}

**Emsal Yarg�tay/Dan��tay Kararlar�:**
${params.legalSearchResult || "Emsal karar ara�t�rmas� yap�lmad�."}

**Ek Notlar:**
${params.docContent || "Ek metin sa�lanmad�."}

**�zel Talimatlar:**
${params.specifics || "�zel talimat sa�lanmad�."}

**Sohbet Ge�mi�i:**
${formatChatHistoryForPrompt(params.chatHistory)}

**RAG Destek Baglami (ilgili parcalar):**
${ragContext || "RAG baglami bulunamadi."}

---

## BEKLENEN �IKTI

Yukar�daki ham verileri kullanarak:
1. Profesyonel, ikna edici bir hukuki anlat� olu�tur
2. Her b�l�m� (A�IKLAMALAR, HUKUK� SEBEPLER, DEL�LLER, SONU� VE �STEM) ayr� ayr� formatla
3. Numaral� maddelerde ak�c� paragraflar kullan, ham veri listesi de�il
4. Mahkemeye sunulmaya haz�r, resmi bir dilek�e format�nda yaz
5. Markdown format�n� kullan (## ba�l�klar, **kal�n**, 1. 2. 3. listeler)
6. ⚠️ EMSAL KARARLARI: Yarg�tay kararlar�n� ilgili arg�manla birlikte A�IKLAMALAR b�l�m�nde kullan. "Nitekim Yarg�tay X. HD., E. .../..., K. .../... karar�nda '...' �eklinde h�kmedilmi�tir" format�nda entegre et.
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
**MEVCUT DURUM VE BA�LAM:**
- **Vaka �zeti:** ${analysisSummary || "Hen�z analiz yap�lmad�."}
- **Mevcut Arama Anahtar Kelimeleri:** ${safeContext.keywords || "Hen�z anahtar kelime olu�turulmad�."}
- **Web Ara�t�rma �zeti:** ${safeContext.searchSummary || "Hen�z web ara�t�rmas� yap�lmad�."}
- **Emsal Karar �zeti:** ${safeContext.legalSummary || "Hen�z emsal karar �zeti sa�lanmad�."}
- **Kullan�c�n�n Ek Metinleri:** ${safeContext.docContent || "Ek metin sa�lanmad�."}
- **Kullan�c�n�n �zel Talimatlar�:** ${safeContext.specifics || "�zel talimat sa�lanmad�."}
- **RAG Destek Baglami:** ${ragContext || "RAG baglami bulunamadi."}
- **Sistem Tarihi (Europe/Istanbul):** ${systemDateIstanbul}
- **Sistem Saati (Europe/Istanbul):** ${systemTimeIstanbul}
- **UTC Zaman Damgasi:** ${systemUtcIso}
${requestFiles.length > 0 ? `- **Y�klenen Belgeler:** ${requestFiles.length} adet dosya y�klendi (${requestFiles.map(f => f.name).join(', ')})` : ''}
`;

        const systemInstruction = `Sen, T�rk Hukuku konusunda uzman, yard�msever ve proaktif bir hukuk asistan�s�n.

**SEN�N G�REVLER�N:**
1. Kullan�c�n�n hukuki sorular�n� yan�tlamak
2. Dava stratejisi konusunda beyin f�rt�nas� yapmak
3. Hukuki terimleri a��klamak
4. **BELGE ANAL�Z�: Kullan�c� dosya y�kledi�inde, bu dosyalar� analiz et ve sorular�n� yan�tla**
5. **�NEML�: Kullan�c� belge/dilek�e/talep haz�rlaman� istedi�inde, generate_document fonksiyonunu kullan**
6. **KR�T�K: Kullan�c� Yarg�tay karar�/emsal karar aramas� istedi�inde, GER�EK bir Google aramas� yap**

**BELGE ANAL�Z� KURALLARI:**
Kullan�c� dosya y�kledi�inde:
- PDF veya resim dosyalar�n� dikkatlice incele
- ��eri�i �zetle ve anahtar bilgileri ��kar
- Hukuki a��dan �nemli noktalar� vurgula
- Kullan�c�n�n sorular�n� belge i�eri�ine g�re yan�tla

**YARGITAY KARARI ARAMA KURALLARI:**
Kullan�c� sorusunu once analiz et; sadece gerekliyse GERCEK bir web aramasi yap:
- "Yarg�tay karar� ara", "emsal karar bul", "i�tihat ara�t�r"
- "Bu konuda Yarg�tay ne diyor?", "Yarg�tay kararlar�n� bul"
- "Karar k�nyesi ver", "emsal karar listele"

Arama yaparken:
1. Mevcut ba�lamdaki anahtar kelimeleri kullan
2. "site:karararama.yargitay.gov.tr" veya "Yarg�tay" anahtar kelimesi ekle
3. Bulunan kararlar�n TAM K�NYES�N� ver (Daire, Esas No, Karar No, Tarih)
4. Her karar i�in k�sa bir �zet yaz

**�IKTI FORMATI (Yarg�tay Aramas�):**
### BULUNAN YARGITAY KARARLARI

**1. Yarg�tay X. HD., E. XXXX/XXXX, K. XXXX/XXXX, T. XX.XX.XXXX**
�zet: [Karar �zeti]
Kaynak: [URL varsa]

**2. ...**

**BELGE TALEB� TESP�T KURALLARI:**
Kullan�c� �unlar� s�yledi�inde generate_document fonksiyonunu MUTLAKA �a��r:
- "... haz�rla", "... olu�tur", "... yaz" (dilek�e, talep, itiraz vb. ile birlikte)
- "haricen tahsil talebi", "ihtarname", "feragat dilek�esi" vb. belge isimleri
- "bana bir ... haz�rla"
- "... i�in dilek�e laz�m"

**BELGE T�R� �RNEKLER�:**
- harici_tahsil_talebi: Haricen tahsil talebi/yaz�s�
- ihtarname: �htarname
- dava_dilek�esi: Dava dilek�esi
- itiraz_dilek�esi: �tiraz dilek�esi
- feragat_dilek�esi: Feragat dilek�esi
- cevap_dilek�esi: Cevap dilek�esi
- temyiz_dilek�esi: Temyiz dilek�esi
- icra_takip_talebi: �cra takip talebi
- genel_dilek�e: Genel dilek�e/belge

**LIMIT KURALI:**
- Belge olustururken mutlaka generate_document fonksiyonunu kullan.
- generate_document fonksiyonu cagirmadan tam belge metni verme.

��te mevcut davan�n ba�lam�:
${contextPrompt}

T�rk�e yan�t ver. Soruyu once analiz et; tanim/genel sorularda aramayi zorunlu tutma ve kisa mevzuat cevabi ver. Uygulama/uyusmazlik sorularinda gerekli gordugunde arama yap. Tarih/saat sorularinda, baglamdaki sistem tarih-saat bilgisini esas al.`;

        // Function for updating keywords
        const updateKeywordsFunction = {
            name: 'update_search_keywords',
            description: 'Kullan�c� anahtar kelime eklenmesini istedi�inde bu fonksiyonu kullan.',
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
            description: 'Kullan�c� bir belge, dilek�e veya resmi yaz� haz�rlanmas�n� istedi�inde bu fonksiyonu kullan. �rnek: "harici tahsil talebi haz�rla", "ihtarname yaz", "feragat dilek�esi olu�tur".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    documentType: {
                        type: Type.STRING,
                        description: 'Belge t�r�: harici_tahsil_talebi, ihtarname, dava_dilek�esi, itiraz_dilek�esi, feragat_dilek�esi, cevap_dilek�esi, temyiz_dilek�esi, icra_takip_talebi, genel_dilek�e'
                    },
                    documentTitle: {
                        type: Type.STRING,
                        description: 'Belgenin ba�l��� (�rn: "HAR�CEN TAHS�L TALEB�", "�HTARNAME")'
                    },
                    documentContent: {
                        type: Type.STRING,
                        description: 'Belgenin tam i�eri�i - T�rk hukuk format�na uygun, markdown format�nda, b�l�mlere ayr�lm��. Mevcut ba�lam bilgilerini kullan.'
                    }
                },
                required: ['documentType', 'documentTitle', 'documentContent'],
            },
        };
        // Function for searching Yarg�tay decisions
        const searchYargitayFunction = {
            name: 'search_yargitay',
            description: 'Kullan�c� Yarg�tay karar� aramas� istedi�inde bu fonksiyonu kullan. �rnek: "Yarg�tay karar� ara", "emsal karar bul", "i�tihat ara�t�r".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    searchQuery: {
                        type: Type.STRING,
                        description: 'Aranacak konu. Mevcut ba�lamdaki anahtar kelimeleri ve konuyu i�ermeli.'
                    },
                    keywords: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Arama i�in kullan�lacak anahtar kelimeler listesi'
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
                    console.warn(`🔍 AI requesting legal search: "${searchQuery}"`);

                    // Execute the legal search using existing function
                    const searchResult = await searchEmsalFallback(searchQuery);

                    // Format results for the AI
                    let formattedResults = '\n\n### 📚 BULUNAN YARGITAY KARARLARI\n\n';
                    if (searchResult.results && searchResult.results.length > 0) {
                        searchResult.results.forEach((result, index) => {
                            formattedResults += `**${index + 1}. ${result.title || 'Yarg�tay Karar�'}**\n`;
                            if (result.esasNo) formattedResults += `E. ${result.esasNo} `;
                            if (result.kararNo) formattedResults += `K. ${result.kararNo} `;
                            if (result.tarih) formattedResults += `T. ${result.tarih}`;
                            formattedResults += '\n';
                            if (result.ozet) formattedResults += `�zet: ${result.ozet}\n`;
                            formattedResults += '\n';
                        });
                    } else {
                        formattedResults += 'Bu konuda emsal karar bulunamad�.\n';
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
                    const errorChunk = { text: '\n\n⚠️ Emsal karar aramas� s�ras�nda bir hata olu�tu.\n' };
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
    const hasDocumentIntent = /(dilekce|dilek�e|sozlesme|s�zle�me|ihtarname|belge|taslak|metin|talep)/i.test(text);
    const hasGenerationVerb = /(olustur|olu�tur|uret|�ret|hazirla|haz�rla|yaz)/i.test(text);
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
**G�REV: A�A�IDAK� MEVCUT D�LEK�E TASLA�INI, SA�LANAN BA�LAM B�LG�LER�N� KULLANARAK G�ZDEN GE��R VE �Y�LE�T�R.**

**1. �Y�LE�T�R�LECEK MEVCUT D�LEK�E TASLA�I:**
---
${params.currentPetition}
---

**2. D�LEK�EN�N HAZIRLANMASINDA KULLANILAN OR�J�NAL BA�LAM B�LG�LER�:**
- **KULLANICININ ROL�:** ${params.userRole}
- **D�LEK�E T�R�:** ${params.petitionType}
- **DAVA K�NYES�:** ${formatCaseDetailsForPrompt(params.caseDetails)}
- **VEK�L B�LG�LER�:** ${formatLawyerInfoForPrompt(params.lawyerInfo)}
- **�LET���M B�LG�LER�:** ${formatContactInfoForPrompt(params.contactInfo)}
- **OLAYIN �ZET�:** ${params.analysisSummary}
- **TARAFLAR:** ${formatPartiesForPrompt(params.parties)}
- **�LG�L� HUKUK� ARA�TIRMA:** ${params.webSearchResult}
- **EK MET�N VE NOTLAR:** ${params.docContent}
- **�ZEL TAL�MATLAR:** ${params.specifics}
- **�NCEK� SOHBET GE�M���:** ${formatChatHistoryForPrompt(params.chatHistory)}

**�Y�LE�T�R�LM�� N�HA� D�LEK�E METN�:**
[Buraya, yukar�daki tasla�� t�m ba�lam� dikkate alarak daha g��l�, ikna edici ve hukuken sa�lam hale getirilmi� tam dilek�e metnini yaz.]
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
const BEDESTEN_TIMEOUT_MS = Number(process.env.BEDESTEN_TIMEOUT_MS || 15000);
const LEGAL_ROUTER_TIMEOUT_MS = Number(process.env.LEGAL_ROUTER_TIMEOUT_MS || 8000);

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

const withTimeout = async (promise, timeoutMs, timeoutMessage = `Timeout after ${timeoutMs}ms`) => {
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

const fetchWithTimeout = async (url, init = {}, timeoutMs = BEDESTEN_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (error?.name === 'AbortError') {
            const timeoutError = new Error(`Timeout after ${timeoutMs}ms`);
            timeoutError.code = 'REQUEST_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

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

async function generateContentWithRetry(requestPayload, options = {}) {
    const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : (Number.isFinite(AI_CONFIG.MAX_RETRIES) ? AI_CONFIG.MAX_RETRIES : 2);
    const initialDelayMs = Number.isFinite(options.initialDelayMs) ? options.initialDelayMs : (Number.isFinite(AI_CONFIG.INITIAL_RETRY_DELAY_MS) ? AI_CONFIG.INITIAL_RETRY_DELAY_MS : 1000);
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : Number(process.env.LEGAL_AI_TIMEOUT_MS || 35000);

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            return await withTimeout(
                ai.models.generateContent(requestPayload),
                timeoutMs,
                'Legal AI request timed out'
            );
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

const LEGAL_SOURCE_SET = new Set(['all', 'yargitay', 'danistay', 'uyap', 'anayasa', 'kik']);

const normalizeForRouting = (value = '') => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSourceValue = (value, fallback = 'all') => {
    const normalized = normalizeForRouting(value);
    if (LEGAL_SOURCE_SET.has(normalized)) return normalized;
    return fallback;
};

const compactLegalKeywordQuery = (keyword, maxLen = 180) => {
    const raw = String(keyword || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    if (raw.length <= maxLen) return raw;

    const normalized = normalizeForRouting(raw);
    const mustKeep = [];

    const lawMatch = raw.match(/\b\d{3,4}\s*say\w*\s*[^.,;:\n]*?kanun[ua]\b/i);
    if (lawMatch) mustKeep.push(lawMatch[0].trim());

    const articleMatches = raw.match(/\b\d{1,3}\.?\s*maddesi?\b/gi) || [];
    for (const article of articleMatches) {
        if (mustKeep.length >= 3) break;
        mustKeep.push(article.trim());
    }

    const phraseProbes = [
        'imar kanunu',
        'kacak yapi',
        'ruhsatsiz insaat',
        'imar mevzuatina aykirilik',
        'yikim karari',
        'idari para cezasi',
        'yapi tatil tutanagi',
        'proje tadilatina aykiri yapi',
        'encumen karari',
    ];

    for (const probe of phraseProbes) {
        if (!normalized.includes(probe)) continue;
        if (mustKeep.length >= 6) break;
        mustKeep.push(probe);
    }

    const stopWords = new Set(['ve', 'veya', 'ile', 'icin', 'gibi', 'olan', 'olarak', 'dair', 'kararlari', 'karar']);
    const tokenFallback = normalized
        .split(/\s+/)
        .filter(token => token.length >= 3 && !stopWords.has(token))
        .slice(0, 18);

    const merged = [...mustKeep, ...tokenFallback]
        .map(item => String(item || '').trim())
        .filter(Boolean);

    const uniq = [];
    const seen = new Set();
    for (const item of merged) {
        const key = normalizeForRouting(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        uniq.push(item);
    }

    let compacted = uniq.join(' ');
    if (compacted.length > maxLen) {
        compacted = compacted.slice(0, maxLen).trim();
    }
    return compacted || raw.slice(0, maxLen).trim();
};

const resolveSourceByRules = (keyword, requestedSource = 'all') => {
    const text = normalizeForRouting(keyword);
    const requested = normalizeSourceValue(requestedSource, 'all');
    if (!text) {
        return {
            source: requested,
            confidence: requested === 'all' ? 0.4 : 0.75,
            secondarySource: null,
            secondaryScore: 0,
            method: 'rules',
        };
    }

    const scores = {
        danistay: 0,
        yargitay: 0,
        anayasa: 0,
        uyap: 0,
    };

    const addSignals = (source, probes, weight) => {
        for (const probe of probes) {
            if (text.includes(probe)) scores[source] += weight;
        }
    };

    addSignals('danistay', ['danistay'], 5);
    addSignals('yargitay', ['yargitay'], 5);
    addSignals('anayasa', ['anayasa mahkemesi', 'aym', 'bireysel basvuru'], 4.5);
    addSignals('uyap', ['uyap', 'istinaf', 'bolge adliye', 'yerel mahkeme', 'bolge idare'], 3.5);

    addSignals('danistay', [
        'imar',
        '3194',
        'ruhsat',
        'ruhsatsiz',
        'kacak yapi',
        'kacak',
        'yikim',
        'encumen',
        'yapi tatil',
        'idari para cezasi',
        'idari yargi',
        'idare mahkemesi',
        'iptal davasi',
        'tam yargi',
        'belediye',
        'imar barisi',
    ], 1.35);

    addSignals('yargitay', [
        'tck',
        'cmk',
        'hmk',
        'tbk',
        'kambiyo',
        'icra',
        'ceza',
        'bosanma',
        'is davasi',
        'alacak davasi',
        'dolandiricilik',
        'hirsizlik',
        'yaralama',
    ], 1.1);

    const explicitDanistay = text.includes('danistay');
    const explicitYargitay = text.includes('yargitay');
    if (explicitDanistay && explicitYargitay) {
        return {
            source: 'all',
            confidence: 0.98,
            secondarySource: null,
            secondaryScore: 0,
            method: 'rules',
        };
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topSource = 'all', topScore = 0] = sorted[0] || [];
    const [secondSource = null, secondScore = 0] = sorted[1] || [];

    if (!topSource || topScore <= 0) {
        return {
            source: requested,
            confidence: requested === 'all' ? 0.45 : 0.75,
            secondarySource: null,
            secondaryScore: 0,
            method: 'rules',
        };
    }

    const diff = Math.max(0, topScore - secondScore);
    let confidence = 0.55 + Math.min(0.3, topScore * 0.08) + Math.min(0.1, diff * 0.06);
    confidence = Math.max(0.52, Math.min(0.95, confidence));

    let source = topSource;
    if (requested !== 'all' && requested !== topSource && diff < 1.2) {
        source = requested;
        confidence = Math.max(0.72, confidence - 0.08);
    }

    return {
        source: normalizeSourceValue(source, requested),
        confidence,
        secondarySource: secondScore >= 1 ? secondSource : null,
        secondaryScore: secondScore,
        method: 'rules',
    };
};

const tryResolveSourceWithAI = async ({ keyword, requestedSource = 'all' }) => {
    if (!API_KEY) return null;

    const requested = normalizeSourceValue(requestedSource, 'all');
    const routingPrompt = [
        'Asagidaki ictihat arama sorgusu icin en uygun yargi kaynagini sec.',
        'Gecerli source: danistay, yargitay, anayasa, uyap, all',
        'Kurallar:',
        '- Imar/ruhsat/yikim/encumen/idari para cezasi/idari yargi konularinda danistay agirlikli sec.',
        '- Ceza ve ozel hukuk temyiz agirlikli konularda yargitay sec.',
        '- Emin degilsen all sec.',
        'Sadece JSON dondur:',
        '{"source":"...","confidence":0.0,"birimAdi":"ALL","compactQuery":"..."}',
        `requestedSource: ${requested}`,
        `query: ${keyword}`,
    ].join('\n');

    try {
        const response = await generateContentWithRetry({
            model: AI_CONFIG.MODEL_NAME,
            contents: routingPrompt,
            config: { temperature: 0.1 },
        }, { maxRetries: 0, timeoutMs: LEGAL_ROUTER_TIMEOUT_MS });

        const parsed = maybeExtractJson(response.text || '');
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;

        const source = normalizeSourceValue(parsed.source, 'all');
        const confidenceRaw = Number(parsed.confidence);
        const confidence = Number.isFinite(confidenceRaw)
            ? Math.max(0, Math.min(1, confidenceRaw))
            : 0.5;
        const compactQuery = typeof parsed.compactQuery === 'string'
            ? parsed.compactQuery.trim()
            : '';
        const birimAdi = typeof parsed.birimAdi === 'string'
            ? parsed.birimAdi.trim()
            : '';

        return {
            source,
            confidence,
            compactQuery: compactQuery || keyword,
            birimAdi: birimAdi || 'ALL',
            method: 'ai',
        };
    } catch (error) {
        console.error('Legal source AI router error:', error);
        return null;
    }
};

const buildSearchRoutingPlan = async ({ keyword, requestedSource = 'all', filters = {} }) => {
    const requested = normalizeSourceValue(requestedSource, 'all');
    const compactKeyword = compactLegalKeywordQuery(keyword);
    const ruleDecision = resolveSourceByRules(compactKeyword, requested);
    const aiDecision = await tryResolveSourceWithAI({ keyword: compactKeyword, requestedSource: requested });

    let resolvedSource = ruleDecision.source;
    let confidence = ruleDecision.confidence;
    let router = ruleDecision.method;

    if (aiDecision && aiDecision.source) {
        const aiCanOverrideRule = aiDecision.confidence >= 0.64 && (
            ruleDecision.confidence < 0.84
            || aiDecision.source === requested
            || requested === 'all'
        );

        if (aiCanOverrideRule) {
            resolvedSource = aiDecision.source;
            confidence = Math.max(confidence, aiDecision.confidence);
            router = 'ai';
        }
    }

    if (requested !== 'all' && requested !== resolvedSource) {
        const strongOverride = confidence >= 0.86;
        if (!strongOverride) {
            resolvedSource = requested;
            confidence = Math.max(confidence, 0.75);
            router = 'requested';
        }
    }

    const fallbackSources = [];
    for (const candidate of [resolvedSource, ruleDecision.secondarySource, 'all']) {
        const normalized = normalizeSourceValue(candidate, '');
        if (!normalized || fallbackSources.includes(normalized)) continue;
        fallbackSources.push(normalized);
        if (fallbackSources.length >= 3) break;
    }

    const nextFilters = { ...(filters || {}) };
    if ((!nextFilters.birimAdi || nextFilters.birimAdi === 'ALL') && aiDecision?.birimAdi && aiDecision.birimAdi !== 'ALL') {
        nextFilters.birimAdi = aiDecision.birimAdi;
    }

    return {
        requestedSource: requested,
        resolvedSource,
        confidence,
        router,
        keyword: aiDecision?.compactQuery ? compactLegalKeywordQuery(aiDecision.compactQuery) : compactKeyword,
        originalKeyword: String(keyword || ''),
        fallbackSources,
        filters: nextFilters,
        compacted: compactKeyword !== String(keyword || '').trim(),
    };
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

    const response = await fetchWithTimeout(BEDESTEN_SEARCH_URL, {
        method: 'POST',
        headers: getBedestenHeaders(),
        body: JSON.stringify(payload),
    }, BEDESTEN_TIMEOUT_MS);

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
                        text: `A�a��daki hukuk karar PDF i�eri�ini d�z metin olarak ��kar.\nKurallar:\n- Link veya a��klama ekleme.\n- Karar�n g�r�len metnini m�mk�n oldu�unca eksiksiz d�nd�r.\n- Metni T�rk�e karakterleri koruyarak yaz.\nBelge Kimli�i: ${documentId || 'bilinmiyor'}`
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

    const response = await fetchWithTimeout(BEDESTEN_DOCUMENT_URL, {
        method: 'POST',
        headers: getBedestenHeaders(),
        body: JSON.stringify(payload),
    }, BEDESTEN_TIMEOUT_MS);

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
async function searchEmsalFallback(keyword, sourceHint = 'all') {
    try {
        const normalizedSourceHint = normalizeSourceValue(sourceHint, 'all');
        const sourceDirective = normalizedSourceHint === 'all'
            ? 'Yargitay ve Danistay agirlikli'
            : `${normalizedSourceHint.toUpperCase()} agirlikli`;
        const response = await generateContentWithRetry({
            model: AI_CONFIG.MODEL_NAME,
            contents: `T�rkiye'de "${keyword}" konusunda ${sourceDirective} emsal kararlarini bul.

Her karar i�in �u alanlar� �ret:
- mahkeme
- daire
- esasNo
- kararNo
- tarih
- ozet (en fazla 2-3 c�mle)
- sourceUrl (resmi karar arama linki varsa)
- relevanceScore (0-100)

Sadece JSON array d�nd�r:
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
            contents: `A�a��daki karar k�nyesine ait karar METN�N� resmi kaynaklardan bul:
${query}

Kurallar:
- Cevapta URL/link verme.
- Giri�/yorum ekleme.
- Sadece karar metnini d�z yaz� olarak d�nd�r.
- Tam metin bulunamazsa, bulunabilen en detayl� metni d�nd�r.`,
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

        const routingPlan = await buildSearchRoutingPlan({
            keyword,
            requestedSource: source,
            filters,
        });

        console.warn('Legal Search: "' + routingPlan.keyword + '" (requested: ' + (source || 'all') + ', resolved: ' + routingPlan.resolvedSource + ')');

        let results = [];
        let provider = 'bedesten';
        let usedSource = routingPlan.resolvedSource;
        const bedestenErrors = [];
        const warningParts = [];

        for (const candidateSource of routingPlan.fallbackSources) {
            usedSource = candidateSource;
            try {
                const bedestenResults = await searchBedestenAPI(
                    routingPlan.keyword,
                    candidateSource,
                    routingPlan.filters
                );

                if (Array.isArray(bedestenResults) && bedestenResults.length > 0) {
                    results = bedestenResults;
                    break;
                }
            } catch (bedestenError) {
                bedestenErrors.push(candidateSource + ':' + (bedestenError?.message || 'unknown-error'));
                if (bedestenError?.code === 'REQUEST_TIMEOUT') {
                    warningParts.push('MCP/Bedesten aramasi zaman asimina ugradi, AI fallback kullaniliyor.');
                    break;
                }
                console.error('Bedesten search failed (' + candidateSource + '):', bedestenError);
            }
        }

        if (!Array.isArray(results) || results.length === 0) {
            provider = 'ai-fallback';
            const fallback = await searchEmsalFallback(routingPlan.keyword, usedSource);
            results = fallback.results || [];

            if (!fallback.success && results.length === 0) {
                return res.json({
                    success: true,
                    source: usedSource || routingPlan.resolvedSource || 'all',
                    keyword: routingPlan.keyword,
                    provider,
                    results: [],
                    warning: 'Emsal arama servislerine gecici olarak ulasilamiyor. Lutfen kisa bir sure sonra tekrar deneyin.',
                    routing: {
                        requestedSource: routingPlan.requestedSource,
                        resolvedSource: routingPlan.resolvedSource,
                        usedSource,
                        fallbackSources: routingPlan.fallbackSources,
                        router: routingPlan.router,
                        confidence: routingPlan.confidence,
                        compacted: routingPlan.compacted,
                    },
                });
            }
        }

        if (routingPlan.compacted) {
            warningParts.push('Uzun sorgu optimize edilerek arama yapildi.');
        }
        if (bedestenErrors.length > 0) {
            warningParts.push('Bazi Bedesten denemeleri basarisiz oldu.');
        }

        res.json({
            success: true,
            source: usedSource || routingPlan.resolvedSource || 'all',
            keyword: routingPlan.keyword,
            provider,
            results,
            routing: {
                requestedSource: routingPlan.requestedSource,
                resolvedSource: routingPlan.resolvedSource,
                usedSource,
                fallbackSources: routingPlan.fallbackSources,
                router: routingPlan.router,
                confidence: routingPlan.confidence,
                compacted: routingPlan.compacted,
            },
            ...(warningParts.length > 0 ? { warning: warningParts.join(' ') } : {}),
        });

    } catch (error) {
        const statusCode = Number(error?.status) || 500;
        console.error('Legal Search Error:', error);
        res.status(statusCode).json({
            error: getSafeErrorMessage(
                error,
                statusCode === 401
                    ? 'Ictihat aramasi icin giris yapmaniz gerekiyor.'
                    : 'Ictihat arama sirasinda bir hata olustu.'
            ),
            details: statusCode >= 500 && process.env.NODE_ENV === 'production'
                ? undefined
                : (error?.message || undefined)
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

        console.warn(`📄 Get Document: ${documentId || documentUrl}`);

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
            content = 'Karar metni getirilemedi. L�tfen farkl� bir karar se�ip tekrar deneyin.';
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
        const statusCode = Number(error?.status) || 500;
        console.error('Get Document Error:', error);
        res.status(statusCode).json({
            error: getSafeErrorMessage(
                error,
                statusCode === 401
                    ? 'Karar metni almak icin giris yapmaniz gerekiyor.'
                    : 'Belge alinirken bir hata olustu.'
            ),
            details: statusCode >= 500 && process.env.NODE_ENV === 'production'
                ? undefined
                : (error?.message || undefined)
        });
    }
});

// List available legal sources
app.get('/api/legal/sources', (req, res) => {
    res.json({
        sources: [
            { id: 'yargitay', name: 'Yarg�tay', description: 'Yarg�tay Kararlar� (Bedesten API)' },
            { id: 'danistay', name: 'Dan��tay', description: 'Dan��tay Kararlar� (Bedesten API)' },
            { id: 'uyap', name: 'Emsal (UYAP)', description: 'Emsal Kararlar (UYAP Sistemi)' },
            { id: 'anayasa', name: 'Anayasa Mahkemesi', description: 'AYM Norm Denetimi ve Bireysel Ba�vuru' },
            { id: 'kik', name: 'Kamu �hale Kurulu', description: 'K�K Kararlar�' },
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
        title: 'Bo�anma Davas� Dilek�esi',
        description: 'Anla�mal� veya �eki�meli bo�anma davalar� i�in temel dilek�e �ablonu',
        icon: 'HeartCrack',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Ad�', type: 'text', placeholder: '�rn: �stanbul Anadolu 5. Aile Mahkemesi', required: true },
            { key: 'DAVACI_AD', label: 'Davac� Ad� Soyad�', type: 'text', placeholder: '�rn: Ay�e YILMAZ', required: true },
            { key: 'DAVACI_TC', label: 'Davac� TC Kimlik No', type: 'text', placeholder: '�rn: 12345678901', required: true },
            { key: 'DAVACI_ADRES', label: 'Davac� Adresi', type: 'textarea', placeholder: '�rn: Atat�rk Mah. Cumhuriyet Cad. No:15/3 Kad�k�y/�stanbul' },
            { key: 'DAVACI_VEKIL_AD', label: 'Davac� Vekili (Avukat)', type: 'text', placeholder: '�rn: Av. Mehmet KAYA' },
            { key: 'DAVACI_VEKIL_BARO', label: 'Baro Sicil No', type: 'text', placeholder: '�rn: �stanbul Barosu 54321' },
            { key: 'DAVALI_AD', label: 'Daval� Ad� Soyad�', type: 'text', placeholder: '�rn: Ali YILMAZ', required: true },
            { key: 'DAVALI_TC', label: 'Daval� TC Kimlik No', type: 'text', placeholder: '�rn: 98765432109' },
            { key: 'DAVALI_ADRES', label: 'Daval� Adresi', type: 'textarea', placeholder: '�rn: Bah�elievler Mah. �n�n� Sok. No:7 Bak�rk�y/�stanbul' },
            { key: 'EVLILIK_TARIHI', label: 'Evlilik Tarihi', type: 'date', required: true },
            { key: 'EVLILIK_YERI', label: 'Evlenme Yeri', type: 'text', placeholder: '�rn: Kad�k�y Evlendirme Dairesi' },
            { key: 'COCUK_BILGI', label: 'M��terek �ocuk Bilgileri (varsa)', type: 'textarea', placeholder: '�rn: 1. Zeynep YILMAZ (D: 01.01.2015, TC: 11122233344)' },
            { key: 'BOSANMA_SEBEPLERI', label: 'Bo�anma Sebepleri', type: 'textarea', placeholder: '�iddetli ge�imsizlik, evlilik birli�inin temelinden sars�lmas�...', required: true },
            { key: 'NAFAKA_TALEP', label: 'Nafaka Talebi (TL/ay)', type: 'number', placeholder: '�rn: 5000' },
            { key: 'VELAYET_TALEP', label: 'Velayet Talebi', type: 'text', placeholder: '�rn: M��terek �ocuklar�n velayetinin davac� anneye verilmesi' },
        ],
        content: `{{MAHKEME}} BA�KANLI�INA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}

**VEK�L�:** {{DAVACI_VEKIL_AD}}
{{DAVACI_VEKIL_BARO}}

**DAVALI:** {{DAVALI_AD}}
TC Kimlik No: {{DAVALI_TC}}
Adres: {{DAVALI_ADRES}}

**KONU:** Bo�anma davas� hakk�ndad�r.

---

**A�IKLAMALAR:**

1. M�vekkilim ile daval� {{EVLILIK_TARIHI}} tarihinde {{EVLILIK_YERI}}'de evlenmi�lerdir.

2. Taraflar�n bu evlilikten do�an m��terek �ocuklar�:
{{COCUK_BILGI}}

3. {{BOSANMA_SEBEPLERI}}

4. Evlilik birli�inin temelinden sars�lmas� nedeniyle taraflar aras�ndaki evlili�in devam� m�mk�n de�ildir. Ortak hayat�n yeniden kurulmas� ihtimali bulunmamaktad�r.

---

**HUKUK� SEBEPLER:**

- 4721 say�l� T�rk Medeni Kanunu m.166 (Evlilik birli�inin sars�lmas�)
- 4721 say�l� T�rk Medeni Kanunu m.169 (Bo�anmada velayet)
- 4721 say�l� T�rk Medeni Kanunu m.175 (Yoksulluk nafakas�)
- 4721 say�l� T�rk Medeni Kanunu m.182 (�ocuk nafakas�)

---

**DEL�LLER:**

1. N�fus kay�t �rne�i
2. Vukuatl� n�fus kay�t �rne�i
3. Evlilik c�zdan� sureti
4. Tan�k beyanlar�
5. Ekonomik durum ara�t�rmas�
6. Her t�rl� yasal delil

---

**SONU� VE �STEM:**

Yukar�da arz ve izah edilen sebeplerle;

1. Taraflar�n TMK m.166 uyar�nca BO�ANMALARINA,
2. M��terek �ocuklar�n velayetinin davac� tarafa verilmesine ({{VELAYET_TALEP}}),
3. Daval�n�n ayl�k {{NAFAKA_TALEP}} TL i�tirak nafakas� �demesine,
4. Yarg�lama giderlerinin daval�ya y�kletilmesine,

karar verilmesini vekaleten sayg�lar�mla arz ve talep ederim. {{TARIH}}

Davac� Vekili
{{DAVACI_VEKIL_AD}}
`,
        isPremium: false,
        usageCount: 156
    },
    {
        id: '2',
        category: 'Hukuk',
        subcategory: 'Bor�lar Hukuku',
        title: 'Tazminat Davas� Dilek�esi',
        description: 'Maddi ve manevi tazminat talepli dava dilek�esi',
        icon: 'Banknote',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Ad�', type: 'text', placeholder: 'Asliye Hukuk Mahkemesi' },
            { key: 'DAVACI_AD', label: 'Davac� Ad� Soyad�', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'Davac� TC No', type: 'text', required: true },
            { key: 'DAVALI_AD', label: 'Daval�/Kurum Ad�', type: 'text', required: true },
            { key: 'OLAY_TARIHI', label: 'Olay Tarihi', type: 'date', required: true },
            { key: 'OLAY_ACIKLAMASI', label: 'Olay�n A��klamas�', type: 'textarea', required: true },
            { key: 'MADDI_TAZMINAT', label: 'Maddi Tazminat Tutar� (TL)', type: 'number' },
            { key: 'MANEVI_TAZMINAT', label: 'Manevi Tazminat Tutar� (TL)', type: 'number' },
        ],
        content: `{{MAHKEME}} BA�KANLI�INA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}

**DAVALI:** {{DAVALI_AD}}

**KONU:** Maddi ve manevi tazminat talepli dava dilek�esidir.

**DAVA DE�ER�:** {{MADDI_TAZMINAT}} TL (Maddi) + {{MANEVI_TAZMINAT}} TL (Manevi)

---

**A�IKLAMALAR:**

1. {{OLAY_TARIHI}} tarihinde a�a��da a��klanan olay meydana gelmi�tir.

2. {{OLAY_ACIKLAMASI}}

3. Bu olay nedeniyle m�vekkilim maddi ve manevi zarara u�ram��t�r. Zarar�n tazmini i�in i�bu dava a��lm��t�r.

---

**HUKUK� SEBEPLER:**

- 6098 say�l� T�rk Bor�lar Kanunu m.49-76 (Haks�z fiil)
- 6098 say�l� T�rk Bor�lar Kanunu m.56 (Manevi tazminat)

---

**DEL�LLER:**

1. Olay tutanaklar�
2. Fatura ve belgeler
3. Tan�k beyanlar�
4. Bilirki�i incelemesi
5. Her t�rl� yasal delil

---

**SONU� VE �STEM:**

1. {{MADDI_TAZMINAT}} TL MADD� TAZM�NATIN olay tarihinden itibaren i�leyecek yasal faiziyle birlikte daval�dan tahsiline,
2. {{MANEVI_TAZMINAT}} TL MANEV� TAZM�NATIN daval�dan tahsiline,
3. Yarg�lama giderlerinin daval�ya y�kletilmesine,

karar verilmesini sayg�lar�mla arz ve talep ederim. {{TARIH}}

Davac�
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 203
    },
    {
        id: '3',
        category: '�cra',
        subcategory: '�cra Takibi',
        title: '�cra Takibine �tiraz Dilek�esi',
        description: 'Haks�z icra takibine kar�� itiraz dilek�esi',
        icon: 'Gavel',
        variables: [
            { key: 'ICRA_MUDURLUGU', label: '�cra M�d�rl���', type: 'text', required: true },
            { key: 'DOSYA_NO', label: '�cra Dosya No', type: 'text', required: true },
            { key: 'BORCLU_AD', label: 'Bor�lu Ad� Soyad�', type: 'text', required: true },
            { key: 'ALACAKLI_AD', label: 'Alacakl� Ad�', type: 'text', required: true },
            { key: 'ITIRAZ_SEBEPLERI', label: '�tiraz Sebepleri', type: 'textarea', required: true },
        ],
        content: `## {{ICRA_MUDURLUGU}}'NE

**DOSYA NO:** {{DOSYA_NO}}

**BOR�LU (�T�RAZ EDEN):** {{BORCLU_AD}}

**ALACAKLI:** {{ALACAKLI_AD}}

**KONU:** �deme emrine itiraz�m�z hakk�ndad�r.

---

## A�IKLAMALAR

1. M�d�rl���n�zce y�r�t�len {{DOSYA_NO}} say�l� icra takip dosyas�nda taraf�ma �deme emri tebli� edilmi�tir.

2. {{ITIRAZ_SEBEPLERI}}

3. Yukar�da a��klanan nedenlerle s�z konusu borca itiraz etme zorunlulu�u do�mu�tur.

---

## HUKUK� SEBEPLER

- 2004 say�l� �cra ve �flas Kanunu m.62 (�tiraz)
- 2004 say�l� �cra ve �flas Kanunu m.66 (�tiraz�n h�k�mleri)

---

## SONU� VE �STEM

Yukar�da a��klanan sebeplerle;

1. BORCA �T�RAZ ED�YORUM,
2. Takibin durdurulmas�na,

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
        title: 'Kira Tahliye Davas� Dilek�esi',
        description: 'Kirac�n�n tahliyesi i�in dava dilek�esi',
        icon: 'Home',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Ad�', type: 'text', placeholder: 'Sulh Hukuk Mahkemesi' },
            { key: 'KIRAYA_VEREN', label: 'Kiraya Veren Ad�', type: 'text', required: true },
            { key: 'KIRACI', label: 'Kirac� Ad�', type: 'text', required: true },
            { key: 'TASINMAZ_ADRES', label: 'Ta��nmaz Adresi', type: 'textarea', required: true },
            { key: 'KIRA_BEDELI', label: 'Ayl�k Kira Bedeli', type: 'number' },
            { key: 'TAHLIYE_SEBEBI', label: 'Tahliye Sebebi', type: 'textarea', required: true },
        ],
        content: `## {{MAHKEME}} BA�KANLI�INA

**DAVACI (K�RAYA VEREN):** {{KIRAYA_VEREN}}

**DAVALI (K�RACI):** {{KIRACI}}

**KONU:** Kiralanan�n tahliyesi talebimiz hakk�ndad�r.

---

## A�IKLAMALAR

1. Daval�, a�a��da adresi belirtilen ta��nmazda kirac� olarak ikamet etmektedir:
   **Adres:** {{TASINMAZ_ADRES}}

2. Ayl�k kira bedeli {{KIRA_BEDELI}} TL olarak belirlenmi�tir.

3. {{TAHLIYE_SEBEBI}}

4. Bu nedenlerle ta��nmaz�n tahliyesi gerekmektedir.

---

## HUKUK� SEBEPLER

- 6098 say�l� T�rk Bor�lar Kanunu m.347-356 (Kira s�zle�mesi)
- 6098 say�l� T�rk Bor�lar Kanunu m.352 (Kirac�n�n temerr�d�)

---

## DEL�LLER

1. Kira s�zle�mesi
2. �htar belgeleri
3. �deme kay�tlar�
4. Tan�k beyanlar�

---

## SONU� VE �STEM

1. Kiralanan�n TAHL�YES�NE,
2. Birikmi� kira bedellerinin tahsiline,
3. Yarg�lama giderlerinin daval�ya y�kletilmesine,

karar verilmesini sayg�lar�mla arz ve talep ederim.

{{TARIH}}
{{KIRAYA_VEREN}}
`,
        isPremium: false,
        usageCount: 178
    },
    {
        id: '5',
        category: '�dari',
        subcategory: '�ptal Davas�',
        title: '�dari ��lemin �ptali Davas�',
        description: 'Hukuka ayk�r� idari i�lemlerin iptali i�in dava dilek�esi',
        icon: 'Building2',
        variables: [
            { key: 'IDARE_MAHKEMESI', label: '�dare Mahkemesi', type: 'text', placeholder: '�stanbul �dare Mahkemesi' },
            { key: 'DAVACI_AD', label: 'Davac� Ad�', type: 'text', required: true },
            { key: 'DAVALI_IDARE', label: 'Daval� �dare', type: 'text', required: true },
            { key: 'ISLEM_TARIHI', label: '��lem Tarihi', type: 'date', required: true },
            { key: 'ISLEM_KONUSU', label: '�ptali �stenen ��lem', type: 'textarea', required: true },
            { key: 'HUKUKA_AYKIRILIK', label: 'Hukuka Ayk�r�l�k Nedenleri', type: 'textarea', required: true },
        ],
        content: `## {{IDARE_MAHKEMESI}} BA�KANLI�INA

**DAVACI:** {{DAVACI_AD}}

**DAVALI:** {{DAVALI_IDARE}}

**KONU:** �dari i�lemin iptali talebimiz hakk�ndad�r.

**�PTAL� �STENEN ��LEM:** {{ISLEM_KONUSU}}
**��LEM TAR�H�:** {{ISLEM_TARIHI}}

---

## A�IKLAMALAR

1. Daval� idare taraf�ndan {{ISLEM_TARIHI}} tarihinde tesis edilen i�lem hukuka ayk�r�d�r.

2. {{HUKUKA_AYKIRILIK}}

3. S�z konusu i�lem telafisi g�� zararlara neden olmaktad�r.

---

## HUKUK� SEBEPLER

- 2577 say�l� �dari Yarg�lama Usul� Kanunu
- Anayasa m.125 (Yarg� yolu)
- �lgili mevzuat h�k�mleri

---

## SONU� VE �STEM

1. Dava konusu idari i�lemin �PTAL�NE,
2. Y�r�tmenin durdurulmas�na,
3. Yarg�lama giderlerinin daval�ya y�kletilmesine,

karar verilmesini sayg�lar�mla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: true,
        usageCount: 89
    },
    {
        id: '6',
        category: 'Ceza',
        subcategory: '�ikayet',
        title: 'Su� Duyurusu Dilek�esi',
        description: 'Cumhuriyet Savc�l���na su� duyurusu dilek�esi',
        icon: 'Siren',
        variables: [
            { key: 'SAVCILIK', label: 'Cumhuriyet Ba�savc�l���', type: 'text', required: true },
            { key: 'SIKAYET_EDEN', label: '�ikayet Eden (M��teki)', type: 'text', required: true },
            { key: 'SUPHELI', label: '��pheli', type: 'text', required: true },
            { key: 'SUC_TARIHI', label: 'Su� Tarihi', type: 'date', required: true },
            { key: 'SUC_KONUSU', label: 'Su� Konusu Olay', type: 'textarea', required: true },
            { key: 'ISTENEN_CEZA', label: 'Talep Edilen ��lem', type: 'textarea' },
        ],
        content: `## {{SAVCILIK}}'NA

**��KAYET EDEN (M��TEK�):** {{SIKAYET_EDEN}}

**��PHEL�:** {{SUPHELI}}

**SU� TAR�H�:** {{SUC_TARIHI}}

**KONU:** Su� duyurusu hakk�ndad�r.

---

## A�IKLAMALAR

1. {{SUC_TARIHI}} tarihinde a�a��da a��klanan olay meydana gelmi�tir:

2. {{SUC_KONUSU}}

3. Bu eylemler T�rk Ceza Kanunu kapsam�nda su� te�kil etmektedir.

---

## SU� VE CEZA

- �lgili T�rk Ceza Kanunu maddeleri
- Cezai yapt�r�m talep edilmektedir

---

## DEL�LLER

1. Olay tutanaklar�
2. G�r�nt�/Ses kay�tlar�
3. Tan�k beyanlar�
4. Di�er deliller

---

## SONU� VE �STEM

1. {{ISTENEN_CEZA}}

��phelinin yakalanarak cezaland�r�lmas� i�in gerekli soru�turman�n yap�lmas�n� sayg�lar�mla arz ve talep ederim.

{{TARIH}}
{{SIKAYET_EDEN}}
`,
        isPremium: false,
        usageCount: 245
    }
    ,
    {
        "id": "7",
        "category": "�cra",
        "subcategory": "�cra Takibi",
        "title": "�lams�z �cra Takip Talebi",
        "description": "Genel haciz yoluyla ilams�z icra takibi ba�latma talebi",
        "icon": "Gavel",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "�cra Dairesi",
                "type": "text",
                "required": true,
                "placeholder": "�stanbul 1. �cra Dairesi"
            },
            {
                "key": "ALACAKLI_AD",
                "label": "Alacakl� Ad� Soyad�",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_TC",
                "label": "Alacakl� TC No",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_ADRES",
                "label": "Alacakl� Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Bor�lu Ad� Soyad�",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_TC",
                "label": "Bor�lu TC No",
                "type": "text"
            },
            {
                "key": "BORCLU_ADRES",
                "label": "Bor�lu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ALACAK_TUTARI",
                "label": "Alacak Tutar� (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALACAK_NEDENI",
                "label": "Alaca��n Nedeni",
                "type": "textarea",
                "required": true
            },
            {
                "key": "VADE_TARIHI",
                "label": "Vade Tarihi",
                "type": "date"
            }
        ],
        "content": "## {{ICRA_DAIRESI}}'NE\n\n## TAK�P TALEB�\n\n**ALACAKLI:** {{ALACAKLI_AD}}\nTC Kimlik No: {{ALACAKLI_TC}}\nAdres: {{ALACAKLI_ADRES}}\n\n**BOR�LU:** {{BORCLU_AD}}\nTC Kimlik No: {{BORCLU_TC}}\nAdres: {{BORCLU_ADRES}}\n\n---\n\n**TAK�P KONUSU ALACAK:**\n\n| A��klama | Tutar |\n|----------|-------|\n| As�l Alacak | {{ALACAK_TUTARI}} TL |\n| Faiz (Vade Tarihinden �tibaren) | Hesaplanacak |\n| **TOPLAM** | {{ALACAK_TUTARI}} TL + Faiz |\n\n**ALACA�IN NEDEN�:** {{ALACAK_NEDENI}}\n\n**VADE TAR�H�:** {{VADE_TARIHI}}\n\n---\n\n## TALEP\n\nYukar�da belirtilen alaca��m�n tahsili i�in bor�lu aleyhine **genel haciz yoluyla ilams�z icra takibi** ba�lat�lmas�n� talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 523
    },
    {
        "id": "8",
        "category": "�cra",
        "subcategory": "�cra Takibi",
        "title": "Kambiyo Senedi �cra Takibi",
        "description": "�ek, senet veya poli�e ile icra takibi ba�latma",
        "icon": "Receipt",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "�cra Dairesi",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_AD",
                "label": "Alacakl� Ad�",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_ADRES",
                "label": "Alacakl� Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Bor�lu Ad�",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_ADRES",
                "label": "Bor�lu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "SENET_TURU",
                "label": "Senet T�r�",
                "type": "text",
                "placeholder": "Bono / �ek / Poli�e"
            },
            {
                "key": "SENET_TARIHI",
                "label": "Senet Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "SENET_TUTARI",
                "label": "Senet Tutar� (TL)",
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
        "content": "## {{ICRA_DAIRESI}}'NE\n\n## KAMB�YO SENETLER�NE MAHSUS HAC�Z YOLUYLA TAK�P TALEB�\n\n**ALACAKLI:** {{ALACAKLI_AD}}\nAdres: {{ALACAKLI_ADRES}}\n\n**BOR�LU:** {{BORCLU_AD}}\nAdres: {{BORCLU_ADRES}}\n\n---\n\n**TAK�BE KONU KAMB�YO SENED�:**\n\n| Bilgi | De�er |\n|-------|-------|\n| Senet T�r� | {{SENET_TURU}} |\n| D�zenleme Tarihi | {{SENET_TARIHI}} |\n| Vade Tarihi | {{VADE_TARIHI}} |\n| Senet Tutar� | {{SENET_TUTARI}} TL |\n\n---\n\n## TALEP\n\nEkte sunulan kambiyo senedine dayal� olarak, ��K m.167 ve devam� maddeleri uyar�nca bor�lu aleyhine **kambiyo senetlerine mahsus haciz yoluyla takip** ba�lat�lmas�n� talep ederim.\n\n**EKLER:**\n1. Kambiyo senedi asl�\n2. Protesto belgesi (varsa)\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 412
    },
    {
        "id": "9",
        "category": "�cra",
        "subcategory": "�cra �tiraz",
        "title": "Borca �tiraz Dilek�esi",
        "description": "�cra takibine kar�� borca itiraz",
        "icon": "ShieldX",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "�cra Dairesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "�cra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Bor�lu (�tiraz Eden)",
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
                "label": "Alacakl�",
                "type": "text",
                "required": true
            },
            {
                "key": "ITIRAZ_NEDENI",
                "label": "�tiraz Nedeni",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_DAIRESI}}'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**�T�RAZ EDEN (BOR�LU):** {{BORCLU_AD}}\nTC Kimlik No: {{BORCLU_TC}}\nAdres: {{BORCLU_ADRES}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**KONU:** �deme emrine itiraz�md�r.\n\n---\n\n## A�IKLAMALAR\n\n1. M�d�rl���n�z�n yukar�da numaras� yaz�l� dosyas�ndan taraf�ma �deme emri tebli� edilmi�tir.\n\n2. **�T�RAZ NEDEN�M:**\n{{ITIRAZ_NEDENI}}\n\n3. Bu nedenlerle s�z konusu takibe s�resinde itiraz ediyorum.\n\n---\n\n## HUKUK� DAYANAK\n\n- 2004 say�l� �cra ve �flas Kanunu m.62 (�tiraz)\n- 2004 say�l� �cra ve �flas Kanunu m.66 (�tiraz�n h�k�mleri)\n\n---\n\n## SONU� VE �STEM\n\n**BORCA �T�RAZ ED�YORUM.**\n\nTakibin durdurulmas�n� sayg�lar�mla arz ve talep ederim.\n\n{{TARIH}}\n{{BORCLU_AD}}\n",
        "isPremium": false,
        "usageCount": 678
    },
    {
        "id": "10",
        "category": "�cra",
        "subcategory": "�cra �tiraz",
        "title": "�mzaya �tiraz Dilek�esi",
        "description": "Kambiyo senedindeki imzaya itiraz",
        "icon": "PenOff",
        "variables": [
            {
                "key": "ICRA_MAHKEMESI",
                "label": "�cra Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "�cra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davac� (Bor�lu)",
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
                "label": "Daval� (Alacakl�)",
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
        "content": "## {{ICRA_MAHKEMESI}} BA�KANLI�INA\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**DAVACI (BOR�LU):** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI (ALACAKLI):** {{DAVALI_AD}}\n\n**KONU:** Kambiyo senedindeki imzaya itiraz hakk�ndad�r.\n\n---\n\n## A�IKLAMALAR\n\n1. Daval� taraf�ndan aleyhime ba�lat�lan icra takibinde dayanak g�sterilen senedin bilgileri a�a��daki gibidir:\n{{SENET_BILGI}}\n\n2. **S�z konusu senetteki imza taraf�ma ait de�ildir.**\n\n3. Senedin alt�ndaki imza ile benim ger�ek imzam aras�nda a��k fark bulunmakta olup, bu husus bilirki�i incelemesiyle de ortaya konulacakt�r.\n\n---\n\n## HUKUK� SEBEPLER\n\n- 2004 say�l� �cra ve �flas Kanunu m.170 (�mzaya itiraz)\n- 6100 say�l� HMK m.211 (�mza incelemesi)\n\n---\n\n## DEL�LLER\n\n1. �cra dosyas�\n2. Senet asl�\n3. �mza �rnekleri\n4. Bilirki�i incelemesi\n5. N�fus kay�t �rne�i\n\n---\n\n## SONU� VE �STEM\n\n1. **Senetteki imzan�n taraf�ma ait olmad���n�n tespitine,**\n2. �cra takibinin iptaline,\n3. %20 oran�nda k�t�niyet tazminat�na h�kmedilmesine,\n4. Yarg�lama giderlerinin daval�ya y�kletilmesine,\n\nkarar verilmesini sayg�lar�mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 234
    },
    {
        "id": "11",
        "category": "�cra",
        "subcategory": "Haciz",
        "title": "Haciz Kald�rma Talebi",
        "description": "Haczedilen mal �zerindeki haczin kald�r�lmas� talebi",
        "icon": "Unlock",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "�cra Dairesi",
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
                "label": "Haczedilen Mal/E�ya",
                "type": "textarea",
                "required": true
            },
            {
                "key": "KALDIRMA_NEDENI",
                "label": "Haczin Kald�r�lma Nedeni",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_DAIRESI}} M�D�RL���'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**TALEP EDEN:** {{TALEP_EDEN}}\n\n**KONU:** Haciz kald�rma talebimdir.\n\n---\n\n## A�IKLAMALAR\n\n1. M�d�rl���n�z�n yukar�da numaras� yaz�l� dosyas�nda a�a��da belirtilen mal/e�ya �zerine haciz konulmu�tur:\n\n**HACZED�LEN MAL/E�YA:**\n{{HACIZLI_MAL}}\n\n2. **HACZ�N KALDIRILMASI GEREK�ES�:**\n{{KALDIRMA_NEDENI}}\n\n---\n\n## HUKUK� DAYANAK\n\n- 2004 say�l� �cra ve �flas Kanunu m.82 (Haczedilemezlik)\n- 2004 say�l� �cra ve �flas Kanunu m.85 (Ta��n�r haczi)\n\n---\n\n## SONU� VE �STEM\n\nYukar�da a��klanan nedenlerle, s�z konusu mal/e�ya �zerindeki haczin kald�r�lmas�n� sayg�lar�mla talep ederim.\n\n{{TARIH}}\n{{TALEP_EDEN}}\n",
        "isPremium": false,
        "usageCount": 189
    },
    {
        "id": "12",
        "category": "�cra",
        "subcategory": "Haciz",
        "title": "�stihkak Davas� Dilek�esi",
        "description": "Haczedilen mal�n ���nc� ki�iye ait oldu�unun tespiti",
        "icon": "FileWarning",
        "variables": [
            {
                "key": "ICRA_MAHKEMESI",
                "label": "�cra Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "�cra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davac� (3. Ki�i)",
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
                "label": "Daval� (Alacakl�)",
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
                "label": "M�lkiyet Delilleri",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_MAHKEMESI}} BA�KANLI�INA\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**DAVACI (3. K���):** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI (ALACAKLI):** {{DAVALI_AD}}\n\n**KONU:** �stihkak davas� hakk�ndad�r.\n\n---\n\n## A�IKLAMALAR\n\n1. Daval� taraf�ndan y�r�t�len icra takibinde, bor�lunun evinde/i�yerinde yap�lan haciz i�lemi s�ras�nda **bana ait olan** a�a��daki mal haczedilmi�tir:\n\n**HACZED�LEN MAL:**\n{{HACIZLI_MAL}}\n\n2. **Bu mal bana aittir ve bor�lu ile hi�bir ilgisi yoktur.**\n\n3. M�lkiyetimi ispatlayan deliller:\n{{MULKIYET_DELILI}}\n\n---\n\n## HUKUK� SEBEPLER\n\n- 2004 say�l� �cra ve �flas Kanunu m.96-99 (�stihkak davas�)\n\n---\n\n## DEL�LLER\n\n1. Fatura ve sat�� belgeleri\n2. Banka kay�tlar�\n3. Tan�k beyanlar�\n4. Bilirki�i incelemesi\n5. Di�er yasal deliller\n\n---\n\n## SONU� VE �STEM\n\n1. **Haczedilen mal�n taraf�ma ait oldu�unun tespitine,**\n2. S�z konusu mal �zerindeki haczin kald�r�lmas�na,\n3. Yarg�lama giderlerinin daval�ya y�kletilmesine,\n\nkarar verilmesini sayg�lar�mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 156
    },
    {
        "id": "13",
        "category": "�� Hukuku",
        "subcategory": "��e �ade",
        "title": "��e �ade Davas� Dilek�esi",
        "description": "Haks�z fesih nedeniyle i�e iade talebi",
        "icon": "UserCheck",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "�� Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davac� (���i)",
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
                "label": "Daval� (��veren)",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "��veren Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ISE_GIRIS_TARIHI",
                "label": "��e Giri� Tarihi",
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
                "label": "G�revi/Pozisyonu",
                "type": "text",
                "required": true
            },
            {
                "key": "FESIH_GEREKCESI",
                "label": "��verenin Fesih Gerek�esi",
                "type": "textarea"
            }
        ],
        "content": "## {{MAHKEME}} BA�KANLI�INA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Feshin ge�ersizli�i ve i�e iade talebimizdir.\n\n---\n\n## A�IKLAMALAR\n\n1. M�vekkilim {{ISE_GIRIS_TARIHI}} tarihinden {{FESIH_TARIHI}} tarihine kadar daval� i�yerinde **{{GOREV}}** olarak �al��m��t�r.\n\n2. �� s�zle�mesi {{FESIH_TARIHI}} tarihinde i�veren taraf�ndan **haks�z ve ge�ersiz �ekilde** feshedilmi�tir.\n\n3. ��verenin ileri s�rd��� fesih gerek�esi:\n{{FESIH_GEREKCESI}}\n\n4. Bu gerek�e ger�e�i yans�tmamakta olup, fesih haks�z ve ge�ersizdir.\n\n---\n\n## HUKUK� SEBEPLER\n\n- 4857 say�l� �� Kanunu m.18 (Feshin ge�erli sebebe dayand�r�lmas�)\n- 4857 say�l� �� Kanunu m.20 (Fesih bildirimine itiraz)\n- 4857 say�l� �� Kanunu m.21 (Ge�ersiz sebeple feshin sonu�lar�)\n\n---\n\n## DEL�LLER\n\n1. �� s�zle�mesi\n2. Bordro ve SGK kay�tlar�\n3. Fesih bildirimi\n4. Tan�k beyanlar�\n5. ��yeri dosyas�\n\n---\n\n## SONU� VE �STEM\n\n1. **Feshin ge�ersizli�ine ve i�e iadeye,**\n2. ��e ba�latmama halinde 4-8 ayl�k br�t �cret tutar�nda tazminata,\n3. Bo�ta ge�en s�re �cretinin (4 aya kadar) �denmesine,\n4. Yarg�lama giderlerinin daval�ya y�kletilmesine,\n\nkarar verilmesini sayg�lar�mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 445
    },
    {
        "id": "14",
        "category": "�� Hukuku",
        "subcategory": "Tazminat",
        "title": "K�dem ve �hbar Tazminat� Davas�",
        "description": "�� akdi feshi sonras� tazminat talebi",
        "icon": "Banknote",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "�� Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davac� (���i)",
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
                "label": "Daval� (��veren)",
                "type": "text",
                "required": true
            },
            {
                "key": "ISE_GIRIS",
                "label": "��e Giri� Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "CIKIS_TARIHI",
                "label": "��ten ��k�� Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "SON_UCRET",
                "label": "Giydirilmi� Br�t �cret (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "KIDEM_TAZMINATI",
                "label": "K�dem Tazminat� Talebi (TL)",
                "type": "number"
            },
            {
                "key": "IHBAR_TAZMINATI",
                "label": "�hbar Tazminat� Talebi (TL)",
                "type": "number"
            }
        ],
        "content": "## {{MAHKEME}} BA�KANLI�INA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI:** {{DAVALI_AD}}\n\n**KONU:** K�dem ve ihbar tazminat� talebimizdir.\n\n**DAVA DE�ER�:** {{KIDEM_TAZMINATI}} TL + {{IHBAR_TAZMINATI}} TL\n\n---\n\n## A�IKLAMALAR\n\n1. M�vekkilim {{ISE_GIRIS}} - {{CIKIS_TARIHI}} tarihleri aras�nda daval� i�yerinde �al��m��t�r.\n\n2. **Son ayl�k giydirilmi� br�t �creti:** {{SON_UCRET}} TL\n\n3. �� akdi i�veren taraf�ndan haks�z olarak feshedilmi�, ancak tazminatlar� �denmemi�tir.\n\n---\n\n## TALEP ED�LEN ALACAKLAR\n\n| Alacak Kalemi | Tutar |\n|---------------|-------|\n| K�dem Tazminat� | {{KIDEM_TAZMINATI}} TL |\n| �hbar Tazminat� | {{IHBAR_TAZMINATI}} TL |\n| **TOPLAM** | Hesaplanacak |\n\n---\n\n## HUKUK� SEBEPLER\n\n- 1475 say�l� �� Kanunu m.14 (K�dem tazminat�)\n- 4857 say�l� �� Kanunu m.17 (S�reli fesih / �hbar)\n\n---\n\n## SONU� VE �STEM\n\n1. **{{KIDEM_TAZMINATI}} TL k�dem tazminat�n�n** fesih tarihinden itibaren en y�ksek mevduat faiziyle birlikte,\n2. **{{IHBAR_TAZMINATI}} TL ihbar tazminat�n�n** yasal faiziyle birlikte daval�dan tahsiline,\n3. Yarg�lama giderlerinin daval�ya y�kletilmesine,\n\nkarar verilmesini sayg�lar�mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 567
    },
    {
        "id": "15",
        "category": "Hukuk",
        "subcategory": "T�ketici Hukuku",
        "title": "T�ketici Hakem Heyeti Ba�vurusu",
        "description": "Ay�pl� mal/hizmet i�in t�ketici hakem heyetine ba�vuru",
        "icon": "ShoppingCart",
        "variables": [
            {
                "key": "HAKEM_HEYETI",
                "label": "T�ketici Hakem Heyeti",
                "type": "text",
                "required": true
            },
            {
                "key": "BASVURAN_AD",
                "label": "Ba�vuran Ad�",
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
                "label": "Sat�c�/Firma Ad�",
                "type": "text",
                "required": true
            },
            {
                "key": "SATICI_ADRES",
                "label": "Sat�c� Adresi",
                "type": "textarea"
            },
            {
                "key": "URUN_ADI",
                "label": "�r�n/Hizmet Ad�",
                "type": "text",
                "required": true
            },
            {
                "key": "SATIN_ALMA_TARIHI",
                "label": "Sat�n Alma Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "URUN_BEDELI",
                "label": "�r�n Bedeli (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "SIKAYET_KONUSU",
                "label": "�ikayet Konusu",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{HAKEM_HEYETI}}'NE\n\n## T�KET�C� ��KAYET BA�VURUSU\n\n**BA�VURAN (T�KET�C�):**\nAd Soyad: {{BASVURAN_AD}}\nTC Kimlik No: {{BASVURAN_TC}}\nAdres: {{BASVURAN_ADRES}}\nTelefon: {{BASVURAN_TEL}}\n\n**��KAYET ED�LEN (SATICI):**\nFirma Ad�: {{SATICI_AD}}\nAdres: {{SATICI_ADRES}}\n\n---\n\n**��KAYETE KONU �R�N/H�ZMET:**\n\n| Bilgi | De�er |\n|-------|-------|\n| �r�n/Hizmet | {{URUN_ADI}} |\n| Sat�n Alma Tarihi | {{SATIN_ALMA_TARIHI}} |\n| Bedel | {{URUN_BEDELI}} TL |\n\n---\n\n## ��KAYET KONUSU\n\n{{SIKAYET_KONUSU}}\n\n---\n\n## TALEP\n\n6502 say�l� T�keticinin Korunmas� Hakk�nda Kanun uyar�nca;\n\n1. Ay�pl� �r�n�n/hizmetin bedelinin iadesi,\n2. Alternatif olarak �r�n�n de�i�tirilmesi veya �cretsiz onar�m�,\n\nhususlar�nda karar verilmesini sayg�lar�mla arz ve talep ederim.\n\n**EKLER:**\n1. Fatura/fi� sureti\n2. �r�n foto�raflar�\n3. Yaz��ma �rnekleri\n\n{{TARIH}}\n{{BASVURAN_AD}}\n",
        "isPremium": false,
        "usageCount": 892
    },
    {
        "id": "16",
        "category": "Hukuk",
        "subcategory": "T�ketici Hukuku",
        "title": "T�ketici Mahkemesi Dava Dilek�esi",
        "description": "T�ketici uyu�mazl�klar� i�in dava dilek�esi",
        "icon": "Scale",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "T�ketici Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davac� Ad�",
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
                "label": "Davac� Adresi",
                "type": "textarea"
            },
            {
                "key": "DAVALI_AD",
                "label": "Daval� Firma",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "Daval� Adresi",
                "type": "textarea"
            },
            {
                "key": "DAVA_DEGERI",
                "label": "Dava De�eri (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "OLAY_ACIKLAMASI",
                "label": "Olay�n A��klamas�",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{MAHKEME}} BA�KANLI�INA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** T�ketici i�leminden kaynaklanan tazminat talebimizdir.\n\n**DAVA DE�ER�:** {{DAVA_DEGERI}} TL\n\n---\n\n## A�IKLAMALAR\n\n{{OLAY_ACIKLAMASI}}\n\n---\n\n## HUKUK� SEBEPLER\n\n- 6502 say�l� T�keticinin Korunmas� Hakk�nda Kanun\n- 6098 say�l� T�rk Bor�lar Kanunu\n\n---\n\n## DEL�LLER\n\n1. Fatura ve sat�� belgeleri\n2. S�zle�me �rnekleri\n3. Yaz��malar\n4. Tan�k beyanlar�\n5. Bilirki�i incelemesi\n\n---\n\n## SONU� VE �STEM\n\n1. {{DAVA_DEGERI}} TL'nin yasal faiziyle birlikte daval�dan tahsiline,\n2. Yarg�lama giderlerinin daval�ya y�kletilmesine,\n\nkarar verilmesini sayg�lar�mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 334
    },
    {
        "id": "17",
        "category": "Hukuk",
        "subcategory": "Ticaret Hukuku",
        "title": "Alacak Davas� Dilek�esi (Ticari)",
        "description": "Ticari alacak tahsili i�in dava dilek�esi",
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
                "label": "Davac� �irket/Ki�i",
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
                "label": "Daval� �irket/Ki�i",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "Daval� Adresi",
                "type": "textarea"
            },
            {
                "key": "ALACAK_TUTARI",
                "label": "Alacak Tutar� (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALACAK_KAYNAK",
                "label": "Alaca��n Kayna��",
                "type": "textarea",
                "required": true
            },
            {
                "key": "VADE_TARIHI",
                "label": "Vade Tarihi",
                "type": "date"
            }
        ],
        "content": "## {{MAHKEME}} BA�KANLI�INA\n\n**DAVACI:** {{DAVACI_AD}}\nVergi/TC No: {{DAVACI_VKN}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Alacak davas� hakk�ndad�r.\n\n**DAVA DE�ER�:** {{ALACAK_TUTARI}} TL\n\n---\n\n## A�IKLAMALAR\n\n1. M�vekkilim ile daval� aras�nda ticari ili�ki bulunmaktad�r.\n\n2. **Alaca��n Kayna��:**\n{{ALACAK_KAYNAK}}\n\n3. Vade tarihi: {{VADE_TARIHI}}\n\n4. T�m ihtarlara ra�men daval� borcunu �dememi�tir.\n\n---\n\n## HUKUK� SEBEPLER\n\n- 6102 say�l� T�rk Ticaret Kanunu\n- 6098 say�l� T�rk Bor�lar Kanunu\n\n---\n\n## DEL�LLER\n\n1. Faturalar\n2. S�zle�meler\n3. �rsaliyeler\n4. Banka kay�tlar�\n5. �htarname\n6. Ticari defterler\n\n---\n\n## SONU� VE �STEM\n\n1. {{ALACAK_TUTARI}} TL alaca��n vade tarihinden itibaren avans faiziyle birlikte daval�dan tahsiline,\n2. Yarg�lama giderlerinin daval�ya y�kletilmesine,\n\nkarar verilmesini sayg�lar�mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 445
    },
    {
        "id": "18",
        "category": "Hukuk",
        "subcategory": "Ticaret Hukuku",
        "title": "�htarname (�deme)",
        "description": "Ticari bor� i�in �deme ihtarnamesi",
        "icon": "Mail",
        "variables": [
            {
                "key": "NOTER",
                "label": "Noter",
                "type": "text",
                "placeholder": "�stanbul 5. Noterli�i"
            },
            {
                "key": "GONDEREN_AD",
                "label": "G�nderen (Alacakl�)",
                "type": "text",
                "required": true
            },
            {
                "key": "GONDEREN_ADRES",
                "label": "Alacakl� Adresi",
                "type": "textarea"
            },
            {
                "key": "MUHATAP_AD",
                "label": "Muhatap (Bor�lu)",
                "type": "text",
                "required": true
            },
            {
                "key": "MUHATAP_ADRES",
                "label": "Bor�lu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORC_TUTARI",
                "label": "Bor� Tutar� (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "BORC_KONUSU",
                "label": "Bor� Konusu",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ODEME_SURESI",
                "label": "�deme S�resi (G�n)",
                "type": "number",
                "placeholder": "7"
            }
        ],
        "content": "## �HTARNAME\n\n**Ke�ideci (�htar Eden):** {{GONDEREN_AD}}\nAdres: {{GONDEREN_ADRES}}\n\n**Muhatap (�htar Edilen):** {{MUHATAP_AD}}\nAdres: {{MUHATAP_ADRES}}\n\n---\n\n## �HTARIN KONUSU\n\nA�a��da belirtilen borcunuzun �denmesi hakk�ndad�r.\n\n---\n\n**Say�n {{MUHATAP_AD}},**\n\n**1.** Taraf�n�za a�a��da detaylar� verilen alaca��m�z bulunmaktad�r:\n\n**Bor� Konusu:** {{BORC_KONUSU}}\n\n**Bor� Tutar�:** {{BORC_TUTARI}} TL\n\n**2.** S�z konusu borcunuzu defalarca hat�rlatmam�za ra�men h�l� �demediniz.\n\n**3.** ��bu ihtarnamenin taraf�n�za tebli�inden itibaren **{{ODEME_SURESI}} g�n** i�inde yukar�da belirtilen borcunuzu �demenizi,\n\n**4.** Aksi takdirde aleyhinize yasal yollara (icra takibi ve/veya dava) ba�vurulaca��n�, bu durumda do�acak t�m masraf, faiz ve avukatl�k �cretlerinin taraf�n�zdan tahsil edilece�ini,\n\n**�HTAR EDER�M.**\n\n{{TARIH}}\n{{GONDEREN_AD}}\n\n---\n\n*Bu ihtarname noter kanal�yla tebli� edilmek �zere haz�rlanm��t�r.*\n",
        "isPremium": false,
        "usageCount": 723
    },
    {
        "id": "19",
        "category": "Hukuk",
        "subcategory": "Miras Hukuku",
        "title": "Miras��l�k Belgesi (Veraset �lam�) Talebi",
        "description": "Sulh hukuk mahkemesinden veraset ilam� talebi",
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
                "label": "Davac� (Miras��)",
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
                "label": "Murisin (�lenin) Ad�",
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
                "label": "�l�m Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "OLUM_YERI",
                "label": "�l�m Yeri",
                "type": "text"
            },
            {
                "key": "MIRASCILAR",
                "label": "Di�er Miras��lar",
                "type": "textarea"
            }
        ],
        "content": "## {{MAHKEME}} BA�KANLI�INA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**KONU:** Miras��l�k belgesi (veraset ilam�) verilmesi talebimdir.\n\n---\n\n## A�IKLAMALAR\n\n1. Muris **{{MURIS_AD}}** (TC: {{MURIS_TC}}) {{OLUM_TARIHI}} tarihinde {{OLUM_YERI}}'de vefat etmi�tir.\n\n2. Ben m�teveffan�n miras��s�y�m.\n\n3. Di�er miras��lar:\n{{MIRASCILAR}}\n\n4. M�teveffan�n terekesi �zerinde i�lem yapabilmek i�in miras��l�k belgesi al�nmas� gerekmektedir.\n\n---\n\n## HUKUK� SEBEPLER\n\n- 4721 say�l� T�rk Medeni Kanunu m.598 (Miras��l�k belgesi)\n\n---\n\n## DEL�LLER\n\n1. Veraset ve intikal vergisi beyannamesi\n2. N�fus kay�t �rne�i (muris ve miras��lar)\n3. �l�m belgesi\n4. Vukuatl� n�fus kay�t �rne�i\n\n---\n\n## SONU� VE �STEM\n\nM�teveffa {{MURIS_AD}}'in miras��lar�n� ve miras paylar�n� g�steren **M�RAS�ILIK BELGES�** verilmesini sayg�lar�mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 567
    },
    {
        "id": "20",
        "category": "Hukuk",
        "subcategory": "Miras Hukuku",
        "title": "Mirastan Feragat S�zle�mesi",
        "description": "Noterde d�zenlenecek mirastan feragat belgesi",
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
                "label": "Muris (Miras B�rakan)",
                "type": "text",
                "required": true
            },
            {
                "key": "BEDEL",
                "label": "Kar��l�k Bedel (varsa)",
                "type": "text"
            }
        ],
        "content": "## M�RASTAN FERAGAT S�ZLE�MES�\n\n**FERAGAT EDEN:**\nAd Soyad: {{FERAGAT_EDEN}}\nTC Kimlik No: {{FERAGAT_EDEN_TC}}\n\n**MUR�S:**\nAd Soyad: {{MURIS_AD}}\n\n---\n\n## BEYAN\n\nBen {{FERAGAT_EDEN}}, {{MURIS_AD}}'�n ileride ger�ekle�ecek �l�m� halinde terekesinden pay�ma d��ecek t�m miras haklar�ndan, TMK m.528 uyar�nca, a�a��daki �artlarla **FERAGAT ETT���M�** beyan ederim.\n\n**Kar��l�k:** {{BEDEL}}\n\n**Feragatin Kapsam�:** Tam feragat (hem kendim hem altsoyum ad�na)\n\nBu s�zle�me, murisin sa�l���nda, resmi �ekilde yap�lm�� olup, taraf�mca �zg�r iradeyle imzalanm��t�r.\n\n---\n\n## HUKUK� DAYANAK\n\n- 4721 say�l� T�rk Medeni Kanunu m.528 (Mirastan feragat s�zle�mesi)\n\n---\n\n{{TARIH}}\n\n**Feragat Eden:**\n{{FERAGAT_EDEN}}\n\n**Muris:**\n{{MURIS_AD}}\n\n---\n\n*Bu s�zle�me noter huzurunda d�zenleme �eklinde yap�lmal�d�r.*\n",
        "isPremium": true,
        "usageCount": 123
    },
    {
        "id": "21",
        "category": "�cra",
        "subcategory": "Tahsilat",
        "title": "Haricen Tahsil Bildirimi",
        "description": "�cra dosyas� d���nda yap�lan tahsilat�n bildirilmesi",
        "icon": "HandCoins",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "�cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacakl�", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Bor�lu", "type": "text", "required": true },
            { "key": "TAHSIL_TUTARI", "label": "Tahsil Edilen Tutar (TL)", "type": "number", "required": true },
            { "key": "TAHSIL_TARIHI", "label": "Tahsil Tarihi", "type": "date", "required": true },
            { "key": "KALAN_ALACAK", "label": "Kalan Alacak (varsa)", "type": "number" }
        ],
        "content": "## {{ICRA_DAIRESI}} M�D�RL���'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BOR�LU:** {{BORCLU_AD}}\n\n**KONU:** Haricen tahsil bildirimi\n\n---\n\n## A�IKLAMA\n\nM�d�rl���n�z�n yukar�da numaras� yaz�l� dosyas�nda takip edilen alaca��m�n bir k�sm�/tamam� bor�lu taraf�ndan **haricen (icra dairesi d���nda)** taraf�ma �denmi�tir.\n\n**TAHS�LAT B�LG�LER�:**\n\n| Bilgi | De�er |\n|-------|-------|\n| Tahsil Edilen Tutar | {{TAHSIL_TUTARI}} TL |\n| Tahsil Tarihi | {{TAHSIL_TARIHI}} |\n| Kalan Alacak | {{KALAN_ALACAK}} TL |\n\n---\n\n## TALEP\n\nYukar�da belirtilen haricen tahsilat�n dosyaya i�lenmesini ve dosyan�n buna g�re g�ncellenmesini talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1245
    },
    {
        "id": "22",
        "category": "�cra",
        "subcategory": "Dosya ��lemleri",
        "title": "Dosya Kapama (Takipten Vazge�me) Talebi",
        "description": "Alacakl�n�n takipten vazge�erek dosyay� kapatma talebi",
        "icon": "FolderX",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "�cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacakl�", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Bor�lu", "type": "text", "required": true },
            { "key": "VAZGECME_NEDENI", "label": "Vazge�me Nedeni", "type": "textarea" }
        ],
        "content": "## {{ICRA_DAIRESI}} M�D�RL���'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BOR�LU:** {{BORCLU_AD}}\n\n**KONU:** Takipten vazge�me ve dosyan�n kapat�lmas� talebi\n\n---\n\n## A�IKLAMA\n\nM�d�rl���n�z�n yukar�da numaras� yaz�l� dosyas�nda y�r�t�len icra takibinden **VAZGE��YORUM.**\n\n**Vazge�me Nedeni:** {{VAZGECME_NEDENI}}\n\n---\n\n## TALEP\n\n��K m.129 uyar�nca takipten vazge�ti�imi beyan eder, takibin durdurularak dosyan�n kapat�lmas�n� talep ederim.\n\n**Not:** Dosyadaki t�m hacizlerin kald�r�lmas�n� da talep ediyorum.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 876
    },
    {
        "id": "23",
        "category": "�cra",
        "subcategory": "Haciz",
        "title": "Maa� Haczi (Maa� Kesintisi) Talebi",
        "description": "Bor�lunun maa��na haciz konulmas� talebi",
        "icon": "Wallet",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "�cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacakl�", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Bor�lu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Bor�lu TC No", "type": "text", "required": true },
            { "key": "ISVEREN_AD", "label": "��veren/Kurum Ad�", "type": "text", "required": true },
            { "key": "ISVEREN_ADRES", "label": "��veren Adresi", "type": "textarea", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} M�D�RL���'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BOR�LU:** {{BORCLU_AD}} (TC: {{BORCLU_TC}})\n\n**KONU:** Maa� haczi (maa� kesintisi) talebi\n\n---\n\n## A�IKLAMA\n\nBor�lunun a�a��da belirtilen i�yerinde �al��t��� tespit edilmi�tir:\n\n**��VEREN B�LG�LER�:**\n- **Kurum/�irket:** {{ISVEREN_AD}}\n- **Adres:** {{ISVEREN_ADRES}}\n\n---\n\n## TALEP\n\n��K m.83 ve m.355 uyar�nca;\n\n1. Bor�lunun maa� ve �cretinin **1/4'�n�n** haciz kesintisi yap�larak dosyaya g�nderilmesi i�in ilgili i�verene **maa� haczi m�zekkeresi** yaz�lmas�n�,\n\n2. Kesinti yap�l�ncaya kadar i�verene sorumluluk bildiriminde bulunulmas�n�,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1567
    },
    {
        "id": "24",
        "category": "�cra",
        "subcategory": "Haciz",
        "title": "Ta��nmaz (Gayrimenkul) Haczi Talebi",
        "description": "Bor�lunun ta��nmaz�na haciz �erhi konulmas� talebi",
        "icon": "Home",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "�cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacakl�", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Bor�lu", "type": "text", "required": true },
            { "key": "TASINMAZ_BILGI", "label": "Ta��nmaz Bilgileri (�l/�l�e/Ada/Parsel)", "type": "textarea", "required": true },
            { "key": "TAPU_MUDURLUGU", "label": "Tapu M�d�rl���", "type": "text", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} M�D�RL���'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BOR�LU:** {{BORCLU_AD}}\n\n**KONU:** Ta��nmaz haczi talebi\n\n---\n\n## A�IKLAMA\n\nBor�lunun a�a��da belirtilen ta��nmaz/ta��nmazlar �zerinde m�lkiyeti bulunmaktad�r:\n\n**TA�INMAZ B�LG�LER�:**\n{{TASINMAZ_BILGI}}\n\n**�LG�L� TAPU M�D�RL���:** {{TAPU_MUDURLUGU}}\n\n---\n\n## TALEP\n\n��K m.79 ve m.91 uyar�nca;\n\n1. Yukar�da belirtilen ta��nmaz/ta��nmazlar �zerine **HAC�Z �ERH�** konulmas� i�in ilgili Tapu M�d�rl���'ne m�zekkere yaz�lmas�n�,\n\n2. Haciz �erhinin tapu kayd�na i�lenmesini,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 934
    },
    {
        "id": "25",
        "category": "�cra",
        "subcategory": "Haciz",
        "title": "Haciz Fekki (Haciz Kald�rma) Talebi - Alacakl�",
        "description": "Alacakl�n�n haczi kald�rma talebi",
        "icon": "KeyRound",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "�cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacakl�", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Bor�lu", "type": "text", "required": true },
            { "key": "HACIZLI_MAL", "label": "Haczin Kald�r�laca�� Mal/Kay�t", "type": "textarea", "required": true },
            { "key": "FEKK_NEDENI", "label": "Haciz Fekki Nedeni", "type": "textarea" }
        ],
        "content": "## {{ICRA_DAIRESI}} M�D�RL���'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BOR�LU:** {{BORCLU_AD}}\n\n**KONU:** Haciz fekki (haciz kald�rma) talebi\n\n---\n\n## A�IKLAMA\n\nM�d�rl���n�z�n yukar�da numaras� yaz�l� dosyas�nda bor�luya ait a�a��daki mal/kay�t �zerine haciz konulmu�tur:\n\n**HAC�ZL� MAL/KAYIT:**\n{{HACIZLI_MAL}}\n\n**HAC�Z FEKK� NEDEN�:**\n{{FEKK_NEDENI}}\n\n---\n\n## TALEP\n\nYukar�da belirtilen mal/kay�t �zerindeki haczin **FEKK�N� (KALDIRILMASINI)** ve ilgili kurumlara haciz fekki m�zekkeresi yaz�lmas�n� talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1123
    },
    {
        "id": "26",
        "category": "�cra",
        "subcategory": "Mal Beyan�",
        "title": "Mal Beyan� Talepli �deme Emri Talebi",
        "description": "Bor�ludan mal beyan� istenmesi talebi",
        "icon": "ClipboardList",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "�cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacakl�", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Bor�lu", "type": "text", "required": true },
            { "key": "BORCLU_ADRES", "label": "Bor�lu Adresi", "type": "textarea", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} M�D�RL���'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BOR�LU:** {{BORCLU_AD}}\nAdres: {{BORCLU_ADRES}}\n\n**KONU:** Mal beyan� talebinde bulunulmas�\n\n---\n\n## A�IKLAMA\n\nM�d�rl���n�z�n yukar�da numaras� yaz�l� dosyas�nda bor�luya g�nderilen �deme emri tebli� edilmi�, ancak bor�lu �deme yapmam�� ve itirazda da bulunmam��t�r.\n\n---\n\n## TALEP\n\n��K m.74 uyar�nca;\n\n1. Bor�luya **MAL BEYANI** i�in davetiye ��kar�lmas�n�,\n\n2. Bor�lunun mal beyan�nda bulunmamas� veya ger�e�e ayk�r� beyanda bulunmas� halinde ��K m.337 kapsam�nda �ikayet hakk�m�n sakl� tutulmas�n�,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 789
    },
    {
        "id": "27",
        "category": "�cra",
        "subcategory": "Ara�",
        "title": "Ara� Haczi Talebi",
        "description": "Bor�lunun arac�na haciz konulmas� talebi",
        "icon": "Car",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "�cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacakl�", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Bor�lu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Bor�lu TC No", "type": "text", "required": true },
            { "key": "ARAC_PLAKA", "label": "Ara� Plakas� (biliniyorsa)", "type": "text" }
        ],
        "content": "## {{ICRA_DAIRESI}} M�D�RL���'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BOR�LU:** {{BORCLU_AD}} (TC: {{BORCLU_TC}})\n\n**KONU:** Ara� haczi talebi\n\n---\n\n## TALEP\n\nBor�lunun ad�na kay�tl� ara�/ara�lar �zerine haciz konulmas� i�in;\n\n1. **Emniyet Genel M�d�rl��� Trafik Ba�kanl���'na** (EGM) haciz m�zekkeresi yaz�lmas�n�,\n\n2. Bor�lu ad�na kay�tl� t�m ara�lar�n tespit edilmesini ve haciz �erhi konulmas�n�,\n\n3. Yakalama �erhi konulmas�n�,\n\ntalep ederim.\n\n**Bilinen Ara� Plakas� (varsa):** {{ARAC_PLAKA}}\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1456
    },
    {
        "id": "28",
        "category": "�cra",
        "subcategory": "Banka",
        "title": "Banka Hesab� Haczi Talebi",
        "description": "Bor�lunun banka hesaplar�na haciz konulmas�",
        "icon": "Landmark",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "�cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacakl�", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Bor�lu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Bor�lu TC/VKN", "type": "text", "required": true },
            { "key": "BANKA_ADI", "label": "Banka Ad� (biliniyorsa)", "type": "text" }
        ],
        "content": "## {{ICRA_DAIRESI}} M�D�RL���'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BOR�LU:** {{BORCLU_AD}} (TC/VKN: {{BORCLU_TC}})\n\n**KONU:** Banka hesaplar�na haciz talebi\n\n---\n\n## TALEP\n\nBor�lunun banka hesaplar�na haciz konulmas� i�in;\n\n1. **T�m bankalara** (UYAP �zerinden toplu) haciz m�zekkeresi g�nderilmesini,\n\n2. Bor�lunun t�m banka hesaplar�ndaki mevduat�n haczedilmesini,\n\n3. Haczedilen tutarlar�n dosyaya aktar�lmas�n�,\n\ntalep ederim.\n\n**Bilinen Banka (varsa):** {{BANKA_ADI}}\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
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

const MOJIBAKE_DETECTION = /[���]/;

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
        return res.status(404).json({ error: '�ablon bulunamad�' });
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
        return res.status(404).json({ error: '�ablon bulunamad�' });
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







