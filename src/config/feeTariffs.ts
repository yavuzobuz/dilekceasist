// 2026 tariff model (backward compatible exports kept for existing screens)

export interface TarifeMeta {
    lastUpdated: string;
    lastChecked: string | null;
    source: string;
    version: string;
    references?: string[];
}

export type MahkemeTipi =
    | 'sulh_hukuk'
    | 'asliye_hukuk'
    | 'aile'
    | 'is'
    | 'tuketici'
    | 'asliye_ticaret'
    | 'icra_hukuk'
    | 'idare'
    | 'vergi'
    | 'asliye_ceza'
    | 'agir_ceza'
    | 'bolge_adliye'
    | 'yargitay_danistay'
    | 'anayasa';

export interface HarcTarifeleri {
    meta: TarifeMeta;
    basvurmaHarci: {
        sulhHukuk: number;
        asliyeHukuk: number;
        bolgeAdliye: number;
        anayasaMahkemesi: number;
        icra: number;
    };
    nispiHarc: {
        kararIlam: number;
        pesinOran: number;
        asgaritutar: number;
    };
    icraTahsilHarci: {
        hacizdenOnce: number;
        hacizdenSonra: number;
        satisSonrasi: number;
    };
    icraPesinHarc: number;
    cezaeviHarci: number;
    vekaletHarci: number;
    vekaletPulu: number;
    kesifHarci: number;
    hukukGiderAvansi: number;
    tanikUcretAraligi: {
        min: number;
        max: number;
    };
    mahkemeBazliBasvurmaHarci: Record<MahkemeTipi, number>;
    mahkemeBazliBilirkisiUcreti: Record<MahkemeTipi, number>;
}

export interface AvukatlikUcretTarifeleri {
    meta: TarifeMeta;
    asliyeMahkeme: number;
    sulhHukuk: number;
    tuketiciMahkemesi: number;
    icraTakibi: number;
    icraTahliye: number;
    agirCeza: number;
    idareMahkemesi: number;
}

// 2026 values:
// - Maktu harclar 2025 -> 2026 icin %18.95 yeniden degerleme artisi uygulanmistir.
// - Bilirkisi minimumlari 2026 tarifesindeki mahkeme gruplarina gore islenmistir.
// - HMK gider avansi (hukuk): 530 TL.
export const HARCLAR_2026: HarcTarifeleri = {
    meta: {
        lastUpdated: '2026-01-01',
        lastChecked: null,
        source: 'Resmi Gazete 31.12.2025 (5. Mukerrer) ve 2026 yargi gider tarifeleri',
        version: '2026.1',
        references: [
            'https://www.resmigazete.gov.tr/eskiler/2025/12/20251231M5-28.pdf',
            'https://hukukislem.adalet.gov.tr/Resimler/SayfaDokuman/2532025103528Tebligat%20ve%20M%C3%BCzekkere%20Gideri.pdf',
            'https://hukukislem.adalet.gov.tr/Resimler/SayfaDokuman/2532025103536Tan%C4%B1kl%C4%B1k%20%C3%9Ccreti.pdf',
            'https://bilirkisilik.adalet.gov.tr/Resimler/Dokuman/3012202511022026%20Bilirkisilik%20Asgari%20Ucret%20Tarifesi.pdf'
        ]
    },
    basvurmaHarci: {
        sulhHukuk: 335.2,
        asliyeHukuk: 732.0,
        bolgeAdliye: 1124.6,
        anayasaMahkemesi: 6024.1,
        icra: 732.0,
    },
    nispiHarc: {
        kararIlam: 0.06831,
        pesinOran: 0.25,
        asgaritutar: 335.2,
    },
    icraTahsilHarci: {
        hacizdenOnce: 0.0455,
        hacizdenSonra: 0.0910,
        satisSonrasi: 0.1138,
    },
    icraPesinHarc: 0.005,
    cezaeviHarci: 0.02,
    vekaletHarci: 104.1,
    vekaletPulu: 164.2,
    kesifHarci: 5188.0,
    hukukGiderAvansi: 530.0,
    tanikUcretAraligi: {
        min: 130,
        max: 200,
    },
    mahkemeBazliBasvurmaHarci: {
        sulh_hukuk: 335.2,
        asliye_hukuk: 732.0,
        aile: 732.0,
        is: 732.0,
        tuketici: 732.0,
        asliye_ticaret: 732.0,
        icra_hukuk: 732.0,
        idare: 732.0,
        vergi: 732.0,
        asliye_ceza: 732.0,
        agir_ceza: 732.0,
        bolge_adliye: 1124.6,
        yargitay_danistay: 1475.6,
        anayasa: 6024.1,
    },
    mahkemeBazliBilirkisiUcreti: {
        sulh_hukuk: 2200,
        asliye_hukuk: 3600,
        aile: 2800,
        is: 2800,
        tuketici: 2200,
        asliye_ticaret: 4100,
        icra_hukuk: 2200,
        idare: 3600,
        vergi: 3600,
        asliye_ceza: 3600,
        agir_ceza: 4100,
        bolge_adliye: 4200,
        yargitay_danistay: 5100,
        anayasa: 5100,
    },
};

// Backward compatibility alias used by existing pages
export const HARCLAR_2025: HarcTarifeleri = HARCLAR_2026;

export const AVUKATLIK_UCRET_2026: AvukatlikUcretTarifeleri = {
    meta: {
        lastUpdated: '2025-11-04',
        lastChecked: null,
        source: 'TBB Avukatlik Asgari Ucret Tarifesi (2025-2026)',
        version: '2025-2026'
    },
    asliyeMahkeme: 45000,
    sulhHukuk: 30000,
    tuketiciMahkemesi: 22500,
    icraTakibi: 9000,
    icraTahliye: 20000,
    agirCeza: 65000,
    idareMahkemesi: 30000,
};

// Backward compatibility alias used by existing pages
export const AVUKATLIK_UCRET_2025: AvukatlikUcretTarifeleri = AVUKATLIK_UCRET_2026;

export function shouldCheckForUpdates(lastChecked: string | null): boolean {
    if (!lastChecked) return true;

    const lastCheckDate = new Date(lastChecked);
    const now = new Date();
    const threeMonthsAgo = new Date(now.setMonth(now.getMonth() - 3));

    return lastCheckDate < threeMonthsAgo;
}

export function getNextCheckDate(lastChecked: string | null): Date {
    if (!lastChecked) return new Date();

    const lastCheckDate = new Date(lastChecked);
    return new Date(lastCheckDate.setMonth(lastCheckDate.getMonth() + 3));
}
