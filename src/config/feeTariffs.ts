// 2025 Harç Tarifeleri Yapılandırması
// Kaynak: 96 Seri No.lu Harçlar Kanunu Genel Tebliği (1 Ocak 2025)
// AAÜT 2025-2026 (4 Kasım 2025 Resmî Gazete)

export interface TarifeMeta {
    lastUpdated: string;
    lastChecked: string | null;
    source: string;
    version: string;
}

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

// Harç Tarifeleri (2025)
export const HARCLAR_2025: HarcTarifeleri = {
    meta: {
        lastUpdated: '2025-01-01',
        lastChecked: null,
        source: 'https://www.resmigazete.gov.tr - 96 Seri No.lu Harçlar Kanunu Genel Tebliği',
        version: '2025.1'
    },
    basvurmaHarci: {
        sulhHukuk: 281.80,
        asliyeHukuk: 615.40,
        bolgeAdliye: 945.40,
        anayasaMahkemesi: 5064.40,
        icra: 615.40,
    },
    nispiHarc: {
        kararIlam: 0.06831, // binde 68,31
        pesinOran: 0.25,
        asgaritutar: 427.60,
    },
    icraTahsilHarci: {
        hacizdenOnce: 0.0455,
        hacizdenSonra: 0.0910,
        satisSonrasi: 0.1138,
    },
    icraPesinHarc: 0.005,
    cezaeviHarci: 0.02,
    vekaletHarci: 87.50,
    vekaletPulu: 138.00,
    kesifHarci: 4361.50,
};

// Avukatlık Asgari Ücret Tarifesi (2025-2026)
export const AVUKATLIK_UCRET_2025: AvukatlikUcretTarifeleri = {
    meta: {
        lastUpdated: '2025-11-04',
        lastChecked: null,
        source: 'https://www.barobirlik.org.tr - AAÜT 2025-2026',
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

// Tarife güncellik kontrolü için yardımcı fonksiyonlar
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
