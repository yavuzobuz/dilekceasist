import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const TRIAL_DURATION_DAYS = Math.max(1, Number.parseInt(process.env.TRIAL_DURATION_DAYS || '14', 10));
export const TRIAL_DAILY_GENERATION_LIMIT = Math.max(1, Number.parseInt(process.env.TRIAL_DAILY_GENERATION_LIMIT || '10', 10));

const httpError = (status, message, code) => {
    const error = new Error(message);
    error.status = status;
    if (code) {
        error.code = code;
    }
    return error;
};

const ensureSupabaseConfig = () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
        throw httpError(500, 'Supabase config missing for generation quota checks.', 'SUPABASE_CONFIG_MISSING');
    }
};

export const getBearerToken = (authorizationHeader = '') => {
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

const createServiceRoleClient = () => {
    ensureSupabaseConfig();
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        }
    });
};

const getAuthenticatedUserFromRequest = async (req) => {
    ensureSupabaseConfig();

    const token = getBearerToken(req?.headers?.authorization);
    if (!token) {
        throw httpError(401, 'Belge uretimi icin giris yapmaniz gerekiyor.', 'AUTH_REQUIRED');
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
        throw httpError(401, 'Gecersiz oturum. Lutfen tekrar giris yapin.', 'INVALID_SESSION');
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

export const consumeGenerationCredit = async (req, actionType = 'document_generation') => {
    try {
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
    } catch (error) {
        if (error?.status) {
            return {
                allowed: false,
                status: error.status,
                payload: {
                    error: error.message || 'Belge uretim kotasi kontrolu basarisiz.',
                    code: error.code || (error.status === 401 ? 'AUTH_REQUIRED' : 'CREDIT_CHECK_FAILED')
                }
            };
        }
        throw error;
    }
};
