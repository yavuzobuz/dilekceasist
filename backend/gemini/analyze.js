import { applyCors, getSafeErrorMessage } from '../../lib/api/cors.js';
import { GEMINI_MODEL_NAME, GEMINI_STABLE_FALLBACK_MODEL_NAME, getGeminiClient } from './_shared.js';

const MODEL_NAME = GEMINI_MODEL_NAME;

const ANALYZE_SYSTEM_INSTRUCTION = `Sen bir Turk hukuki asistansin. Gorevin yuklenen belgeleri analiz etmek.

TUM METIN BLOKLARINI birlestir ve analizi asagidaki JSON formatinda dondur:

{
  "summary": "Belgenin ozeti - kullaniciya gosterilecek anlatim",
  "potentialParties": ["Taraf1", "Taraf2"],
  "analysisInsights": {
    "documentType": "iddianame | mahkeme karari | sozlesme | ihtarname | tapu kaydi | bilirkisi raporu vb.",
    "caseStage": "dava oncesi | ilk derece | istinaf | temyiz | icra | idari basvuru vb.",
    "primaryDomain": "ceza | is_hukuku | aile | icra | borclar | ticaret | gayrimenkul | idare | vergi | tuketici | sigorta | miras | anayasa",
    "secondaryDomains": ["ikincil alan 1", "ikincil alan 2"],
    "caseType": "Kisa dava tipi veya uyusmazlik basligi",
    "coreIssue": "Dosyanin kalbindeki asil hukuki mesele",
    "keyFacts": ["Olay ozeti madde 1", "Olay ozeti madde 2"],
    "timeline": ["Tarih ve olay 1", "Tarih ve olay 2"],
    "claims": ["Iddia 1", "Iddia 2"],
    "defenses": ["Savunma 1", "Savunma 2"],
    "evidenceSummary": ["Delil 1", "Delil 2"],
    "legalIssues": ["Hukuki mesele 1", "Hukuki mesele 2"],
    "risksAndWeakPoints": ["Zayif nokta 1", "Eksik bilgi 1"],
    "missingCriticalInfo": ["Dilekce icin eksik bilgi 1"],
    "suggestedNextSteps": ["Sonraki adim 1", "Sonraki adim 2"],
    "webSearchPlan": {
      "coreQueries": ["Web icin ana sorgu 1", "Web icin ana sorgu 2"],
      "supportQueries": ["Destek sorgu 1"],
      "negativeQueries": ["Haric tutulacak konu 1"],
      "focusTopics": ["Odak konu 1", "Odak konu 2"]
    },
    "precedentSearchPlan": {
      "requiredConcepts": ["Zorunlu kavram 1", "Zorunlu kavram 2"],
      "supportConcepts": ["Destek kavram 1", "Destek kavram 2"],
      "evidenceConcepts": ["Delil kavrami 1", "Delil kavrami 2"],
      "negativeConcepts": ["Karistirilmamasi gereken kavram 1"],
      "preferredSource": "yargitay | danistay | bam | auto",
      "preferredBirimCodes": ["H9", "H22"],
      "searchSeedText": "Karar aramasina gidecek kisa ama anlamli metin",
      "searchVariants": [
        { "query": "+\"zorunlu ifade 1\" +\"zorunlu ifade 2\"", "mode": "strict" },
        { "query": "+\"zorunlu ifade 1\" +\"destek ifade\"", "mode": "broad" },
        { "query": "\"dava tipi\" \"kanun no veya madde\"", "mode": "statute" }
      ],
      "fallbackToNext": true,
      "queryMode": "short_issue | long_fact | document_style"
    }
  },
  "legalSearchPacket": {
    "primaryDomain": "ceza | is_hukuku | aile | icra | borclar | ticaret | gayrimenkul | idare | vergi | tuketici | sigorta | miras | anayasa",
    "caseType": "Kisa dava tipi veya uyusmazlik basligi",
    "coreIssue": "Aranacak asil hukuki mesele",
    "requiredConcepts": ["Zorunlu kavram 1", "Zorunlu kavram 2"],
    "supportConcepts": ["Destek kavram 1", "Destek kavram 2"],
    "evidenceConcepts": ["Delil kavrami 1", "Delil kavrami 2"],
    "negativeConcepts": ["Karistirilmamasi gereken kavram 1"],
    "preferredSource": "yargitay | danistay | bam | auto",
    "preferredBirimCodes": ["H9", "H22"],
    "searchSeedText": "Karar aramasina gidecek kisa ama anlamli metin",
    "searchVariants": [
      { "query": "+\"zorunlu ifade 1\" +\"zorunlu ifade 2\"", "mode": "strict" },
      { "query": "+\"zorunlu ifade 1\" +\"destek ifade\"", "mode": "broad" },
      { "query": "\"dava tipi\" \"kanun no veya madde\"", "mode": "statute" }
    ],
    "fallbackToNext": true,
    "queryMode": "short_issue | long_fact | document_style"
  },
  "caseDetails": {
    "caseTitle": "Dava basligi veya konu",
    "court": "Mahkeme adi",
    "fileNumber": "Dosya numarasi",
    "decisionNumber": "Karar numarasi",
    "decisionDate": "Karar tarihi"
  },
  "lawyerInfo": {
    "name": "Avukat adi",
    "bar": "Baro",
    "barNumber": "Sicil no",
    "address": "Adres",
    "phone": "Telefon",
    "email": "Email",
    "tcNo": "TC Kimlik No"
  },
  "contactInfo": [
    { "name": "Ad", "address": "Adres", "phone": "Telefon", "email": "Email", "tcNo": "TC" }
  ]
}

Kurallar:
- SADECE JSON dondur, baska aciklama ekleme.
- summary kullaniciya gosterilecek aciklamadir.
- analysisInsights detayli hukuk analizidir; bos birakma.
- legalSearchPacket emsal karar aramasi icin zorunludur; bos birakma.
- analysisInsights ile legalSearchPacket ayni dosya cizgisinde olmali; birbiriyle celismemeli.
- keyFacts, claims, defenses, evidenceSummary ve legalIssues olabildigince somut olsun.
- risksAndWeakPoints bolumune delil zafiyeti, celiski, sure, gorev, ispat veya eksik evrak gibi zayif noktalari yaz.
- missingCriticalInfo bolumune dilekceyi guclendirmek icin gereken ama belgede bulunmayan kritik verileri yaz.
- webSearchPlan internette aranabilecek net ve dogrulanabilir sorgular uretsin.
- precedentSearchPlan karar aramasinda ise yarayacak cekirdek kavramlari cikarsin.
- requiredConcepts genel degil, karar aramada ise yarayan cekirdek hukuki kavramlar olsun.
- Imar, yapi tatil tutanagi, yapi tespit tutanagi, yikim karari, belediye encumeni, ruhsatsiz yapi, orantililik ilkesi veya 3194 sayili Imar Kanunu eksenli dosyalarda bu kavramlari requiredConcepts/supportConcepts icinde mutlaka koru; bunlari genel ifadeye indirgeme.
- negativeConcepts yanlis alana goturecek veya karistirilacak kavramlar olsun.
- preferredSource ceza/is/aile/icra/borclar/ticaret/gayrimenkul/miras icin genelde yargitay, idare/vergi icin danistay, istinaf odakli dosyalarda bam olsun.
- searchSeedText tek satirlik, temiz ve aramaya hazir bir metin olsun.
- searchVariants alanina 2-4 adet operatorlu query yaz; bunlar nesne formatinda olsun: { query, mode }.
- mode degeri strict, broad veya statute olsun.
- strict varyanti en dar ve en guvenli query olsun.
- broad varyanti biraz daha genis ama hala ayni hukuk alaninda kalan query olsun.
- statute varyanti varsa ilgili kanun/madde veya kanun numarasi ile desteklenmis query olsun.
- query stringi gecerli JSON stringi olmali; tirnak kullanirsan \"...\" seklinde kacir.
- searchVariants uzun cumle olmasin; Bedesten icin kisa, operatorlu ve aranabilir olsun.
- + operatoru, tirnak, AND ve OR kullanabilirsin; regex, fuzzy veya proximity kullanma.
- fallbackToNext true olsun.
- Eger yuklenen dosya taranmis, goruntu tabanli veya resimden olusmus bir PDF ise gorunen metni OCR mantigi ile okuyup analiz et. Metin secilemiyor olsa bile yazilar, muhurler, imzalar, tablo basliklari ve sayfa ustbilgilerini dikkate al.`;

export default async function handler(req, res) {
    if (!applyCors(req, res, {
        methods: 'POST, OPTIONS',
        headers: 'Content-Type, Authorization',
    })) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const ai = getGeminiClient();
        const { uploadedFiles, udfTextContent, wordTextContent } = req.body;
        const safeUploadedFiles = Array.isArray(uploadedFiles) ? uploadedFiles : [];

        if (safeUploadedFiles.length === 0 && !udfTextContent && !wordTextContent) {
            return res.status(400).json({ error: 'Analiz edilecek hicbir belge saglanmadi.' });
        }

        const fileSummaries = safeUploadedFiles
            .map((file, index) => {
                const fileName = String(file?.name || `Belge ${index + 1}`).trim() || `Belge ${index + 1}`;
                const mimeType = String(file?.mimeType || 'bilinmeyen').trim() || 'bilinmeyen';
                const scannedHint = /pdf/i.test(mimeType)
                    ? 'Taranmis/goruntu tabanli PDF olabilir; OCR ile oku.'
                    : /^image\//i.test(mimeType)
                        ? 'Gorsel belge; gorunen metni ve duzeni incele.'
                        : '';
                return `- ${fileName} (${mimeType})${scannedHint ? ` - ${scannedHint}` : ''}`;
            })
            .join('\n');

        const parts = [];

        if (udfTextContent) {
            parts.push({ text: `UDF Icerigi:\n${udfTextContent}\n\n---\n` });
        }
        if (wordTextContent) {
            parts.push({ text: `Word Icerigi:\n${wordTextContent}\n\n---\n` });
        }

        if (fileSummaries) {
            parts.push({ text: `Yuklenen dosyalar:\n${fileSummaries}\n` });
        }

        if (safeUploadedFiles.length > 0) {
            for (const file of safeUploadedFiles) {
                if (file.mimeType && file.data) {
                    parts.push({
                        inlineData: {
                            mimeType: file.mimeType,
                            data: file.data,
                        },
                    });
                }
            }
        }

        parts.push({ text: 'Lutfen yukaridaki tum belgeleri analiz et ve JSON formatinda sonuc dondur.' });

        const response = await generateAnalysisWithFallback(ai, parts);

        res.json({ text: response.text });
    } catch (error) {
        console.error('Analyze Error:', error);
        res.status(500).json({ error: getSafeErrorMessage(error, 'Internal Server Error') });
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateAnalysisWithFallback(ai, parts) {
    const primaryModels = [MODEL_NAME];
    const fallbackModels = GEMINI_STABLE_FALLBACK_MODEL_NAME && GEMINI_STABLE_FALLBACK_MODEL_NAME !== MODEL_NAME
        ? [GEMINI_STABLE_FALLBACK_MODEL_NAME]
        : [];
    const attempts = [
        ...primaryModels.map((model) => ({ model, retries: 2 })),
        ...fallbackModels.map((model) => ({ model, retries: 1 })),
    ];

    let lastError;

    for (const attempt of attempts) {
        for (let i = 0; i <= attempt.retries; i += 1) {
            try {
                return await ai.models.generateContent({
                    model: attempt.model,
                    contents: [{ role: 'user', parts }],
                    config: { systemInstruction: ANALYZE_SYSTEM_INSTRUCTION },
                });
            } catch (error) {
                lastError = error;
                const status = Number(error?.status || error?.response?.status || 0);
                const code = String(error?.code || error?.error?.status || '').toUpperCase();
                const retryable = status === 503 || code === 'UNAVAILABLE';
                if (!retryable || i === attempt.retries) break;
                await sleep(500 * (i + 1));
            }
        }
    }

    throw lastError || new Error('analysis_generation_failed');
}
