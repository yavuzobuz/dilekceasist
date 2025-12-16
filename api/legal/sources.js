export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    res.json({
        sources: [
            { id: 'yargitay', name: 'Yargıtay', description: 'Yargıtay Kararları' },
            { id: 'danistay', name: 'Danıştay', description: 'Danıştay Kararları' },
            { id: 'uyap', name: 'Emsal (UYAP)', description: 'Emsal Kararlar' },
            { id: 'anayasa', name: 'Anayasa Mahkemesi', description: 'AYM Kararları' },
            { id: 'kik', name: 'Kamu İhale Kurulu', description: 'KİK Kararları' },
        ]
    });
}
