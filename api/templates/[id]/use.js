// Use template - fill variables and generate content
import { ICRA_TEMPLATES, IS_HUKUKU_TEMPLATES } from '../../../templates-part1.js';
import { TUKETICI_TEMPLATES, TICARET_TEMPLATES, MIRAS_TEMPLATES } from '../../../templates-part2.js';

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { id } = req.query;
        const { variables } = req.body;

        console.log(`[TEMPLATE USE] ID: ${id}, Variables received:`, JSON.stringify(variables, null, 2));

        const template = TEMPLATES.find(t => t.id === id);

        if (!template) {
            return res.status(404).json({ error: 'Şablon bulunamadı' });
        }

        let content = template.content;

        // Add current date
        const today = new Date().toLocaleDateString('tr-TR');
        content = content.replace(/\{\{TARIH\}\}/g, today);

        // Replace all variables
        if (variables) {
            for (const [key, value] of Object.entries(variables)) {
                const placeholder = '{{' + key + '}}';
                console.log('[TEMPLATE] Replacing:', placeholder, '->', value);
                content = content.split(placeholder).join(value || '');
            }
        }

        // Remove any remaining unreplaced variables
        content = content.replace(/\{\{[A-Z_]+\}\}/g, '[...]');

        res.json({
            success: true,
            content,
            title: template.title
        });

    } catch (error) {
        console.error('Template Use Error:', error);
        res.status(500).json({ error: error.message });
    }
}
