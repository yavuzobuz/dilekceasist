// Templates API Endpoint
const TEMPLATES = [
    {
        id: '1',
        category: 'Hukuk',
        subcategory: 'Dava',
        title: 'Genel Dava Dilekçesi',
        description: 'Genel amaçlı dava dilekçesi şablonu',
        icon: 'FileText',
        isPremium: false,
        usageCount: 1250
    },
    {
        id: '2',
        category: 'İcra',
        subcategory: 'İcra Takibi',
        title: 'İlamsız İcra Takip Talebi',
        description: 'Genel haciz yoluyla ilamsız icra takibi başlatma talebi',
        icon: 'Gavel',
        isPremium: false,
        usageCount: 523
    },
    {
        id: '3',
        category: 'İcra',
        subcategory: 'İcra İtiraz',
        title: 'Borca İtiraz Dilekçesi',
        description: 'İcra takibine karşı borca itiraz',
        icon: 'ShieldX',
        isPremium: false,
        usageCount: 678
    },
    {
        id: '4',
        category: 'İş Hukuku',
        subcategory: 'İşe İade',
        title: 'İşe İade Davası Dilekçesi',
        description: 'Haksız fesih nedeniyle işe iade talebi',
        icon: 'UserCheck',
        isPremium: false,
        usageCount: 445
    },
    {
        id: '5',
        category: 'İş Hukuku',
        subcategory: 'Tazminat',
        title: 'Kıdem ve İhbar Tazminatı Davası',
        description: 'İş akdi feshi sonrası tazminat talebi',
        icon: 'Banknote',
        isPremium: false,
        usageCount: 567
    },
    {
        id: '6',
        category: 'Ceza',
        subcategory: 'Şikayet',
        title: 'Suç Duyurusu Dilekçesi',
        description: 'Savcılığa suç duyurusu',
        icon: 'AlertTriangle',
        isPremium: false,
        usageCount: 892
    },
    {
        id: '7',
        category: 'İdari',
        subcategory: 'İptal Davası',
        title: 'İdari İşlem İptal Davası',
        description: 'İdari işlemin iptali talebi',
        icon: 'Building2',
        isPremium: false,
        usageCount: 234
    },
    {
        id: '8',
        category: 'Hukuk',
        subcategory: 'İtiraz',
        title: 'Kaçak Elektrik İtirazı',
        description: 'Kaçak elektrik tahakkukuna itiraz dilekçesi',
        icon: 'Zap',
        isPremium: false,
        usageCount: 456
    }
];

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { category, search } = req.query;

        let filteredTemplates = TEMPLATES;

        // Filter by category
        if (category && category !== 'Tümü') {
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
