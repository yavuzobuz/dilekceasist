// Admin Users API - list users with plan/quota and assign rights
import { createClient } from '@supabase/supabase-js';
import { applyCors, getSafeErrorMessage } from './_lib/cors.js';
import { cancelStripeSubscriptionForUser } from './_lib/stripeCheckout.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'kibrit74@gmail.com')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
const TRIAL_DURATION_DAYS = Math.max(1, Number.parseInt(process.env.TRIAL_DURATION_DAYS || '14', 10));
const TRIAL_DAILY_GENERATION_LIMIT = Math.max(1, Number.parseInt(process.env.TRIAL_DAILY_GENERATION_LIMIT || '10', 10));

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

const getTodayIsoDate = () => new Date().toISOString().slice(0, 10);

const parsePositiveLimit = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return Math.floor(parsed);
};

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

const getAuthenticatedUser = async (req) => {
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

    return user;
};

const requireAdminAuth = async (req) => {
    const user = await getAuthenticatedUser(req);

    if (!isAdminUser(user)) {
        throw httpError(403, 'Forbidden: Admin access required');
    }

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
    const payload = {
        user_id: userId,
        plan_code: 'trial',
        status: 'active',
        trial_starts_at: now.toISOString(),
        trial_ends_at: new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
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
    const usedToday = await getUsageCountForDate(serviceClient, userId, getTodayIsoDate());
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

const handleGet = async (req, res, supabaseAdmin) => {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const search = req.query.search || '';

    const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: pageSize
    });

    if (authError) {
        throw authError;
    }

    let filteredUsers = users || [];
    if (search) {
        const searchLower = search.toLowerCase();
        filteredUsers = filteredUsers.filter(user =>
            (user.email && user.email.toLowerCase().includes(searchLower))
            || (user.user_metadata?.full_name && user.user_metadata.full_name.toLowerCase().includes(searchLower))
        );
    }

    const userIds = filteredUsers.map(user => user.id);
    if (userIds.length === 0) {
        return res.status(200).json({
            users: [],
            total: 0,
            page,
            pageSize
        });
    }

    const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const { data: petitionCounts } = await supabaseAdmin
        .from('petitions')
        .select('user_id')
        .in('user_id', userIds);
    const petitionCountMap = new Map();
    petitionCounts?.forEach(row => {
        petitionCountMap.set(row.user_id, (petitionCountMap.get(row.user_id) || 0) + 1);
    });

    const { data: plans } = await supabaseAdmin
        .from('user_usage_plans')
        .select('user_id, plan_code, status, daily_limit, trial_starts_at, trial_ends_at')
        .in('user_id', userIds);
    const planMap = new Map(plans?.map(plan => [plan.user_id, plan]) || []);

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
};

const handlePatch = async (req, res, supabaseAdmin) => {
    const body = parseRequestBody(req);
    const { userId, planCode, status, dailyLimit, resetTodayUsage } = body;

    if (!userId || typeof userId !== 'string') {
        throw httpError(400, 'userId zorunludur.');
    }

    const existingPlan = await getOrCreateUserPlan(supabaseAdmin, userId);
    const updates = {};

    if (planCode !== undefined) {
        const normalizedPlanCode = normalizePlanCode(planCode);
        if (!normalizedPlanCode) {
            throw httpError(400, 'Gecersiz planCode degeri.');
        }
        updates.plan_code = normalizedPlanCode;
    }

    if (status !== undefined) {
        const normalizedStatus = normalizePlanStatus(status);
        if (!normalizedStatus) {
            throw httpError(400, 'Gecersiz status degeri.');
        }
        updates.status = normalizedStatus;
    }

    if (dailyLimit !== undefined) {
        if (dailyLimit === null || dailyLimit === '') {
            updates.daily_limit = null;
        } else {
            const normalizedLimit = parsePositiveLimit(dailyLimit);
            if (!normalizedLimit) {
                throw httpError(400, 'dailyLimit pozitif bir sayi olmali veya null olmalidir.');
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
        const { error: updateError } = await supabaseAdmin
            .from('user_usage_plans')
            .update(updates)
            .eq('user_id', userId);

        if (updateError) {
            throw updateError;
        }
    }

    if (resetTodayUsage) {
        const { error: resetError } = await supabaseAdmin
            .from('ai_generation_usage')
            .delete()
            .eq('user_id', userId)
            .eq('usage_date', getTodayIsoDate());

        if (resetError) {
            throw resetError;
        }
    }

    const summary = await buildPlanUsageSummary(supabaseAdmin, userId);
    res.status(200).json({ success: true, summary });
};

const handleCancelPlan = async (req, res, supabaseAdmin) => {
    const authenticatedUser = await getAuthenticatedUser(req);
    const stripeCancellation = await cancelStripeSubscriptionForUser({
        userId: authenticatedUser.id,
        email: authenticatedUser.email || '',
    });

    const summary = await buildPlanUsageSummary(supabaseAdmin, authenticatedUser.id);
    res.status(200).json({ success: true, summary, stripeCancellation });
};

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'GET, PATCH, POST, OPTIONS',
        headers: 'Content-Type, Authorization',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const action = String(req.query?.action || '').toLowerCase();
        if (req.method === 'GET' && action === 'plan-summary') {
            const authenticatedUser = await getAuthenticatedUser(req);
            const supabaseAdmin = createServiceRoleClient();
            const summary = await buildPlanUsageSummary(supabaseAdmin, authenticatedUser.id);
            return res.status(200).json({ summary });
        }
        if (req.method === 'POST' && action === 'cancel-plan') {
            const supabaseAdmin = createServiceRoleClient();
            return await handleCancelPlan(req, res, supabaseAdmin);
        }

        await requireAdminAuth(req);
        const supabaseAdmin = createServiceRoleClient();

        if (req.method === 'GET') {
            return await handleGet(req, res, supabaseAdmin);
        }

        return await handlePatch(req, res, supabaseAdmin);
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(error.status || 500).json({
            error: getSafeErrorMessage(error, 'Admin users API error'),
        });
    }
}
