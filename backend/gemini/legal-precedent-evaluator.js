import { getGeminiClient, GEMINI_MODEL_NAME } from './_shared.js';

const EVALUATION_TIMEOUT_MS = 30000;

/**
 * Kararları batch olarak değerlendirip sınıflandırır.
 * 
 * @param {Object} options
 * @param {Array} options.decisions - Bedesten'den dönen karar nesneleri
 * @param {string} options.caseContext - Kullanıcının olay özeti veya araması
 * @param {string} [options.userRole] - Kullanıcı rolü: 'davaci', 'davali', 'sanik', 'notr'
 * @param {number} [options.topN=10] - Değerlendirilecek maksimum karar sayısı
 * @returns {Promise<Object>} Gruplandırılmış ve etiketlenmiş kararlar
 */
export async function evaluatePrecedents({
    decisions = [],
    caseContext = '',
    userRole = 'notr',
    topN = 10,
} = {}) {
    if (!Array.isArray(decisions) || decisions.length === 0) {
        return {
            evaluated: [],
            groups: { davaci_lehine: [], davali_lehine: [], notr: [] },
            _metadata: { totalInput: 0, totalEvaluated: 0, error: null },
        };
    }

    const candidates = decisions.slice(0, topN);

    const decisionSummaries = candidates.map((d, i) => {
        const text = d?.ozet || d?.summaryText || d?.snippet || d?.karar_ozeti || '';
        const court = d?.daire || d?.kurum_dairesi || '';
        const date = d?.tarih || '';
        const esas = d?.esasNo || '';
        return `[${i + 1}] ${court} ${date} ${esas}\n${text.slice(0, 400)}`;
    }).join('\n\n---\n\n');

    const roleLabel = {
        davaci: 'Davacı (iddia eden taraf)',
        davali: 'Davalı (savunan taraf)',
        sanik: 'Sanık (ceza davasında yargılanan)',
        notr: 'Tarafsız araştırmacı',
    }[userRole] || 'Tarafsız araştırmacı';

    const systemPrompt = `Sen kidemli bir hukuk arastirmacisisin.
Sana bir hukuki olay ozeti ve ${candidates.length} adet Yargitay/Danistay karari verilecek.
Kullanicinin rolu: ${roleLabel}

Her bir karari asagidaki JSON formatinda degerlendirip siniflandir:
{
  "evaluations": [
    {
      "index": 1,
      "category": "davaci_lehine" | "davali_lehine" | "notr",
      "relevanceScore": 0-100,
      "summary": "Bu karar neden bu kategoride? (1 cumle)"
    }
  ]
}

Kurallar:
1. "davaci_lehine": Davacinin/sikayetcinin talebini destekleyen kararlar (kabul, tazminata hukmedilmesi vb.)
2. "davali_lehine": Davalinin/sanigin lehine olan kararlar (red, beraat, bozma vb.)
3. "notr": Usule iliskin veya dogrudan taraf lehine olmayan kararlar
4. relevanceScore: Kararin kullanicinin olayina ne kadar uygun oldugunu gosterir (0=alakasiz, 100=birebir emsal)
5. Sadece JSON dondur, baska aciklama ekleme.`;

    const userPrompt = `OLAY OZETI:
${caseContext.slice(0, 2000)}

KARARLAR:
${decisionSummaries}`;

    try {
        const ai = getGeminiClient();
        const response = await Promise.race([
            ai.models.generateContent({
                model: GEMINI_MODEL_NAME,
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                config: { systemInstruction: systemPrompt },
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('evaluator_timeout')), EVALUATION_TIMEOUT_MS)
            ),
        ]);

        let jsonStr = (response?.text || '').trim();
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.slice(7);
            if (jsonStr.endsWith('```')) {
                jsonStr = jsonStr.slice(0, -3);
            }
        }

        const parsed = JSON.parse(jsonStr.trim());
        const evaluations = Array.isArray(parsed?.evaluations) ? parsed.evaluations : [];

        const enriched = evaluations.map((ev) => {
            const idx = (ev.index || 1) - 1;
            const original = candidates[idx] || {};
            return {
                ...original,
                _evaluation: {
                    category: ev.category || 'notr',
                    relevanceScore: Number(ev.relevanceScore) || 0,
                    summary: ev.summary || '',
                },
            };
        });

        const groups = {
            davaci_lehine: enriched.filter((d) => d._evaluation.category === 'davaci_lehine')
                .sort((a, b) => b._evaluation.relevanceScore - a._evaluation.relevanceScore),
            davali_lehine: enriched.filter((d) => d._evaluation.category === 'davali_lehine')
                .sort((a, b) => b._evaluation.relevanceScore - a._evaluation.relevanceScore),
            notr: enriched.filter((d) => d._evaluation.category === 'notr')
                .sort((a, b) => b._evaluation.relevanceScore - a._evaluation.relevanceScore),
        };

        return {
            evaluated: enriched,
            groups,
            _metadata: {
                totalInput: decisions.length,
                totalEvaluated: enriched.length,
                error: null,
            },
        };
    } catch (error) {
        console.warn(`[Precedent Evaluator] Batch evaluation failed: ${error.message}`);
        return {
            evaluated: candidates.map((d) => ({
                ...d,
                _evaluation: { category: 'notr', relevanceScore: 0, summary: 'Degerlendirme basarisiz' },
            })),
            groups: {
                davaci_lehine: [],
                davali_lehine: [],
                notr: candidates,
            },
            _metadata: {
                totalInput: decisions.length,
                totalEvaluated: candidates.length,
                error: error.message,
            },
        };
    }
}
