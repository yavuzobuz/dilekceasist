const stripWrappingQuotes = (value = '') => String(value || '').replace(/^['"]+|['"]+$/g, '');

const normalizeOrigin = (origin = '') => {
    const raw = stripWrappingQuotes(String(origin || '').replace(/[\r\n\t]/g, '').trim());
    if (!raw) return '';

    try {
        const parsed = new URL(raw);
        return `${parsed.protocol}//${parsed.host}`.toLowerCase();
    } catch {
        return raw.replace(/\/+$/, '').toLowerCase();
    }
};

const parseOriginList = (...values) => values
    .filter(Boolean)
    .flatMap(value => String(value).split(/[,\n]/))
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
    process.env.APP_BASE_URL,
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGINS,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173'
));

export const applyCors = (
    req,
    res,
    {
        methods = 'GET, POST, OPTIONS',
        headers = 'Content-Type, Authorization',
        credentials = true,
    } = {}
) => {
    const requestOrigin = req?.headers?.origin;
    const requestHost = String(req?.headers?.host || '').trim().toLowerCase();

    const isSameHostOrigin = (() => {
        if (!requestOrigin || !requestHost) return false;
        try {
            const parsed = new URL(requestOrigin);
            return String(parsed.host || '').trim().toLowerCase() === requestHost;
        } catch {
            return false;
        }
    })();

    if (requestOrigin) {
        const normalized = normalizeOrigin(requestOrigin);
        const isAllowed = allowedOriginSet.has(normalized)
            || isSameHostOrigin
            || (process.env.NODE_ENV !== 'production' && isLocalDevOrigin(requestOrigin));

        if (!isAllowed) {
            return false;
        }

        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Vary', 'Origin');
        if (credentials) {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
    }

    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);
    return true;
};

export const getSafeErrorMessage = (error, fallbackMessage) => (
    process.env.NODE_ENV === 'production'
        ? fallbackMessage
        : (error?.message || fallbackMessage)
);
