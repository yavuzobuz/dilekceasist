// Templates API Endpoint - Full Template Library
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { category, search } = req.query;

        // Map templates to list format (without full content)
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

        res.json({
            success: true,
            templates: filteredTemplates,
            total: filteredTemplates.length
        });

    } catch (error) {
        console.error('Templates Error:', error);
        res.status(500).json({ error: error.message });
    }
}

// Export TEMPLATES for use by other API routes
export { TEMPLATES };
