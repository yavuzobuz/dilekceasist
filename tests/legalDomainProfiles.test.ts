import { describe, expect, it } from 'vitest';
import {
    normalizeDisplayText,
    normalizeMatchText,
    normalizeDomainId,
    getDomainProfile,
    detectPrimaryDomain,
    canonicalizeConcepts,
    getConceptVariants,
    getNegativeConceptsForDomain,
    inferSourceTargetsFromDomain,
    LEGAL_DOMAIN_PROFILES,
    DEFAULT_DOMAIN_PROFILE_ID,
} from '../lib/legal/legalDomainProfiles.js';

describe('normalizeDisplayText', () => {
    it('collapses multiple spaces into one', () => {
        expect(normalizeDisplayText('  kıdem   tazminatı  ')).toBe('kıdem tazminatı');
    });

    it('trims whitespace from both ends', () => {
        expect(normalizeDisplayText('  işe iade  ')).toBe('işe iade');
    });

    it('returns empty string for empty input', () => {
        expect(normalizeDisplayText('')).toBe('');
        expect(normalizeDisplayText()).toBe('');
    });

    it('handles null/undefined gracefully', () => {
        expect(normalizeDisplayText(null as unknown as string)).toBe('');
        expect(normalizeDisplayText(undefined)).toBe('');
    });
});

describe('normalizeMatchText', () => {
    it('lowercases Turkish characters', () => {
        const result = normalizeMatchText('İşe İade');
        expect(result).toBe('ise iade');
    });

    it('converts ı to i', () => {
        expect(normalizeMatchText('kıdem')).toBe('kidem');
    });

    it('strips diacritics', () => {
        expect(normalizeMatchText('şüphe')).toBe('suphe');
    });

    it('removes special characters keeping spaces and alphanumeric', () => {
        expect(normalizeMatchText('TCK/188')).toBe('tck/188');
    });

    it('handles empty input', () => {
        expect(normalizeMatchText('')).toBe('');
        expect(normalizeMatchText()).toBe('');
    });
});

describe('normalizeDomainId', () => {
    it('returns exact domain IDs', () => {
        expect(normalizeDomainId('is_hukuku')).toBe('is_hukuku');
        expect(normalizeDomainId('ceza')).toBe('ceza');
        expect(normalizeDomainId('idare')).toBe('idare');
        expect(normalizeDomainId('vergi')).toBe('vergi');
        expect(normalizeDomainId('aile')).toBe('aile');
        expect(normalizeDomainId('ticaret')).toBe('ticaret');
        expect(normalizeDomainId('miras')).toBe('miras');
        expect(normalizeDomainId('tuketici')).toBe('tuketici');
        expect(normalizeDomainId('sigorta')).toBe('sigorta');
        expect(normalizeDomainId('icra')).toBe('icra');
        expect(normalizeDomainId('borclar')).toBe('borclar');
        expect(normalizeDomainId('anayasa')).toBe('anayasa');
        expect(normalizeDomainId('genel_hukuk')).toBe('genel_hukuk');
    });

    it('resolves sub-domain aliases correctly', () => {
        expect(normalizeDomainId('fikri_mulkiyet')).toBe('ticaret');
        expect(normalizeDomainId('bankacilik')).toBe('ticaret');
        expect(normalizeDomainId('bilisim')).toBe('ceza');
        expect(normalizeDomainId('bilisim_hukuku')).toBe('ceza');
        expect(normalizeDomainId('siber_suclar')).toBe('ceza');
        expect(normalizeDomainId('kamulastirma')).toBe('idare');
        expect(normalizeDomainId('cevre_hukuku')).toBe('borclar');
        expect(normalizeDomainId('rekabet_hukuku')).toBe('ticaret');
        expect(normalizeDomainId('sendikal_hukuk')).toBe('is_hukuku');
        expect(normalizeDomainId('sosyal_guvenlik')).toBe('is_hukuku');
        expect(normalizeDomainId('deniz_hukuku')).toBe('ticaret');
        expect(normalizeDomainId('saglik')).toBe('ceza');
        expect(normalizeDomainId('tibbi_malpraktis')).toBe('ceza');
        expect(normalizeDomainId('basin_hukuku')).toBe('ceza');
        expect(normalizeDomainId('kvkk')).toBe('ceza');
        expect(normalizeDomainId('tasima_hukuku')).toBe('ticaret');
        expect(normalizeDomainId('transfer_fiyatlandirmasi')).toBe('vergi');
        expect(normalizeDomainId('enerji')).toBe('idare');
        expect(normalizeDomainId('vatandaslik')).toBe('idare');
    });

    it('returns fallback for unknown domains', () => {
        expect(normalizeDomainId('bilinmeyen', 'genel_hukuk')).toBe('bilinmeyen');
        expect(normalizeDomainId('', 'genel_hukuk')).toBe('genel_hukuk');
    });

    it('normalizes casing and accents', () => {
        expect(normalizeDomainId('CEZA')).toBe('ceza');
        expect(normalizeDomainId('İdare')).toBe('idare');
    });
});

describe('getDomainProfile', () => {
    it('returns correct profile for each core domain', () => {
        const ceza = getDomainProfile('ceza');
        expect(ceza.id).toBe('ceza');
        expect(ceza.label).toBe('Ceza');
        expect(ceza.primarySources).toContain('yargitay');

        const idare = getDomainProfile('idare');
        expect(idare.id).toBe('idare');
        expect(idare.primarySources).toContain('danistay');

        const anayasa = getDomainProfile('anayasa');
        expect(anayasa.id).toBe('anayasa');
        expect(anayasa.primarySources).toContain('anayasa');
    });

    it('returns profile for domain aliases', () => {
        const fikri = getDomainProfile('fikri_mulkiyet');
        expect(fikri.id).toBe('ticaret');

        const bilisim = getDomainProfile('bilisim');
        expect(bilisim.id).toBe('ceza');
    });

    it('falls back to genel_hukuk for unknown domain', () => {
        const result = getDomainProfile('bilinmeyen_alan');
        expect(result.id).toBe('genel_hukuk');
    });

    it('every core profile has required fields', () => {
        const coreIds = ['is_hukuku', 'ceza', 'idare', 'icra', 'vergi', 'anayasa', 'aile', 'ticaret', 'miras', 'tuketici', 'sigorta', 'borclar', 'genel_hukuk'];
        for (const id of coreIds) {
            const profile = getDomainProfile(id);
            expect(profile).toBeDefined();
            expect(profile.id).toBe(id);
            expect(typeof profile.label).toBe('string');
            expect(Array.isArray(profile.primarySources)).toBe(true);
            expect(Array.isArray(profile.canonicalConcepts)).toBe(true);
            expect(typeof profile.turkishAliases).toBe('object');
            expect(typeof profile.asciiAliases).toBe('object');
            expect(Array.isArray(profile.negativeMarkers)).toBe(true);
        }
    });
});

describe('detectPrimaryDomain', () => {
    it('detects is_hukuku from relevant concepts', () => {
        const result = detectPrimaryDomain({ rawText: 'işe iade kıdem tazminatı ihbar tazminatı fazla mesai işçilik alacağı' });
        expect(result).toBe('is_hukuku');
    });

    it('detects ceza from criminal terms', () => {
        const result = detectPrimaryDomain({ rawText: 'uyuşturucu madde ticareti TCK 188 sanık iddianame tutuklama hukuka aykırı delil' });
        expect(result).toBe('ceza');
    });

    it('detects aile from family law terms', () => {
        const result = detectPrimaryDomain({ rawText: 'boşanma nafaka velayet çocuğun üstün yararı mal rejimi TMK' });
        expect(result).toBe('aile');
    });

    it('detects icra from enforcement terms', () => {
        const result = detectPrimaryDomain({ rawText: 'icra takibi ödeme emri haciz haczedilemezlik itirazın kaldırılması kambiyo' });
        expect(result).toBe('icra');
    });

    it('detects miras from inheritance terms', () => {
        const result = detectPrimaryDomain({ rawText: 'tenkis vasiyetname saklı pay mirasın reddi tereke veraset ilamı' });
        expect(result).toBe('miras');
    });

    it('returns genel_hukuk for empty input', () => {
        const result = detectPrimaryDomain({ rawText: '' });
        expect(result).toBe(DEFAULT_DOMAIN_PROFILE_ID);
    });

    it('accepts concepts array for detection', () => {
        const result = detectPrimaryDomain({ concepts: ['kıdem tazminatı', 'ihbar tazminatı', 'işe iade'] });
        expect(result).toBe('is_hukuku');
    });
});

describe('canonicalizeConcepts', () => {
    it('returns canonical concepts for is_hukuku domain', () => {
        const result = canonicalizeConcepts({
            domainId: 'is_hukuku',
            values: ['kıdem', 'ihbar öneli', 'ise iade'],
        });
        expect(result.length).toBeGreaterThan(0);
        expect(result.length).toBeLessThanOrEqual(6);
    });

    it('returns fallback concepts when no match found', () => {
        const result = canonicalizeConcepts({
            domainId: 'ceza',
            values: ['xyz_unknown_term'],
        });
        expect(result.length).toBeGreaterThan(0);
    });

    it('respects the limit parameter', () => {
        const result = canonicalizeConcepts({
            domainId: 'is_hukuku',
            values: ['kıdem tazminatı', 'ihbar tazminatı', 'işe iade', 'fazla mesai', 'mobbing', 'iş kazası', 'meslek hastalığı'],
            limit: 3,
        });
        expect(result.length).toBeLessThanOrEqual(3);
    });

    it('deduplicates values', () => {
        const result = canonicalizeConcepts({
            domainId: 'is_hukuku',
            values: ['kıdem tazminatı', 'kıdem tazminatı', 'kıdem tazminatı'],
        });
        const uniqueCheck = new Set(result.map((v) => v.toLowerCase()));
        expect(uniqueCheck.size).toBe(result.length);
    });
});

describe('getConceptVariants', () => {
    it('returns variants for a known concept in is_hukuku', () => {
        const variants = getConceptVariants('is_hukuku', 'kıdem tazminatı');
        expect(variants).toContain('kıdem tazminatı');
        expect(variants.length).toBeGreaterThan(1);
    });

    it('returns at least the concept itself for unknown domain', () => {
        const variants = getConceptVariants('genel_hukuk', 'herhangi bir kavram');
        expect(variants.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty array for empty concept', () => {
        const variants = getConceptVariants('is_hukuku', '');
        expect(variants).toEqual([]);
    });
});

describe('getNegativeConceptsForDomain', () => {
    it('returns negative markers for ceza', () => {
        const negatives = getNegativeConceptsForDomain('ceza');
        expect(negatives.length).toBeGreaterThan(0);
        expect(negatives.some((m) => /bireysel|anayasa/i.test(m))).toBe(true);
    });

    it('returns negative markers for is_hukuku', () => {
        const negatives = getNegativeConceptsForDomain('is_hukuku');
        expect(negatives.length).toBeGreaterThan(0);
    });
});

describe('inferSourceTargetsFromDomain', () => {
    it('returns yargitay for is_hukuku', () => {
        const sources = inferSourceTargetsFromDomain('is_hukuku');
        expect(sources).toContain('yargitay');
    });

    it('returns danistay for idare', () => {
        const sources = inferSourceTargetsFromDomain('idare');
        expect(sources).toContain('danistay');
    });

    it('returns anayasa for anayasa', () => {
        const sources = inferSourceTargetsFromDomain('anayasa');
        expect(sources).toContain('anayasa');
    });
});

describe('LEGAL_DOMAIN_PROFILES integrity', () => {
    it('all profiles have non-empty canonicalConcepts', () => {
        const requiredIds = ['is_hukuku', 'ceza', 'idare', 'icra', 'vergi', 'aile', 'ticaret', 'miras', 'tuketici', 'sigorta', 'borclar'];
        for (const id of requiredIds) {
            const profile = LEGAL_DOMAIN_PROFILES[id];
            expect(profile?.canonicalConcepts?.length, `${id} should have canonicalConcepts`).toBeGreaterThan(0);
        }
    });

    it('all profiles have a queryTemplates array', () => {
        const ids = Object.keys(LEGAL_DOMAIN_PROFILES);
        for (const id of ids) {
            const profile = LEGAL_DOMAIN_PROFILES[id];
            expect(Array.isArray(profile.queryTemplates), `${id} should have queryTemplates`).toBe(true);
            expect(profile.queryTemplates.length, `${id} queryTemplates should not be empty`).toBeGreaterThan(0);
        }
    });

    it('idare profile targets danistay', () => {
        const profile = LEGAL_DOMAIN_PROFILES['idare'];
        expect(profile.primarySources).toContain('danistay');
    });

    it('ceza preferred birim codes include CGK', () => {
        const profile = LEGAL_DOMAIN_PROFILES['ceza'];
        expect(profile.preferredBirimCodes).toContain('CGK');
    });
});
