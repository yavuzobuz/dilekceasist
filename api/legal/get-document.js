import legalHandler from './index.js';

export default async function handler(req, res) {
    req.query = { ...(req.query || {}), action: 'get-document' };
    return legalHandler(req, res);
}
