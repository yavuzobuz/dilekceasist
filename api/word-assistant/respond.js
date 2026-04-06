import handler from '../../backend/word/respond.js';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '15mb',
        },
    },
    maxDuration: 60,
};

export default handler;
