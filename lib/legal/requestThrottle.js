const GLOBAL_CONCURRENCY = Math.max(
    1,
    Number.parseInt(process.env.YARGI_GLOBAL_CONCURRENCY || '3', 10)
);
const DOC_FETCH_CONCURRENCY = Math.max(
    1,
    Number.parseInt(process.env.YARGI_DOC_FETCH_CONCURRENCY || '2', 10)
);
const BACKOFF_BASE_MS = Math.max(
    100,
    Number.parseInt(process.env.YARGI_429_BACKOFF_BASE_MS || '1000', 10)
);
const BACKOFF_MAX_MS = Math.max(
    BACKOFF_BASE_MS,
    Number.parseInt(process.env.YARGI_429_BACKOFF_MAX_MS || '15000', 10)
);

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitedError = (error) => {
    const status = Number(error?.status || error?.statusCode || 0);
    if (status === 429) return true;

    const code = String(error?.code || '').trim().toUpperCase();
    if (code === 'HTTP_429') return true;

    const message = String(error?.message || error || '');
    return /429|too many requests|rate limit|rate_limited/i.test(message);
};

export const createLimiter = (concurrency = 1) => {
    let active = 0;
    const queue = [];

    const next = () => {
        if (active >= concurrency || queue.length === 0) return;
        active += 1;
        const { fn, resolve, reject } = queue.shift();
        fn()
            .then(resolve)
            .catch(reject)
            .finally(() => {
                active -= 1;
                next();
            });
    };

    return (fn) => new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
    });
};

export const withBackoff = async (fn, maxRetries = 4) => {
    let attempt = 0;
    while (attempt <= maxRetries) {
        try {
            return await fn();
        } catch (error) {
            if (!isRateLimitedError(error) || attempt === maxRetries) {
                throw error;
            }

            const delay = Math.min(
                BACKOFF_BASE_MS * (2 ** attempt) + Math.floor(Math.random() * 500),
                BACKOFF_MAX_MS
            );
            console.warn(`[throttle] 429 attempt=${attempt + 1} delay=${delay}ms`);
            await sleep(delay);
            attempt += 1;
        }
    }

    return fn();
};

export const globalYargiLimiter = createLimiter(GLOBAL_CONCURRENCY);
const docFetchLimiter = createLimiter(DOC_FETCH_CONCURRENCY);

export const yargiRequest = (fn) =>
    globalYargiLimiter(() => withBackoff(fn));

export const docFetchRequest = (fn) =>
    globalYargiLimiter(() => docFetchLimiter(() => withBackoff(fn)));

export const __testables = {
    isRateLimitedError,
    GLOBAL_CONCURRENCY,
    DOC_FETCH_CONCURRENCY,
    BACKOFF_BASE_MS,
    BACKOFF_MAX_MS,
};
