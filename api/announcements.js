// Announcements API - CRUD operations for announcements
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'kibrit74@gmail.com')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

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
    const hasAdminClaim = user?.app_metadata?.is_admin === true || user?.user_metadata?.is_admin === true;

    return hasAdminClaim || role === 'admin' || role === 'super_admin' || ADMIN_EMAILS.includes(email);
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
        const supabase = createServiceRoleClient();

        // GET - Fetch all announcements (or active only with ?active=true)
        if (req.method === 'GET') {
            const activeOnly = req.query.active === 'true';

            if (!activeOnly) {
                await requireAdminAuth(req);
            }

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

            return res.status(201).json({ announcement: data });
        }

        // PUT - Update announcement
        if (req.method === 'PUT') {
            await requireAdminAuth(req);
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

            return res.status(200).json({ announcement: data });
        }

        // DELETE - Delete announcement
        if (req.method === 'DELETE') {
            await requireAdminAuth(req);
            const { id } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'Announcement ID is required' });
            }

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
