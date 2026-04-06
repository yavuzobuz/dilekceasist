import { createClient } from '@supabase/supabase-js';
import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { confirmStripeCheckoutSessionForUser } from '../../lib/api/stripeCheckout.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const getBearerToken = (authorizationHeader = '') => {
    if (typeof authorizationHeader !== 'string') return null;
    const [scheme, token] = authorizationHeader.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
        return null;
    }
    return token.trim();
};

const parseRequestBody = (req) => {
    if (!req?.body) return {};
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch {
            return {};
        }
    }
    return {};
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
        const user = await getAuthenticatedUser(req);
        const body = parseRequestBody(req);
        const sessionId = String(body?.sessionId || '').trim();

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId zorunludur.' });
        }

        const result = await confirmStripeCheckoutSessionForUser({
            sessionId,
            userId: user.id,
        });

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('Billing confirm session error:', error);
        return res.status(error.status || 500).json({
            error: getSafeErrorMessage(error, 'Checkout oturumu dogrulanamadi'),
            details: error.details || error.message || null,
        });
    }
}
