// Announcements API - CRUD operations for announcements
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
const ANNOUNCEMENT_TYPES = new Set(['info', 'warning', 'success', 'error']);

const httpError = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const getBearerToken = (authorizationHeader = '') => {
    if (typeof authorizationHeader !== 'string') return null;
    const [scheme, token] = authorizationHeader.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
        return null;
    }
    return token.trim();
};

const isAdminUser = (user) => {
    const email = (user?.email || '').toLowerCase();
    const role = String(user?.app_metadata?.role || '').toLowerCase();
    const hasAdminClaim = user?.app_metadata?.is_admin === true;

    return hasAdminClaim || role === 'admin' || role === 'super_admin' || ADMIN_EMAILS.includes(email);
};

const parseBooleanInput = (value, defaultValue = false) => {
    if (value === undefined) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    throw httpError(400, 'Invalid boolean value');
};

const parseOptionalIsoDate = (value) => {
    if (value == null || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw httpError(400, 'Invalid expires_at value');
    }
    return date.toISOString();
};

const sanitizeRequiredText = (value, fieldName, maxLength) => {
    if (typeof value !== 'string') {
        throw httpError(400, `${fieldName} must be a string`);
    }

    const trimmed = value.trim();
    if (!trimmed) {
        throw httpError(400, `${fieldName} is required`);
    }
    if (trimmed.length > maxLength) {
        throw httpError(400, `${fieldName} exceeds max length of ${maxLength}`);
    }
    return trimmed;
};

const sanitizeOptionalText = (value, fieldName, maxLength) => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') {
        throw httpError(400, `${fieldName} must be a string`);
    }

    const trimmed = value.trim();
    if (trimmed.length > maxLength) {
        throw httpError(400, `${fieldName} exceeds max length of ${maxLength}`);
    }
    return trimmed;
};

const sanitizeAnnouncementType = (value, required = false) => {
    if (value === undefined && !required) return undefined;

    const normalized = String(value || '').trim().toLowerCase();
    if (!ANNOUNCEMENT_TYPES.has(normalized)) {
        throw httpError(400, 'Invalid announcement type');
    }
    return normalized;
};

const sanitizeAnnouncementCreatePayload = (payload = {}) => {
    return {
        title: sanitizeRequiredText(payload.title, 'title', 150),
        content: sanitizeRequiredText(payload.content, 'content', 5000),
        type: sanitizeAnnouncementType(payload.type, false) || 'info',
        is_active: parseBooleanInput(payload.is_active, true),
        show_on_login: parseBooleanInput(payload.show_on_login, false),
        expires_at: parseOptionalIsoDate(payload.expires_at),
    };
};

const sanitizeAnnouncementUpdatePayload = (payload = {}) => {
    const id = sanitizeRequiredText(payload.id, 'id', 64);

    const updates = {
        title: sanitizeOptionalText(payload.title, 'title', 150),
        content: sanitizeOptionalText(payload.content, 'content', 5000),
        type: sanitizeAnnouncementType(payload.type, false),
        is_active: payload.is_active === undefined ? undefined : parseBooleanInput(payload.is_active),
        show_on_login: payload.show_on_login === undefined ? undefined : parseBooleanInput(payload.show_on_login),
        expires_at: payload.expires_at === undefined ? undefined : parseOptionalIsoDate(payload.expires_at),
    };

    const sanitizedUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(sanitizedUpdates).length === 0) {
        throw httpError(400, 'No valid fields to update');
    }

    return { id, updates: sanitizedUpdates };
};

const sanitizeAnnouncementDeletePayload = (payload = {}) => {
    return { id: sanitizeRequiredText(payload.id, 'id', 64) };
};

const createServiceRoleClient = () => {
    if (!SUPABASE_URL) {
        throw httpError(500, 'Supabase URL not configured');
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
        throw httpError(500, 'SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
};

const createReadOnlyClient = () => {
    if (!SUPABASE_URL) {
        throw httpError(500, 'Supabase URL not configured');
    }

    if (SUPABASE_ANON_KEY) {
        return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { autoRefreshToken: false, persistSession: false }
        });
    }

    if (SUPABASE_SERVICE_ROLE_KEY) {
        return createServiceRoleClient();
    }

    throw httpError(500, 'Supabase read-only config missing on server');
};

const requireAdminAuth = async (req) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw httpError(500, 'Supabase auth config missing on server');
    }

    const token = getBearerToken(req.headers.authorization);
    if (!token) {
        throw httpError(401, 'Unauthorized: Bearer token required');
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
        throw httpError(401, 'Unauthorized: Invalid token');
    }

    if (!isAdminUser(user)) {
        throw httpError(403, 'Forbidden: Admin access required');
    }
};

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // GET - Fetch all announcements (or active only with ?active=true)
        if (req.method === 'GET') {
            const activeOnly = req.query.active === 'true';

            if (!activeOnly) {
                await requireAdminAuth(req);
            }

            const supabase = activeOnly ? createReadOnlyClient() : createServiceRoleClient();

            let query = supabase
                .from('announcements')
                .select('*')
                .order('created_at', { ascending: false });

            if (activeOnly) {
                query = query
                    .eq('is_active', true)
                    .or('expires_at.is.null,expires_at.gte.' + new Date().toISOString());
            }

            const { data, error } = await query;

            if (error) throw error;

            return res.status(200).json({ announcements: data || [] });
        }

        // POST - Create new announcement
        if (req.method === 'POST') {
            await requireAdminAuth(req);
            const supabase = createServiceRoleClient();
            const createPayload = sanitizeAnnouncementCreatePayload(req.body || {});

            const { data, error } = await supabase
                .from('announcements')
                .insert([createPayload])
                .select()
                .single();

            if (error) throw error;

            return res.status(201).json({ announcement: data });
        }

        // PUT - Update announcement
        if (req.method === 'PUT') {
            await requireAdminAuth(req);
            const supabase = createServiceRoleClient();
            const { id, updates } = sanitizeAnnouncementUpdatePayload(req.body || {});

            const { data, error } = await supabase
                .from('announcements')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            return res.status(200).json({ announcement: data });
        }

        // DELETE - Delete announcement
        if (req.method === 'DELETE') {
            await requireAdminAuth(req);
            const supabase = createServiceRoleClient();
            const { id } = sanitizeAnnouncementDeletePayload(req.body || {});

            const { error } = await supabase
                .from('announcements')
                .delete()
                .eq('id', id);

            if (error) throw error;

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Announcements API error:', error);
        return res.status(error.status || 500).json({ error: error.message });
    }
}
