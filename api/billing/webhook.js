export const config = {
    api: {
        bodyParser: false,
    },
};

const getSafeErrorMessage = (error, fallbackMessage) => (
    process.env.NODE_ENV === 'production'
        ? fallbackMessage
        : (error?.message || fallbackMessage)
);

const readRawBody = async (req) => {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (req.body instanceof Uint8Array) return Buffer.from(req.body);
    if (typeof req.body === 'string') return Buffer.from(req.body);
    if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body));

    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { constructStripeWebhookEvent, processStripeWebhookEvent } = await import('../_lib/stripeCheckout.js');

        const signatureHeader = Array.isArray(req.headers['stripe-signature'])
            ? req.headers['stripe-signature'][0]
            : req.headers['stripe-signature'];

        const rawBody = await readRawBody(req);
        const event = constructStripeWebhookEvent({
            rawBody,
            signature: signatureHeader,
        });

        const result = await processStripeWebhookEvent(event);
        return res.status(200).json({
            received: true,
            handled: result?.handled !== false,
            eventType: event?.type || null,
            reason: result?.reason || null,
        });
    } catch (error) {
        console.error('Billing webhook error:', error);
        return res.status(error.status || 500).json({
            error: getSafeErrorMessage(error, 'Stripe webhook islenemedi'),
            details: error.details || error.message || null,
        });
    }
}
