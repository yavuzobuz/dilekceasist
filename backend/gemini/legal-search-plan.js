import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { generateLegalSearchPlan } from './legal-search-plan-core.js';

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization, x-api-key',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const rawText = String(req?.body?.rawText || '').trim();
        const preferredSource = String(req?.body?.preferredSource || 'all').trim();
        const payload = await generateLegalSearchPlan({ rawText, preferredSource });
        return res.status(200).json(payload);
    } catch (error) {
        console.error('Legal Search Plan Error:', error);
        const statusCode = Number(error?.status) || 500;
        return res.status(statusCode).json({
            error: getSafeErrorMessage(error, 'AI arama plani su anda olusturulamiyor.'),
        });
    }
}
