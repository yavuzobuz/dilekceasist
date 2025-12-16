import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-2.5-pro';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { keywords } = req.body;

        const systemInstruction = `Sen, Türk hukuku alanında uzman bir araştırma asistanısın. 
Görevin özellikle YARGITAY KARARLARI bulmak ve bunları dilekçede kullanılabilir formatta sunmaktır.

## KRİTİK GÖREV: YARGITAY KARARLARI BULMA

Her aramada şunları tespit etmeye çalış:
1. **Karar Künyesi:** Daire, Esas No, Karar No, Tarih
2. **Karar Özeti:** 1-2 cümlelik özet
3. **İlgili Kanun Maddesi:** Kararda atıf yapılan mevzuat

## ÇIKTI FORMATI

### EMSAL YARGITAY KARARLARI
**1. [Yargıtay X. HD., E. XXXX/XXXX, K. XXXX/XXXX, T. XX.XX.XXXX]**
Özet: [Kararın özeti]
İlgili Mevzuat: [Kanun maddesi]

### İLGİLİ MEVZUAT
- [Kanun Adı] m. [madde no]: [madde özeti]

### ARAŞTIRMA ÖZETİ
[Bulunan karar ve mevzuata dayalı genel hukuki değerlendirme]`;

        const yargitayQueries = keywords.map(kw => `"${kw}" Yargıtay karar emsal`);
        const mevzuatQueries = keywords.map(kw => `"${kw}" kanun maddesi hüküm`);

        const promptText = `
## ARAMA GÖREVİ: YARGITAY KARARLARI VE MEVZUAT

### ANAHTAR KELİMELER
${keywords.join(', ')}

### ARAMA STRATEJİSİ
**1. Yargıtay Kararları (Öncelikli)**
${yargitayQueries.map(q => `- ${q}`).join('\n')}

**2. Mevzuat Araması**
${mevzuatQueries.map(q => `- ${q}`).join('\n')}

## BEKLENTİLER
1. En az 3-5 Yargıtay kararı bul
2. Her karar için TAM KÜNYESİNİ yaz
3. İlgili kanun maddelerini listele
`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: promptText,
            config: {
                tools: [{ googleSearch: {} }],
                systemInstruction: systemInstruction,
            },
        });

        res.json({
            text: response.text,
            groundingMetadata: response.candidates?.[0]?.groundingMetadata
        });

    } catch (error) {
        console.error('Web Search Error:', error);
        res.status(500).json({ error: error.message });
    }
}
