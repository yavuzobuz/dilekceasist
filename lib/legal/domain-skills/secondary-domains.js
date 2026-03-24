import { buildGenericPackage, resolveQueryMode } from './shared.js';

const SECONDARY_DOMAIN_CONFIGS = {
    ticaret: {
        label: 'Ticaret hukuku',
        profiles: ['ticaret', 'hukuk'],
        sources: ['yargitay'],
        negative: ['ceza dairesi', 'danistay', 'bosanma'],
        principles: ['ticari defter', 'yetki', 'ticari faiz'],
        evidence: ['ticaret sicil kaydi', 'genel kurul tutanagi', 'yonetim kurulu karari', 'cek yapragi', 'ticari defter kaydi'],
        variants: [
            { when: /(anonim sirket|limited sirket|genel kurul|ortaklar kurulu|marka|haksiz rekabet)/i, core: 'Sirketler ve ticari organizasyon uyusmazliklarinda organ karari ile sorumluluk denetiminin degerlendirilmesi', retrieval: ['anonim sirket', 'genel kurul', 'limited sirket'], support: ['ortaklar kurulu', 'mudur sorumlulugu', 'ttk 409'], clauses: ['anonim sirket genel kurul iptal', 'limited sirket mudur sorumlulugu', 'haksiz rekabet ttk 54'] },
            { when: /(cek|bono|kambiyo|cari hesap|konkordato|iflas|acente)/i, core: 'Ticari alacak, kambiyo ve konkordato sureclerinde belge ve yetki degerlendirmesinin yapilmasi', retrieval: ['ticari alacak', 'cari hesap', 'cek bedeli'], support: ['kambiyo senedi', 'konkordato', 'faiz'], clauses: ['ticari alacak cari hesap faiz', 'cek bedeli kambiyo', 'konkordato alacakli tasdik'] },
        ],
        fallback: { core: 'Ticaret hukuku uyusmazliginda sirket, kambiyo veya ticari alacak basliklarinin degerlendirilmesi', retrieval: ['ticari alacak', 'ttk', 'sirket uyusmazligi'], support: ['ticari defter', 'faiz', 'yetki'], clauses: ['ticaret hukuku emsal karar', 'sirket uyusmazligi ttk', 'ticari alacak faiz yargitay'] },
    },
    idare: {
        label: 'Idare hukuku',
        profiles: ['idare'],
        sources: ['danistay', 'uyap'],
        negative: ['ceza dairesi', 'hukuk dairesi', 'is hukuku', 'bosanma'],
        principles: ['hukuka aykirilik', 'orantililik', 'hukuki guvenlik'],
        evidence: ['idari islem tarihi', 'teblig tarihi', 'idari para cezasi', 'yapi ruhsati', 'encumen karari', 'teknik rapor'],
        variants: [
            { when: /(iptal davasi|idari islem|yetki asimi|hukuka aykirilik)/i, core: 'Idari islemin iptalinde yetki, sekil ve sebep yonlerinden hukuka uygunluk denetimi', retrieval: ['idari islem iptali', 'yetki asimi', 'hukuka aykirilik'], support: ['orantililik', 'hukuki guvenlik', 'takdir yetkisi'], clauses: ['idari islem iptali yetki asimi', 'hukuka aykirilik orantililik', 'takdir yetkisi yargisal denetim'] },
            { when: /(tam yargi|imar|yikim karari|ruhsat iptali|kamulastirma)/i, core: 'Idare hukukunda tam yargi veya imar etkili islemlerde tazmin ve orantililik denetiminin degerlendirilmesi', retrieval: ['tam yargi davasi', 'imar para cezasi', 'yikim karari'], support: ['hizmet kusuru', 'kamulastirma', 'kazanilmis hak'], clauses: ['tam yargi davasi hizmet kusuru', 'imar para cezasi yikim karari', 'kamulastirmasiz el atma bedel'] },
        ],
        fallback: { core: 'Idare hukuku uyusmazliginda islem, eylem ve iptal denetimi basliklarinin degerlendirilmesi', retrieval: ['idari islem', 'iptal davasi', 'hukuka aykirilik'], support: ['orantililik', 'hukuki guvenlik', 'tam yargi'], clauses: ['idare hukuku emsal karar', 'iptal davasi hukuka aykirilik', 'tam yargi hizmet kusuru'] },
    },
    vergi: {
        label: 'Vergi hukuku',
        profiles: ['idare'],
        sources: ['danistay'],
        negative: ['ceza dairesi', 'hukuk dairesi', 'bosanma', 'is hukuku'],
        principles: ['ispat yuku', 'zamanaasimi', 'tarhiyat denetimi'],
        evidence: ['fatura', 'e-fatura', 'muhasebe kaydi', 'banka hareketi', 'inceleme raporu', 'tarhiyat ihbarnamesi'],
        variants: [
            { when: /(kdv|sahte fatura|indirim reddi|vergi ziya|tarhiyat|ozel usulsuzluk)/i, core: 'Vergi uyusmazliginda tarhiyat, sahte fatura ve ceza dayanaklarinin degerlendirilmesi', retrieval: ['kdv', 'sahte fatura', 'tarhiyat'], support: ['vergi ziyai', 'ispat yuku', 'inceleme raporu'], clauses: ['kdv sahte fatura indirim reddi', 'vergi ziyai cezasi tarhiyat', 'sahte fatura ispat yuku'] },
        ],
        fallback: { core: 'Vergi uyusmazliginda tarhiyat, ceza ve mukellef ispat yukunun degerlendirilmesi', retrieval: ['vergi tarhiyati', 'vergi ziyai', 'tarhiyat'], support: ['ispat yuku', 'inceleme raporu', 'zamanaasimi'], clauses: ['vergi tarhiyati emsal karar', 'vergi ziyai ispat yuku', 'tarhiyat zamanaasimi danistay'] },
    },
    tuketici: {
        label: 'Tuketici hukuku',
        profiles: ['hukuk'],
        sources: ['yargitay', 'uyap'],
        negative: ['ceza dairesi', 'danistay', 'idare mahkemesi', 'tck'],
        principles: ['ayip', 'cayma hakki', 'ispat yuku'],
        evidence: ['sozlesme', 'fatura', 'garanti belgesi', 'servis kaydi', 'odeme dekontu', 'hakem heyeti karari'],
        variants: [
            { when: /(ayipli mal|ayipli hizmet|tuketici hakem heyeti|tkhk 11|cayma hakki)/i, core: 'Tuketici uyusmazliginda ayip ve cayma hakki kapsaminda iade veya bedel talebinin degerlendirilmesi', retrieval: ['tuketici sozlesmesi', 'ayipli mal', 'tkhk 11'], support: ['cayma hakki', 'bedel iadesi', 'hakem heyeti'], clauses: ['ayipli mal tkhk 11', 'cayma hakki bedel iadesi', 'tuketici hakem heyeti yargitay'] },
        ],
        fallback: { core: 'Tuketici hukukunda ayip, iade ve bedel taleplerinin degerlendirilmesi', retrieval: ['tuketici sozlesmesi', 'ayipli mal', 'bedel iadesi'], support: ['cayma hakki', 'ispat yuku', 'hakem heyeti'], clauses: ['tuketici ayipli mal bedel iadesi', 'cayma hakki emsal karar', 'hakem heyeti yargitay'] },
    },
    sigorta: {
        label: 'Sigorta hukuku',
        profiles: ['hukuk'],
        sources: ['yargitay'],
        negative: ['ceza dairesi', 'danistay', 'bosanma', 'idare mahkemesi'],
        principles: ['rizikonun gerceklesmesi', 'kusur', 'rucu'],
        evidence: ['sigorta policesi', 'hasar dosyasi', 'ekspertiz raporu', 'kaza tespit tutanagi', 'banka odeme kaydi'],
        variants: [
            { when: /(sigorta|kasko|trafik kazasi|deger kaybi|rucu|hasar)/i, core: 'Sigorta iliskisinde rizikonun gerceklesmesi, teminat kapsami ve tazmin sorumlulugunun degerlendirilmesi', retrieval: ['sigorta sozlesmesi', 'tazminat', 'rizikonun gerceklesmesi'], support: ['rucu', 'kusur', 'deger kaybi'], clauses: ['sigorta sozlesmesi rizikonun gerceklesmesi', 'deger kaybi tazminat yargitay', 'sigorta rucu kusur'] },
        ],
        fallback: { core: 'Sigorta uyusmazliginda police kapsami ve tazminat sorumlulugunun degerlendirilmesi', retrieval: ['sigorta sozlesmesi', 'tazminat', 'police'], support: ['kusur', 'rucu', 'hasar'], clauses: ['sigorta police tazminat', 'hasar kusur rucu', 'kasko trafik kazasi yargitay'] },
    },
    miras: {
        label: 'Miras hukuku',
        profiles: ['hukuk'],
        sources: ['yargitay'],
        negative: ['ceza dairesi', 'danistay', 'is hukuku', 'idare mahkemesi'],
        principles: ['sakli pay', 'muris muvazaasi', 'tenkis'],
        evidence: ['veraset ilami', 'tapu kaydi', 'vasiyetname', 'mirascilik belgesi', 'banka kaydi', 'tanik'],
        variants: [
            { when: /(muris muvazaasi|tenkis|sakli pay|vasiyetname|mirasin reddi)/i, core: 'Miras uyusmazliginda sakli pay, tenkis ve muris tasarruflarinin gecerliliginin degerlendirilmesi', retrieval: ['tenkis', 'muris muvazaasi', 'sakli pay'], support: ['vasiyetname iptali', 'mirasin reddi', 'tmk 560'], clauses: ['tenkis sakli pay tmk 560', 'muris muvazaasi tapu iptali', 'vasiyetname iptali yargitay'] },
        ],
        fallback: { core: 'Miras hukuku uyusmazliginda mirascilik, tenkis ve tasarruf sinirlarinin degerlendirilmesi', retrieval: ['miras', 'tenkis', 'mirascilik'], support: ['sakli pay', 'vasiyetname', 'tasfiye'], clauses: ['miras tenkis emsal karar', 'mirascilik sakli pay', 'vasiyetname iptali yargitay'] },
    },
    anayasa: {
        label: 'Anayasa hukuku',
        profiles: ['anayasa'],
        sources: ['anayasa'],
        negative: ['ceza dairesi', 'hukuk dairesi', 'danistay', 'yargitay hukuk'],
        principles: ['ihlal', 'orantililik', 'etkili basvuru'],
        evidence: ['basvuru tarihi', 'ic yollarin tuketilme tarihi', 'yargilama suresi', 'tutukluluk suresi', 'tazminat miktari'],
        variants: [
            {
                when: /(bireysel basvuru|aym|anayasa mahkemesi|adil yargilanma|ifade ozgurlugu|mulkiyet hakki|anayasa 36|anayasa 26|anayasa 35|makul sure|etkili basvuru|aihs)/i,
                subdomain: 'anayasa_bireysel_basvuru',
                decisionType: 'bireysel_basvuru',
                core: 'Anayasa Mahkemesi bireysel basvurusunda temel hak ihlali ve orantililik denetiminin degerlendirilmesi',
                retrieval: ['bireysel basvuru', 'ihlal', 'anayasa mahkemesi'],
                support: ['adil yargilanma hakki', 'etkili basvuru', 'orantililik', 'yeniden yargilama'],
                clauses: [
                    '+\"adil yargilanma\" +\"silahlarin esitligi\" +\"ihlal\"',
                    '+\"ifade ozgurlugu\" +\"basin ozgurlugu\" +\"ihlal\"',
                    '+\"makul sure\" +\"yargilama\" +\"tazminat\"',
                    '+\"etkili basvuru\" +\"ic hukuk yolu\" +\"tuketme\"',
                    'anayasa mahkemesi bireysel basvuru ihlal',
                ],
                evidence: ['basvuru tarihi', 'ic yollarin tuketilme tarihi', 'yargilama suresi', 'tutukluluk suresi'],
                negative: ['norm denetimi', 'iptal davasi', 'kanun iptali', 'anayasaya aykirilik'],
            },
            {
                when: /(anayasaya aykirilik|kanun iptali|iptal davasi|norm denetimi|esas sayisi|khk|belirlilik ilkesi|olcululuk)/i,
                subdomain: 'anayasa_norm_denetimi',
                decisionType: 'norm_denetimi',
                core: 'Norm denetiminde kanun veya KHK hukumlerinin Anayasaya uygunlugunun degerlendirilmesi',
                retrieval: ['anayasaya aykirilik', 'kanun iptali', 'norm denetimi'],
                support: ['hukuk devleti', 'belirlilik ilkesi', 'olcululuk', 'esitlik ilkesi'],
                clauses: [
                    '+\"anayasaya aykirilik\" +\"kanun\" +\"iptal\"',
                    '+\"hukuk devleti\" +\"belirlilik ilkesi\" +\"iptal\"',
                    '+\"temel hak sinirlamasi\" +\"orantililik\" +\"olcululuk\"',
                    '+\"esitlik ilkesi\" +\"Anayasa 10\" +\"ayrimcilik\"',
                    'anayasa mahkemesi norm denetimi',
                ],
                negative: ['bireysel basvuru', 'ihlal', 'yeniden yargilama', 'ic hukuk yolu'],
            },
        ],
        fallback: {
            subdomain: 'anayasa_bireysel_basvuru',
            decisionType: 'bireysel_basvuru',
            core: 'Anayasal hak ihlali iddiasinda bireysel basvuru sartlari ve ihlal denetiminin degerlendirilmesi',
            retrieval: ['bireysel basvuru', 'ihlal', 'anayasa mahkemesi'],
            support: ['etkili basvuru', 'orantililik', 'yeniden yargilama'],
            clauses: [
                '+\"adil yargilanma\" +\"silahlarin esitligi\" +\"ihlal\"',
                '+\"makul sure\" +\"yargilama\" +\"tazminat\"',
                'anayasa mahkemesi bireysel basvuru',
            ],
            negative: ['norm denetimi', 'iptal davasi', 'kanun iptali'],
        },
        suggestedCourt: 'Anayasa Mahkemesi',
    },
};

export const buildSecondaryDomainSkillPackage = ({
    rawText = '',
    domain = '',
    preferredSource = 'all',
}) => {
    const config = SECONDARY_DOMAIN_CONFIGS[domain];
    if (!config) return null;

    const queryMode = resolveQueryMode(rawText);
    const normalized = String(rawText || '').toLocaleLowerCase('tr-TR');
    const variant = config.variants.find((item) => item.when.test(normalized)) || config.fallback;

    return buildGenericPackage({
        rawText,
        domain,
        label: config.label,
        profiles: config.profiles,
        sources: config.sources,
        negative: [...config.negative, ...((variant && Array.isArray(variant.negative)) ? variant.negative : [])],
        principles: config.principles,
        evidence: config.evidence,
        variant,
        queryMode,
        preferredSource,
        strictResultMode: domain === 'anayasa',
        suggestedCourt: config.suggestedCourt || '',
        subdomain: variant.subdomain || `${domain}_general`,
        decisionType: variant.decisionType || '',
    });
};
