
export enum PetitionType {
  Dava = "Dava Dilekçesi",
  Cevap = "Cevap Dilekçesi",
  Itiraz = "İtiraz Dilekçesi",
  BilirkişiRaporunaItiraz = "Bilirkişi Raporuna İtiraz Dilekçesi",
  Sikayet = "Şikayet Dilekçesi",
  Istinaf = "İstinaf Dilekçesi",
  Temyiz = "Temyiz Dilekçesi",
}

export enum UserRole {
  Davaci = "Davacı",
  Davali = "Davalı",
  Musteki = "Müşteki / Şikayetçi",
  Magdur = "Mağdur",
  ItirazEden = "İtiraz Eden",
  Basvuran = "Başvuran",
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GroundingSource {
    uri: string;
    title: string;
}

export interface UploadedFile {
    mimeType: string;
    data: string; // base64 encoded string
}

export interface WebSearchResult {
    summary: string;
    sources: GroundingSource[];
}

export interface AnalysisData {
    summary: string;
    potentialParties: string[];
    caseDetails?: CaseDetails;
    lawyerInfo?: LawyerInfo;
    contactInfo?: ContactInfo[];
}

export interface CaseDetails {
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
    caseDetails: CaseDetails;
    analysisSummary: string;
    webSearchResult: string;
    docContent: string;
    specifics: string;
    chatHistory: ChatMessage[];
    parties: { [key: string]: string };
    lawyerInfo?: LawyerInfo;
    contactInfo?: ContactInfo[];
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
}

export interface ChatContext {
  keywords: string;
  searchSummary: string;
  docContent: string;
  specifics: string;
}
