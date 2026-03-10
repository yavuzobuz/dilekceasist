import { describe, expect, it } from 'vitest';

import { __testables } from '../lib/legal/mcpLegalSearch.js';

const { buildAiForcedProfiles, buildQuerySignals } = __testables;
const LONG_CEZA_TEXT = `
Saniklar hakkinda, banka hesaplarinin baskalari adina kullandirildigi, bu hesaplara suc gelirlerinin aktarildigi,
uyusturucu madde ticareti ve nitelikli dolandiricilik suclarina iliskin iletisim tespit tutanaklari, fiziki takip,
arama ve elkoyma islemleri ile dijital materyal incelemeleri bulundugu, saniklardan ele gecirilen maddelerin satisa hazir
paketler halinde oldugu, tanik beyanlari ile para transfer kayitlarinin birbiriyle uyumlu oldugu, TCK 188 ve baglantili
ceza sorusturmasi kapsaminda kamu davasi acilmasini gerektirir yeterli suphe olustugu anlasilmistir.
`.trim();

const LONG_IDARE_TEXT = `
Davaci sirket hakkinda duzenlenen vergi inceleme raporunda sahte fatura kullanimina dayali KDV indirimi reddedilmis,
tarhiyat ve vergi ziyai cezasi kesilmis, uzlasma saglanamamasi uzerine vergi mahkemesinde iptal davasi acilmistir.
Dosyada vergi teknigi raporu, inceleme tutanagi, savunma dilekceleri ve idari isleme dayanak belgeler bulunmaktadir.
Uyusmazligin ticari iliski degil, dogrudan idari vergi islemi ve tarhiyat denetimi niteliginde oldugu gorulmektedir.
`.trim();

describe('mcpLegalSearch AI profile priority', () => {
    it('uses only AI profiles when AI produced a profile list', () => {
        const rawQuery = 'Sanik hakkinda uyusturucu madde ticareti ve nitelikli dolandiricilik nedeniyle kamu davasi acilmistir. Sirket hesabi ve para transferleri delil olarak incelenmistir.';
        const forcedProfiles = buildAiForcedProfiles({
            primaryProfile: 'ceza',
            profiles: ['ceza'],
        });

        const signals = buildQuerySignals('uyusturucu madde ticareti', rawQuery, {
            forcedProfiles,
            searchArea: 'hukuk',
            resolvedSource: 'all',
        });

        expect(forcedProfiles).toEqual(['ceza']);
        expect(signals.matchedProfileIds).toEqual(['ceza']);
        expect(signals.primaryDomainId).toBe('ceza');
        expect(signals.lockProfiles).toBe(true);
    });

    it('does not accept unknown AI profile ids', () => {
        const forcedProfiles = buildAiForcedProfiles({
            primaryProfile: 'ceza',
            profiles: ['ceza', 'olmayan_profil'],
        });

        expect(forcedProfiles).toEqual(['ceza']);
    });

    it('keeps ceza profile on a long criminal text even if user area is hukuk', () => {
        const forcedProfiles = buildAiForcedProfiles({
            primaryProfile: 'ceza',
            profiles: ['ceza'],
        });

        const signals = buildQuerySignals('uyusturucu madde ticareti', LONG_CEZA_TEXT, {
            forcedProfiles,
            searchArea: 'hukuk',
            resolvedSource: 'all',
        });

        expect(signals.matchedProfileIds).toEqual(['ceza']);
        expect(signals.primaryDomainId).toBe('ceza');
        expect(signals.lockProfiles).toBe(true);
    });

    it('keeps idare profile on a tax dispute text instead of drifting to ticaret or hukuk', () => {
        const forcedProfiles = buildAiForcedProfiles({
            primaryProfile: 'idare',
            profiles: ['idare'],
        });

        const signals = buildQuerySignals('tarhiyat vergi ziyai cezasi', LONG_IDARE_TEXT, {
            forcedProfiles,
            searchArea: 'hukuk',
            resolvedSource: 'all',
        });

        expect(signals.matchedProfileIds).toEqual(['idare']);
        expect(signals.primaryDomainId).toBe('idare');
        expect(signals.lockProfiles).toBe(true);
    });
});
