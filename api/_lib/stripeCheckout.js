import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const PLAN_TO_PRICE_ENV_KEY = {
    pro: 'STRIPE_PRICE_ID_PRO',
    team: 'STRIPE_PRICE_ID_TEAM',
};

const normalizeOrigin = (origin = '') => String(origin || '').trim().replace(/\/+$/, '').toLowerCase();

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

const TRIAL_DURATION_DAYS = Math.max(1, Number.parseInt(process.env.TRIAL_DURATION_DAYS || '14', 10));
const TRIAL_DAILY_GENERATION_LIMIT = Math.max(1, Number.parseInt(process.env.TRIAL_DAILY_GENERATION_LIMIT || '10', 10));
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CANCELABLE_SUBSCRIPTION_STATUSES = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete']);

const httpError = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const normalizeHttpUrl = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) return null;
    return raw.replace(/\/+$/, '');
};

const buildRequestBaseUrl = (req) => {
    const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim();
    const forwardedHost = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
        .split(',')[0]
        .trim();

    if (forwardedHost) {
        return `${forwardedProto || 'https'}://${forwardedHost}`;
    }

    if (req?.protocol && req?.headers?.host) {
        return `${req.protocol}://${req.headers.host}`;
    }

    return null;
};

const parsePositiveLimit = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return Math.floor(parsed);
};

const getTrialWindow = () => {
    const now = new Date();
    return {
        trialStartsAt: now.toISOString(),
        trialEndsAt: new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    };
};

const createServiceRoleClient = () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw httpError(500, 'Supabase service role bilgileri eksik.');
    }

    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        }
    });
};

const escapeStripeSearchValue = (value = '') => String(value || '').replace(/'/g, "\\'");

export const normalizePaidPlan = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'pro' || normalized === 'team') {
        return normalized;
    }
    return null;
};

export const parseRequestBody = (req) => {
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

export const resolveAppBaseUrl = (req) => {
    const allowedOrigins = new Set(parseOriginList(
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

    const candidates = [
        process.env.APP_BASE_URL,
        process.env.FRONTEND_URL,
        req?.headers?.origin,
        buildRequestBaseUrl(req),
    ];

    for (const candidate of candidates) {
        const normalized = normalizeHttpUrl(candidate);
        if (!normalized) continue;

        const normalizedCandidate = normalizeOrigin(normalized);
        if (allowedOrigins.has(normalizedCandidate)) {
            return normalized;
        }

        if (process.env.NODE_ENV !== 'production' && isLocalDevOrigin(normalized)) {
            return normalized;
        }
    }

    // Fallback to request-derived origin when CORS already admitted the request.
    const requestOrigin = normalizeHttpUrl(req?.headers?.origin);
    if (requestOrigin) {
        return requestOrigin;
    }

    const requestBaseUrl = normalizeHttpUrl(buildRequestBaseUrl(req));
    if (requestBaseUrl) {
        return requestBaseUrl;
    }

    return null;
};

let stripeClient = null;

const getStripeWebhookSecret = () => {
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    if (!webhookSecret) {
        throw httpError(500, 'STRIPE_WEBHOOK_SECRET yapilandirilmamis.');
    }
    return webhookSecret;
};

const getStripeClient = () => {
    const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
    if (!stripeSecretKey) {
        throw httpError(500, 'STRIPE_SECRET_KEY yapilandirilmamis.');
    }

    if (!stripeClient) {
        stripeClient = new Stripe(stripeSecretKey);
    }

    return stripeClient;
};

const getPriceIdForPlan = (plan) => {
    const envKey = PLAN_TO_PRICE_ENV_KEY[plan];
    const priceId = String((envKey && process.env[envKey]) || '').trim();

    if (!envKey || !priceId) {
        throw httpError(500, `${envKey || 'STRIPE_PRICE_ID'} yapilandirilmamis.`);
    }

    return priceId;
};

const resolvePlanFromPriceId = (priceId = '') => {
    const normalizedPriceId = String(priceId || '').trim();
    if (!normalizedPriceId) return null;

    for (const [plan, envKey] of Object.entries(PLAN_TO_PRICE_ENV_KEY)) {
        const candidate = String(process.env[envKey] || '').trim();
        if (candidate && candidate === normalizedPriceId) {
            return plan;
        }
    }

    return null;
};

const mapStripeSubscriptionStatusToPlanStatus = (stripeStatus = '') => {
    const normalized = String(stripeStatus || '').trim().toLowerCase();

    if (normalized === 'active' || normalized === 'trialing') {
        return 'active';
    }

    if (normalized === 'past_due' || normalized === 'unpaid' || normalized === 'incomplete' || normalized === 'incomplete_expired') {
        return 'suspended';
    }

    return 'inactive';
};

const derivePlanFromSubscription = (subscription = {}) => {
    const metadataPlan = normalizePaidPlan(subscription?.metadata?.plan);
    if (metadataPlan) return metadataPlan;

    const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
    for (const item of items) {
        const plan = resolvePlanFromPriceId(item?.price?.id);
        if (plan) return plan;
    }

    return null;
};

const ensureUserUsagePlanRow = async (serviceClient, userId) => {
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

    const { trialStartsAt, trialEndsAt } = getTrialWindow();
    const payload = {
        user_id: userId,
        plan_code: 'trial',
        status: 'active',
        trial_starts_at: trialStartsAt,
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

const updateUserUsagePlan = async ({ userId, plan = null, status = null }) => {
    const serviceClient = createServiceRoleClient();
    const existingPlan = await ensureUserUsagePlanRow(serviceClient, userId);
    const updates = {};

    const normalizedPlan = normalizePaidPlan(plan);
    const effectivePlan = normalizedPlan || String(existingPlan?.plan_code || 'trial').toLowerCase();

    if (normalizedPlan) {
        updates.plan_code = normalizedPlan;
    }

    if (status) {
        updates.status = status;
    }

    if (effectivePlan === 'trial') {
        const { trialStartsAt, trialEndsAt } = getTrialWindow();
        updates.daily_limit = parsePositiveLimit(existingPlan?.daily_limit) || TRIAL_DAILY_GENERATION_LIMIT;
        updates.trial_starts_at = existingPlan?.trial_starts_at || trialStartsAt;
        updates.trial_ends_at = existingPlan?.trial_ends_at || trialEndsAt;
    } else {
        updates.daily_limit = null;
    }

    const { data: updatedPlan, error: updateError } = await serviceClient
        .from('user_usage_plans')
        .update(updates)
        .eq('user_id', userId)
        .select('*')
        .maybeSingle();

    if (updateError) {
        throw updateError;
    }

    return updatedPlan || { ...existingPlan, ...updates };
};

const toWebhookBuffer = (rawBody) => {
    if (Buffer.isBuffer(rawBody)) return rawBody;
    if (rawBody instanceof Uint8Array) return Buffer.from(rawBody);
    if (typeof rawBody === 'string') return Buffer.from(rawBody);
    if (rawBody && typeof rawBody === 'object') return Buffer.from(JSON.stringify(rawBody));
    throw httpError(400, 'Webhook body okunamadi.');
};

const getUserIdFromSubscription = (subscription = {}) => {
    const metadataUserId = String(subscription?.metadata?.userId || '').trim();
    if (metadataUserId) return metadataUserId;
    return null;
};

const getUserIdFromCheckoutSession = (session = {}) => {
    const metadataUserId = String(session?.metadata?.userId || '').trim();
    if (metadataUserId) return metadataUserId;

    const clientReferenceId = String(session?.client_reference_id || '').trim();
    if (clientReferenceId) return clientReferenceId;

    return null;
};

const processCheckoutCompletedEvent = async (event) => {
    const session = event?.data?.object || {};
    if (session?.mode !== 'subscription') {
        return { handled: false, reason: 'non_subscription_checkout' };
    }

    const userId = getUserIdFromCheckoutSession(session);
    const plan = normalizePaidPlan(session?.metadata?.plan);

    if (!userId || !plan) {
        return { handled: false, reason: 'missing_user_or_plan' };
    }

    await updateUserUsagePlan({
        userId,
        plan,
        status: 'active',
    });

    return {
        handled: true,
        userId,
        plan,
        status: 'active',
    };
};

const processSubscriptionUpdatedEvent = async (event) => {
    const subscription = event?.data?.object || {};
    const userId = getUserIdFromSubscription(subscription);
    if (!userId) {
        return { handled: false, reason: 'missing_user_id' };
    }

    const plan = derivePlanFromSubscription(subscription);
    const status = mapStripeSubscriptionStatusToPlanStatus(subscription?.status);

    await updateUserUsagePlan({
        userId,
        plan,
        status,
    });

    return {
        handled: true,
        userId,
        plan,
        status,
    };
};

const processSubscriptionDeletedEvent = async (event) => {
    const subscription = event?.data?.object || {};
    const userId = getUserIdFromSubscription(subscription);
    if (!userId) {
        return { handled: false, reason: 'missing_user_id' };
    }

    const plan = derivePlanFromSubscription(subscription);

    await updateUserUsagePlan({
        userId,
        plan,
        status: 'inactive',
    });

    return {
        handled: true,
        userId,
        plan,
        status: 'inactive',
    };
};

const isCancelableStripeSubscriptionStatus = (status = '') => {
    const normalized = String(status || '').trim().toLowerCase();
    return CANCELABLE_SUBSCRIPTION_STATUSES.has(normalized);
};

const pickMostRecentCancelableSubscription = (subscriptions = []) => {
    return (subscriptions || [])
        .filter(subscription => isCancelableStripeSubscriptionStatus(subscription?.status))
        .sort((a, b) => Number(b?.created || 0) - Number(a?.created || 0))[0] || null;
};

const findActiveSubscriptionByUserId = async ({ stripe, userId }) => {
    if (!userId) return null;

    const query = `metadata['userId']:'${escapeStripeSearchValue(userId)}'`;
    try {
        const result = await stripe.subscriptions.search({
            query,
            limit: 20,
        });
        const matched = pickMostRecentCancelableSubscription(result?.data || []);
        if (matched) return matched;
    } catch (error) {
        console.warn('Stripe subscription search by userId failed:', error?.message || error);
    }

    return null;
};

const findActiveSubscriptionByEmail = async ({ stripe, email }) => {
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) return null;

    let customers = [];
    try {
        const result = await stripe.customers.list({
            email: normalizedEmail,
            limit: 10,
        });
        customers = result?.data || [];
    } catch (error) {
        console.warn('Stripe customer lookup by email failed:', error?.message || error);
        return null;
    }

    const subscriptions = [];
    for (const customer of customers) {
        try {
            const response = await stripe.subscriptions.list({
                customer: customer.id,
                status: 'all',
                limit: 20,
            });
            subscriptions.push(...(response?.data || []));
        } catch (error) {
            console.warn('Stripe subscription list by customer failed:', error?.message || error);
        }
    }

    return pickMostRecentCancelableSubscription(subscriptions);
};

export const constructStripeWebhookEvent = ({ rawBody, signature }) => {
    const stripeSignature = String(signature || '').trim();
    if (!stripeSignature) {
        throw httpError(400, 'Stripe-Signature basligi eksik.');
    }

    const stripe = getStripeClient();
    const webhookSecret = getStripeWebhookSecret();
    const bodyBuffer = toWebhookBuffer(rawBody);

    try {
        return stripe.webhooks.constructEvent(bodyBuffer, stripeSignature, webhookSecret);
    } catch (error) {
        const signatureError = httpError(400, 'Stripe webhook imza dogrulamasi basarisiz.');
        signatureError.details = error?.message || null;
        throw signatureError;
    }
};

export const processStripeWebhookEvent = async (event) => {
    const eventType = String(event?.type || '');

    switch (eventType) {
        case 'checkout.session.completed':
            return processCheckoutCompletedEvent(event);
        case 'customer.subscription.updated':
            return processSubscriptionUpdatedEvent(event);
        case 'customer.subscription.deleted':
            return processSubscriptionDeletedEvent(event);
        default:
            return { handled: false, reason: 'event_type_not_handled', eventType };
    }
};

export const cancelStripeSubscriptionForUser = async ({ userId, email }) => {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
        throw httpError(400, 'Kullanici bilgisi gecersiz.');
    }

    let stripe = null;
    try {
        stripe = getStripeClient();
    } catch (error) {
        // Keep local cancellation behavior for environments without Stripe config.
        if (error?.status === 500) {
            await updateUserUsagePlan({
                userId: normalizedUserId,
                status: 'inactive',
            });

            return {
                cancelled: false,
                reason: 'stripe_not_configured',
                subscriptionId: null,
                plan: null,
            };
        }
        throw error;
    }

    const byUserId = await findActiveSubscriptionByUserId({ stripe, userId: normalizedUserId });
    const subscription = byUserId || await findActiveSubscriptionByEmail({ stripe, email });

    if (!subscription) {
        await updateUserUsagePlan({
            userId: normalizedUserId,
            status: 'inactive',
        });

        return {
            cancelled: false,
            reason: 'subscription_not_found',
            subscriptionId: null,
            plan: null,
        };
    }

    const cancelledSubscription = await stripe.subscriptions.cancel(subscription.id);
    const plan = derivePlanFromSubscription(cancelledSubscription) || derivePlanFromSubscription(subscription);
    const status = mapStripeSubscriptionStatusToPlanStatus(cancelledSubscription?.status || 'canceled');

    await updateUserUsagePlan({
        userId: normalizedUserId,
        plan,
        status,
    });

    return {
        cancelled: true,
        reason: null,
        subscriptionId: cancelledSubscription?.id || subscription.id,
        plan,
        stripeStatus: cancelledSubscription?.status || 'canceled',
    };
};

export const createStripeCheckoutSession = async ({ req, user, plan, idempotencyKey }) => {
    const baseUrl = resolveAppBaseUrl(req);
    if (!baseUrl) {
        throw httpError(500, 'APP_BASE_URL veya FRONTEND_URL yapilandirilmamis.');
    }

    const stripe = getStripeClient();
    const priceId = getPriceIdForPlan(plan);

    const successUrl = `${baseUrl}/profile?billing=success&plan=${encodeURIComponent(plan)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/fiyatlandirma?billing=cancelled&plan=${encodeURIComponent(plan)}`;

    const sessionPayload = {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: user.id,
        customer_email: user.email || undefined,
        allow_promotion_codes: true,
        metadata: {
            userId: user.id,
            plan,
        },
        subscription_data: {
            metadata: {
                userId: user.id,
                plan,
            },
        },
    };

    const requestOptions = {};
    if (idempotencyKey) {
        requestOptions.idempotencyKey = String(idempotencyKey).slice(0, 255);
    }

    const session = await stripe.checkout.sessions.create(sessionPayload, requestOptions);

    if (!session?.url) {
        throw httpError(500, 'Stripe checkout oturumu olusturulamadi.');
    }

    return session;
};

export const confirmStripeCheckoutSessionForUser = async ({ sessionId, userId }) => {
    const normalizedSessionId = String(sessionId || '').trim();
    const normalizedUserId = String(userId || '').trim();

    if (!normalizedSessionId || !normalizedSessionId.startsWith('cs_')) {
        throw httpError(400, 'Gecersiz checkout session id.');
    }

    if (!normalizedUserId) {
        throw httpError(400, 'Gecersiz kullanici bilgisi.');
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(normalizedSessionId);

    if (!session) {
        throw httpError(404, 'Checkout session bulunamadi.');
    }

    if (String(session?.mode || '') !== 'subscription') {
        return { handled: false, reason: 'non_subscription_checkout' };
    }

    const sessionUserId = getUserIdFromCheckoutSession(session);
    if (!sessionUserId || sessionUserId !== normalizedUserId) {
        throw httpError(403, 'Checkout session kullanici ile eslesmiyor.');
    }

    let plan = normalizePaidPlan(session?.metadata?.plan);
    if (!plan && session?.subscription) {
        const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id;

        if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
                expand: ['items.data.price'],
            });
            plan = derivePlanFromSubscription(subscription);
        }
    }

    if (!plan) {
        throw httpError(400, 'Checkout session plan bilgisi bulunamadi.');
    }

    const sessionStatus = String(session?.status || '').toLowerCase();
    const paymentStatus = String(session?.payment_status || '').toLowerCase();
    const isCompleted = sessionStatus === 'complete';
    const isPayableState = paymentStatus === 'paid' || paymentStatus === 'no_payment_required';

    if (!isCompleted || !isPayableState) {
        return {
            handled: false,
            reason: 'checkout_not_completed',
            sessionStatus,
            paymentStatus,
        };
    }

    const updatedPlan = await updateUserUsagePlan({
        userId: normalizedUserId,
        plan,
        status: 'active',
    });

    return {
        handled: true,
        reason: null,
        plan,
        sessionStatus,
        paymentStatus,
        summary: {
            user_id: normalizedUserId,
            plan_code: String(updatedPlan?.plan_code || plan),
            status: String(updatedPlan?.status || 'active'),
            daily_limit: parsePositiveLimit(updatedPlan?.daily_limit),
            trial_starts_at: updatedPlan?.trial_starts_at || null,
            trial_ends_at: updatedPlan?.trial_ends_at || null,
        },
    };
};
