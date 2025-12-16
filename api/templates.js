// Consolidated Templates API Endpoint
// Handles: GET /api/templates, GET /api/templates?id=X, POST /api/templates (use template)
import { ICRA_TEMPLATES, IS_HUKUKU_TEMPLATES } from '../templates-part1.js';
import { TUKETICI_TEMPLATES, TICARET_TEMPLATES, MIRAS_TEMPLATES } from '../templates-part2.js';

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // GET request - list templates or get single template
        if (req.method === 'GET') {
            const { category, search, id } = req.query;

            // If id is provided, return single template
            if (id) {
                const template = TEMPLATES.find(t => t.id === id);
                if (!template) {
                    return res.status(404).json({ error: 'Şablon bulunamadı' });
                }
                return res.json({ success: true, template });
            }

            // Otherwise, return list of templates
            let filteredTemplates = TEMPLATES.map(t => ({
                id: t.id,
                category: t.category,
                subcategory: t.subcategory,
                title: t.title,
                description: t.description,
                icon: t.icon,
                isPremium: t.isPremium,
                usageCount: t.usageCount,
                variableCount: t.variables?.length || 0
            }));

            // Filter by category
            if (category && category !== 'Tümü' && category !== 'all') {
                filteredTemplates = filteredTemplates.filter(t => t.category === category);
            }

            // Filter by search term
            if (search) {
                const searchLower = search.toLowerCase();
                filteredTemplates = filteredTemplates.filter(t =>
                    t.title.toLowerCase().includes(searchLower) ||
                    t.description.toLowerCase().includes(searchLower)
                );
            }

            return res.json({
                success: true,
                templates: filteredTemplates,
                total: filteredTemplates.length
            });
        }

        // POST request - use template (fill variables)
        if (req.method === 'POST') {
            const { id, variables } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'Template ID gerekli' });
            }

            console.log(`[TEMPLATE USE] ID: ${id}, Variables:`, JSON.stringify(variables, null, 2));

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
                    content = content.split(placeholder).join(value || '');
                }
            }

            // Remove any remaining unreplaced variables
            content = content.replace(/\{\{[A-Z_]+\}\}/g, '[...]');

            return res.json({
                success: true,
                content,
                title: template.title
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Templates Error:', error);
        res.status(500).json({ error: error.message });
    }
}
