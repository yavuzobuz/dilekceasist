import { detectDomainFromText } from '../legal-domain-strategies.js';
import { DOMAIN_PRIORITY, DOMAIN_RULES } from './registry.js';
import { buildGenericPackage, dedupeStrings, normalizeSkillText, resolveQueryMode } from './shared.js';

const getMatchScore = (normalizedText = '', regexList = []) =>
    (Array.isArray(regexList) ? regexList : []).reduce((score, regex) => {
        if (!(regex instanceof RegExp)) return score;
        return regex.test(normalizedText) ? score + 1 : score;
    }, 0);

const selectDomainRule = (rawText = '') => {
    const normalizedText = normalizeSkillText(rawText);
    const publicServiceIdareSignal =
        /\b(idare mahkemesi|tam yargi|hizmet kusuru|memur|rektorluk|universite|gecici gorevlendirme)\b/i.test(normalizedText) &&
        /\b(mobbing|psikolojik taciz|bezdiri|gorevden alma|disiplin)\b/i.test(normalizedText);

    if (publicServiceIdareSignal && DOMAIN_RULES.idare) {
        return {
            domainKey: 'idare',
            rule: DOMAIN_RULES.idare,
            score: 999,
        };
    }

    const scored = DOMAIN_PRIORITY
        .map((domainKey) => {
            const rule = DOMAIN_RULES[domainKey];
            if (!rule) return null;

            const detectionScore = getMatchScore(normalizedText, rule.detection);
            const variantScore = (Array.isArray(rule.variants) ? rule.variants : []).reduce((total, variant) => (
                variant?.when instanceof RegExp && variant.when.test(normalizedText) ? total + 2 : total
            ), 0);

            return {
                domainKey,
                rule,
                score: detectionScore + variantScore,
            };
        })
        .filter(Boolean)
        .sort((left, right) => right.score - left.score);

    if (scored[0]?.score > 0) return scored[0];

    const fallbackDomain = detectDomainFromText(rawText);
    return fallbackDomain && DOMAIN_RULES[fallbackDomain]
        ? { domainKey: fallbackDomain, rule: DOMAIN_RULES[fallbackDomain], score: 0 }
        : null;
};

const selectVariant = (normalizedText = '', rule = null) => {
    const variants = Array.isArray(rule?.variants) ? rule.variants : [];
    return variants.find((variant) => variant?.when instanceof RegExp && variant.when.test(normalizedText))
        || rule?.defaultVariant
        || null;
};

export const detectSkillDomain = (rawText = '') => selectDomainRule(rawText)?.domainKey || null;

export const buildDocDrivenSkillPackage = ({
    rawText = '',
    preferredSource = 'all',
} = {}) => {
    const selected = selectDomainRule(rawText);
    if (!selected?.rule) return null;

    const normalizedText = normalizeSkillText(rawText);
    const queryMode = resolveQueryMode(rawText);
    const variant = selectVariant(normalizedText, selected.rule);
    if (!variant) return null;

    const domain = selected.domainKey;
    const rule = selected.rule;
    const negativeConcepts = dedupeStrings([
        ...(rule.negative || []),
        ...(variant.negative || []),
    ], { max: 16 });
    const evidenceConcepts = dedupeStrings([
        ...(rule.evidence || []),
        ...(variant.evidence || []),
    ], { max: 16 });
    const suggestedCourt = String(variant.suggestedCourt || rule.suggestedCourt || '').trim();
    const decisionType = String(variant.decisionType || '').trim();
    const strictResultMode = Boolean(
        rule.strictResultMode
        || ['long_fact', 'document_style', 'case_file'].includes(queryMode)
    );

    return buildGenericPackage({
        rawText,
        domain,
        label: rule.label,
        profiles: rule.profiles,
        sources: rule.sources,
        negative: negativeConcepts,
        principles: rule.principles,
        evidence: evidenceConcepts,
        variant,
        queryMode,
        preferredSource,
        strictResultMode,
        suggestedCourt,
        subdomain: variant.subdomain || `${domain}_genel`,
        decisionType,
        allowEvidenceAsCore: Boolean(variant.allowEvidenceAsCore),
    });
};
