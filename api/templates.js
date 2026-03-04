// Consolidated Templates API Endpoint
// Handles:
// - GET /api/templates
// - GET /api/templates?id=X
// - POST /api/templates (single fill)
// - POST /api/templates with rows[] (bulk fill)
import { ICRA_TEMPLATES, IS_HUKUKU_TEMPLATES } from '../templates-part1.js';
import { TUKETICI_TEMPLATES, TICARET_TEMPLATES, MIRAS_TEMPLATES, CEZA_TEMPLATES, IDARI_TEMPLATES } from '../templates-part2.js';
import { SOZLESME_VE_IHTARNAME_TEMPLATES } from '../templates-part3.js';
import { applyCors, getSafeErrorMessage } from './_lib/cors.js';

const TEMPLATES = [
    ...ICRA_TEMPLATES,
    ...IS_HUKUKU_TEMPLATES,
    ...TUKETICI_TEMPLATES,
    ...TICARET_TEMPLATES,
    ...MIRAS_TEMPLATES,
    ...CEZA_TEMPLATES,
    ...IDARI_TEMPLATES,
    ...SOZLESME_VE_IHTARNAME_TEMPLATES,
];

const CP1252_REVERSE_BYTE_MAP = new Map([
    [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
    [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88],
    [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
    [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
    [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
    [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F],
]);

const MOJIBAKE_DETECTION = /[ÃÄÅÂ]/;

const decodePotentialMojibake = (value) => {
    if (typeof value !== 'string' || !MOJIBAKE_DETECTION.test(value)) return value;

    const bytes = [];
    for (const char of value) {
        const codePoint = char.codePointAt(0);
        if (codePoint == null) continue;

        if (codePoint <= 0xFF) {
            bytes.push(codePoint);
            continue;
        }

        const cp1252Byte = CP1252_REVERSE_BYTE_MAP.get(codePoint);
        if (cp1252Byte == null) {
            return value;
        }
        bytes.push(cp1252Byte);
    }

    try {
        return Buffer.from(bytes).toString('utf8');
    } catch {
        return value;
    }
};

const deepSanitizeText = (input) => {
    if (typeof input === 'string') return decodePotentialMojibake(input);
    if (Array.isArray(input)) return input.map(item => deepSanitizeText(item));
    if (input && typeof input === 'object') {
        return Object.fromEntries(
            Object.entries(input).map(([key, value]) => [key, deepSanitizeText(value)])
        );
    }
    return input;
};

const SANITIZED_TEMPLATES = TEMPLATES.map(template => deepSanitizeText(template));

const normalizeCategory = (value = '') => {
    return String(value)
        .toLowerCase()
        .replace(/\u0131/g, 'i')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
};

const resolveTemplateSection = (template = {}) => {
    const category = normalizeCategory(template.category);
    const subcategory = normalizeCategory(template.subcategory);
    const title = normalizeCategory(template.title);
    const description = normalizeCategory(template.description);
    const combined = `${category}${subcategory}${title}${description}`;

    const isNotice = category.includes('ihtar')
        || subcategory.includes('ihtar')
        || title.includes('ihtar')
        || combined.includes('ihtarname');
    if (isNotice) return 'notices';

    const isContract = category.includes('sozles')
        || subcategory.includes('sozles')
        || title.includes('sozles')
        || combined.includes('sozlesme');
    if (isContract) return 'contracts';

    return 'other';
};

const removeMarkdownMarkers = (value = '') => {
    return String(value)
        .replace(/^\s*##\s*/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*\*/g, '');
};

const resolveTemplateContent = (template) => {
    const section = resolveTemplateSection(template);
    const content = template?.content || '';
    if (section === 'contracts' || section === 'notices') {
        return removeMarkdownMarkers(content);
    }
    return content;
};

const fillTemplateContent = (template, variables = {}) => {
    let content = resolveTemplateContent(template);

    const today = new Date().toLocaleDateString('tr-TR');
    content = content.replace(/\{\{\s*TARIH\s*\}\}/gi, today);

    for (const [key, value] of Object.entries(variables || {})) {
        const normalizedValue = value == null ? '' : String(value);
        const placeholderRegex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
        content = content.replace(placeholderRegex, normalizedValue);
    }

    // Remove any remaining unreplaced variables
    content = content.replace(/\{\{\s*[A-Z0-9_]+\s*\}\}/gi, '[...]');

    return content;
};

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'GET, POST, OPTIONS',
        headers: 'Content-Type, Authorization',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (req.method === 'GET') {
            if (process.env.NODE_ENV !== 'production') {
                console.log('TEMPLATES API GET HIT. URL:', req.url);
            }
            const { category, search, id } = req.query;

            if (id) {
                const template = SANITIZED_TEMPLATES.find(t => t.id === id);
                if (!template) {
                    return res.status(404).json({ error: 'Sablon bulunamadi' });
                }
                return res.json({
                    success: true,
                    template: {
                        ...template,
                        content: resolveTemplateContent(template),
                    },
                });
            }

            let filteredTemplates = SANITIZED_TEMPLATES.map(t => ({
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

            const template = SANITIZED_TEMPLATES.find(t => t.id === id);
            if (!template) {
                return res.status(404).json({ error: 'Sablon bulunamadi' });
            }

            // Bulk mode
            if (Array.isArray(rows)) {
                const generatedRows = rows.map((rowVariables = {}, index) => ({
                    index,
                    variables: rowVariables,
                    content: fillTemplateContent(template, rowVariables),
                }));

                return res.json({
                    success: true,
                    title: template.title,
                    total: generatedRows.length,
                    rows: generatedRows,
                });
            }

            // Single mode
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[TEMPLATE USE] ID: ${id}, variableCount: ${variables ? Object.keys(variables).length : 0}`);
            }
            const content = fillTemplateContent(template, variables);

            return res.json({
                success: true,
                content,
                title: template.title,
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Templates Error:', error);
        res.status(500).json({ error: getSafeErrorMessage(error, 'Templates API error') });
    }
}
