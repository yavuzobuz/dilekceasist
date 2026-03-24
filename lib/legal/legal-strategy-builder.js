import { getGeminiClient, GEMINI_MODEL_NAME } from '../../backend/gemini/_shared.js';
import { detectDomainFromText, extractLegalArticles } from './legal-domain-strategies.js';
import { buildSkillBackedSearchPackage } from './legal-search-skill.js';
import { sanitizeLegalInput } from './legal-text-utils.js';

const GENERIC_DIAGNOSIS_PATTERNS = [
    /\b(emsal karar|hukuku emsal karar|ticari alacak|icra takibi|is davasi|hukuk davasi|idare hukuku)\b/i,
    /\b(hukukunda .* degerlendirilmesi|uyusmazliginda .* degerlendirilmesi|ceza yargilamasi|borclar hukukunda|is iliskisinden dogan)\b/i,
];

const normalizePlannerText = (value = '') =>
    String(value || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const isGenericDiagnosis = (value = '') => {
    const normalized = normalizePlannerText(value);
    if (!normalized) return true;
    return GENERIC_DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(normalized));
};

const detectRequestedRelief = (rawText = '', detectedDomain = '') => {
    const normalized = normalizePlannerText(rawText);
    if (/\b(ise iade)\b/i.test(normalized)) return 'ise iade';
    if (/\b(beraat|suc vasfi)\b/i.test(normalized)) return 'beraat veya vasif degisikligi';
    if (/\b(tam yargi)\b/i.test(normalized)) return 'tam yargi tazminati';
    if (/\b(manevi tazminat)\b/i.test(normalized)) return 'manevi tazminat';
    if (/\b(kidem tazminati|ihbar tazminati)\b/i.test(normalized)) return 'kidem ve ihbar tazminati';
    if (/\b(iptal|iptali)\b/i.test(normalized)) return 'iptal';
    if (/\b(iade|iadesi)\b/i.test(normalized)) return 'iade';
    if (/\b(tahsil|tahsili)\b/i.test(normalized)) return 'tahsil';

    const fallbackMap = {
        ceza: 'beraat veya vasif degisikligi',
        is_hukuku: 'isci alacagi veya fesih talebi',
        aile: 'bosanma ve ferileri',
        ticaret: 'ticari tazminat veya men',
        icra: 'takibin devami veya iptali',
        idare: 'iptal veya tam yargi',
        hukuk: 'alacak veya tazminat',
    };
    return fallbackMap[detectedDomain] || 'hukuki koruma talebi';
};

const inferDiagnosisForText = (rawText = '', detectedDomain = '', task = '') => {
    const normalized = normalizePlannerText(`${rawText} ${task}`.trim());

    if (
        /\b(iban|eft|havale)\b/i.test(normalized) &&
        /\b(hata|hatali|yanlis|sehven|iade etmiyor|geri vermiyor|hesabina gondermis|tanimadigi)\b/i.test(normalized)
    ) {
        return 'sebepsiz zenginlesme';
    }
    if (/\b(istirdat)\b/i.test(normalized)) {
        return 'istirdat';
    }
    if (
        /\b(memur|rektorluk|universite|idare mahkemesi|gecici gorevlendirme|tam yargi|hizmet kusuru)\b/i.test(normalized) &&
        /\b(mobbing|bezdiri|psikolojik taciz|gorevden alma|disiplin)\b/i.test(normalized)
    ) {
        return 'hizmet kusuru ve tam yargi';
    }
    if (/\b(mobbing|psikolojik taciz)\b/i.test(normalized) && /\b(fesih|isten cikar|kidem|ihbar|is sozlesmesi)\b/i.test(normalized)) {
        return 'is hukuku feshi';
    }
    if (/\b(uyusturucu|tck 191|kisisel kullanim)\b/i.test(normalized)) {
        return 'kullanmak icin bulundurma';
    }
    if (/\b(uyusturucu|tck 188|ticaret kasti)\b/i.test(normalized)) {
        return 'uyusturucu madde ticareti';
    }
    if (/\b(haksiz rekabet)\b/i.test(normalized)) {
        return 'haksiz rekabet';
    }
    if (/\b(bosanma|nafaka|velayet)\b/i.test(normalized)) {
        return 'bosanma ve aile hukuku';
    }
    if (/\b(itirazin iptali)\b/i.test(normalized)) {
        return 'itirazin iptali';
    }
    if (/\b(menfi tespit)\b/i.test(normalized)) {
        return 'menfi tespit';
    }
    if (/\b(tam yargi|idari eylem|hizmet kusuru)\b/i.test(normalized)) {
        return 'tam yargi';
    }

    const fallbackMap = {
        ceza: 'ceza yargilamasi',
        is_hukuku: 'is hukuku feshi',
        aile: 'bosanma ve aile hukuku',
        ticaret: 'ticari uyusmazlik',
        icra: 'icra hukuku uyusmazligi',
        idare: 'idari islem veya tam yargi',
        hukuk: 'borclar ve tazminat uyusmazligi',
    };
    return fallbackMap[detectedDomain] || 'hukuki uyusmazlik';
};

const buildInitialKeyword = (legalDiagnosis = '', fallback = '') => {
    const source = normalizePlannerText(legalDiagnosis || fallback);
    return source.split(' ').filter(Boolean).slice(0, 3).join(' ').trim();
};

const buildDiagnosisSearchClauses = ({
    legalDiagnosis = '',
    requestedRelief = '',
    existingClauses = [],
    searchQuery = '',
} = {}) => {
    const clauses = [
        buildInitialKeyword(legalDiagnosis, searchQuery),
        legalDiagnosis,
        `${buildInitialKeyword(legalDiagnosis, searchQuery) || legalDiagnosis} ${requestedRelief}`.trim(),
        ...(Array.isArray(existingClauses) ? existingClauses : []),
    ];

    const unique = [];
    const seen = new Set();
    for (const clause of clauses) {
        const compact = String(clause || '').replace(/\s+/g, ' ').trim();
        const normalized = normalizePlannerText(compact);
        if (!compact || !normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        unique.push(compact);
        if (unique.length >= 6) break;
    }
    return unique;
};

const buildSkillProfile = ({
    skillPackage = null,
    preferredSource = 'yargitay',
    detectedDomain = 'borclar',
} = {}) => {
    const firstPlan = skillPackage?.strategies?.[0]?.plan || {};
    const targetSources = Array.isArray(firstPlan?.targetSources) && firstPlan.targetSources.length > 0
        ? firstPlan.targetSources
        : (Array.isArray(skillPackage?.sourceTargets) && skillPackage.sourceTargets.length > 0 ? skillPackage.sourceTargets : [preferredSource]);

    const excludedCourts = Array.from(new Set([
        ...(Array.isArray(firstPlan?.negativeConcepts) ? firstPlan.negativeConcepts : []),
        ...(Array.isArray(skillPackage?.context?.negativeConcepts) ? skillPackage.context.negativeConcepts : []),
    ]
        .map((item) => String(item || '').trim())
        .filter(Boolean)));

    const typicalStrategies = Array.isArray(firstPlan?.searchClauses) && firstPlan.searchClauses.length > 0
        ? firstPlan.searchClauses
        : (Array.isArray(skillPackage?.context?.variants) && skillPackage.context.variants.length > 0 ? skillPackage.context.variants : [detectedDomain]);

    return {
        targetSources,
        excludedCourts,
        typicalStrategies,
    };
};

const repairStrategyPlan = ({
    strategy = {},
    rawText = '',
    detectedDomain = '',
    profile = null,
    preferredSource = 'yargitay',
} = {}) => {
    const basePlan = strategy?.plan || {};
    const effectiveDomain = String(basePlan?.primaryDomain || detectedDomain || '').trim() || 'borclar';
    const effectiveProfile = profile || { targetSources: [preferredSource], excludedCourts: [], typicalStrategies: [effectiveDomain] };
    const safeTargetSources = Array.isArray(basePlan?.targetSources) && basePlan.targetSources.length > 0
        ? basePlan.targetSources
        : (Array.isArray(effectiveProfile?.targetSources) && effectiveProfile.targetSources.length > 0 ? effectiveProfile.targetSources : [preferredSource]);

    const requestedRelief = detectRequestedRelief(rawText, effectiveDomain);
    const inferredDiagnosis = inferDiagnosisForText(rawText, effectiveDomain, requestedRelief);
    const legalDiagnosis = !isGenericDiagnosis(strategy?.legalDiagnosis)
        ? String(strategy.legalDiagnosis || '').trim()
        : inferredDiagnosis;
    const initialKeyword = buildInitialKeyword(legalDiagnosis, basePlan?.initialKeyword || basePlan?.searchQuery || basePlan?.coreIssue || '');
    const searchQuery = String(basePlan?.searchQuery || '').trim() || `${initialKeyword} ${requestedRelief}`.trim();
    const semanticQuery = String(basePlan?.semanticQuery || '').trim()
        || `${legalDiagnosis}. Talep: ${requestedRelief}.`.replace(/\s+/g, ' ').trim();
    const reasoning = String(basePlan?.reasoning || strategy?.reasoning || '').trim()
        || `Esas uyusmazlik "${legalDiagnosis}" olarak sabitlendi; arama bu hukuki kurum etrafinda kuruldu.`;

    const safeNegativeConcepts = Array.isArray(basePlan?.negativeConcepts) ? [...basePlan.negativeConcepts] : [];
    (Array.isArray(effectiveProfile?.excludedCourts) ? effectiveProfile.excludedCourts : []).forEach((court) => {
        const lowered = String(court || '').toLowerCase();
        if (!safeNegativeConcepts.includes(lowered)) {
            safeNegativeConcepts.push(lowered);
        }
    });

    return {
        name: strategy?.name || 'STRATEJI',
        description: strategy?.description || 'Varsayilan strateji',
        legalDiagnosis,
        reasoning,
        plan: {
            ...(basePlan || {}),
            domain: effectiveDomain,
            primaryDomain: effectiveDomain,
            queryMode: basePlan?.queryMode || 'short_issue',
            targetSources: safeTargetSources,
            requestedRelief,
            diagnosisConfidence: !isGenericDiagnosis(strategy?.legalDiagnosis) ? 0.82 : 0.94,
            initialKeyword,
            searchQuery,
            semanticQuery,
            coreIssue: String(basePlan?.coreIssue || legalDiagnosis).trim(),
            retrievalConcepts: Array.isArray(basePlan?.retrievalConcepts) && basePlan.retrievalConcepts.length > 0
                ? basePlan.retrievalConcepts
                : [legalDiagnosis],
            supportConcepts: Array.isArray(basePlan?.supportConcepts) ? basePlan.supportConcepts : [],
            evidenceConcepts: Array.isArray(basePlan?.evidenceConcepts) ? basePlan.evidenceConcepts : [],
            negativeConcepts: safeNegativeConcepts,
            reasoning,
            searchClauses: buildDiagnosisSearchClauses({
                legalDiagnosis,
                requestedRelief,
                existingClauses: basePlan?.searchClauses,
                searchQuery,
            }),
        },
    };
};

export async function buildSearchStrategies({ rawText, role, task, preferredSource = 'yargitay', skillPackage = null, forceAiStrategy = false }) {
    const sanitized = sanitizeLegalInput(rawText, { preserveLayout: true });
    const safeRawText = sanitized.text;
    const resolvedSkillPackage = skillPackage?.active
        ? skillPackage
        : buildSkillBackedSearchPackage({
            rawText: safeRawText,
            preferredSource,
        });
    const detectedDomain = resolvedSkillPackage?.active
        ? String(resolvedSkillPackage.primaryDomain || detectDomainFromText(safeRawText) || 'borclar').trim()
        : detectDomainFromText(safeRawText);
    const articles = extractLegalArticles(safeRawText);
    const profile = buildSkillProfile({
        skillPackage: resolvedSkillPackage,
        preferredSource,
        detectedDomain,
    });

    let strategies = [];
    if (!forceAiStrategy && resolvedSkillPackage?.active && Array.isArray(resolvedSkillPackage.strategies) && resolvedSkillPackage.strategies.length > 0) {
        strategies = resolvedSkillPackage.strategies.map((strategy) => ({
            name: strategy.name || 'STRATEJI',
            description: strategy.description || 'Skill stratejisi',
            legalDiagnosis: strategy.legalDiagnosis || strategy.plan?.coreIssue || '',
            reasoning: strategy.reasoning || strategy.plan?.reasoning || '',
            plan: {
                ...(strategy.plan || {}),
                skillId: strategy.plan?.skillId || resolvedSkillPackage.skillId || 'turk-hukuku-karar-arama',
                skillActive: true,
                targetSources: Array.isArray(strategy.plan?.targetSources)
                    ? strategy.plan.targetSources
                    : (Array.isArray(resolvedSkillPackage.sourceTargets) ? resolvedSkillPackage.sourceTargets : [preferredSource]),
            },
        }));
    } else {
        try {
            strategies = await generateStrategiesViaAI({
                rawText: safeRawText,
                detectedDomain,
                articles,
                profile,
                role,
                task,
            });
        } catch (error) {
            console.warn(`[Strategy Builder] AI strateji uretimi basarisiz oldu, fallback kullaniliyor. Hata: ${error.message}`);
            strategies = generateFallbackStrategies(detectedDomain, profile, articles, role, task);
        }
    }

    return strategies.map((strategy) => repairStrategyPlan({
        strategy,
        rawText: safeRawText,
        detectedDomain,
        profile,
        preferredSource,
    }));
}

async function generateStrategiesViaAI({ rawText, detectedDomain, articles, profile, role, task }) {
    console.log('[AI GENERATION STARTED] Executing Gemini for domain:', detectedDomain);

    let strategyCount = 3;
    if (rawText.length <= 250) {
        strategyCount = 1;
    } else if (rawText.length <= 1000) {
        strategyCount = 2;
    }

    const systemPrompt = `
Sen Yargitay ve Danistay seviyesinde calisan kidemli bir ictihat stratejistisin.
Gorevin, gonderilen hukuki metni analiz edip yuksek mahkemede emsal karar aramak icin ${strategyCount} farkli strateji olusturmaktir.
Stratejiler, eger metin tarafsiz bir soru ise "Davaci", "Davali" veya "Notr" acilardan farkli arama stratejilerini kapsayabilir.

Analiz bilgileri:
- Tespit edilen hukuk dali: ${detectedDomain.toUpperCase()}
- Hedef kaynak: ${profile.targetSources.join(', ')}
- Kacinilmasi gereken daireler: ${profile.excludedCourts.join(', ')}
- Metinden cikarilan kanun maddeleri: ${articles.length > 0 ? articles.join(', ') : 'Bulunamadi'}
${role ? `- Kullanici rolu: ${role}` : '- Kullanici rolu: Metnin dilinden cikar (Yoksa Notr arama yap)'}
${task ? `- Kullanici hedefi: ${task}` : '- Kullanici hedefi: Metnin baglamina gore en ilgili hedefi/uyusmazligi aramak'}

Kritik kurallar:
1. MUST-CONCEPT KURALI: Olayin olmazsa olmaz (must-have) spesifik kavramlarini, suc adini veya sozlesme turunu KESINLIKLE "retrievalConcepts" icinde ayri elemanlar olarak listele.
2. ARAMA MANTIGI: "searchClauses" icinde arama yaparken mutlak gecmesi gereken kavramlari vurgula. Icerik mutlak gecmesi gereken min. 2 kavram icermelidir (ornek: "+uyusturucu +ticaret").
3. Once hukuki nitelendirme yap. Jenerik terim kullanma. "legalDiagnosis" net hukuki karsilik olmali.
4. "initialKeyword" 1-3 kelime olsun ve "legalDiagnosis" tasimasi sart.
5. Kullanici hedefini (varsa) negativeConcepts icine yazma.
6. requestedRelief alanini mutlaka doldur.
7. diagnosisConfidence 0 ile 1 arasinda sayi olsun.
8. Mutlaka ve sadece ${strategyCount} adet strateji iceren bir JSON dizisi dondur!

Sadece JSON dondur:
[
  {
    "name": "STRATEJI A",
    "description": "Kisa aciklama (Hangi yonden/rol icin oldugunu belirt)",
    "legalDiagnosis": "Olayin hukuki kurumu",
    "reasoning": "Arama gerekcesi",
    "plan": {
      "queryMode": "short_issue",
      "requestedRelief": "istenen sonuc",
      "diagnosisConfidence": 0.8,
      "initialKeyword": "kisa resmi ifade",
      "searchQuery": "kisa arama kelimeleri",
      "semanticQuery": "ilgili hukuki sorun hakkinda paragraf arayisi",
      "coreIssue": "uyusmazligin ozu",
      "retrievalConcepts": ["kavram1", "kavram2"],
      "supportConcepts": ["destek1", "destek2"],
      "evidenceConcepts": ["delil1", "delil2"],
      "negativeConcepts": ["yanlis alan"],
      "searchClauses": ["+ornek +clause"]
    }
  }
]`;

    let textToAnalyze = rawText;
    if (rawText.length > 15000) {
        textToAnalyze = rawText.substring(0, 8000) + '\n\n... [METIN KESILDI] ...\n\n' + rawText.substring(rawText.length - 6000);
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: [{ role: 'user', parts: [{ text: `Incelenecek hukuki metin:\n\n${textToAnalyze}` }] }],
        config: { systemInstruction: systemPrompt },
    });

    let jsonStr = response.text.trim();
    if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.substring(7);
        if (jsonStr.endsWith('```')) {
            jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        }
    }

    console.log('[GEMINI RAW JSON] >>>', jsonStr.substring(0, 300) + '...');
    return JSON.parse(jsonStr.trim());
}

function generateFallbackStrategies(domain, profile, articles, role, task) {
    const primaryFallback = `${articles[0] || task || domain}`.trim();
    return [
        {
            name: 'STRATEJI A',
            description: 'Kanun maddesi ve cekirdek talep odakli fallback',
            legalDiagnosis: '',
            reasoning: '',
            plan: {
                queryMode: 'short_issue',
                requestedRelief: '',
                diagnosisConfidence: 0.45,
                initialKeyword: primaryFallback,
                searchQuery: `${articles.join(' ')} ${task || domain}`.trim(),
                semanticQuery: `${domain} alaninda ${task || 'uyusmazlik'} hakkinda yuksek mahkeme kararlari.`,
                coreIssue: task || domain,
                retrievalConcepts: [...articles, domain].filter(Boolean),
                supportConcepts: [],
                evidenceConcepts: [],
                negativeConcepts: profile.excludedCourts.map((court) => court.toLowerCase()),
                searchClauses: [`${articles[0] || domain} ${task || 'emsal'}`.trim()],
            },
        },
        {
            name: 'STRATEJI B',
            description: 'Prensip odakli fallback',
            legalDiagnosis: '',
            reasoning: '',
            plan: {
                queryMode: 'short_issue',
                requestedRelief: '',
                diagnosisConfidence: 0.4,
                initialKeyword: profile.typicalStrategies[0]?.replace(/_/g, ' ') || domain,
                searchQuery: `${profile.typicalStrategies.join(' ').replace(/_/g, ' ')}`.trim(),
                semanticQuery: `${domain} davalarinda ${profile.typicalStrategies.map((item) => item.replace(/_/g, ' ')).join(', ')} ilkeleri.`,
                coreIssue: domain,
                retrievalConcepts: profile.typicalStrategies.map((item) => item.replace(/_/g, ' ')),
                supportConcepts: [],
                evidenceConcepts: [],
                negativeConcepts: profile.excludedCourts.map((court) => court.toLowerCase()),
                searchClauses: [profile.typicalStrategies[0]?.replace(/_/g, ' ') || domain],
            },
        },
    ];
}
