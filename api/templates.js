// Consolidated Templates API Endpoint
// Handles:
// - GET /api/templates
// - GET /api/templates?id=X
// - POST /api/templates (single fill)
// - POST /api/templates with rows[] (bulk fill)
import { ICRA_TEMPLATES, IS_HUKUKU_TEMPLATES } from '../templates-part1.js';
import { TUKETICI_TEMPLATES, TICARET_TEMPLATES, MIRAS_TEMPLATES, CEZA_TEMPLATES, IDARI_TEMPLATES } from '../templates-part2.js';

const TEMPLATES = [
    ...ICRA_TEMPLATES,
    ...IS_HUKUKU_TEMPLATES,
    ...TUKETICI_TEMPLATES,
    ...TICARET_TEMPLATES,
    ...MIRAS_TEMPLATES,
    ...CEZA_TEMPLATES,
    ...IDARI_TEMPLATES,
];

const normalizeCategory = (value = '') => {
    return String(value)
        .toLowerCase()
        .replace(/\u0131/g, 'i')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
};

const fillTemplateContent = (templateContent, variables = {}) => {
    let content = templateContent;

    const today = new Date().toLocaleDateString('tr-TR');
    content = content.replace(/\{\{TARIH\}\}/g, today);

    for (const [key, value] of Object.entries(variables || {})) {
        const placeholder = `{{${key}}}`;
        const normalizedValue = value == null ? '' : String(value);
        content = content.split(placeholder).join(normalizedValue);
    }

    // Remove any remaining unreplaced variables
    content = content.replace(/\{\{[A-Z_]+\}\}/g, '[...]');

    return content;
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (req.method === 'GET') {
            console.log("TEMPLATES API GET HIT. URL:", req.url, "QUERY:", req.query);
            const { category, search, id } = req.query;

            if (id) {
                const template = TEMPLATES.find(t => t.id === id);
                if (!template) {
                    return res.status(404).json({ error: 'Sablon bulunamadi' });
                }
                return res.json({ success: true, template });
            }

            let filteredTemplates = TEMPLATES.map(t => ({
                id: t.id,
                category: t.category,
                subcategory: t.subcategory,
                title: t.title,
                description: t.description,
                icon: t.icon,
                isPremium: t.isPremium,
                usageCount: t.usageCount,
                variableCount: t.variables?.length || 0,
            }));

            const normalizedCategory = normalizeCategory(category);
            if (normalizedCategory && normalizedCategory !== 'tumu' && normalizedCategory !== 'all') {
                filteredTemplates = filteredTemplates.filter(t =>
                    normalizeCategory(t.category) === normalizedCategory
                );
            }

            if (search) {
                const searchLower = search.toLowerCase();
                filteredTemplates = filteredTemplates.filter(t =>
                    t.title.toLowerCase().includes(searchLower) ||
                    t.description.toLowerCase().includes(searchLower)
                );
            }

            return res.json({
                success: true,
                query: req.query,
                originalUrl: req.originalUrl,
                templates: filteredTemplates,
                total: filteredTemplates.length,
            });
        }

        if (req.method === 'POST') {
            const { id, variables, rows } = req.body || {};

            if (!id) {
                return res.status(400).json({ error: 'Template ID gerekli' });
            }

            const template = TEMPLATES.find(t => t.id === id);
            if (!template) {
                return res.status(404).json({ error: 'Sablon bulunamadi' });
            }

            // Bulk mode
            if (Array.isArray(rows)) {
                const generatedRows = rows.map((rowVariables = {}, index) => ({
                    index,
                    variables: rowVariables,
                    content: fillTemplateContent(template.content, rowVariables),
                }));

                return res.json({
                    success: true,
                    title: template.title,
                    total: generatedRows.length,
                    rows: generatedRows,
                });
            }

            // Single mode
            console.log(`[TEMPLATE USE] ID: ${id}, Variables:`, JSON.stringify(variables, null, 2));
            const content = fillTemplateContent(template.content, variables);

            return res.json({
                success: true,
                content,
                title: template.title,
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Templates Error:', error);
        res.status(500).json({ error: error.message });
    }
}

