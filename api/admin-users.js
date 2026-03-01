// Admin Users API - Get users with email from Supabase Auth
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
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
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
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        await requireAdminAuth(req);
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

        // Get profiles data for additional info
        const userIds = filteredUsers.map(u => u.id);
        const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, office_name')
            .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        // Get petition counts
        const { data: petitionCounts } = await supabaseAdmin
            .from('petitions')
            .select('user_id')
            .in('user_id', userIds);

        const countMap = new Map();
        petitionCounts?.forEach(p => {
            countMap.set(p.user_id, (countMap.get(p.user_id) || 0) + 1);
        });

        // Combine data
        const combinedUsers = filteredUsers.map(user => {
            const profile = profileMap.get(user.id) || {};
            return {
                id: user.id,
                email: user.email,
                full_name: profile.full_name || user.user_metadata?.full_name || null,
                office_name: profile.office_name || null,
                created_at: user.created_at,
                last_sign_in_at: user.last_sign_in_at,
                petition_count: countMap.get(user.id) || 0
            };
        });

        // Get total count
        const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000
        });

        res.status(200).json({
            users: combinedUsers,
            total: allUsers?.length || 0,
            page,
            pageSize
        });

    } catch (error) {
        console.error('Admin users error:', error);
        res.status(error.status || 500).json({ error: error.message });
    }
}
