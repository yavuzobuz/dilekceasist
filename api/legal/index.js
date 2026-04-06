import legalActionHandler from './[action].js';

const normalizeAction = (value) => {
    if (Array.isArray(value)) return String(value[0] || '').trim().toLowerCase();
    return String(value || '').trim().toLowerCase();
};

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    const requestedAction = normalizeAction(req?.query?.action || req?.body?.action);

    if (requestedAction) {
        req.query = { ...(req.query || {}), action: requestedAction };
    } else if (req.method === 'GET') {
        req.query = { ...(req.query || {}), action: 'sources' };
    }

    return legalActionHandler(req, res);
}
