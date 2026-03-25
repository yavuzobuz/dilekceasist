
// =====================================================
// TÜRK HUKUK SİSTEMİ DİLEKÇE TÜRLERİ
// Comprehensive Turkish Legal Petition Types
// =====================================================

// Ana Kategori (Main Category)
export enum PetitionCategory {
  Hukuk = "Hukuk Yargılaması",
  Ceza = "Ceza Yargılaması",
  DegisikIs = "Değişik İş (D.İş)",
  Icra = "İcra ve İflas",
  Idari = "İdari Yargı",
  KanunYollari = "Kanun Yolları",
}

// Alt Kategori (Subcategory)
export enum PetitionSubcategory {
  // Hukuk
  DavaAcilis = "Dava Açılışı ve Cevap",
  AileHukuku = "Aile Hukuku",
  IsHukuku = "İş Hukuku",
  GayrimenkulMiras = "Gayrimenkul/Miras",
  YargilamaAraDilekceleri = "Yargılama Süreci",

  // Ceza
  Sorusturma = "Soruşturma (Savcılık)",
  Kovusturma = "Kovuşturma (Mahkeme)",

  // D.İş
  TespitDilekceleri = "Tespit Dilekçeleri",
  GeciciKoruma = "Geçici Koruma ve Tedbirler",
  ItirazMerci = "İtiraz Merci İncelemeleri",

  // İcra
  IcraTakip = "Takip ve İtiraz",
  IcraHukukMahkemesi = "İcra Hukuk Mahkemesi",
  IcraTalepler = "Talepler",
  IcraGenelMahkeme = "Genel Mahkeme Davaları",

  // İdari
  IdariDavalar = "İdari Davalar",

  // Kanun Yolları
  UstMahkeme = "Üst Mahkeme Başvuruları",
}

// Dilekçe Türleri (Petition Types)
export enum PetitionType {
  // ========== HUKUK - Dava Açılışı ==========
  DavaDilekcesi = "Dava Dilekçesi",
  CevapDilekcesi = "Cevap Dilekçesi",
  CevabaCevap = "Cevaba Cevap Dilekçesi",
  IkinciCevap = "İkinci Cevap Dilekçesi",

  // ========== HUKUK - Aile ==========
  AnlasmaliBosonma = "Anlaşmalı Boşanma Protokolü",
  CekismeliBosonma = "Çekişmeli Boşanma Dilekçesi",
  NafakaArtirim = "Nafaka Artırım Dilekçesi",
  NafakaAzaltim = "Nafaka Azaltım Dilekçesi",
  VelayetDegisikligi = "Velayet Değişikliği (Nez'i) Dilekçesi",
  BabalikDavasi = "Babalık Davası Dilekçesi",

  // ========== HUKUK - İş ==========
  IseIade = "İşe İade Davası Dilekçesi",
  KidemIhbar = "Kıdem/İhbar Tazminatı Dilekçesi",
  FazlaMesai = "Fazla Mesai Alacağı Dilekçesi",
  HizmetTespiti = "Hizmet Tespiti Davası Dilekçesi",

  // ========== HUKUK - Gayrimenkul/Miras ==========
  IzaleiSuyu = "İzale-i Şüyu (Ortaklığın Giderilmesi)",
  TapuIptalTescil = "Tapu İptal ve Tescil Davası",
  Ecrimisil = "Ecrimisil (Haksız İşgal) Davası",
  Onalim = "Önalım (Şufa) Davası",
  MirasinReddi = "Mirasın Reddi Dilekçesi",
  VerasetIlami = "Veraset İlamı Talebi",

  // ========== HUKUK - Yargılama Süreci ==========
  DelilTanikListesi = "Delil ve Tanık Listesi",
  BilirkisiItiraz = "Bilirkişi Raporuna İtiraz",
  BilirkisiBeyan = "Bilirkişi Raporuna Beyan",
  IslahDilekcesi = "Islah Dilekçesi",
  AdliYardim = "Adli Yardım Talebi",
  FeragatDilekcesi = "Feragat Dilekçesi",
  KabulDilekcesi = "Kabul Dilekçesi",

  // ========== CEZA - Soruşturma ==========
  Sikayet = "Şikayet / Suç Duyurusu Dilekçesi",
  KYOKItiraz = "KYOK (Takipsizlik) Kararına İtiraz",
  KorumaTedbiri = "Koruma Tedbiri Talebi",
  ElKonulanEsya = "El Konulan Eşyanın İadesi Talebi",

  // ========== CEZA - Kovuşturma ==========
  SavunmaDilekcesi = "Savunma Dilekçesi",
  KatilmaTalebi = "Katılma (Müdahale) Talebi",
  TevsiiTahkikat = "Tevsi-i Tahkikat Talebi",
  EsasHakkindaBeyan = "Esas Hakkında Mütalaaya Beyan",
  HAGBBeyan = "HAGB Beyanı",

  // ========== D.İŞ - Tespit ==========
  DelilTespiti = "Delil Tespiti Dilekçesi",
  HasarTespiti = "Hasar Tespiti Talebi",
  InsaatSeviyeTespiti = "İnşaat Seviye Tespiti",
  InternetIcerikTespiti = "İnternet İçeriği Tespiti",
  TicariDefterIncelemesi = "Ticari Defter İncelemesi Talebi",

  // ========== D.İŞ - Geçici Koruma ==========
  IhtiyatiHaciz = "İhtiyati Haciz Talebi",
  IhtiyatiTedbir = "İhtiyati Tedbir Talebi",
  Koruma6284 = "6284 Sayılı Kanun Koruma Talebi",
  UzaklastirmaKarari = "Uzaklaştırma Kararı Talebi",

  // ========== D.İŞ - İtiraz Merci ==========
  TrafikCezasiItiraz = "Trafik Cezasına İtiraz",
  TutuklulugaItiraz = "Tutukluluğa İtiraz Dilekçesi",
  IdariParaCezasiItiraz = "İdari Para Cezasına İtiraz",

  // ========== İCRA - Takip ve İtiraz ==========
  TakipTalebi = "Takip Talebi",
  BorcaItiraz = "Borca İtiraz Dilekçesi",
  ImzayaItiraz = "İmzaya İtiraz Dilekçesi",
  OdemeEmriItiraz = "Ödeme Emrine İtiraz",

  // ========== İCRA - İcra Hukuk Mahkemesi ==========
  IcraSikayet = "Şikayet (Memur Muamelesi)",
  IhaleninFeshi = "İhalenin Feshi Davası",
  Meskeniyet = "Meskeniyet İddiası (Haczedilmezlik)",
  Istihkak = "İstihkak Davası",

  // ========== İCRA - Talepler ==========
  MaasHaczi = "Maaş Haczi Talebi",
  AracYakalama = "Araç Yakalama Talebi",
  MalBeyani = "Mal Beyanı Dilekçesi",
  HacizKaldirma = "Haciz Kaldırma Talebi",
  TakibinIptali = "Takibin İptali Talebi",
  HaricenTahsil = "Haricen Tahsil Talebi",
  DosyaKapatma = "Dosya Kapatma Talebi",
  TahliyeTalebi = "Tahliye Talebi",

  // ========== İCRA - Genel Mahkeme ==========
  ItirazinIptali = "İtirazın İptali Davası",
  MenfiTespit = "Menfi Tespit Davası",
  Istirdat = "İstirdat (Geri Alma) Davası",
  TasarrufunIptali = "Tasarrufun İptali Davası",

  // ========== İDARİ YARGI ==========
  IptalDavasi = "İptal Davası Dilekçesi",
  TamYargiDavasi = "Tam Yargı Davası Dilekçesi",
  YurutmeninDurdurulmasi = "Yürütmenin Durdurulması Talebi",
  VergiDavasi = "Vergi Davası Dilekçesi",

  // ========== KANUN YOLLARI ==========
  IstinafBasvuru = "İstinaf Başvuru Dilekçesi",
  TemyizBasvuru = "Temyiz Başvuru Dilekçesi",
  BireyselBasvuru = "AYM Bireysel Başvuru Dilekçesi",
  SureTutum = "Süre Tutum Dilekçesi", // Eski uygulama, 8. Yargı Paketi ile değişti
  KararDuzeltme = "Karar Düzeltme Dilekçesi",
  YargilamaninYenilenmesi = "Yargılamanın Yenilenmesi Dilekçesi",
}

// Kategori -> Alt Kategori Eslesmesi
export const CategoryToSubcategories: Record<PetitionCategory, PetitionSubcategory[]> = {
  [PetitionCategory.Hukuk]: [
    PetitionSubcategory.DavaAcilis,
    PetitionSubcategory.AileHukuku,
    PetitionSubcategory.IsHukuku,
    PetitionSubcategory.GayrimenkulMiras,
    PetitionSubcategory.YargilamaAraDilekceleri,
  ],
  [PetitionCategory.Ceza]: [
    PetitionSubcategory.Sorusturma,
    PetitionSubcategory.Kovusturma,
  ],
  [PetitionCategory.DegisikIs]: [
    PetitionSubcategory.TespitDilekceleri,
    PetitionSubcategory.GeciciKoruma,
    PetitionSubcategory.ItirazMerci,
  ],
  [PetitionCategory.Icra]: [
    PetitionSubcategory.IcraTakip,
    PetitionSubcategory.IcraHukukMahkemesi,
    PetitionSubcategory.IcraTalepler,
    PetitionSubcategory.IcraGenelMahkeme,
  ],
  [PetitionCategory.Idari]: [
    PetitionSubcategory.IdariDavalar,
  ],
  [PetitionCategory.KanunYollari]: [
    PetitionSubcategory.UstMahkeme,
  ],
};

// Alt Kategori -> Dilekçe Türleri Eşleşmesi
export const SubcategoryToPetitionTypes: Record<PetitionSubcategory, PetitionType[]> = {
  // Hukuk - Dava Açılışı
  [PetitionSubcategory.DavaAcilis]: [
    PetitionType.DavaDilekcesi,
    PetitionType.CevapDilekcesi,
    PetitionType.CevabaCevap,
    PetitionType.IkinciCevap,
  ],
  // Hukuk - Aile
  [PetitionSubcategory.AileHukuku]: [
    PetitionType.AnlasmaliBosonma,
    PetitionType.CekismeliBosonma,
    PetitionType.NafakaArtirim,
    PetitionType.NafakaAzaltim,
    PetitionType.VelayetDegisikligi,
    PetitionType.BabalikDavasi,
  ],
  // Hukuk - İş
  [PetitionSubcategory.IsHukuku]: [
    PetitionType.IseIade,
    PetitionType.KidemIhbar,
    PetitionType.FazlaMesai,
    PetitionType.HizmetTespiti,
  ],
  // Hukuk - Gayrimenkul/Miras
  [PetitionSubcategory.GayrimenkulMiras]: [
    PetitionType.IzaleiSuyu,
    PetitionType.TapuIptalTescil,
    PetitionType.Ecrimisil,
    PetitionType.Onalim,
    PetitionType.MirasinReddi,
    PetitionType.VerasetIlami,
  ],
  // Hukuk - Yargılama Süreci
  [PetitionSubcategory.YargilamaAraDilekceleri]: [
    PetitionType.DelilTanikListesi,
    PetitionType.BilirkisiItiraz,
    PetitionType.BilirkisiBeyan,
    PetitionType.IslahDilekcesi,
    PetitionType.AdliYardim,
    PetitionType.FeragatDilekcesi,
    PetitionType.KabulDilekcesi,
  ],
  // Ceza - Soruşturma
  [PetitionSubcategory.Sorusturma]: [
    PetitionType.Sikayet,
    PetitionType.KYOKItiraz,
    PetitionType.KorumaTedbiri,
    PetitionType.ElKonulanEsya,
  ],
  // Ceza - Kovusturma
  [PetitionSubcategory.Kovusturma]: [
    PetitionType.SavunmaDilekcesi,
    PetitionType.KatilmaTalebi,
    PetitionType.TevsiiTahkikat,
    PetitionType.EsasHakkindaBeyan,
    PetitionType.HAGBBeyan,
  ],
  // D.İş - Tespit
  [PetitionSubcategory.TespitDilekceleri]: [
    PetitionType.DelilTespiti,
    PetitionType.HasarTespiti,
    PetitionType.InsaatSeviyeTespiti,
    PetitionType.InternetIcerikTespiti,
    PetitionType.TicariDefterIncelemesi,
  ],
  // D.İş - Geçici Koruma
  [PetitionSubcategory.GeciciKoruma]: [
    PetitionType.IhtiyatiHaciz,
    PetitionType.IhtiyatiTedbir,
    PetitionType.Koruma6284,
    PetitionType.UzaklastirmaKarari,
  ],
  // D.İş - İtiraz Merci
  [PetitionSubcategory.ItirazMerci]: [
    PetitionType.TrafikCezasiItiraz,
    PetitionType.TutuklulugaItiraz,
    PetitionType.IdariParaCezasiItiraz,
  ],
  // İcra - Takip ve İtiraz
  [PetitionSubcategory.IcraTakip]: [
    PetitionType.TakipTalebi,
    PetitionType.BorcaItiraz,
    PetitionType.ImzayaItiraz,
    PetitionType.OdemeEmriItiraz,
  ],
  // İcra - İcra Hukuk Mahkemesi
  [PetitionSubcategory.IcraHukukMahkemesi]: [
    PetitionType.IcraSikayet,
    PetitionType.IhaleninFeshi,
    PetitionType.Meskeniyet,
    PetitionType.Istihkak,
  ],
  // Icra - Talepler
  [PetitionSubcategory.IcraTalepler]: [
    PetitionType.MaasHaczi,
    PetitionType.AracYakalama,
    PetitionType.MalBeyani,
    PetitionType.HacizKaldirma,
    PetitionType.TakibinIptali,
    PetitionType.HaricenTahsil,
    PetitionType.DosyaKapatma,
    PetitionType.TahliyeTalebi,
  ],
  // Icra - Genel Mahkeme
  [PetitionSubcategory.IcraGenelMahkeme]: [
    PetitionType.ItirazinIptali,
    PetitionType.MenfiTespit,
    PetitionType.Istirdat,
    PetitionType.TasarrufunIptali,
  ],
  // İdari - Davalar
  [PetitionSubcategory.IdariDavalar]: [
    PetitionType.IptalDavasi,
    PetitionType.TamYargiDavasi,
    PetitionType.YurutmeninDurdurulmasi,
    PetitionType.VergiDavasi,
  ],
  // Kanun Yolları
  [PetitionSubcategory.UstMahkeme]: [
    PetitionType.IstinafBasvuru,
    PetitionType.TemyizBasvuru,
    PetitionType.BireyselBasvuru,
    PetitionType.SureTutum,
    PetitionType.KararDuzeltme,
    PetitionType.YargilamaninYenilenmesi,
  ],
};

// Kullanıcı Rolleri
export enum UserRole {
  Davaci = "Davacı",
  Davali = "Davalı",
  Musteki = "Müşteki / Şikayetçi",
  Magdur = "Mağdur",
  Sanik = "Sanık",
  Mudahil = "Müdahil (Katılan)",
  ItirazEden = "İtiraz Eden",
  Basvuran = "Başvuran",
  Alacakli = "Alacaklı",
  Borclu = "Borçlu",
  Istinafeden = "İstinaf Eden",
  Temyizeden = "Temyiz Eden",
  Vekil = "Vekil (Avukat)",
}

// Rol önerileri - kategoriye göre
export const CategoryToRoles: Record<PetitionCategory, UserRole[]> = {
  [PetitionCategory.Hukuk]: [UserRole.Davaci, UserRole.Davali, UserRole.Vekil],
  [PetitionCategory.Ceza]: [UserRole.Musteki, UserRole.Magdur, UserRole.Sanik, UserRole.Mudahil, UserRole.Vekil],
  [PetitionCategory.DegisikIs]: [UserRole.Basvuran, UserRole.ItirazEden, UserRole.Vekil],
  [PetitionCategory.Icra]: [UserRole.Alacakli, UserRole.Borclu, UserRole.Vekil],
  [PetitionCategory.Idari]: [UserRole.Davaci, UserRole.Basvuran, UserRole.Vekil],
  [PetitionCategory.KanunYollari]: [UserRole.Istinafeden, UserRole.Temyizeden, UserRole.Davaci, UserRole.Davali, UserRole.Vekil],
};

// =====================================================
// Diğer Tipler (Other Types)
// =====================================================

export interface ChatUploadedFile {
  name: string;
  mimeType: string;
  data: string; // base64 encoded
  preview?: string; // Optional preview URL for images
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  files?: ChatUploadedFile[]; // Optional uploaded files
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface UploadedFile {
  name?: string;
  mimeType: string;
  data: string; // base64 encoded string
}

export interface WebSearchResult {
  summary: string;
  sources: GroundingSource[];
}

export interface LegalSearchResult {
  title: string;
  esasNo?: string;
  kararNo?: string;
  tarih?: string;
  daire?: string;
  ozet?: string;
  source?: string;
  sourceUrl?: string;
  documentUrl?: string;
  documentId?: string;
  snippet?: string;
  relevanceScore?: number; // 0-100 relevance score
  similarityScore?: number;
  semanticQuery?: string;
  initialKeyword?: string;
  matchReason?: string;
  matchHighlights?: string[];
  matchedKeywordCount?: number;
  matchedKeywords?: string[];
  matchStage?: 'summary' | 'full_text';
  requiredKeywordCount?: number;
  semanticScore?: number;
  summaryKeywordHits?: number;
  fullTextKeywordHits?: number;
  selectionReason?: string;
  sourceUsed?: string;
  retrievalStage?: 'summary' | 'full_text';
  combinedScore?: number;
  matchedRequiredConcepts?: string[];
  missingRequiredConcepts?: string[];
  matchedSupportConcepts?: string[];
  matchedEvidenceConcepts?: string[];
  matchedNegativeConcepts?: string[];
  domainConfidence?: number;
  rejectionReason?: string;
}

export interface LegalSearchPacket {
  searchVariants?: Array<{
    query: string;
    mode?: 'strict' | 'broad' | 'statute' | 'fallback' | string;
  }>;
  fallbackToNext?: boolean;
  primaryDomain?:
    | 'ceza'
    | 'is_hukuku'
    | 'aile'
    | 'icra'
    | 'borclar'
    | 'ticaret'
    | 'gayrimenkul'
    | 'idare'
    | 'vergi'
    | 'tuketici'
    | 'sigorta'
    | 'miras'
    | 'anayasa'
    | 'fikri_mulkiyet'
    | 'bilisim'
    | 'deniz'
    | 'kamulastirma'
    | 'rekabet'
    | 'cevre'
    | 'bankacilik'
    | 'kadastro'
    | 'cocuk'
    | 'saglik'
    | 'infaz'
    | 'is_guvenligi'
    | 'tahkim';
  caseType?: string;
  coreIssue?: string;
  requiredConcepts?: string[];
  supportConcepts?: string[];
  evidenceConcepts?: string[];
  negativeConcepts?: string[];
  preferredSource?: 'yargitay' | 'danistay' | 'bam' | 'auto';
  preferredBirimCodes?: string[];
  searchSeedText?: string;
  queryMode?: 'short_issue' | 'long_fact' | 'document_style';
}

export interface WebSearchPlan {
  coreQueries?: string[];
  supportQueries?: string[];
  negativeQueries?: string[];
  focusTopics?: string[];
}

export interface PrecedentSearchPlan {
  searchVariants?: Array<{
    query: string;
    mode?: 'strict' | 'broad' | 'statute' | 'fallback' | string;
  }>;
  fallbackToNext?: boolean;
  requiredConcepts?: string[];
  supportConcepts?: string[];
  evidenceConcepts?: string[];
  negativeConcepts?: string[];
  preferredSource?: 'yargitay' | 'danistay' | 'bam' | 'auto';
  preferredBirimCodes?: string[];
  searchSeedText?: string;
  queryMode?: 'short_issue' | 'long_fact' | 'document_style';
}

export interface DetailedAnalysis {
  documentType?: string;
  caseStage?: string;
  primaryDomain?: LegalSearchPacket['primaryDomain'];
  secondaryDomains?: string[];
  caseType?: string;
  coreIssue?: string;
  keyFacts?: string[];
  timeline?: string[];
  claims?: string[];
  defenses?: string[];
  evidenceSummary?: string[];
  legalIssues?: string[];
  risksAndWeakPoints?: string[];
  missingCriticalInfo?: string[];
  suggestedNextSteps?: string[];
  webSearchPlan?: WebSearchPlan;
  precedentSearchPlan?: PrecedentSearchPlan;
}

export interface AnalysisData {
  summary: string;
  potentialParties: string[];
  caseDetails?: CaseDetails;
  lawyerInfo?: LawyerInfo;
  contactInfo?: ContactInfo[];
  legalSearchPacket?: LegalSearchPacket;
  analysisInsights?: DetailedAnalysis;
}

export interface CaseDetails {
  caseTitle: string;
  court: string;
  fileNumber: string;
  decisionNumber: string;
  decisionDate: string;
}

export interface ContactInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  tcNo?: string;
  barNumber?: string; // Baro sicil numarası (vekiller için)
}

export interface LawyerInfo extends ContactInfo {
  barNumber: string;
  bar: string; // Baro adı (örn: "Ankara Barosu")
  title: string; // "Avukat" veya "Avukat - Stajyer" vs.
}

export interface GeneratePetitionParams {
  userRole: UserRole;
  petitionType: PetitionType;
  petitionCategory?: PetitionCategory;
  petitionSubcategory?: PetitionSubcategory;
  caseDetails: CaseDetails;
  analysisSummary: string;
  webSearchResult: string;
  legalSearchResult?: string; // Yargitay, Danistay etc. court decisions
  docContent: string;
  specifics: string;
  searchKeywords?: string[] | string;
  webSources?: GroundingSource[];
  legalSearchResults?: LegalSearchResult[];
  chatHistory: ChatMessage[];
  parties: { [key: string]: string };
  webSourceCount?: number;
  legalResultCount?: number;
  lawyerInfo?: LawyerInfo;
  contactInfo?: ContactInfo[];
  analysisInsights?: DetailedAnalysis;
}

export interface PetitionViewProps {
  petition: string;
  setGeneratedPetition: (petition: string) => void;
  sources: GroundingSource[];
  isLoading: boolean;
  onRewrite: (text: string) => Promise<string>;
  onReview: () => void;
  isReviewing: boolean;
  petitionVersion: number;
  // Office branding
  officeLogoUrl?: string | null;
  corporateHeader?: string | null;
}

export interface ChatContext {
  keywords: string;
  searchSummary: string;
  legalSummary?: string;
  webSources?: GroundingSource[];
  legalSearchResults?: LegalSearchResult[];
  webSourceCount?: number;
  legalResultCount?: number;
  docContent: string;
  specifics: string;
  analysisSummary?: string;
  currentDraft?: string;
  petitionType?: string;
  allowWebSearch?: boolean;
  allowLegalSearch?: boolean;
  disableDocumentGeneration?: boolean;
}





