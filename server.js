import express from 'express';
import 'dotenv/config';
import htmlToDocx from 'html-to-docx';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';
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
    getLegalDocumentViaMcp,
    getLegalSources,
    searchLegalDecisionsViaMcp,
} from './lib/legal/mcpLegalSearch.js';
import {
    cancelStripeSubscriptionForUser,
    constructStripeWebhookEvent,
    createStripeCheckoutSession,
    normalizePaidPlan,
    parseRequestBody,
    processStripeWebhookEvent
} from './lib/api/stripeCheckout.js';

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

const compactLegalKeywordQuery = (keyword = '', maxLen = 180) => {
    const normalized = String(keyword || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > maxLen ? normalized.slice(0, maxLen).trim() : normalized;
};

const buildStrictBedestenQuery = (keyword = '') => {
    const compacted = compactLegalKeywordQuery(keyword, 180);
    return compacted.split(/\s+/).length >= 2 ? compacted : '';
};

const searchEmsalFallback = async (keyword = '') => {
    const payload = await searchLegalDecisionsViaMcp({
        source: 'all',
        keyword,
        rawQuery: keyword,
        filters: {},
    });

    return {
        results: Array.isArray(payload?.results) ? payload.results : [],
    };
};

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
            console.error('Validation errors for ' + req.path + ':', errors.array());
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
    skip: (req) => req.method === 'GET' && String(req.path || '').startsWith('/api/templates'),
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
app.use('/api/gemini/analyze', express.json({ limit: process.env.ANALYZE_JSON_BODY_LIMIT || process.env.UPLOAD_JSON_BODY_LIMIT || '40mb' }));
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
        details.caseTitle && `Dava Başlığı / Konu: ${details.caseTitle}`,
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
    'de', 'da', 'mi', 'mu', 'mı', 'mü', 'ki', 'ya', 'yada', 'hem',
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
        const safeUploadedFiles = Array.isArray(uploadedFiles) ? uploadedFiles : [];
        console.warn('Analyze Request Received');

        const model = AI_CONFIG.MODEL_NAME;
        const systemInstruction = `Sen Türk hukukunda uzmanlaşmış bir hukuk asistanısın. Görevin, sağlanan belgeleri, resimleri ve metinleri titizlikle analiz etmektir. Temel bilgileri çıkar, tüm potansiyel tarafları (şahıslar, şirketler) belirle ve eğer varsa dava künye bilgilerini (mahkeme adı, dosya/esas no, karar no, karar tarihi) tespit et. Ayrıca belgelerden avukat/vekil bilgilerini (isim, baro, baro sicil no, adres, telefon, email) ve diğer iletişim bilgilerini çıkar. Çıktını JSON nesnesi olarak yapılandır. Analiz özetinin her zaman Türkçe olmasını sağla.`;

        const promptText = `
Lütfen sana gönderilen PDF belgelerini, resim dosyalarını ve aşağıdaki metin olarak sağlanan UDF ve Word belgelerinin içeriğini titizlikle analiz et.

**ANA GÖREVLER:**
1. Olayın detaylı ve Türkçe bir özetini oluştur. **ÖZETİ MUTLAKA PARAGRAFLARA BÖLEREK YAZ (paragraflar arasında '\\n\\n' boşlukları bırak)**, tek parça blok yazı kesinlikle kullanma.
2. Metinde adı geçen tüm potansiyel tarafları listele.
3. Dava künye bilgilerini çıkar (mahkeme, dosya numarası, karar numarası, karar tarihi).
4. **ÖNEMLİ:** Avukat/vekil bilgilerini bul ve çıkar:
   - Avukat adı soyadı (genellikle "Av." veya "Avukat" ile başlar)
   - Baro adı ("... Barosu" formatında)
   - Baro sicil numarası
   - İş adresi
   - Telefon numarası
   - Email adresi
5. Diğer iletişim bilgilerini çıkar (tarafların adres, telefon, email bilgileri).

**UDF Belge İçerikleri:**
${udfTextContent || "UDF belgesi yüklenmedi."}

**Word Belge İçerikleri:**
${wordTextContent || "Word belgesi yüklenmedi."}

**ÇIKTI FORMATI:**
Sonucu 'summary', 'potentialParties', 'caseDetails', 'lawyerInfo' ve 'contactInfo' anahtarlarına sahip bir JSON nesnesi olarak döndür.
 
**EK KURAL:**
- Yuklenen PDF taranmis/goruntu tabanli ise gorunen metni OCR mantigi ile oku.
- Metin secilemiyor olsa bile yazilari, muhurlari, imzalari, tablo basliklarini ve sayfa ustbilgilerini dikkate al.
`;

        const fileSummaries = safeUploadedFiles
            .map((file, index) => {
                const fileName = String(file?.name || `Belge ${index + 1}`).trim() || `Belge ${index + 1}`;
                const mimeType = String(file?.mimeType || 'bilinmeyen').trim() || 'bilinmeyen';
                const scannedHint = /pdf/i.test(mimeType)
                    ? 'Taranmış/görüntü tabanlı PDF olabilir; OCR ile oku.'
                    : /^image\//i.test(mimeType)
                        ? 'Görsel belge; görünen metni ve düzeni incele.'
                        : '';
                return `- ${fileName} (${mimeType})${scannedHint ? ` - ${scannedHint}` : ''}`;
            })
            .join('\n');

        const contentParts = [
            { text: promptText },
            ...(fileSummaries ? [{ text: `Yüklenen dosyalar:\n${fileSummaries}\n` }] : []),
            ...safeUploadedFiles.map(file => ({
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
                        summary: { type: Type.STRING, description: 'Belgelerin detaylı Türkçe özeti.' },
                        potentialParties: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Benzersiz potansiyel taraf isimlerinin listesi.' },
                        caseDetails: {
                            type: Type.OBJECT,
                            properties: {
                                caseTitle: { type: Type.STRING },
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
        console.warn('Analyze Response Ready', {
            uploadedFileCount: safeUploadedFiles.length,
            udfLength: String(udfTextContent || '').length,
            wordLength: String(wordTextContent || '').length,
            responseTextLength: String(response.text || '').length,
        });
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
        const systemInstruction = `Sen Türk Hukuku alanında uzman, stratejik bir araştırma asistanısın. Görevin, verilen vaka özetini analiz ederek, kullanıcının '${userRole}' olan rolünü hukuki olarak en güçlü konuma getirecek anahtar kelimeleri belirlemektir. Oluşturacağın anahtar kelimeler, kullanıcının lehine olan Yargıtay kararlarını, mevzuatı ve hukuki argümanları bulmaya odaklanmalıdır. Çıktı olarak sadece 'keywords' anahtarını içeren ve bu anahtarın değerinin bir string dizisi olduğu bir JSON nesnesi döndür.`;
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
        res.status(500).json({ error: getSafeErrorMessage(error, 'Metin yeniden yazilamadi.') });
    }
});

// 3. Web Search - Enhanced for Yargitay Decisions
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
Görevin özellikle Yargıtay kararları bulmak ve bunları dilekçede kullanılabilir formatta sunmaktır.

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

        // Generate search queries for Yargitay and legislation
        const yargitayQueries = searchTerms.map(kw => `"${kw}" Yargıtay karar emsal`);
        const mevzuatQueries = searchTerms.map(kw => `"${kw}" kanun maddesi hüküm`);
        const uyapQueries = searchTerms.map(kw => `"${kw}" site:karararama.yargitay.gov.tr`);

        const promptText = `
## ARAMA GÖREVİ: YARGITAY KARARLARI VE MEVZUAT

Aşağıdaki konularda kapsamlı bir hukuki araştırma yap:

### ANAHTAR KELİMELER
${searchTerms.join(', ')}

### ARAMA STRATEJİSİ

**1. Yargıtay Kararları (öncelikli)**
${yargitayQueries.map(q => `- ${q}`).join('\n')}

**2. UYAP Karar Arama**
${uyapQueries.map(q => `- ${q}`).join('\n')}

**3. Mevzuat Araması**
${mevzuatQueries.map(q => `- ${q}`).join('\n')}

---

## BEKLENTİLER

1. **En az 3-5 Yargıtay kararı** bul (mümkünse)
2. Her karar için tam künyesini yaz (Daire, E., K., Tarih)
3. İlgili kanun maddelerini listele
4. Araştırma özetini hazırla

⚠️ ÖNEMLİ: Karar künyelerini doğru ve eksiksiz yaz. Bu bilgiler dilekçede referans olarak kullanılacak.
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

        const systemInstruction = `Sen, Türk hukuk sisteminde 20+ yıl deneyime sahip, üst düzey bir hukuk danışmanı ve dilekçe yazım uzmanısın.

## SENİN GÖREVİN
Sağlanan ham verileri, profesyonel ve ikna edici bir hukuki anlatıya dönüştürmek. Ham bilgileri olduğu gibi kopyalamak değil, bunları hukuki bir dil ve mantıksal akış içinde sentezlemek.

## KRİTİK YAZIM KURALLARI

### 1. AÇIKLAMALAR BÖLÜMÜ NASIL YAZILMALI
❌ YANLIŞ (Ham veri dökümü):
"Davalı kurum tarafından müvekkil HÜSEYİN ÇELİK adına 'kaçak elektrik tahakkuk hesap detayı' düzenlenmiş olup, bu belge müvekkilime tebliğ edilmiştir. İşbu tahakkukta, müvekkilimin Tesisat No (4004311180), Müşteri No (205539133), TC Kimlik No (41038011064)..."

✅ DOĞRU (Profesyonel hukuki anlatı):
"1. Müvekkilim, davalı kurumun abonesi olup, söz konusu taşınmazda ikamet etmektedir.

2. Davalı kurum, müvekkilim aleyhine "kaçak elektrik kullanımı" iddiasıyla tahakkuk işlemi başlatmış ve 25.275,55 TL tutarında borç çıkarmıştır.

3. Yapılan incelemede, müvekkilimin sayacının (Seri No: CE000624281) herhangi bir müdahale izine rastlanmamış olup, iddia edilen kaçak kullanım tespiti usulsüz bir şekilde gerçekleştirilmiştir.

4. Şöyle ki; [olay detayları kronolojik sırayla anlatılmalı]..."

### 2. ⚠️ EMSAL KARARLARIN KULLANIMI (ÇOK ÖNEMLİ)
Yargıtay/Danıştay kararları sadece "HUKUKİ SEBEPLER" bölümüne listelenmemeli.

❌ YANLIŞ (Sadece listeleme):
"## HUKUKİ SEBEPLER
- Yargıtay 9. HD., E. 2023/1234, K. 2023/5678
- Yargıtay 3. HD., E. 2022/5678, K. 2022/9999"

✅ DOĞRU (İlgili argümanla entegre):
"## AÇIKLAMALAR
...
4. Davalı kurumun iddia ettiği kaçak elektrik kullanımının somut delilleri bulunmamaktadır. Nitekim Yargıtay 3. Hukuk Dairesi'nin E. 2022/5678, K. 2022/9999, T. 15.03.2023 tarihli kararında: 'Kaçak elektrik kullanımı iddiasının ispatı davalıya aittir. Sayaç mührü üzerinde herhangi bir müdahale izi tespit edilememişse kaçak elektrik kullanımından söz edilemez' şeklinde hükmedilmiştir. Somut olayda da sayaçta herhangi bir müdahale izi tespit edilememiştir.

5. Ayrıca tahakkuk edilen miktar da fahiştir. Yargıtay 3. HD., E. 2021/4567 kararında da belirtildiği üzere, 'Tüketim miktarının belirlenmesinde gerçek tüketim değerleri esas alınmalıdır.'
..."

### 3. BÖLÜM YAPISI (Kesin sıra)
Her dilekçede şu bölümler mutlaka bulunmalı ve bu sırayla yazılmalı:

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

Aşağıdaki ham verileri kullanarak profesyonel bir Türk hukuk dilekçesi hazırla.

⚠️ ÖNEMLİ: Ham verileri olduğu gibi kopyalama. Bunları hukuki bir anlatıya dönüştür.

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
1. Profesyonel, ikna edici bir hukuki anlatı oluştur.
2. Her bölümü (AÇIKLAMALAR, HUKUKİ SEBEPLER, DELİLLER, SONUÇ VE İSTEM) ayrı ayrı formatla.
3. Numaralı maddelerde akıcı paragraflar kullan, ham veri listesi yazma.
4. Mahkemeye sunulmaya hazır, resmi bir dilekçe formatında yaz.
5. Markdown formatını kullan (## başlıklar, **kalın**, 1. 2. 3. listeler).
6. ⚠️ EMSAL KARARLARI: Yargıtay kararlarını ilgili argümanla birlikte AÇIKLAMALAR bölümünde kullan. "Nitekim Yargıtay X. HD., E. .../..., K. .../... kararında '...' şeklinde hükmedilmiştir" formatında entegre et.
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

const CHAT_VISIBLE_LEGAL_RESULT_LIMIT = 5;
const CHAT_LEGAL_SUMMARY_PREVIEW_CHARS = 480;

const truncateChatSearchText = (value = '', maxLen = CHAT_LEGAL_SUMMARY_PREVIEW_CHARS) => {
    const raw = String(value || '').replace(/\s+/g, ' ').trim();
    if (!raw || raw.length <= maxLen) return raw;
    return `${raw.slice(0, Math.max(0, maxLen - 3)).trim()}...`;
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
        const isDocumentGenerationRequest = isLikelyDocumentGenerationRequest(latestUserMessage);
        const userRequestedLegalSearch = safeContext?.allowLegalSearch === true || isExplicitLegalSearchRequest(latestUserMessage);
        const allowSearchYargitayTool = isDocumentGenerationRequest || userRequestedLegalSearch;
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

        if (isDocumentGenerationRequest) {
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
**MEVCUT DURUM VE BAĞLAM:**
- **Vaka Özeti:** ${analysisSummary || "Henüz analiz yapılmadı."}
- **Mevcut Arama Anahtar Kelimeleri:** ${safeContext.keywords || "Henüz anahtar kelime oluşturulmadı."}
- **Web Araştırma Özeti:** ${safeContext.searchSummary || "Henüz web araştırması yapılmadı."}
- **Emsal Karar Özeti:** ${safeContext.legalSummary || "Henüz emsal karar özeti sağlanmadı."}
- **Kullanıcının Ek Metinleri:** ${safeContext.docContent || "Ek metin sağlanmadı."}
- **Kullanıcının Özel Talimatları:** ${safeContext.specifics || "Özel talimat sağlanmadı."}
- **RAG Destek Baglami:** ${ragContext || "RAG baglami bulunamadi."}
- **Sistem Tarihi (Europe/Istanbul):** ${systemDateIstanbul}
- **Sistem Saati (Europe/Istanbul):** ${systemTimeIstanbul}
- **UTC Zaman Damgasi:** ${systemUtcIso}
${requestFiles.length > 0 ? `- **Yüklenen Belgeler:** ${requestFiles.length} adet dosya yüklendi (${requestFiles.map(f => f.name).join(', ')})` : ''}
`;

        const systemInstruction = `Sen, Türk Hukuku konusunda uzman, yardımsever ve proaktif bir hukuk asistanısın.

**SENİN GÖREVLERİN:**
1. Kullanıcının hukuki sorularını yanıtlamak
2. Dava stratejisi konusunda beyin fırtınası yapmak
3. Hukuki terimleri açıklamak
4. **BELGE ANALİZİ:** Kullanıcı dosya yüklediğinde, bu dosyaları analiz et ve sorularını yanıtla
5. **ÖNEMLİ:** Kullanıcı belge/dilekçe/talep hazırlamanı istediğinde, generate_document fonksiyonunu kullan
6. **KRİTİK:** Kullanıcı Yargıtay kararı/emsal karar araması istediğinde, gerçek bir web araması yap

**BELGE ANALİZİ KURALLARI:**
Kullanıcı dosya yüklediğinde:
- PDF veya resim dosyalarını dikkatlice incele
- İçeriği özetle ve anahtar bilgileri çıkar
- Hukuki açıdan önemli noktaları vurgula
- Kullanıcının sorularını belge içeriğine göre yanıtla

**YARGITAY KARARI ARAMA KURALLARI:**
Kullanıcı sorusunu önce analiz et; sadece gerekliyse gerçek bir web araması yap:
- "Yargıtay kararı ara", "emsal karar bul", "içtihat araştır"
- "Bu konuda Yargıtay ne diyor?", "Yargıtay kararlarını bul"
- "Karar künyesi ver", "emsal karar listele"

Arama yaparken:
1. Mevcut bağlamdaki anahtar kelimeleri kullan
2. "site:karararama.yargitay.gov.tr" veya "Yargıtay" anahtar kelimesi ekle
3. Bulunan kararların tam künyesini ver (Daire, Esas No, Karar No, Tarih)
4. Her karar için kısa bir özet yaz

**ÇIKTI FORMATI (Yargıtay Araması):**
### BULUNAN YARGITAY KARARLARI

**1. Yargıtay X. HD., E. XXXX/XXXX, K. XXXX/XXXX, T. XX.XX.XXXX**
Özet: [Karar özeti]
Kaynak: [URL varsa]

**2. ...**

**BELGE TALEBİ TESPİT KURALLARI:**
Kullanıcı şunları söylediğinde generate_document fonksiyonunu mutlaka çağır:
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
${allowSearchYargitayTool
                ? 'Kullanıcı açıkça emsal/içtihat talep ettiğinde search_yargitay fonksiyonunu kullan.'
                : 'Kullanıcı talep etmedikçe search_yargitay fonksiyonunu çağırma.'}


Türkçe yanıt ver. Soruyu önce analiz et; tanım/genel sorularda aramayı zorunlu tutma ve kısa mevzuat cevabı ver. Uygulama/uyuşmazlık sorularında gerekli gördüğünde arama yap. Tarih/saat sorularında, bağlamdaki sistem tarih-saat bilgisini esas al.`;

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
        // Function for searching Yargitay decisions
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

        const functionDeclarations = [updateKeywordsFunction, generateDocumentFunction];
        if (allowSearchYargitayTool) {
            functionDeclarations.push(searchYargitayFunction);
        }

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
                tools: [{ functionDeclarations }],
            },
        });

        // Setup streaming response
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const pendingFunctionCalls = [];
        let streamBlockedByQuota = false;
        let stopStreamAfterFunctionCall = false;

        for await (const chunk of responseStream) {
            // Check for function calls
            const candidate = chunk.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.functionCall) {
                        stopStreamAfterFunctionCall = true;
                    }
                    if (part.functionCall && part.functionCall.name === 'search_yargitay' && allowSearchYargitayTool) {
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

            // Gemini may leave the stream open after emitting a function call while
            // waiting for tool results we do not provide in this route. End the turn
            // as soon as the function call is delivered so the client can continue.
            if (stopStreamAfterFunctionCall) {
                break;
            }
        }

        if (streamBlockedByQuota) {
            res.end();
            return;
        }

        // If there were search_yargitay function calls, execute a single consolidated legal search
        if (pendingFunctionCalls.length > 0) {
            try {
                const rawSearchParts = [];
                for (const fc of pendingFunctionCalls) {
                    const args = fc?.args && typeof fc.args === 'object' ? fc.args : {};
                    if (typeof args.searchQuery === 'string' && args.searchQuery.trim()) {
                        rawSearchParts.push(args.searchQuery.trim());
                    }
                    if (Array.isArray(args.keywords)) {
                        for (const keyword of args.keywords) {
                            if (typeof keyword === 'string' && keyword.trim()) {
                                rawSearchParts.push(keyword.trim());
                            }
                        }
                    }
                }

                const combinedSearchText = rawSearchParts.join(' ').trim() || latestUserMessage || '';
                const strictSearchQuery = buildStrictBedestenQuery(combinedSearchText);
                const compactSearchQuery = compactLegalKeywordQuery(combinedSearchText, 180);
                const searchQuery = strictSearchQuery || compactSearchQuery || combinedSearchText;

                console.warn(`[LEGAL_SEARCH] consolidated legal search: "${searchQuery}"`);

                const searchResult = await searchEmsalFallback(searchQuery);
                const visibleResults = Array.isArray(searchResult.results)
                    ? searchResult.results.slice(0, CHAT_VISIBLE_LEGAL_RESULT_LIMIT)
                    : [];
                const hiddenCount = Math.max(0, (searchResult.results?.length || 0) - visibleResults.length);

                let formattedResults = '\n\n### BULUNAN EMSAL KARARLAR\n\n';
                if (visibleResults.length > 0) {
                    visibleResults.forEach((result, index) => {
                        formattedResults += `**${index + 1}. ${result.title || 'Emsal Karar'}**\n`;
                        if (result.esasNo) formattedResults += `E. ${result.esasNo} `;
                        if (result.kararNo) formattedResults += `K. ${result.kararNo} `;
                        if (result.tarih) formattedResults += `T. ${result.tarih}`;
                        formattedResults += '\n';
                        if (result.ozet) formattedResults += `Ozet: ${truncateChatSearchText(result.ozet)}\n\n`;
                    });
                    if (hiddenCount > 0) {
                        formattedResults += `+ ${hiddenCount} ek karar bulundu. Tam liste baglama eklendi.\n`;
                    }
                } else {
                    formattedResults += 'Bu konuda emsal karar bulunamadi.\n';
                }

                const resultChunk = {
                    text: formattedResults,
                    functionCallResults: true,
                    searchResults: searchResult.results || []
                };
                res.write(JSON.stringify(resultChunk) + '\n');
            } catch (searchError) {
                console.error('Legal search error in chat:', searchError);
                const errorChunk = { text: '\n\nEmsal karar aramasi sirasinda bir hata olustu.\n' };
                res.write(JSON.stringify(errorChunk) + '\n');
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
    const text = String(rawMessage || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i');
    const hasDocumentIntent = /\b(dilekce|sozlesme|ihtarname|belge|taslak|metin|talep)\b/i.test(text);
    const hasGenerationVerb = /\b(olustur|uret|hazirla|yaz)\b/i.test(text);
    return hasDocumentIntent && hasGenerationVerb;
};

const hasSearchOptOutIntent = (rawMessage = '') => {
    const text = String(rawMessage || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i');
    if (!text) return false;
    return /(arama|arastirma|ictihat|emsal|yargitay|danistay|web|internet).*(yapma|istemiyorum|olmasin|gerek yok|gerekli degil|yapmayin)|\b(yapma|istemiyorum|olmasin|gerek yok|gerekli degil|yapmayin).*(arama|arastirma|ictihat|emsal|yargitay|danistay|web|internet)\b/i.test(text);
};

const isExplicitLegalSearchRequest = (rawMessage = '') => {
    const text = String(rawMessage || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i');
    if (!text || hasSearchOptOutIntent(text)) return false;

    const hasLegalToken = /\b(emsal|ictihat|yargitay|danistay|karar no|esas no|karar ara)\b/i.test(text);
    const hasSearchVerb = /\b(ara|arama|arastir|arastirma|bul|getir|goster|listele|paylas)\b/i.test(text);
    const hasLookupQuestion = /\b(var mi|ne diyor|ornek)\b/i.test(text);
    return hasLegalToken && (hasSearchVerb || hasLookupQuestion);
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

const buildDefaultPlanUsageSummary = (userId) => {
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    return {
        user_id: userId,
        plan_code: 'trial',
        status: 'active',
        daily_limit: TRIAL_DAILY_GENERATION_LIMIT,
        used_today: 0,
        remaining_today: TRIAL_DAILY_GENERATION_LIMIT,
        trial_starts_at: now.toISOString(),
        trial_ends_at: trialEndsAt,
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
        res.status(500).json({ error: getSafeErrorMessage(error, 'Dilekce gozden gecirilemedi.') });
    }
});

// ============================================
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
        .isLength({ min: 2, max: 5000 })
        .withMessage('Arama kelimesi (keyword) 2-5000 karakter arasinda olmalidir.'),
    body('filters')
        .optional()
        .isObject()
        .withMessage('filters bir nesne olmalidir.'),
]), async (req, res) => {
    try {
        await getAuthenticatedUserFromRequest(req);
        const { source, keyword, rawQuery, filters = {} } = req.body;
        const payload = await searchLegalDecisionsViaMcp({
            source,
            keyword,
            rawQuery,
            filters,
        });
        res.json(payload);
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
        const payload = await getLegalDocumentViaMcp(req.body || {});
        res.json(payload);
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
    res.json(getLegalSources());
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
        title: 'Boï¿½anma Davasï¿½ Dilekï¿½esi',
        description: 'Anlaï¿½malï¿½ veya ï¿½ekiï¿½meli boï¿½anma davalarï¿½ iï¿½in temel dilekï¿½e ï¿½ablonu',
        icon: 'HeartCrack',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Adï¿½', type: 'text', placeholder: 'ï¿½rn: ï¿½stanbul Anadolu 5. Aile Mahkemesi', required: true },
            { key: 'DAVACI_AD', label: 'Davacï¿½ Adï¿½ Soyadï¿½', type: 'text', placeholder: 'ï¿½rn: Ayï¿½e YILMAZ', required: true },
            { key: 'DAVACI_TC', label: 'Davacï¿½ TC Kimlik No', type: 'text', placeholder: 'ï¿½rn: 12345678901', required: true },
            { key: 'DAVACI_ADRES', label: 'Davacï¿½ Adresi', type: 'textarea', placeholder: 'ï¿½rn: Atatï¿½rk Mah. Cumhuriyet Cad. No:15/3 Kadï¿½kï¿½y/ï¿½stanbul' },
            { key: 'DAVACI_VEKIL_AD', label: 'Davacï¿½ Vekili (Avukat)', type: 'text', placeholder: 'ï¿½rn: Av. Mehmet KAYA' },
            { key: 'DAVACI_VEKIL_BARO', label: 'Baro Sicil No', type: 'text', placeholder: 'ï¿½rn: ï¿½stanbul Barosu 54321' },
            { key: 'DAVALI_AD', label: 'Davalï¿½ Adï¿½ Soyadï¿½', type: 'text', placeholder: 'ï¿½rn: Ali YILMAZ', required: true },
            { key: 'DAVALI_TC', label: 'Davalï¿½ TC Kimlik No', type: 'text', placeholder: 'ï¿½rn: 98765432109' },
            { key: 'DAVALI_ADRES', label: 'Davalï¿½ Adresi', type: 'textarea', placeholder: 'ï¿½rn: Bahï¿½elievler Mah. ï¿½nï¿½nï¿½ Sok. No:7 Bakï¿½rkï¿½y/ï¿½stanbul' },
            { key: 'EVLILIK_TARIHI', label: 'Evlilik Tarihi', type: 'date', required: true },
            { key: 'EVLILIK_YERI', label: 'Evlenme Yeri', type: 'text', placeholder: 'ï¿½rn: Kadï¿½kï¿½y Evlendirme Dairesi' },
            { key: 'COCUK_BILGI', label: 'Mï¿½ï¿½terek ï¿½ocuk Bilgileri (varsa)', type: 'textarea', placeholder: 'ï¿½rn: 1. Zeynep YILMAZ (D: 01.01.2015, TC: 11122233344)' },
            { key: 'BOSANMA_SEBEPLERI', label: 'Boï¿½anma Sebepleri', type: 'textarea', placeholder: 'ï¿½iddetli geï¿½imsizlik, evlilik birliï¿½inin temelinden sarsï¿½lmasï¿½...', required: true },
            { key: 'NAFAKA_TALEP', label: 'Nafaka Talebi (TL/ay)', type: 'number', placeholder: 'ï¿½rn: 5000' },
            { key: 'VELAYET_TALEP', label: 'Velayet Talebi', type: 'text', placeholder: 'ï¿½rn: Mï¿½ï¿½terek ï¿½ocuklarï¿½n velayetinin davacï¿½ anneye verilmesi' },
        ],
        content: `{{MAHKEME}} BAï¿½KANLIï¿½INA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}
Adres: {{DAVACI_ADRES}}

**VEKï¿½Lï¿½:** {{DAVACI_VEKIL_AD}}
{{DAVACI_VEKIL_BARO}}

**DAVALI:** {{DAVALI_AD}}
TC Kimlik No: {{DAVALI_TC}}
Adres: {{DAVALI_ADRES}}

**KONU:** Boï¿½anma davasï¿½ hakkï¿½ndadï¿½r.

---

**Aï¿½IKLAMALAR:**

1. Mï¿½vekkilim ile davalï¿½ {{EVLILIK_TARIHI}} tarihinde {{EVLILIK_YERI}}'de evlenmiï¿½lerdir.

2. Taraflarï¿½n bu evlilikten doï¿½an mï¿½ï¿½terek ï¿½ocuklarï¿½:
{{COCUK_BILGI}}

3. {{BOSANMA_SEBEPLERI}}

4. Evlilik birliï¿½inin temelinden sarsï¿½lmasï¿½ nedeniyle taraflar arasï¿½ndaki evliliï¿½in devamï¿½ mï¿½mkï¿½n deï¿½ildir. Ortak hayatï¿½n yeniden kurulmasï¿½ ihtimali bulunmamaktadï¿½r.

---

**HUKUKï¿½ SEBEPLER:**

- 4721 sayï¿½lï¿½ Tï¿½rk Medeni Kanunu m.166 (Evlilik birliï¿½inin sarsï¿½lmasï¿½)
- 4721 sayï¿½lï¿½ Tï¿½rk Medeni Kanunu m.169 (Boï¿½anmada velayet)
- 4721 sayï¿½lï¿½ Tï¿½rk Medeni Kanunu m.175 (Yoksulluk nafakasï¿½)
- 4721 sayï¿½lï¿½ Tï¿½rk Medeni Kanunu m.182 (ï¿½ocuk nafakasï¿½)

---

**DELï¿½LLER:**

1. Nï¿½fus kayï¿½t ï¿½rneï¿½i
2. Vukuatlï¿½ nï¿½fus kayï¿½t ï¿½rneï¿½i
3. Evlilik cï¿½zdanï¿½ sureti
4. Tanï¿½k beyanlarï¿½
5. Ekonomik durum araï¿½tï¿½rmasï¿½
6. Her tï¿½rlï¿½ yasal delil

---

**SONUï¿½ VE ï¿½STEM:**

Yukarï¿½da arz ve izah edilen sebeplerle;

1. Taraflarï¿½n TMK m.166 uyarï¿½nca BOï¿½ANMALARINA,
2. Mï¿½ï¿½terek ï¿½ocuklarï¿½n velayetinin davacï¿½ tarafa verilmesine ({{VELAYET_TALEP}}),
3. Davalï¿½nï¿½n aylï¿½k {{NAFAKA_TALEP}} TL iï¿½tirak nafakasï¿½ ï¿½demesine,
4. Yargï¿½lama giderlerinin davalï¿½ya yï¿½kletilmesine,

karar verilmesini vekaleten saygï¿½larï¿½mla arz ve talep ederim. {{TARIH}}

Davacï¿½ Vekili
{{DAVACI_VEKIL_AD}}
`,
        isPremium: false,
        usageCount: 156
    },
    {
        id: '2',
        category: 'Hukuk',
        subcategory: 'Borï¿½lar Hukuku',
        title: 'Tazminat Davasï¿½ Dilekï¿½esi',
        description: 'Maddi ve manevi tazminat talepli dava dilekï¿½esi',
        icon: 'Banknote',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Adï¿½', type: 'text', placeholder: 'Asliye Hukuk Mahkemesi' },
            { key: 'DAVACI_AD', label: 'Davacï¿½ Adï¿½ Soyadï¿½', type: 'text', required: true },
            { key: 'DAVACI_TC', label: 'Davacï¿½ TC No', type: 'text', required: true },
            { key: 'DAVALI_AD', label: 'Davalï¿½/Kurum Adï¿½', type: 'text', required: true },
            { key: 'OLAY_TARIHI', label: 'Olay Tarihi', type: 'date', required: true },
            { key: 'OLAY_ACIKLAMASI', label: 'Olayï¿½n Aï¿½ï¿½klamasï¿½', type: 'textarea', required: true },
            { key: 'MADDI_TAZMINAT', label: 'Maddi Tazminat Tutarï¿½ (TL)', type: 'number' },
            { key: 'MANEVI_TAZMINAT', label: 'Manevi Tazminat Tutarï¿½ (TL)', type: 'number' },
        ],
        content: `{{MAHKEME}} BAï¿½KANLIï¿½INA

**DAVACI:** {{DAVACI_AD}}
TC Kimlik No: {{DAVACI_TC}}

**DAVALI:** {{DAVALI_AD}}

**KONU:** Maddi ve manevi tazminat talepli dava dilekï¿½esidir.

**DAVA DEï¿½ERï¿½:** {{MADDI_TAZMINAT}} TL (Maddi) + {{MANEVI_TAZMINAT}} TL (Manevi)

---

**Aï¿½IKLAMALAR:**

1. {{OLAY_TARIHI}} tarihinde aï¿½aï¿½ï¿½da aï¿½ï¿½klanan olay meydana gelmiï¿½tir.

2. {{OLAY_ACIKLAMASI}}

3. Bu olay nedeniyle mï¿½vekkilim maddi ve manevi zarara uï¿½ramï¿½ï¿½tï¿½r. Zararï¿½n tazmini iï¿½in iï¿½bu dava aï¿½ï¿½lmï¿½ï¿½tï¿½r.

---

**HUKUKï¿½ SEBEPLER:**

- 6098 sayï¿½lï¿½ Tï¿½rk Borï¿½lar Kanunu m.49-76 (Haksï¿½z fiil)
- 6098 sayï¿½lï¿½ Tï¿½rk Borï¿½lar Kanunu m.56 (Manevi tazminat)

---

**DELï¿½LLER:**

1. Olay tutanaklarï¿½
2. Fatura ve belgeler
3. Tanï¿½k beyanlarï¿½
4. Bilirkiï¿½i incelemesi
5. Her tï¿½rlï¿½ yasal delil

---

**SONUï¿½ VE ï¿½STEM:**

1. {{MADDI_TAZMINAT}} TL MADDï¿½ TAZMï¿½NATIN olay tarihinden itibaren iï¿½leyecek yasal faiziyle birlikte davalï¿½dan tahsiline,
2. {{MANEVI_TAZMINAT}} TL MANEVï¿½ TAZMï¿½NATIN davalï¿½dan tahsiline,
3. Yargï¿½lama giderlerinin davalï¿½ya yï¿½kletilmesine,

karar verilmesini saygï¿½larï¿½mla arz ve talep ederim. {{TARIH}}

Davacï¿½
{{DAVACI_AD}}
`,
        isPremium: false,
        usageCount: 203
    },
    {
        id: '3',
        category: 'ï¿½cra',
        subcategory: 'ï¿½cra Takibi',
        title: 'ï¿½cra Takibine ï¿½tiraz Dilekï¿½esi',
        description: 'Haksï¿½z icra takibine karï¿½ï¿½ itiraz dilekï¿½esi',
        icon: 'Gavel',
        variables: [
            { key: 'ICRA_MUDURLUGU', label: 'ï¿½cra Mï¿½dï¿½rlï¿½ï¿½ï¿½', type: 'text', required: true },
            { key: 'DOSYA_NO', label: 'ï¿½cra Dosya No', type: 'text', required: true },
            { key: 'BORCLU_AD', label: 'Borï¿½lu Adï¿½ Soyadï¿½', type: 'text', required: true },
            { key: 'ALACAKLI_AD', label: 'Alacaklï¿½ Adï¿½', type: 'text', required: true },
            { key: 'ITIRAZ_SEBEPLERI', label: 'ï¿½tiraz Sebepleri', type: 'textarea', required: true },
        ],
        content: `## {{ICRA_MUDURLUGU}}'NE

**DOSYA NO:** {{DOSYA_NO}}

**BORï¿½LU (ï¿½Tï¿½RAZ EDEN):** {{BORCLU_AD}}

**ALACAKLI:** {{ALACAKLI_AD}}

**KONU:** ï¿½deme emrine itirazï¿½mï¿½z hakkï¿½ndadï¿½r.

---

## Aï¿½IKLAMALAR

1. Mï¿½dï¿½rlï¿½ï¿½ï¿½nï¿½zce yï¿½rï¿½tï¿½len {{DOSYA_NO}} sayï¿½lï¿½ icra takip dosyasï¿½nda tarafï¿½ma ï¿½deme emri tebliï¿½ edilmiï¿½tir.

2. {{ITIRAZ_SEBEPLERI}}

3. Yukarï¿½da aï¿½ï¿½klanan nedenlerle sï¿½z konusu borca itiraz etme zorunluluï¿½u doï¿½muï¿½tur.

---

## HUKUKï¿½ SEBEPLER

- 2004 sayï¿½lï¿½ ï¿½cra ve ï¿½flas Kanunu m.62 (ï¿½tiraz)
- 2004 sayï¿½lï¿½ ï¿½cra ve ï¿½flas Kanunu m.66 (ï¿½tirazï¿½n hï¿½kï¿½mleri)

---

## SONUï¿½ VE ï¿½STEM

Yukarï¿½da aï¿½ï¿½klanan sebeplerle;

1. BORCA ï¿½Tï¿½RAZ EDï¿½YORUM,
2. Takibin durdurulmasï¿½na,

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
        title: 'Kira Tahliye Davasï¿½ Dilekï¿½esi',
        description: 'Kiracï¿½nï¿½n tahliyesi iï¿½in dava dilekï¿½esi',
        icon: 'Home',
        variables: [
            { key: 'MAHKEME', label: 'Mahkeme Adï¿½', type: 'text', placeholder: 'Sulh Hukuk Mahkemesi' },
            { key: 'KIRAYA_VEREN', label: 'Kiraya Veren Adï¿½', type: 'text', required: true },
            { key: 'KIRACI', label: 'Kiracï¿½ Adï¿½', type: 'text', required: true },
            { key: 'TASINMAZ_ADRES', label: 'Taï¿½ï¿½nmaz Adresi', type: 'textarea', required: true },
            { key: 'KIRA_BEDELI', label: 'Aylï¿½k Kira Bedeli', type: 'number' },
            { key: 'TAHLIYE_SEBEBI', label: 'Tahliye Sebebi', type: 'textarea', required: true },
        ],
        content: `## {{MAHKEME}} BAï¿½KANLIï¿½INA

**DAVACI (Kï¿½RAYA VEREN):** {{KIRAYA_VEREN}}

**DAVALI (Kï¿½RACI):** {{KIRACI}}

**KONU:** Kiralananï¿½n tahliyesi talebimiz hakkï¿½ndadï¿½r.

---

## Aï¿½IKLAMALAR

1. Davalï¿½, aï¿½aï¿½ï¿½da adresi belirtilen taï¿½ï¿½nmazda kiracï¿½ olarak ikamet etmektedir:
   **Adres:** {{TASINMAZ_ADRES}}

2. Aylï¿½k kira bedeli {{KIRA_BEDELI}} TL olarak belirlenmiï¿½tir.

3. {{TAHLIYE_SEBEBI}}

4. Bu nedenlerle taï¿½ï¿½nmazï¿½n tahliyesi gerekmektedir.

---

## HUKUKï¿½ SEBEPLER

- 6098 sayï¿½lï¿½ Tï¿½rk Borï¿½lar Kanunu m.347-356 (Kira sï¿½zleï¿½mesi)
- 6098 sayï¿½lï¿½ Tï¿½rk Borï¿½lar Kanunu m.352 (Kiracï¿½nï¿½n temerrï¿½dï¿½)

---

## DELï¿½LLER

1. Kira sï¿½zleï¿½mesi
2. ï¿½htar belgeleri
3. ï¿½deme kayï¿½tlarï¿½
4. Tanï¿½k beyanlarï¿½

---

## SONUï¿½ VE ï¿½STEM

1. Kiralananï¿½n TAHLï¿½YESï¿½NE,
2. Birikmiï¿½ kira bedellerinin tahsiline,
3. Yargï¿½lama giderlerinin davalï¿½ya yï¿½kletilmesine,

karar verilmesini saygï¿½larï¿½mla arz ve talep ederim.

{{TARIH}}
{{KIRAYA_VEREN}}
`,
        isPremium: false,
        usageCount: 178
    },
    {
        id: '5',
        category: 'ï¿½dari',
        subcategory: 'ï¿½ptal Davasï¿½',
        title: 'ï¿½dari ï¿½ï¿½lemin ï¿½ptali Davasï¿½',
        description: 'Hukuka aykï¿½rï¿½ idari iï¿½lemlerin iptali iï¿½in dava dilekï¿½esi',
        icon: 'Building2',
        variables: [
            { key: 'IDARE_MAHKEMESI', label: 'ï¿½dare Mahkemesi', type: 'text', placeholder: 'ï¿½stanbul ï¿½dare Mahkemesi' },
            { key: 'DAVACI_AD', label: 'Davacï¿½ Adï¿½', type: 'text', required: true },
            { key: 'DAVALI_IDARE', label: 'Davalï¿½ ï¿½dare', type: 'text', required: true },
            { key: 'ISLEM_TARIHI', label: 'ï¿½ï¿½lem Tarihi', type: 'date', required: true },
            { key: 'ISLEM_KONUSU', label: 'ï¿½ptali ï¿½stenen ï¿½ï¿½lem', type: 'textarea', required: true },
            { key: 'HUKUKA_AYKIRILIK', label: 'Hukuka Aykï¿½rï¿½lï¿½k Nedenleri', type: 'textarea', required: true },
        ],
        content: `## {{IDARE_MAHKEMESI}} BAï¿½KANLIï¿½INA

**DAVACI:** {{DAVACI_AD}}

**DAVALI:** {{DAVALI_IDARE}}

**KONU:** ï¿½dari iï¿½lemin iptali talebimiz hakkï¿½ndadï¿½r.

**ï¿½PTALï¿½ ï¿½STENEN ï¿½ï¿½LEM:** {{ISLEM_KONUSU}}
**ï¿½ï¿½LEM TARï¿½Hï¿½:** {{ISLEM_TARIHI}}

---

## Aï¿½IKLAMALAR

1. Davalï¿½ idare tarafï¿½ndan {{ISLEM_TARIHI}} tarihinde tesis edilen iï¿½lem hukuka aykï¿½rï¿½dï¿½r.

2. {{HUKUKA_AYKIRILIK}}

3. Sï¿½z konusu iï¿½lem telafisi gï¿½ï¿½ zararlara neden olmaktadï¿½r.

---

## HUKUKï¿½ SEBEPLER

- 2577 sayï¿½lï¿½ ï¿½dari Yargï¿½lama Usulï¿½ Kanunu
- Anayasa m.125 (Yargï¿½ yolu)
- ï¿½lgili mevzuat hï¿½kï¿½mleri

---

## SONUï¿½ VE ï¿½STEM

1. Dava konusu idari iï¿½lemin ï¿½PTALï¿½NE,
2. Yï¿½rï¿½tmenin durdurulmasï¿½na,
3. Yargï¿½lama giderlerinin davalï¿½ya yï¿½kletilmesine,

karar verilmesini saygï¿½larï¿½mla arz ve talep ederim.

{{TARIH}}
{{DAVACI_AD}}
`,
        isPremium: true,
        usageCount: 89
    },
    {
        id: '6',
        category: 'Ceza',
        subcategory: 'ï¿½ikayet',
        title: 'Suï¿½ Duyurusu Dilekï¿½esi',
        description: 'Cumhuriyet Savcï¿½lï¿½ï¿½ï¿½na suï¿½ duyurusu dilekï¿½esi',
        icon: 'Siren',
        variables: [
            { key: 'SAVCILIK', label: 'Cumhuriyet Baï¿½savcï¿½lï¿½ï¿½ï¿½', type: 'text', required: true },
            { key: 'SIKAYET_EDEN', label: 'ï¿½ikayet Eden (Mï¿½ï¿½teki)', type: 'text', required: true },
            { key: 'SUPHELI', label: 'ï¿½ï¿½pheli', type: 'text', required: true },
            { key: 'SUC_TARIHI', label: 'Suï¿½ Tarihi', type: 'date', required: true },
            { key: 'SUC_KONUSU', label: 'Suï¿½ Konusu Olay', type: 'textarea', required: true },
            { key: 'ISTENEN_CEZA', label: 'Talep Edilen ï¿½ï¿½lem', type: 'textarea' },
        ],
        content: `## {{SAVCILIK}}'NA

**ï¿½ï¿½KAYET EDEN (Mï¿½ï¿½TEKï¿½):** {{SIKAYET_EDEN}}

**ï¿½ï¿½PHELï¿½:** {{SUPHELI}}

**SUï¿½ TARï¿½Hï¿½:** {{SUC_TARIHI}}

**KONU:** Suï¿½ duyurusu hakkï¿½ndadï¿½r.

---

## Aï¿½IKLAMALAR

1. {{SUC_TARIHI}} tarihinde aï¿½aï¿½ï¿½da aï¿½ï¿½klanan olay meydana gelmiï¿½tir:

2. {{SUC_KONUSU}}

3. Bu eylemler Tï¿½rk Ceza Kanunu kapsamï¿½nda suï¿½ teï¿½kil etmektedir.

---

## SUï¿½ VE CEZA

- ï¿½lgili Tï¿½rk Ceza Kanunu maddeleri
- Cezai yaptï¿½rï¿½m talep edilmektedir

---

## DELï¿½LLER

1. Olay tutanaklarï¿½
2. Gï¿½rï¿½ntï¿½/Ses kayï¿½tlarï¿½
3. Tanï¿½k beyanlarï¿½
4. Diï¿½er deliller

---

## SONUï¿½ VE ï¿½STEM

1. {{ISTENEN_CEZA}}

ï¿½ï¿½phelinin yakalanarak cezalandï¿½rï¿½lmasï¿½ iï¿½in gerekli soruï¿½turmanï¿½n yapï¿½lmasï¿½nï¿½ saygï¿½larï¿½mla arz ve talep ederim.

{{TARIH}}
{{SIKAYET_EDEN}}
`,
        isPremium: false,
        usageCount: 245
    }
    ,
    {
        "id": "7",
        "category": "ï¿½cra",
        "subcategory": "ï¿½cra Takibi",
        "title": "ï¿½lamsï¿½z ï¿½cra Takip Talebi",
        "description": "Genel haciz yoluyla ilamsï¿½z icra takibi baï¿½latma talebi",
        "icon": "Gavel",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "ï¿½cra Dairesi",
                "type": "text",
                "required": true,
                "placeholder": "ï¿½stanbul 1. ï¿½cra Dairesi"
            },
            {
                "key": "ALACAKLI_AD",
                "label": "Alacaklï¿½ Adï¿½ Soyadï¿½",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_TC",
                "label": "Alacaklï¿½ TC No",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_ADRES",
                "label": "Alacaklï¿½ Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Borï¿½lu Adï¿½ Soyadï¿½",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_TC",
                "label": "Borï¿½lu TC No",
                "type": "text"
            },
            {
                "key": "BORCLU_ADRES",
                "label": "Borï¿½lu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ALACAK_TUTARI",
                "label": "Alacak Tutarï¿½ (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALACAK_NEDENI",
                "label": "Alacaï¿½ï¿½n Nedeni",
                "type": "textarea",
                "required": true
            },
            {
                "key": "VADE_TARIHI",
                "label": "Vade Tarihi",
                "type": "date"
            }
        ],
        "content": "## {{ICRA_DAIRESI}}'NE\n\n## TAKï¿½P TALEBï¿½\n\n**ALACAKLI:** {{ALACAKLI_AD}}\nTC Kimlik No: {{ALACAKLI_TC}}\nAdres: {{ALACAKLI_ADRES}}\n\n**BORï¿½LU:** {{BORCLU_AD}}\nTC Kimlik No: {{BORCLU_TC}}\nAdres: {{BORCLU_ADRES}}\n\n---\n\n**TAKï¿½P KONUSU ALACAK:**\n\n| Aï¿½ï¿½klama | Tutar |\n|----------|-------|\n| Asï¿½l Alacak | {{ALACAK_TUTARI}} TL |\n| Faiz (Vade Tarihinden ï¿½tibaren) | Hesaplanacak |\n| **TOPLAM** | {{ALACAK_TUTARI}} TL + Faiz |\n\n**ALACAï¿½IN NEDENï¿½:** {{ALACAK_NEDENI}}\n\n**VADE TARï¿½Hï¿½:** {{VADE_TARIHI}}\n\n---\n\n## TALEP\n\nYukarï¿½da belirtilen alacaï¿½ï¿½mï¿½n tahsili iï¿½in borï¿½lu aleyhine **genel haciz yoluyla ilamsï¿½z icra takibi** baï¿½latï¿½lmasï¿½nï¿½ talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 523
    },
    {
        "id": "8",
        "category": "ï¿½cra",
        "subcategory": "ï¿½cra Takibi",
        "title": "Kambiyo Senedi ï¿½cra Takibi",
        "description": "ï¿½ek, senet veya poliï¿½e ile icra takibi baï¿½latma",
        "icon": "Receipt",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "ï¿½cra Dairesi",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_AD",
                "label": "Alacaklï¿½ Adï¿½",
                "type": "text",
                "required": true
            },
            {
                "key": "ALACAKLI_ADRES",
                "label": "Alacaklï¿½ Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Borï¿½lu Adï¿½",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_ADRES",
                "label": "Borï¿½lu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "SENET_TURU",
                "label": "Senet Tï¿½rï¿½",
                "type": "text",
                "placeholder": "Bono / ï¿½ek / Poliï¿½e"
            },
            {
                "key": "SENET_TARIHI",
                "label": "Senet Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "SENET_TUTARI",
                "label": "Senet Tutarï¿½ (TL)",
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
        "content": "## {{ICRA_DAIRESI}}'NE\n\n## KAMBï¿½YO SENETLERï¿½NE MAHSUS HACï¿½Z YOLUYLA TAKï¿½P TALEBï¿½\n\n**ALACAKLI:** {{ALACAKLI_AD}}\nAdres: {{ALACAKLI_ADRES}}\n\n**BORï¿½LU:** {{BORCLU_AD}}\nAdres: {{BORCLU_ADRES}}\n\n---\n\n**TAKï¿½BE KONU KAMBï¿½YO SENEDï¿½:**\n\n| Bilgi | Deï¿½er |\n|-------|-------|\n| Senet Tï¿½rï¿½ | {{SENET_TURU}} |\n| Dï¿½zenleme Tarihi | {{SENET_TARIHI}} |\n| Vade Tarihi | {{VADE_TARIHI}} |\n| Senet Tutarï¿½ | {{SENET_TUTARI}} TL |\n\n---\n\n## TALEP\n\nEkte sunulan kambiyo senedine dayalï¿½ olarak, ï¿½ï¿½K m.167 ve devamï¿½ maddeleri uyarï¿½nca borï¿½lu aleyhine **kambiyo senetlerine mahsus haciz yoluyla takip** baï¿½latï¿½lmasï¿½nï¿½ talep ederim.\n\n**EKLER:**\n1. Kambiyo senedi aslï¿½\n2. Protesto belgesi (varsa)\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 412
    },
    {
        "id": "9",
        "category": "ï¿½cra",
        "subcategory": "ï¿½cra ï¿½tiraz",
        "title": "Borca ï¿½tiraz Dilekï¿½esi",
        "description": "ï¿½cra takibine karï¿½ï¿½ borca itiraz",
        "icon": "ShieldX",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "ï¿½cra Dairesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "ï¿½cra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "BORCLU_AD",
                "label": "Borï¿½lu (ï¿½tiraz Eden)",
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
                "label": "Alacaklï¿½",
                "type": "text",
                "required": true
            },
            {
                "key": "ITIRAZ_NEDENI",
                "label": "ï¿½tiraz Nedeni",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_DAIRESI}}'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ï¿½Tï¿½RAZ EDEN (BORï¿½LU):** {{BORCLU_AD}}\nTC Kimlik No: {{BORCLU_TC}}\nAdres: {{BORCLU_ADRES}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**KONU:** ï¿½deme emrine itirazï¿½mdï¿½r.\n\n---\n\n## Aï¿½IKLAMALAR\n\n1. Mï¿½dï¿½rlï¿½ï¿½ï¿½nï¿½zï¿½n yukarï¿½da numarasï¿½ yazï¿½lï¿½ dosyasï¿½ndan tarafï¿½ma ï¿½deme emri tebliï¿½ edilmiï¿½tir.\n\n2. **ï¿½Tï¿½RAZ NEDENï¿½M:**\n{{ITIRAZ_NEDENI}}\n\n3. Bu nedenlerle sï¿½z konusu takibe sï¿½resinde itiraz ediyorum.\n\n---\n\n## HUKUKï¿½ DAYANAK\n\n- 2004 sayï¿½lï¿½ ï¿½cra ve ï¿½flas Kanunu m.62 (ï¿½tiraz)\n- 2004 sayï¿½lï¿½ ï¿½cra ve ï¿½flas Kanunu m.66 (ï¿½tirazï¿½n hï¿½kï¿½mleri)\n\n---\n\n## SONUï¿½ VE ï¿½STEM\n\n**BORCA ï¿½Tï¿½RAZ EDï¿½YORUM.**\n\nTakibin durdurulmasï¿½nï¿½ saygï¿½larï¿½mla arz ve talep ederim.\n\n{{TARIH}}\n{{BORCLU_AD}}\n",
        "isPremium": false,
        "usageCount": 678
    },
    {
        "id": "10",
        "category": "ï¿½cra",
        "subcategory": "ï¿½cra ï¿½tiraz",
        "title": "ï¿½mzaya ï¿½tiraz Dilekï¿½esi",
        "description": "Kambiyo senedindeki imzaya itiraz",
        "icon": "PenOff",
        "variables": [
            {
                "key": "ICRA_MAHKEMESI",
                "label": "ï¿½cra Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "ï¿½cra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacï¿½ (Borï¿½lu)",
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
                "label": "Davalï¿½ (Alacaklï¿½)",
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
        "content": "## {{ICRA_MAHKEMESI}} BAï¿½KANLIï¿½INA\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**DAVACI (BORï¿½LU):** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI (ALACAKLI):** {{DAVALI_AD}}\n\n**KONU:** Kambiyo senedindeki imzaya itiraz hakkï¿½ndadï¿½r.\n\n---\n\n## Aï¿½IKLAMALAR\n\n1. Davalï¿½ tarafï¿½ndan aleyhime baï¿½latï¿½lan icra takibinde dayanak gï¿½sterilen senedin bilgileri aï¿½aï¿½ï¿½daki gibidir:\n{{SENET_BILGI}}\n\n2. **Sï¿½z konusu senetteki imza tarafï¿½ma ait deï¿½ildir.**\n\n3. Senedin altï¿½ndaki imza ile benim gerï¿½ek imzam arasï¿½nda aï¿½ï¿½k fark bulunmakta olup, bu husus bilirkiï¿½i incelemesiyle de ortaya konulacaktï¿½r.\n\n---\n\n## HUKUKï¿½ SEBEPLER\n\n- 2004 sayï¿½lï¿½ ï¿½cra ve ï¿½flas Kanunu m.170 (ï¿½mzaya itiraz)\n- 6100 sayï¿½lï¿½ HMK m.211 (ï¿½mza incelemesi)\n\n---\n\n## DELï¿½LLER\n\n1. ï¿½cra dosyasï¿½\n2. Senet aslï¿½\n3. ï¿½mza ï¿½rnekleri\n4. Bilirkiï¿½i incelemesi\n5. Nï¿½fus kayï¿½t ï¿½rneï¿½i\n\n---\n\n## SONUï¿½ VE ï¿½STEM\n\n1. **Senetteki imzanï¿½n tarafï¿½ma ait olmadï¿½ï¿½ï¿½nï¿½n tespitine,**\n2. ï¿½cra takibinin iptaline,\n3. %20 oranï¿½nda kï¿½tï¿½niyet tazminatï¿½na hï¿½kmedilmesine,\n4. Yargï¿½lama giderlerinin davalï¿½ya yï¿½kletilmesine,\n\nkarar verilmesini saygï¿½larï¿½mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 234
    },
    {
        "id": "11",
        "category": "ï¿½cra",
        "subcategory": "Haciz",
        "title": "Haciz Kaldï¿½rma Talebi",
        "description": "Haczedilen mal ï¿½zerindeki haczin kaldï¿½rï¿½lmasï¿½ talebi",
        "icon": "Unlock",
        "variables": [
            {
                "key": "ICRA_DAIRESI",
                "label": "ï¿½cra Dairesi",
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
                "label": "Haczedilen Mal/Eï¿½ya",
                "type": "textarea",
                "required": true
            },
            {
                "key": "KALDIRMA_NEDENI",
                "label": "Haczin Kaldï¿½rï¿½lma Nedeni",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_DAIRESI}} Mï¿½Dï¿½RLï¿½ï¿½ï¿½'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**TALEP EDEN:** {{TALEP_EDEN}}\n\n**KONU:** Haciz kaldï¿½rma talebimdir.\n\n---\n\n## Aï¿½IKLAMALAR\n\n1. Mï¿½dï¿½rlï¿½ï¿½ï¿½nï¿½zï¿½n yukarï¿½da numarasï¿½ yazï¿½lï¿½ dosyasï¿½nda aï¿½aï¿½ï¿½da belirtilen mal/eï¿½ya ï¿½zerine haciz konulmuï¿½tur:\n\n**HACZEDï¿½LEN MAL/Eï¿½YA:**\n{{HACIZLI_MAL}}\n\n2. **HACZï¿½N KALDIRILMASI GEREKï¿½ESï¿½:**\n{{KALDIRMA_NEDENI}}\n\n---\n\n## HUKUKï¿½ DAYANAK\n\n- 2004 sayï¿½lï¿½ ï¿½cra ve ï¿½flas Kanunu m.82 (Haczedilemezlik)\n- 2004 sayï¿½lï¿½ ï¿½cra ve ï¿½flas Kanunu m.85 (Taï¿½ï¿½nï¿½r haczi)\n\n---\n\n## SONUï¿½ VE ï¿½STEM\n\nYukarï¿½da aï¿½ï¿½klanan nedenlerle, sï¿½z konusu mal/eï¿½ya ï¿½zerindeki haczin kaldï¿½rï¿½lmasï¿½nï¿½ saygï¿½larï¿½mla talep ederim.\n\n{{TARIH}}\n{{TALEP_EDEN}}\n",
        "isPremium": false,
        "usageCount": 189
    },
    {
        "id": "12",
        "category": "ï¿½cra",
        "subcategory": "Haciz",
        "title": "ï¿½stihkak Davasï¿½ Dilekï¿½esi",
        "description": "Haczedilen malï¿½n ï¿½ï¿½ï¿½ncï¿½ kiï¿½iye ait olduï¿½unun tespiti",
        "icon": "FileWarning",
        "variables": [
            {
                "key": "ICRA_MAHKEMESI",
                "label": "ï¿½cra Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DOSYA_NO",
                "label": "ï¿½cra Dosya No",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacï¿½ (3. Kiï¿½i)",
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
                "label": "Davalï¿½ (Alacaklï¿½)",
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
                "label": "Mï¿½lkiyet Delilleri",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{ICRA_MAHKEMESI}} BAï¿½KANLIï¿½INA\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**DAVACI (3. Kï¿½ï¿½ï¿½):** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI (ALACAKLI):** {{DAVALI_AD}}\n\n**KONU:** ï¿½stihkak davasï¿½ hakkï¿½ndadï¿½r.\n\n---\n\n## Aï¿½IKLAMALAR\n\n1. Davalï¿½ tarafï¿½ndan yï¿½rï¿½tï¿½len icra takibinde, borï¿½lunun evinde/iï¿½yerinde yapï¿½lan haciz iï¿½lemi sï¿½rasï¿½nda **bana ait olan** aï¿½aï¿½ï¿½daki mal haczedilmiï¿½tir:\n\n**HACZEDï¿½LEN MAL:**\n{{HACIZLI_MAL}}\n\n2. **Bu mal bana aittir ve borï¿½lu ile hiï¿½bir ilgisi yoktur.**\n\n3. Mï¿½lkiyetimi ispatlayan deliller:\n{{MULKIYET_DELILI}}\n\n---\n\n## HUKUKï¿½ SEBEPLER\n\n- 2004 sayï¿½lï¿½ ï¿½cra ve ï¿½flas Kanunu m.96-99 (ï¿½stihkak davasï¿½)\n\n---\n\n## DELï¿½LLER\n\n1. Fatura ve satï¿½ï¿½ belgeleri\n2. Banka kayï¿½tlarï¿½\n3. Tanï¿½k beyanlarï¿½\n4. Bilirkiï¿½i incelemesi\n5. Diï¿½er yasal deliller\n\n---\n\n## SONUï¿½ VE ï¿½STEM\n\n1. **Haczedilen malï¿½n tarafï¿½ma ait olduï¿½unun tespitine,**\n2. Sï¿½z konusu mal ï¿½zerindeki haczin kaldï¿½rï¿½lmasï¿½na,\n3. Yargï¿½lama giderlerinin davalï¿½ya yï¿½kletilmesine,\n\nkarar verilmesini saygï¿½larï¿½mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 156
    },
    {
        "id": "13",
        "category": "ï¿½ï¿½ Hukuku",
        "subcategory": "ï¿½ï¿½e ï¿½ade",
        "title": "ï¿½ï¿½e ï¿½ade Davasï¿½ Dilekï¿½esi",
        "description": "Haksï¿½z fesih nedeniyle iï¿½e iade talebi",
        "icon": "UserCheck",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "ï¿½ï¿½ Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacï¿½ (ï¿½ï¿½ï¿½i)",
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
                "label": "Davalï¿½ (ï¿½ï¿½veren)",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "ï¿½ï¿½veren Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ISE_GIRIS_TARIHI",
                "label": "ï¿½ï¿½e Giriï¿½ Tarihi",
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
                "label": "Gï¿½revi/Pozisyonu",
                "type": "text",
                "required": true
            },
            {
                "key": "FESIH_GEREKCESI",
                "label": "ï¿½ï¿½verenin Fesih Gerekï¿½esi",
                "type": "textarea"
            }
        ],
        "content": "## {{MAHKEME}} BAï¿½KANLIï¿½INA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Feshin geï¿½ersizliï¿½i ve iï¿½e iade talebimizdir.\n\n---\n\n## Aï¿½IKLAMALAR\n\n1. Mï¿½vekkilim {{ISE_GIRIS_TARIHI}} tarihinden {{FESIH_TARIHI}} tarihine kadar davalï¿½ iï¿½yerinde **{{GOREV}}** olarak ï¿½alï¿½ï¿½mï¿½ï¿½tï¿½r.\n\n2. ï¿½ï¿½ sï¿½zleï¿½mesi {{FESIH_TARIHI}} tarihinde iï¿½veren tarafï¿½ndan **haksï¿½z ve geï¿½ersiz ï¿½ekilde** feshedilmiï¿½tir.\n\n3. ï¿½ï¿½verenin ileri sï¿½rdï¿½ï¿½ï¿½ fesih gerekï¿½esi:\n{{FESIH_GEREKCESI}}\n\n4. Bu gerekï¿½e gerï¿½eï¿½i yansï¿½tmamakta olup, fesih haksï¿½z ve geï¿½ersizdir.\n\n---\n\n## HUKUKï¿½ SEBEPLER\n\n- 4857 sayï¿½lï¿½ ï¿½ï¿½ Kanunu m.18 (Feshin geï¿½erli sebebe dayandï¿½rï¿½lmasï¿½)\n- 4857 sayï¿½lï¿½ ï¿½ï¿½ Kanunu m.20 (Fesih bildirimine itiraz)\n- 4857 sayï¿½lï¿½ ï¿½ï¿½ Kanunu m.21 (Geï¿½ersiz sebeple feshin sonuï¿½larï¿½)\n\n---\n\n## DELï¿½LLER\n\n1. ï¿½ï¿½ sï¿½zleï¿½mesi\n2. Bordro ve SGK kayï¿½tlarï¿½\n3. Fesih bildirimi\n4. Tanï¿½k beyanlarï¿½\n5. ï¿½ï¿½yeri dosyasï¿½\n\n---\n\n## SONUï¿½ VE ï¿½STEM\n\n1. **Feshin geï¿½ersizliï¿½ine ve iï¿½e iadeye,**\n2. ï¿½ï¿½e baï¿½latmama halinde 4-8 aylï¿½k brï¿½t ï¿½cret tutarï¿½nda tazminata,\n3. Boï¿½ta geï¿½en sï¿½re ï¿½cretinin (4 aya kadar) ï¿½denmesine,\n4. Yargï¿½lama giderlerinin davalï¿½ya yï¿½kletilmesine,\n\nkarar verilmesini saygï¿½larï¿½mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 445
    },
    {
        "id": "14",
        "category": "ï¿½ï¿½ Hukuku",
        "subcategory": "Tazminat",
        "title": "Kï¿½dem ve ï¿½hbar Tazminatï¿½ Davasï¿½",
        "description": "ï¿½ï¿½ akdi feshi sonrasï¿½ tazminat talebi",
        "icon": "Banknote",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "ï¿½ï¿½ Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacï¿½ (ï¿½ï¿½ï¿½i)",
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
                "label": "Davalï¿½ (ï¿½ï¿½veren)",
                "type": "text",
                "required": true
            },
            {
                "key": "ISE_GIRIS",
                "label": "ï¿½ï¿½e Giriï¿½ Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "CIKIS_TARIHI",
                "label": "ï¿½ï¿½ten ï¿½ï¿½kï¿½ï¿½ Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "SON_UCRET",
                "label": "Giydirilmiï¿½ Brï¿½t ï¿½cret (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "KIDEM_TAZMINATI",
                "label": "Kï¿½dem Tazminatï¿½ Talebi (TL)",
                "type": "number"
            },
            {
                "key": "IHBAR_TAZMINATI",
                "label": "ï¿½hbar Tazminatï¿½ Talebi (TL)",
                "type": "number"
            }
        ],
        "content": "## {{MAHKEME}} BAï¿½KANLIï¿½INA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\n\n**DAVALI:** {{DAVALI_AD}}\n\n**KONU:** Kï¿½dem ve ihbar tazminatï¿½ talebimizdir.\n\n**DAVA DEï¿½ERï¿½:** {{KIDEM_TAZMINATI}} TL + {{IHBAR_TAZMINATI}} TL\n\n---\n\n## Aï¿½IKLAMALAR\n\n1. Mï¿½vekkilim {{ISE_GIRIS}} - {{CIKIS_TARIHI}} tarihleri arasï¿½nda davalï¿½ iï¿½yerinde ï¿½alï¿½ï¿½mï¿½ï¿½tï¿½r.\n\n2. **Son aylï¿½k giydirilmiï¿½ brï¿½t ï¿½creti:** {{SON_UCRET}} TL\n\n3. ï¿½ï¿½ akdi iï¿½veren tarafï¿½ndan haksï¿½z olarak feshedilmiï¿½, ancak tazminatlarï¿½ ï¿½denmemiï¿½tir.\n\n---\n\n## TALEP EDï¿½LEN ALACAKLAR\n\n| Alacak Kalemi | Tutar |\n|---------------|-------|\n| Kï¿½dem Tazminatï¿½ | {{KIDEM_TAZMINATI}} TL |\n| ï¿½hbar Tazminatï¿½ | {{IHBAR_TAZMINATI}} TL |\n| **TOPLAM** | Hesaplanacak |\n\n---\n\n## HUKUKï¿½ SEBEPLER\n\n- 1475 sayï¿½lï¿½ ï¿½ï¿½ Kanunu m.14 (Kï¿½dem tazminatï¿½)\n- 4857 sayï¿½lï¿½ ï¿½ï¿½ Kanunu m.17 (Sï¿½reli fesih / ï¿½hbar)\n\n---\n\n## SONUï¿½ VE ï¿½STEM\n\n1. **{{KIDEM_TAZMINATI}} TL kï¿½dem tazminatï¿½nï¿½n** fesih tarihinden itibaren en yï¿½ksek mevduat faiziyle birlikte,\n2. **{{IHBAR_TAZMINATI}} TL ihbar tazminatï¿½nï¿½n** yasal faiziyle birlikte davalï¿½dan tahsiline,\n3. Yargï¿½lama giderlerinin davalï¿½ya yï¿½kletilmesine,\n\nkarar verilmesini saygï¿½larï¿½mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 567
    },
    {
        "id": "15",
        "category": "Hukuk",
        "subcategory": "Tï¿½ketici Hukuku",
        "title": "Tï¿½ketici Hakem Heyeti Baï¿½vurusu",
        "description": "Ayï¿½plï¿½ mal/hizmet iï¿½in tï¿½ketici hakem heyetine baï¿½vuru",
        "icon": "ShoppingCart",
        "variables": [
            {
                "key": "HAKEM_HEYETI",
                "label": "Tï¿½ketici Hakem Heyeti",
                "type": "text",
                "required": true
            },
            {
                "key": "BASVURAN_AD",
                "label": "Baï¿½vuran Adï¿½",
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
                "label": "Satï¿½cï¿½/Firma Adï¿½",
                "type": "text",
                "required": true
            },
            {
                "key": "SATICI_ADRES",
                "label": "Satï¿½cï¿½ Adresi",
                "type": "textarea"
            },
            {
                "key": "URUN_ADI",
                "label": "ï¿½rï¿½n/Hizmet Adï¿½",
                "type": "text",
                "required": true
            },
            {
                "key": "SATIN_ALMA_TARIHI",
                "label": "Satï¿½n Alma Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "URUN_BEDELI",
                "label": "ï¿½rï¿½n Bedeli (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "SIKAYET_KONUSU",
                "label": "ï¿½ikayet Konusu",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{HAKEM_HEYETI}}'NE\n\n## Tï¿½KETï¿½Cï¿½ ï¿½ï¿½KAYET BAï¿½VURUSU\n\n**BAï¿½VURAN (Tï¿½KETï¿½Cï¿½):**\nAd Soyad: {{BASVURAN_AD}}\nTC Kimlik No: {{BASVURAN_TC}}\nAdres: {{BASVURAN_ADRES}}\nTelefon: {{BASVURAN_TEL}}\n\n**ï¿½ï¿½KAYET EDï¿½LEN (SATICI):**\nFirma Adï¿½: {{SATICI_AD}}\nAdres: {{SATICI_ADRES}}\n\n---\n\n**ï¿½ï¿½KAYETE KONU ï¿½Rï¿½N/Hï¿½ZMET:**\n\n| Bilgi | Deï¿½er |\n|-------|-------|\n| ï¿½rï¿½n/Hizmet | {{URUN_ADI}} |\n| Satï¿½n Alma Tarihi | {{SATIN_ALMA_TARIHI}} |\n| Bedel | {{URUN_BEDELI}} TL |\n\n---\n\n## ï¿½ï¿½KAYET KONUSU\n\n{{SIKAYET_KONUSU}}\n\n---\n\n## TALEP\n\n6502 sayï¿½lï¿½ Tï¿½keticinin Korunmasï¿½ Hakkï¿½nda Kanun uyarï¿½nca;\n\n1. Ayï¿½plï¿½ ï¿½rï¿½nï¿½n/hizmetin bedelinin iadesi,\n2. Alternatif olarak ï¿½rï¿½nï¿½n deï¿½iï¿½tirilmesi veya ï¿½cretsiz onarï¿½mï¿½,\n\nhususlarï¿½nda karar verilmesini saygï¿½larï¿½mla arz ve talep ederim.\n\n**EKLER:**\n1. Fatura/fiï¿½ sureti\n2. ï¿½rï¿½n fotoï¿½raflarï¿½\n3. Yazï¿½ï¿½ma ï¿½rnekleri\n\n{{TARIH}}\n{{BASVURAN_AD}}\n",
        "isPremium": false,
        "usageCount": 892
    },
    {
        "id": "16",
        "category": "Hukuk",
        "subcategory": "Tï¿½ketici Hukuku",
        "title": "Tï¿½ketici Mahkemesi Dava Dilekï¿½esi",
        "description": "Tï¿½ketici uyuï¿½mazlï¿½klarï¿½ iï¿½in dava dilekï¿½esi",
        "icon": "Scale",
        "variables": [
            {
                "key": "MAHKEME",
                "label": "Tï¿½ketici Mahkemesi",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVACI_AD",
                "label": "Davacï¿½ Adï¿½",
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
                "label": "Davacï¿½ Adresi",
                "type": "textarea"
            },
            {
                "key": "DAVALI_AD",
                "label": "Davalï¿½ Firma",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "Davalï¿½ Adresi",
                "type": "textarea"
            },
            {
                "key": "DAVA_DEGERI",
                "label": "Dava Deï¿½eri (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "OLAY_ACIKLAMASI",
                "label": "Olayï¿½n Aï¿½ï¿½klamasï¿½",
                "type": "textarea",
                "required": true
            }
        ],
        "content": "## {{MAHKEME}} BAï¿½KANLIï¿½INA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Tï¿½ketici iï¿½leminden kaynaklanan tazminat talebimizdir.\n\n**DAVA DEï¿½ERï¿½:** {{DAVA_DEGERI}} TL\n\n---\n\n## Aï¿½IKLAMALAR\n\n{{OLAY_ACIKLAMASI}}\n\n---\n\n## HUKUKï¿½ SEBEPLER\n\n- 6502 sayï¿½lï¿½ Tï¿½keticinin Korunmasï¿½ Hakkï¿½nda Kanun\n- 6098 sayï¿½lï¿½ Tï¿½rk Borï¿½lar Kanunu\n\n---\n\n## DELï¿½LLER\n\n1. Fatura ve satï¿½ï¿½ belgeleri\n2. Sï¿½zleï¿½me ï¿½rnekleri\n3. Yazï¿½ï¿½malar\n4. Tanï¿½k beyanlarï¿½\n5. Bilirkiï¿½i incelemesi\n\n---\n\n## SONUï¿½ VE ï¿½STEM\n\n1. {{DAVA_DEGERI}} TL'nin yasal faiziyle birlikte davalï¿½dan tahsiline,\n2. Yargï¿½lama giderlerinin davalï¿½ya yï¿½kletilmesine,\n\nkarar verilmesini saygï¿½larï¿½mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 334
    },
    {
        "id": "17",
        "category": "Hukuk",
        "subcategory": "Ticaret Hukuku",
        "title": "Alacak Davasï¿½ Dilekï¿½esi (Ticari)",
        "description": "Ticari alacak tahsili iï¿½in dava dilekï¿½esi",
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
                "label": "Davacï¿½ ï¿½irket/Kiï¿½i",
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
                "label": "Davalï¿½ ï¿½irket/Kiï¿½i",
                "type": "text",
                "required": true
            },
            {
                "key": "DAVALI_ADRES",
                "label": "Davalï¿½ Adresi",
                "type": "textarea"
            },
            {
                "key": "ALACAK_TUTARI",
                "label": "Alacak Tutarï¿½ (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "ALACAK_KAYNAK",
                "label": "Alacaï¿½ï¿½n Kaynaï¿½ï¿½",
                "type": "textarea",
                "required": true
            },
            {
                "key": "VADE_TARIHI",
                "label": "Vade Tarihi",
                "type": "date"
            }
        ],
        "content": "## {{MAHKEME}} BAï¿½KANLIï¿½INA\n\n**DAVACI:** {{DAVACI_AD}}\nVergi/TC No: {{DAVACI_VKN}}\nAdres: {{DAVACI_ADRES}}\n\n**DAVALI:** {{DAVALI_AD}}\nAdres: {{DAVALI_ADRES}}\n\n**KONU:** Alacak davasï¿½ hakkï¿½ndadï¿½r.\n\n**DAVA DEï¿½ERï¿½:** {{ALACAK_TUTARI}} TL\n\n---\n\n## Aï¿½IKLAMALAR\n\n1. Mï¿½vekkilim ile davalï¿½ arasï¿½nda ticari iliï¿½ki bulunmaktadï¿½r.\n\n2. **Alacaï¿½ï¿½n Kaynaï¿½ï¿½:**\n{{ALACAK_KAYNAK}}\n\n3. Vade tarihi: {{VADE_TARIHI}}\n\n4. Tï¿½m ihtarlara raï¿½men davalï¿½ borcunu ï¿½dememiï¿½tir.\n\n---\n\n## HUKUKï¿½ SEBEPLER\n\n- 6102 sayï¿½lï¿½ Tï¿½rk Ticaret Kanunu\n- 6098 sayï¿½lï¿½ Tï¿½rk Borï¿½lar Kanunu\n\n---\n\n## DELï¿½LLER\n\n1. Faturalar\n2. Sï¿½zleï¿½meler\n3. ï¿½rsaliyeler\n4. Banka kayï¿½tlarï¿½\n5. ï¿½htarname\n6. Ticari defterler\n\n---\n\n## SONUï¿½ VE ï¿½STEM\n\n1. {{ALACAK_TUTARI}} TL alacaï¿½ï¿½n vade tarihinden itibaren avans faiziyle birlikte davalï¿½dan tahsiline,\n2. Yargï¿½lama giderlerinin davalï¿½ya yï¿½kletilmesine,\n\nkarar verilmesini saygï¿½larï¿½mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 445
    },
    {
        "id": "18",
        "category": "Hukuk",
        "subcategory": "Ticaret Hukuku",
        "title": "ï¿½htarname (ï¿½deme)",
        "description": "Ticari borï¿½ iï¿½in ï¿½deme ihtarnamesi",
        "icon": "Mail",
        "variables": [
            {
                "key": "NOTER",
                "label": "Noter",
                "type": "text",
                "placeholder": "ï¿½stanbul 5. Noterliï¿½i"
            },
            {
                "key": "GONDEREN_AD",
                "label": "Gï¿½nderen (Alacaklï¿½)",
                "type": "text",
                "required": true
            },
            {
                "key": "GONDEREN_ADRES",
                "label": "Alacaklï¿½ Adresi",
                "type": "textarea"
            },
            {
                "key": "MUHATAP_AD",
                "label": "Muhatap (Borï¿½lu)",
                "type": "text",
                "required": true
            },
            {
                "key": "MUHATAP_ADRES",
                "label": "Borï¿½lu Adresi",
                "type": "textarea",
                "required": true
            },
            {
                "key": "BORC_TUTARI",
                "label": "Borï¿½ Tutarï¿½ (TL)",
                "type": "number",
                "required": true
            },
            {
                "key": "BORC_KONUSU",
                "label": "Borï¿½ Konusu",
                "type": "textarea",
                "required": true
            },
            {
                "key": "ODEME_SURESI",
                "label": "ï¿½deme Sï¿½resi (Gï¿½n)",
                "type": "number",
                "placeholder": "7"
            }
        ],
        "content": "## ï¿½HTARNAME\n\n**Keï¿½ideci (ï¿½htar Eden):** {{GONDEREN_AD}}\nAdres: {{GONDEREN_ADRES}}\n\n**Muhatap (ï¿½htar Edilen):** {{MUHATAP_AD}}\nAdres: {{MUHATAP_ADRES}}\n\n---\n\n## ï¿½HTARIN KONUSU\n\nAï¿½aï¿½ï¿½da belirtilen borcunuzun ï¿½denmesi hakkï¿½ndadï¿½r.\n\n---\n\n**Sayï¿½n {{MUHATAP_AD}},**\n\n**1.** Tarafï¿½nï¿½za aï¿½aï¿½ï¿½da detaylarï¿½ verilen alacaï¿½ï¿½mï¿½z bulunmaktadï¿½r:\n\n**Borï¿½ Konusu:** {{BORC_KONUSU}}\n\n**Borï¿½ Tutarï¿½:** {{BORC_TUTARI}} TL\n\n**2.** Sï¿½z konusu borcunuzu defalarca hatï¿½rlatmamï¿½za raï¿½men hï¿½lï¿½ ï¿½demediniz.\n\n**3.** ï¿½ï¿½bu ihtarnamenin tarafï¿½nï¿½za tebliï¿½inden itibaren **{{ODEME_SURESI}} gï¿½n** iï¿½inde yukarï¿½da belirtilen borcunuzu ï¿½demenizi,\n\n**4.** Aksi takdirde aleyhinize yasal yollara (icra takibi ve/veya dava) baï¿½vurulacaï¿½ï¿½nï¿½, bu durumda doï¿½acak tï¿½m masraf, faiz ve avukatlï¿½k ï¿½cretlerinin tarafï¿½nï¿½zdan tahsil edileceï¿½ini,\n\n**ï¿½HTAR EDERï¿½M.**\n\n{{TARIH}}\n{{GONDEREN_AD}}\n\n---\n\n*Bu ihtarname noter kanalï¿½yla tebliï¿½ edilmek ï¿½zere hazï¿½rlanmï¿½ï¿½tï¿½r.*\n",
        "isPremium": false,
        "usageCount": 723
    },
    {
        "id": "19",
        "category": "Hukuk",
        "subcategory": "Miras Hukuku",
        "title": "Mirasï¿½ï¿½lï¿½k Belgesi (Veraset ï¿½lamï¿½) Talebi",
        "description": "Sulh hukuk mahkemesinden veraset ilamï¿½ talebi",
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
                "label": "Davacï¿½ (Mirasï¿½ï¿½)",
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
                "label": "Murisin (ï¿½lenin) Adï¿½",
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
                "label": "ï¿½lï¿½m Tarihi",
                "type": "date",
                "required": true
            },
            {
                "key": "OLUM_YERI",
                "label": "ï¿½lï¿½m Yeri",
                "type": "text"
            },
            {
                "key": "MIRASCILAR",
                "label": "Diï¿½er Mirasï¿½ï¿½lar",
                "type": "textarea"
            }
        ],
        "content": "## {{MAHKEME}} BAï¿½KANLIï¿½INA\n\n**DAVACI:** {{DAVACI_AD}}\nTC Kimlik No: {{DAVACI_TC}}\nAdres: {{DAVACI_ADRES}}\n\n**KONU:** Mirasï¿½ï¿½lï¿½k belgesi (veraset ilamï¿½) verilmesi talebimdir.\n\n---\n\n## Aï¿½IKLAMALAR\n\n1. Muris **{{MURIS_AD}}** (TC: {{MURIS_TC}}) {{OLUM_TARIHI}} tarihinde {{OLUM_YERI}}'de vefat etmiï¿½tir.\n\n2. Ben mï¿½teveffanï¿½n mirasï¿½ï¿½sï¿½yï¿½m.\n\n3. Diï¿½er mirasï¿½ï¿½lar:\n{{MIRASCILAR}}\n\n4. Mï¿½teveffanï¿½n terekesi ï¿½zerinde iï¿½lem yapabilmek iï¿½in mirasï¿½ï¿½lï¿½k belgesi alï¿½nmasï¿½ gerekmektedir.\n\n---\n\n## HUKUKï¿½ SEBEPLER\n\n- 4721 sayï¿½lï¿½ Tï¿½rk Medeni Kanunu m.598 (Mirasï¿½ï¿½lï¿½k belgesi)\n\n---\n\n## DELï¿½LLER\n\n1. Veraset ve intikal vergisi beyannamesi\n2. Nï¿½fus kayï¿½t ï¿½rneï¿½i (muris ve mirasï¿½ï¿½lar)\n3. ï¿½lï¿½m belgesi\n4. Vukuatlï¿½ nï¿½fus kayï¿½t ï¿½rneï¿½i\n\n---\n\n## SONUï¿½ VE ï¿½STEM\n\nMï¿½teveffa {{MURIS_AD}}'in mirasï¿½ï¿½larï¿½nï¿½ ve miras paylarï¿½nï¿½ gï¿½steren **Mï¿½RASï¿½ILIK BELGESï¿½** verilmesini saygï¿½larï¿½mla arz ve talep ederim.\n\n{{TARIH}}\n{{DAVACI_AD}}\n",
        "isPremium": false,
        "usageCount": 567
    },
    {
        "id": "20",
        "category": "Hukuk",
        "subcategory": "Miras Hukuku",
        "title": "Mirastan Feragat Sï¿½zleï¿½mesi",
        "description": "Noterde dï¿½zenlenecek mirastan feragat belgesi",
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
                "label": "Muris (Miras Bï¿½rakan)",
                "type": "text",
                "required": true
            },
            {
                "key": "BEDEL",
                "label": "Karï¿½ï¿½lï¿½k Bedel (varsa)",
                "type": "text"
            }
        ],
        "content": "## Mï¿½RASTAN FERAGAT Sï¿½ZLEï¿½MESï¿½\n\n**FERAGAT EDEN:**\nAd Soyad: {{FERAGAT_EDEN}}\nTC Kimlik No: {{FERAGAT_EDEN_TC}}\n\n**MURï¿½S:**\nAd Soyad: {{MURIS_AD}}\n\n---\n\n## BEYAN\n\nBen {{FERAGAT_EDEN}}, {{MURIS_AD}}'ï¿½n ileride gerï¿½ekleï¿½ecek ï¿½lï¿½mï¿½ halinde terekesinden payï¿½ma dï¿½ï¿½ecek tï¿½m miras haklarï¿½ndan, TMK m.528 uyarï¿½nca, aï¿½aï¿½ï¿½daki ï¿½artlarla **FERAGAT ETTï¿½ï¿½ï¿½Mï¿½** beyan ederim.\n\n**Karï¿½ï¿½lï¿½k:** {{BEDEL}}\n\n**Feragatin Kapsamï¿½:** Tam feragat (hem kendim hem altsoyum adï¿½na)\n\nBu sï¿½zleï¿½me, murisin saï¿½lï¿½ï¿½ï¿½nda, resmi ï¿½ekilde yapï¿½lmï¿½ï¿½ olup, tarafï¿½mca ï¿½zgï¿½r iradeyle imzalanmï¿½ï¿½tï¿½r.\n\n---\n\n## HUKUKï¿½ DAYANAK\n\n- 4721 sayï¿½lï¿½ Tï¿½rk Medeni Kanunu m.528 (Mirastan feragat sï¿½zleï¿½mesi)\n\n---\n\n{{TARIH}}\n\n**Feragat Eden:**\n{{FERAGAT_EDEN}}\n\n**Muris:**\n{{MURIS_AD}}\n\n---\n\n*Bu sï¿½zleï¿½me noter huzurunda dï¿½zenleme ï¿½eklinde yapï¿½lmalï¿½dï¿½r.*\n",
        "isPremium": true,
        "usageCount": 123
    },
    {
        "id": "21",
        "category": "ï¿½cra",
        "subcategory": "Tahsilat",
        "title": "Haricen Tahsil Bildirimi",
        "description": "ï¿½cra dosyasï¿½ dï¿½ï¿½ï¿½nda yapï¿½lan tahsilatï¿½n bildirilmesi",
        "icon": "HandCoins",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "ï¿½cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklï¿½", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borï¿½lu", "type": "text", "required": true },
            { "key": "TAHSIL_TUTARI", "label": "Tahsil Edilen Tutar (TL)", "type": "number", "required": true },
            { "key": "TAHSIL_TARIHI", "label": "Tahsil Tarihi", "type": "date", "required": true },
            { "key": "KALAN_ALACAK", "label": "Kalan Alacak (varsa)", "type": "number" }
        ],
        "content": "## {{ICRA_DAIRESI}} Mï¿½Dï¿½RLï¿½ï¿½ï¿½'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORï¿½LU:** {{BORCLU_AD}}\n\n**KONU:** Haricen tahsil bildirimi\n\n---\n\n## Aï¿½IKLAMA\n\nMï¿½dï¿½rlï¿½ï¿½ï¿½nï¿½zï¿½n yukarï¿½da numarasï¿½ yazï¿½lï¿½ dosyasï¿½nda takip edilen alacaï¿½ï¿½mï¿½n bir kï¿½smï¿½/tamamï¿½ borï¿½lu tarafï¿½ndan **haricen (icra dairesi dï¿½ï¿½ï¿½nda)** tarafï¿½ma ï¿½denmiï¿½tir.\n\n**TAHSï¿½LAT Bï¿½LGï¿½LERï¿½:**\n\n| Bilgi | Deï¿½er |\n|-------|-------|\n| Tahsil Edilen Tutar | {{TAHSIL_TUTARI}} TL |\n| Tahsil Tarihi | {{TAHSIL_TARIHI}} |\n| Kalan Alacak | {{KALAN_ALACAK}} TL |\n\n---\n\n## TALEP\n\nYukarï¿½da belirtilen haricen tahsilatï¿½n dosyaya iï¿½lenmesini ve dosyanï¿½n buna gï¿½re gï¿½ncellenmesini talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1245
    },
    {
        "id": "22",
        "category": "ï¿½cra",
        "subcategory": "Dosya ï¿½ï¿½lemleri",
        "title": "Dosya Kapama (Takipten Vazgeï¿½me) Talebi",
        "description": "Alacaklï¿½nï¿½n takipten vazgeï¿½erek dosyayï¿½ kapatma talebi",
        "icon": "FolderX",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "ï¿½cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklï¿½", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borï¿½lu", "type": "text", "required": true },
            { "key": "VAZGECME_NEDENI", "label": "Vazgeï¿½me Nedeni", "type": "textarea" }
        ],
        "content": "## {{ICRA_DAIRESI}} Mï¿½Dï¿½RLï¿½ï¿½ï¿½'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORï¿½LU:** {{BORCLU_AD}}\n\n**KONU:** Takipten vazgeï¿½me ve dosyanï¿½n kapatï¿½lmasï¿½ talebi\n\n---\n\n## Aï¿½IKLAMA\n\nMï¿½dï¿½rlï¿½ï¿½ï¿½nï¿½zï¿½n yukarï¿½da numarasï¿½ yazï¿½lï¿½ dosyasï¿½nda yï¿½rï¿½tï¿½len icra takibinden **VAZGEï¿½ï¿½YORUM.**\n\n**Vazgeï¿½me Nedeni:** {{VAZGECME_NEDENI}}\n\n---\n\n## TALEP\n\nï¿½ï¿½K m.129 uyarï¿½nca takipten vazgeï¿½tiï¿½imi beyan eder, takibin durdurularak dosyanï¿½n kapatï¿½lmasï¿½nï¿½ talep ederim.\n\n**Not:** Dosyadaki tï¿½m hacizlerin kaldï¿½rï¿½lmasï¿½nï¿½ da talep ediyorum.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 876
    },
    {
        "id": "23",
        "category": "ï¿½cra",
        "subcategory": "Haciz",
        "title": "Maaï¿½ Haczi (Maaï¿½ Kesintisi) Talebi",
        "description": "Borï¿½lunun maaï¿½ï¿½na haciz konulmasï¿½ talebi",
        "icon": "Wallet",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "ï¿½cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklï¿½", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borï¿½lu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Borï¿½lu TC No", "type": "text", "required": true },
            { "key": "ISVEREN_AD", "label": "ï¿½ï¿½veren/Kurum Adï¿½", "type": "text", "required": true },
            { "key": "ISVEREN_ADRES", "label": "ï¿½ï¿½veren Adresi", "type": "textarea", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} Mï¿½Dï¿½RLï¿½ï¿½ï¿½'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORï¿½LU:** {{BORCLU_AD}} (TC: {{BORCLU_TC}})\n\n**KONU:** Maaï¿½ haczi (maaï¿½ kesintisi) talebi\n\n---\n\n## Aï¿½IKLAMA\n\nBorï¿½lunun aï¿½aï¿½ï¿½da belirtilen iï¿½yerinde ï¿½alï¿½ï¿½tï¿½ï¿½ï¿½ tespit edilmiï¿½tir:\n\n**ï¿½ï¿½VEREN Bï¿½LGï¿½LERï¿½:**\n- **Kurum/ï¿½irket:** {{ISVEREN_AD}}\n- **Adres:** {{ISVEREN_ADRES}}\n\n---\n\n## TALEP\n\nï¿½ï¿½K m.83 ve m.355 uyarï¿½nca;\n\n1. Borï¿½lunun maaï¿½ ve ï¿½cretinin **1/4'ï¿½nï¿½n** haciz kesintisi yapï¿½larak dosyaya gï¿½nderilmesi iï¿½in ilgili iï¿½verene **maaï¿½ haczi mï¿½zekkeresi** yazï¿½lmasï¿½nï¿½,\n\n2. Kesinti yapï¿½lï¿½ncaya kadar iï¿½verene sorumluluk bildiriminde bulunulmasï¿½nï¿½,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1567
    },
    {
        "id": "24",
        "category": "ï¿½cra",
        "subcategory": "Haciz",
        "title": "Taï¿½ï¿½nmaz (Gayrimenkul) Haczi Talebi",
        "description": "Borï¿½lunun taï¿½ï¿½nmazï¿½na haciz ï¿½erhi konulmasï¿½ talebi",
        "icon": "Home",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "ï¿½cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklï¿½", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borï¿½lu", "type": "text", "required": true },
            { "key": "TASINMAZ_BILGI", "label": "Taï¿½ï¿½nmaz Bilgileri (ï¿½l/ï¿½lï¿½e/Ada/Parsel)", "type": "textarea", "required": true },
            { "key": "TAPU_MUDURLUGU", "label": "Tapu Mï¿½dï¿½rlï¿½ï¿½ï¿½", "type": "text", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} Mï¿½Dï¿½RLï¿½ï¿½ï¿½'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORï¿½LU:** {{BORCLU_AD}}\n\n**KONU:** Taï¿½ï¿½nmaz haczi talebi\n\n---\n\n## Aï¿½IKLAMA\n\nBorï¿½lunun aï¿½aï¿½ï¿½da belirtilen taï¿½ï¿½nmaz/taï¿½ï¿½nmazlar ï¿½zerinde mï¿½lkiyeti bulunmaktadï¿½r:\n\n**TAï¿½INMAZ Bï¿½LGï¿½LERï¿½:**\n{{TASINMAZ_BILGI}}\n\n**ï¿½LGï¿½Lï¿½ TAPU Mï¿½Dï¿½RLï¿½ï¿½ï¿½:** {{TAPU_MUDURLUGU}}\n\n---\n\n## TALEP\n\nï¿½ï¿½K m.79 ve m.91 uyarï¿½nca;\n\n1. Yukarï¿½da belirtilen taï¿½ï¿½nmaz/taï¿½ï¿½nmazlar ï¿½zerine **HACï¿½Z ï¿½ERHï¿½** konulmasï¿½ iï¿½in ilgili Tapu Mï¿½dï¿½rlï¿½ï¿½ï¿½'ne mï¿½zekkere yazï¿½lmasï¿½nï¿½,\n\n2. Haciz ï¿½erhinin tapu kaydï¿½na iï¿½lenmesini,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 934
    },
    {
        "id": "25",
        "category": "ï¿½cra",
        "subcategory": "Haciz",
        "title": "Haciz Fekki (Haciz Kaldï¿½rma) Talebi - Alacaklï¿½",
        "description": "Alacaklï¿½nï¿½n haczi kaldï¿½rma talebi",
        "icon": "KeyRound",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "ï¿½cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklï¿½", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borï¿½lu", "type": "text", "required": true },
            { "key": "HACIZLI_MAL", "label": "Haczin Kaldï¿½rï¿½lacaï¿½ï¿½ Mal/Kayï¿½t", "type": "textarea", "required": true },
            { "key": "FEKK_NEDENI", "label": "Haciz Fekki Nedeni", "type": "textarea" }
        ],
        "content": "## {{ICRA_DAIRESI}} Mï¿½Dï¿½RLï¿½ï¿½ï¿½'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORï¿½LU:** {{BORCLU_AD}}\n\n**KONU:** Haciz fekki (haciz kaldï¿½rma) talebi\n\n---\n\n## Aï¿½IKLAMA\n\nMï¿½dï¿½rlï¿½ï¿½ï¿½nï¿½zï¿½n yukarï¿½da numarasï¿½ yazï¿½lï¿½ dosyasï¿½nda borï¿½luya ait aï¿½aï¿½ï¿½daki mal/kayï¿½t ï¿½zerine haciz konulmuï¿½tur:\n\n**HACï¿½ZLï¿½ MAL/KAYIT:**\n{{HACIZLI_MAL}}\n\n**HACï¿½Z FEKKï¿½ NEDENï¿½:**\n{{FEKK_NEDENI}}\n\n---\n\n## TALEP\n\nYukarï¿½da belirtilen mal/kayï¿½t ï¿½zerindeki haczin **FEKKï¿½Nï¿½ (KALDIRILMASINI)** ve ilgili kurumlara haciz fekki mï¿½zekkeresi yazï¿½lmasï¿½nï¿½ talep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1123
    },
    {
        "id": "26",
        "category": "ï¿½cra",
        "subcategory": "Mal Beyanï¿½",
        "title": "Mal Beyanï¿½ Talepli ï¿½deme Emri Talebi",
        "description": "Borï¿½ludan mal beyanï¿½ istenmesi talebi",
        "icon": "ClipboardList",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "ï¿½cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklï¿½", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borï¿½lu", "type": "text", "required": true },
            { "key": "BORCLU_ADRES", "label": "Borï¿½lu Adresi", "type": "textarea", "required": true }
        ],
        "content": "## {{ICRA_DAIRESI}} Mï¿½Dï¿½RLï¿½ï¿½ï¿½'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORï¿½LU:** {{BORCLU_AD}}\nAdres: {{BORCLU_ADRES}}\n\n**KONU:** Mal beyanï¿½ talebinde bulunulmasï¿½\n\n---\n\n## Aï¿½IKLAMA\n\nMï¿½dï¿½rlï¿½ï¿½ï¿½nï¿½zï¿½n yukarï¿½da numarasï¿½ yazï¿½lï¿½ dosyasï¿½nda borï¿½luya gï¿½nderilen ï¿½deme emri tebliï¿½ edilmiï¿½, ancak borï¿½lu ï¿½deme yapmamï¿½ï¿½ ve itirazda da bulunmamï¿½ï¿½tï¿½r.\n\n---\n\n## TALEP\n\nï¿½ï¿½K m.74 uyarï¿½nca;\n\n1. Borï¿½luya **MAL BEYANI** iï¿½in davetiye ï¿½ï¿½karï¿½lmasï¿½nï¿½,\n\n2. Borï¿½lunun mal beyanï¿½nda bulunmamasï¿½ veya gerï¿½eï¿½e aykï¿½rï¿½ beyanda bulunmasï¿½ halinde ï¿½ï¿½K m.337 kapsamï¿½nda ï¿½ikayet hakkï¿½mï¿½n saklï¿½ tutulmasï¿½nï¿½,\n\ntalep ederim.\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 789
    },
    {
        "id": "27",
        "category": "ï¿½cra",
        "subcategory": "Araï¿½",
        "title": "Araï¿½ Haczi Talebi",
        "description": "Borï¿½lunun aracï¿½na haciz konulmasï¿½ talebi",
        "icon": "Car",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "ï¿½cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklï¿½", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borï¿½lu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Borï¿½lu TC No", "type": "text", "required": true },
            { "key": "ARAC_PLAKA", "label": "Araï¿½ Plakasï¿½ (biliniyorsa)", "type": "text" }
        ],
        "content": "## {{ICRA_DAIRESI}} Mï¿½Dï¿½RLï¿½ï¿½ï¿½'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORï¿½LU:** {{BORCLU_AD}} (TC: {{BORCLU_TC}})\n\n**KONU:** Araï¿½ haczi talebi\n\n---\n\n## TALEP\n\nBorï¿½lunun adï¿½na kayï¿½tlï¿½ araï¿½/araï¿½lar ï¿½zerine haciz konulmasï¿½ iï¿½in;\n\n1. **Emniyet Genel Mï¿½dï¿½rlï¿½ï¿½ï¿½ Trafik Baï¿½kanlï¿½ï¿½ï¿½'na** (EGM) haciz mï¿½zekkeresi yazï¿½lmasï¿½nï¿½,\n\n2. Borï¿½lu adï¿½na kayï¿½tlï¿½ tï¿½m araï¿½larï¿½n tespit edilmesini ve haciz ï¿½erhi konulmasï¿½nï¿½,\n\n3. Yakalama ï¿½erhi konulmasï¿½nï¿½,\n\ntalep ederim.\n\n**Bilinen Araï¿½ Plakasï¿½ (varsa):** {{ARAC_PLAKA}}\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
        "isPremium": false,
        "usageCount": 1456
    },
    {
        "id": "28",
        "category": "ï¿½cra",
        "subcategory": "Banka",
        "title": "Banka Hesabï¿½ Haczi Talebi",
        "description": "Borï¿½lunun banka hesaplarï¿½na haciz konulmasï¿½",
        "icon": "Landmark",
        "variables": [
            { "key": "ICRA_DAIRESI", "label": "ï¿½cra Dairesi", "type": "text", "required": true },
            { "key": "DOSYA_NO", "label": "Dosya No", "type": "text", "required": true },
            { "key": "ALACAKLI_AD", "label": "Alacaklï¿½", "type": "text", "required": true },
            { "key": "BORCLU_AD", "label": "Borï¿½lu", "type": "text", "required": true },
            { "key": "BORCLU_TC", "label": "Borï¿½lu TC/VKN", "type": "text", "required": true },
            { "key": "BANKA_ADI", "label": "Banka Adï¿½ (biliniyorsa)", "type": "text" }
        ],
        "content": "## {{ICRA_DAIRESI}} Mï¿½Dï¿½RLï¿½ï¿½ï¿½'NE\n\n**DOSYA NO:** {{DOSYA_NO}}\n\n**ALACAKLI:** {{ALACAKLI_AD}}\n\n**BORï¿½LU:** {{BORCLU_AD}} (TC/VKN: {{BORCLU_TC}})\n\n**KONU:** Banka hesaplarï¿½na haciz talebi\n\n---\n\n## TALEP\n\nBorï¿½lunun banka hesaplarï¿½na haciz konulmasï¿½ iï¿½in;\n\n1. **Tï¿½m bankalara** (UYAP ï¿½zerinden toplu) haciz mï¿½zekkeresi gï¿½nderilmesini,\n\n2. Borï¿½lunun tï¿½m banka hesaplarï¿½ndaki mevduatï¿½n haczedilmesini,\n\n3. Haczedilen tutarlarï¿½n dosyaya aktarï¿½lmasï¿½nï¿½,\n\ntalep ederim.\n\n**Bilinen Banka (varsa):** {{BANKA_ADI}}\n\n{{TARIH}}\n{{ALACAKLI_AD}}\n",
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

const MOJIBAKE_DETECTION = /[ï¿½ï¿½ï¿½]/;

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
        return res.status(404).json({ error: 'Şablon bulunamadı' });
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
        let summary;
        try {
            const serviceClient = createServiceRoleClient();
            summary = await buildPlanUsageSummary(serviceClient, user.id);
        } catch (summaryError) {
            console.error('User plan summary data fallback:', summaryError);
            summary = buildDefaultPlanUsageSummary(user.id);
        }
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
