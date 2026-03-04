import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { applyCors, getSafeErrorMessage } from '../_lib/cors.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const createCheckoutIdempotencyKey = ({ userId, plan }) => {
    const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const raw = `${String(userId || '').trim()}:${String(plan || '').trim()}:${bucket}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64);
};

const getBearerToken = (authorizationHeader = '') => {
    if (typeof authorizationHeader !== 'string') return null;
    const [scheme, token] = authorizationHeader.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
        return null;
    }
    return token.trim();
};

const getAuthenticatedUser = async (req) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        const error = new Error('Supabase auth config missing on server');
        error.status = 500;
        throw error;
    }

    const token = getBearerToken(req.headers.authorization);
    if (!token) {
        const error = new Error('Giris gerekli');
        error.status = 401;
        throw error;
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
        const authError = new Error('Gecersiz oturum');
        authError.status = 401;
        throw authError;
    }

    return user;
};

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
        const {
            createStripeCheckoutSession,
            normalizePaidPlan,
            parseRequestBody,
        } = await import('../_lib/stripeCheckout.js');

        const user = await getAuthenticatedUser(req);
        const body = parseRequestBody(req);
        if (!body || typeof body !== 'object') {
            return res.status(400).json({ error: 'Gecersiz istek govdesi.' });
        }

        const plan = normalizePaidPlan(body?.plan);

        if (!plan) {
            return res.status(400).json({ error: 'Gecersiz plan secimi. Yalnizca pro veya team desteklenir.' });
        }

        const idempotencyKey = createCheckoutIdempotencyKey({ userId: user.id, plan });
        const session = await createStripeCheckoutSession({ req, user, plan, idempotencyKey });
        return res.status(200).json({
            sessionId: session.id,
            url: session.url,
        });
    } catch (error) {
        console.error('Billing checkout session error:', error);
        return res.status(error.status || 500).json({
            error: getSafeErrorMessage(error, 'Odeme oturumu olusturulamadi'),
            details: error.details || error.message || null,
        });
    }
}
