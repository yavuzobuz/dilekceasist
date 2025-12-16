// Get single template by ID
import { ICRA_TEMPLATES, IS_HUKUKU_TEMPLATES } from '../../templates-part1.js';
import { TUKETICI_TEMPLATES, TICARET_TEMPLATES, MIRAS_TEMPLATES } from '../../templates-part2.js';

// Combine all templates
const TEMPLATES = [
    ...ICRA_TEMPLATES,
    ...IS_HUKUKU_TEMPLATES,
    ...TUKETICI_TEMPLATES,
    ...TICARET_TEMPLATES,
    ...MIRAS_TEMPLATES
];

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { id } = req.query;

        const template = TEMPLATES.find(t => t.id === id);

        if (!template) {
            return res.status(404).json({ error: 'Şablon bulunamadı' });
        }

        res.json({
            success: true,
            template
        });

    } catch (error) {
        console.error('Template Detail Error:', error);
        res.status(500).json({ error: error.message });
    }
}
