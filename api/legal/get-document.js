export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { source, documentId, documentUrl } = req.body;

        if (!documentId && !documentUrl) {
            return res.status(400).json({ error: 'documentId veya documentUrl gereklidir.' });
        }

        res.json({
            success: true,
            source,
            document: {
                content: `Belge detayları için lütfen resmi kaynaklara başvurun:
                
• Yargıtay: https://karararama.yargitay.gov.tr
• Danıştay: https://www.danistay.gov.tr/karar-arama
• UYAP Emsal: https://emsal.uyap.gov.tr

Belge ID: ${documentId || documentUrl}`,
                note: 'Tam metin erişimi için resmi portalleri kullanın.'
            }
        });

    } catch (error) {
        console.error('Get Document Error:', error);
        res.status(500).json({ error: 'Belge alınırken bir hata oluştu.', details: error.message });
    }
}
