import handler from '../../backend/legal/search-decisions.js';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '1mb',
        },
    },
    maxDuration: 60,
};

export default handler;
