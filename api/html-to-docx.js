import htmlToDocx from 'html-to-docx';
import { applyCors, getSafeErrorMessage } from './_lib/cors.js';

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { html, options } = req.body;

        if (!html) {
            return res.status(400).json({ error: 'HTML content is required' });
        }

        const documentOptions = {
            ...options,
            table: { row: { cantSplit: true } },
            footer: true,
            pageNumber: true,
        };

        const fileBuffer = await htmlToDocx(html, null, documentOptions);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename=dilekce.docx');
        res.send(Buffer.from(fileBuffer));

    } catch (error) {
        console.error('DOCX Error:', error);
        res.status(500).json({ error: getSafeErrorMessage(error, 'DOCX olusturulamadi.') });
    }
}
