import React, { useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import UTIF from 'utif2';
import mammoth from 'mammoth';
import { PetitionType, ChatMessage, UploadedFile, WebSearchResult, AnalysisData, UserRole, CaseDetails, PetitionCategory, PetitionSubcategory, CategoryToSubcategories, SubcategoryToPetitionTypes, CategoryToRoles, LegalSearchResult, ContactInfo, LawyerInfo } from '../../types';
import { analyzeDocuments, generateSearchKeywords, performWebSearch, generatePetition, streamChatResponse, rewriteText, reviewPetition } from '../../services/geminiService';
import { ToastContainer, ToastType } from '../../components/Toast';
import { Header } from '../../components/Header';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { SparklesIcon, ChevronDownIcon } from '../../components/Icon';
import { PetitionView } from '../../components/PetitionView';
import { PetitionPreview } from '../../components/PetitionPreview';
import { ChatView } from '../../components/ChatView';
import { VoiceInputButton } from '../../components/VoiceInputButton';
import { Petition, supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { getLegalDocument } from '../utils/legalSearch';

// Helper function to convert a File object to a base64 string
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
};

const parseFunctionCallArgs = (rawArgs: unknown): Record<string, any> => {
    if (!rawArgs) return {};
    if (typeof rawArgs === 'string') {
        try {
            const parsed = JSON.parse(rawArgs);
            return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : {};
        } catch {
            return {};
        }
    }
    return typeof rawArgs === 'object' ? rawArgs as Record<string, any> : {};
};

const extractGeneratedDocumentPayload = (rawArgs: unknown): { title: string; content: string } | null => {
    const args = parseFunctionCallArgs(rawArgs);
    const content = (
        args.documentContent ??
        args.document_content ??
        args.content ??
        args.petitionContent ??
        args.dilekceMetni ??
        ''
    );
    const title = (
        args.documentTitle ??
        args.document_title ??
        args.title ??
        'Belge'
    );

    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (!normalizedContent) return null;

    return {
        title: typeof title === 'string' && title.trim() ? title.trim() : 'Belge',
        content: normalizedContent,
    };
};

const extractResultsFromText = (text: string): any[] => {
    if (!text || typeof text !== 'string') return [];

    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
    } catch {
        // Text may contain prose around JSON.
    }

    const jsonArrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch) {
        try {
            const parsed = JSON.parse(jsonArrayMatch[0]);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            return [];
        }
    }

    return [];
};

type AlternativeLegalSearchResult = LegalSearchResult & {
    id?: string;
    documentId?: string;
    snippet?: string;
};

const normalizeLegalSearchResults = (payload: any): AlternativeLegalSearchResult[] => {
    const raw: any[] = [];

    if (Array.isArray(payload)) raw.push(...payload);
    if (Array.isArray(payload?.results)) raw.push(...payload.results);
    if (Array.isArray(payload?.results?.content)) raw.push(...payload.results.content);
    if (Array.isArray(payload?.content)) raw.push(...payload.content);
    if (Array.isArray(payload?.result?.content)) raw.push(...payload.result.content);

    if (typeof payload?.results === 'string') raw.push(...extractResultsFromText(payload.results));
    if (typeof payload?.text === 'string') raw.push(...extractResultsFromText(payload.text));

    const possibleContentArrays = [payload?.results?.content, payload?.content, payload?.result?.content].filter(Array.isArray);
    for (const contentArray of possibleContentArrays) {
        for (const item of contentArray as any[]) {
            if (typeof item?.text === 'string') {
                raw.push(...extractResultsFromText(item.text));
            }
        }
    }

    const mapped = raw
        .map((result: any, index: number): AlternativeLegalSearchResult | null => {
            if (!result || typeof result !== 'object') return null;

            const hasCoreFields = [
                result.title,
                result.mahkeme,
                result.court,
                result.daire,
                result.chamber,
                result.esasNo,
                result.esas_no,
                result.kararNo,
                result.karar_no,
                result.ozet,
                result.snippet,
                result.summary,
            ].some(value => typeof value === 'string' && value.trim().length > 0);

            if (!hasCoreFields) return null;

            const mahkeme = result.mahkeme || result.court || '';
            const daire = result.daire || result.chamber || '';
            const title = (result.title || `${mahkeme || 'Yargitay'} ${daire}`.trim() || `Karar ${index + 1}`).trim();
            const relevanceScore = Number(result.relevanceScore);

            return {
                id: result.id || result.documentId || `search-${index}`,
                documentId: result.documentId || result.id || undefined,
                title,
                esasNo: result.esasNo || result.esas_no || '',
                kararNo: result.kararNo || result.karar_no || '',
                tarih: result.tarih || result.date || '',
                daire,
                ozet: result.ozet || result.snippet || result.summary || '',
                snippet: result.snippet || result.ozet || result.summary || '',
                relevanceScore: Number.isFinite(relevanceScore) ? relevanceScore : undefined,
            };
        })
        .filter((result): result is AlternativeLegalSearchResult => Boolean(result && (result.title || result.ozet)));

    const seen = new Set<string>();
    return mapped.filter(result => {
        const key = `${result.title}|${result.esasNo || ''}|${result.kararNo || ''}|${result.tarih || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const mergeUniqueLegalResults = (
    existing: AlternativeLegalSearchResult[],
    incoming: AlternativeLegalSearchResult[]
): AlternativeLegalSearchResult[] => {
    const seen = new Set<string>();
    return [...existing, ...incoming].filter(result => {
        const key = `${result.title || ''}|${result.esasNo || ''}|${result.kararNo || ''}|${result.tarih || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const mergeWebSearchResults = (
    existing: WebSearchResult | null,
    incoming: WebSearchResult | null
): WebSearchResult | null => {
    if (!existing && !incoming) return null;
    if (!existing) return incoming;
    if (!incoming) return existing;

    const summary = [existing.summary, incoming.summary].filter(Boolean).join('\n\n').trim();
    const sourceMap = new Map<string, { uri: string; title: string }>();

    for (const source of [...existing.sources, ...incoming.sources]) {
        if (!source?.uri) continue;
        sourceMap.set(source.uri, { uri: source.uri, title: source.title || source.uri });
    }

    return {
        summary,
        sources: Array.from(sourceMap.values()),
    };
};

const extractKeywordCandidates = (rawValue: string): string[] => {
    if (!rawValue) return [];
    return rawValue
        .split(/[\s,;:.!?()\/\\-]+/g)
        .map(token => token.trim())
        .filter(token => token.length >= 3);
};

const isLikelyPetitionRequest = (rawMessage: string): boolean => {
    if (!rawMessage) return false;
    return /(dilekce|dilekçe|belge|taslak|template|ihtarname|itiraz|temyiz|feragat|talep)/i.test(rawMessage)
        && /(olustur|oluştur|hazirla|hazırla|yaz)/i.test(rawMessage);
};

const buildLegalResultsPrompt = (results: AlternativeLegalSearchResult[]): string => {
    if (results.length === 0) return '';
    return results
        .map(result => `- ${result.title} ${result.esasNo ? `E. ${result.esasNo}` : ''} ${result.kararNo ? `K. ${result.kararNo}` : ''} ${result.tarih ? `T. ${result.tarih}` : ''} ${result.ozet || ''}`.trim())
        .join('\n');
};

interface TemplateTransferDecision {
    title: string;
    esasNo?: string;
    kararNo?: string;
    tarih?: string;
    daire?: string;
    ozet?: string;
    relevanceScore?: number;
}

interface TemplateTransferContext {
    source?: string;
    templateId?: string;
    templateTitle?: string;
    templateCategory?: string;
    templateSubcategory?: string;
    variableValues?: Record<string, string>;
    selectedDecisions?: TemplateTransferDecision[];
    aiRequested?: boolean;
    createdAt?: string;
}

const TEMPLATE_CONTEXT_STORAGE_KEY = 'templateContext';

const parseTemplateTransferContext = (rawValue: string | null): TemplateTransferContext | null => {
    if (!rawValue) return null;
    try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed as TemplateTransferContext;
    } catch {
        return null;
    }
};

const formatTemplateVariableContext = (variableValues?: Record<string, string>): string => {
    if (!variableValues || typeof variableValues !== 'object') return '';
    const lines = Object.entries(variableValues)
        .map(([key, value]) => [key.trim(), String(value || '').trim()] as const)
        .filter(([, value]) => value.length > 0)
        .map(([key, value]) => `- ${key}: ${value}`);

    if (lines.length === 0) return '';
    return `SABLON ALAN DEGERLERI\n${lines.join('\n')}`;
};

const normalizeTemplateDecisions = (decisions?: TemplateTransferDecision[]): AlternativeLegalSearchResult[] => {
    if (!Array.isArray(decisions)) return [];
    return decisions
        .filter(decision => decision && typeof decision === 'object')
        .map((decision, index) => {
            const title = (decision.title || 'Yargitay Karari').trim();
            return {
                id: `template-decision-${index + 1}`,
                title,
                esasNo: decision.esasNo || '',
                kararNo: decision.kararNo || '',
                tarih: decision.tarih || '',
                daire: decision.daire || '',
                ozet: decision.ozet || '',
                relevanceScore: decision.relevanceScore,
            };
        });
};

const STEPS = [
    { id: 1, title: 'Temel Bilgiler', description: 'Tür ve taraf rolü' },
    { id: 2, title: 'Belgeler', description: 'Dosya ve metin yükleme' },
    { id: 3, title: 'Analiz & Araştırma', description: 'Yapay zeka analizi' },
    { id: 4, title: 'Oluştur', description: 'Dilekçe üretme' },
    { id: 5, title: 'Ön İzleme & İndirme', description: 'Son kontrol ve indirme' },
];

const PARTY_FIELDS: Array<{ key: string; label: string; hint: string }> = [
    { key: 'davaci', label: 'Davaci', hint: 'Dava acan taraf' },
    { key: 'davali', label: 'Davali', hint: 'Dava edilen taraf' },
    { key: 'musteki', label: 'Musteki', hint: 'Sikayetci / magdur taraf' },
    { key: 'supheli', label: 'Supheli / Sanik', hint: 'Hakkinda islem yapilan taraf' },
    { key: 'katilan', label: 'Katilan / Mudahil', hint: 'Davaya sonradan katilan taraf' },
    { key: 'diger', label: 'Diger Taraf', hint: 'Ucuncu kisi / kurum' },
];

const DEFAULT_LAWYER_INFO: LawyerInfo = {
    name: '',
    address: '',
    phone: '',
    email: '',
    tcNo: '',
    barNumber: '',
    bar: '',
    title: 'Avukat',
};

const DEFAULT_CONTACT_INFO: ContactInfo = {
    name: '',
    address: '',
    phone: '',
    email: '',
    tcNo: '',
};

// Expandable subcategory section for dropdowns
const SubcategoryDropdown: React.FC<{
    subcategory: PetitionSubcategory;
    isOpen: boolean;
    onToggle: () => void;
    selectedType: PetitionType;
    onSelectType: (type: PetitionType) => void;
}> = ({ subcategory, isOpen, onToggle, selectedType, onSelectType }) => {
    const types = SubcategoryToPetitionTypes[subcategory] || [];

    return (
        <div className="border border-white/10 rounded-xl overflow-hidden mb-3">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-4 bg-[#1A1A1D] hover:bg-[#1C1C1F] transition-colors text-left"
            >
                <span className="text-sm font-medium text-gray-200">{subcategory}</span>
                <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="bg-[#111113] p-2 space-y-1">
                    {types.map(type => (
                        <button
                            key={type}
                            onClick={() => onSelectType(type)}
                            className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all ${selectedType === type
                                ? 'bg-gradient-to-r from-red-600/20 to-red-600/10 text-red-400 font-semibold border border-red-500/50 shadow-lg shadow-red-900/20'
                                : 'text-gray-400 hover:bg-[#1A1A1D] hover:text-white border border-transparent'
                                }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function AlternativeApp() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, profile, loading } = useAuth();
    const petitionFromState = (location.state as { petition?: Petition })?.petition;

    // Visual State
    const [currentStep, setCurrentStep] = useState(1);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // Inputs from user
    const [petitionType, setPetitionType] = useState<PetitionType>(
        petitionFromState?.petition_type as PetitionType || PetitionType.DavaDilekcesi
    );
    const [userRole, setUserRole] = useState<UserRole>(UserRole.Davaci);
    const [caseDetails, setCaseDetails] = useState<CaseDetails>({ court: '', fileNumber: '', decisionNumber: '', decisionDate: '' });
    const [files, setFiles] = useState<File[]>([]);
    const [docContent, setDocContent] = useState('');
    const [specifics, setSpecifics] = useState('');
    const [parties, setParties] = useState<{ [key: string]: string }>({});

    // Cascading dropdown state
    const [selectedCategory, setSelectedCategory] = useState<PetitionCategory>(PetitionCategory.Hukuk);
    const [openSubcategory, setOpenSubcategory] = useState<PetitionSubcategory | null>(null);

    // Get available subcategories and roles based on selected category
    const availableSubcategories = CategoryToSubcategories[selectedCategory] || [];
    const availableRoles = CategoryToRoles[selectedCategory] || Object.values(UserRole);

    // When category changes, reset role to first available
    useEffect(() => {
        if (!availableRoles.includes(userRole)) {
            setUserRole(availableRoles[0]);
        }
    }, [selectedCategory, availableRoles, userRole, setUserRole]);

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
        if (petitionFromState?.metadata?.chatHistory) {
            return petitionFromState.metadata.chatHistory;
        }
        return [];
    });

    const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
    const [searchKeywords, setSearchKeywords] = useState<string[]>([]);
    const [webSearchResult, setWebSearchResult] = useState<WebSearchResult | null>(null);
    const [legalSearchResults, setLegalSearchResults] = useState<AlternativeLegalSearchResult[]>([]);
    const [selectedDecision, setSelectedDecision] = useState<AlternativeLegalSearchResult | null>(null);
    const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
    const [isDecisionContentLoading, setIsDecisionContentLoading] = useState(false);
    const [selectedDecisionContent, setSelectedDecisionContent] = useState('');
    const [manualPartyName, setManualPartyName] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);

    const [generatedPetition, setGeneratedPetition] = useState(petitionFromState?.content || '');
    const [petitionVersion, setPetitionVersion] = useState(0);

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isLegalSearching, setIsLegalSearching] = useState(false);
    const [isLoadingPetition, setIsLoadingPetition] = useState(false);
    const [isReviewingPetition, setIsReviewingPetition] = useState(false);
    const [pendingTemplateAutoEnhancement, setPendingTemplateAutoEnhancement] = useState(false);
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    const [chatProgressText, setChatProgressText] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: ToastType }>>([]);
    const addToast = useCallback((message: string, type: ToastType) => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const mergeLegalResults = useCallback((incoming: AlternativeLegalSearchResult[]) => {
        if (incoming.length === 0) return;

        setLegalSearchResults(prev => {
            const seen = new Set<string>();
            return [...prev, ...incoming].filter(result => {
                const key = `${result.title || ''}|${result.esasNo || ''}|${result.kararNo || ''}|${result.tarih || ''}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        });
    }, []);

    useEffect(() => {
        const templateContent = localStorage.getItem('templateContent');
        if (templateContent) {
            setGeneratedPetition(templateContent);
            setPetitionVersion(v => v + 1);
            setCurrentStep(4);
            localStorage.removeItem('templateContent');
            addToast('Şablon yüklendi! ✅', 'success');
        } else if (petitionFromState) {
            setGeneratedPetition(petitionFromState.content || '');
            setPetitionVersion(v => v + 1);
            setCurrentStep(4);
            const metadata = petitionFromState.metadata;
            if (metadata) {
                if (metadata.caseDetails) setCaseDetails(metadata.caseDetails);
                if (metadata.parties) setParties(metadata.parties);
                if (metadata.searchKeywords) setSearchKeywords(metadata.searchKeywords);
                if (metadata.docContent) setDocContent(metadata.docContent);
                if (metadata.specifics) setSpecifics(metadata.specifics);
                if (metadata.userRole) setUserRole(metadata.userRole);
                if (metadata.analysisData) setAnalysisData(metadata.analysisData);
                if (metadata.webSearchResult) setWebSearchResult(metadata.webSearchResult);
                if (Array.isArray(metadata.legalSearchResults)) setLegalSearchResults(metadata.legalSearchResults);
                if (metadata.chatHistory) setChatMessages(metadata.chatHistory);
            }
            addToast('Dilekçe yüklendi! x', 'success');
        }
    }, [petitionFromState?.id]);

    const runLegalSearch = async (keywordsForSearch: string[]) => {
        if (keywordsForSearch.length === 0) return;

        setIsLegalSearching(true);
        setError(null);

        try {
            const keyword = keywordsForSearch.slice(0, 5).join(' ');
            const body = JSON.stringify({ source: 'yargitay', keyword });

            let response = await fetch('/api/legal/search-decisions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });

            // Backward compatibility for deployments still using action-based route.
            if (!response.ok) {
                response = await fetch('/api/legal?action=search-decisions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                });
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(errorText || 'Ictihat aramasi basarisiz oldu.');
            }

            const payload = await response.json();
            const normalizedResults = normalizeLegalSearchResults(payload);
            mergeLegalResults(normalizedResults);

            if (normalizedResults.length > 0) {
                addToast(`${normalizedResults.length} adet emsal karar bulundu!`, 'success');
            } else {
                addToast('Bu konuda emsal karar bulunamadi.', 'info');
            }
        } catch (e: any) {
            setError(`Ictihat arama hatasi: ${e.message}`);
        } finally {
            setIsLegalSearching(false);
        }
    };

    const handleSelectedFiles = useCallback((rawFiles: FileList | null) => {
        if (!rawFiles) return;

        const selectedFiles = Array.from(rawFiles);
        const allowedExtensions = ['.pdf', '.udf', '.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.doc', '.docx'];
        const validFiles = selectedFiles.filter(file =>
            allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
        );

        if (validFiles.length !== selectedFiles.length) {
            addToast('Sadece PDF, UDF, Word veya resim dosyalari desteklenir.', 'info');
        }

        if (validFiles.length > 10) {
            addToast('En fazla 10 dosya secilebilir. Ilk 10 dosya alindi.', 'info');
        }

        setFiles(validFiles.slice(0, 10));
    }, [addToast]);

    const handleAnalyze = async () => {
        if (files.length === 0) {
            setError('Lütfen önce analiz edilecek PDF, UDF veya resim dosyalarını yükleyin.');
            return;
        }
        setIsAnalyzing(true);
        setError(null);
        setAnalysisData(null);
        setParties({});
        setManualPartyName('');
        setSearchKeywords([]);
        setWebSearchResult(null);
        setLegalSearchResults([]);
        setGeneratedPetition('');

        try {
            const allUploadedFiles: UploadedFile[] = [];
            let udfContent = '';
            let wordContent = '';
            const zip = new JSZip();

            for (const file of files) {
                const extension = file.name.split('.').pop()?.toLowerCase();
                if (extension === 'pdf') {
                    allUploadedFiles.push({ mimeType: 'application/pdf', data: await fileToBase64(file) });
                } else if (extension === 'tif' || extension === 'tiff') {
                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        const ifds = UTIF.decode(arrayBuffer);
                        const firstPage = ifds[0];

                        if (!firstPage) {
                            throw new Error('TIFF icinde sayfa bulunamadi.');
                        }

                        UTIF.decodeImage(arrayBuffer, firstPage);
                        const rgba = UTIF.toRGBA8(firstPage);
                        const canvas = document.createElement('canvas');
                        canvas.width = firstPage.width;
                        canvas.height = firstPage.height;
                        const ctx = canvas.getContext('2d');

                        if (!ctx) {
                            throw new Error('Canvas context olusturulamadi.');
                        }

                        const imageData = ctx.createImageData(firstPage.width, firstPage.height);
                        imageData.data.set(rgba);
                        ctx.putImageData(imageData, 0, 0);

                        const dataUrl = canvas.toDataURL('image/png');
                        const base64Data = dataUrl.split(',')[1];

                        allUploadedFiles.push({
                            mimeType: 'image/png',
                            data: base64Data,
                        });
                    } catch (tiffError) {
                        console.error(`Error processing TIFF file ${file.name}:`, tiffError);
                        setError(`TIFF dosyasi islenirken hata: ${file.name}`);
                    }
                } else if (file.type.startsWith('image/')) {
                    allUploadedFiles.push({ mimeType: file.type, data: await fileToBase64(file) });
                } else if (extension === 'udf') {
                    try {
                        const loadedZip = await zip.loadAsync(file);
                        let xmlContent = '';
                        let xmlFile = null;
                        for (const fileName in loadedZip.files) {
                            if (Object.prototype.hasOwnProperty.call(loadedZip.files, fileName)) {
                                const fileObject = loadedZip.files[fileName];
                                if (!fileObject.dir && fileObject.name.toLowerCase().endsWith('.xml')) {
                                    xmlFile = fileObject;
                                    break;
                                }
                            }
                        }

                        if (xmlFile) {
                            xmlContent = await xmlFile.async('string');
                        } else {
                            xmlContent = 'UDF arsivinde .xml uzantili icerik dosyasi bulunamadi.';
                        }
                        udfContent += `\n\n--- UDF Belgesi: ${file.name} ---\n${xmlContent}`;
                    } catch (e) {
                        udfContent += `\n\n--- UDF Belgesi: ${file.name} (HATA) ---\nKabul edilemedi.`;
                    }
                } else if (extension === 'doc' || extension === 'docx') {
                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        const result = await mammoth.extractRawText({ arrayBuffer });
                        wordContent += `\n\n--- Word Belgesi: ${file.name} ---\n${result.value}`;
                    } catch (wordError) {
                        console.error(`Error processing Word file ${file.name}:`, wordError);
                        wordContent += `\n\n--- Word Belgesi: ${file.name} (HATA) ---\nBu Word belgesi islenemedi.`;
                    }
                }
            }

            const result = await analyzeDocuments(allUploadedFiles, udfContent.trim(), wordContent.trim());
            setAnalysisData(result);
            if (result.caseDetails) {
                setCaseDetails(prev => ({ ...prev, ...result.caseDetails }));
            }
            const detectedParties = Array.isArray(result.potentialParties)
                ? result.potentialParties
                    .map(name => name.trim())
                    .filter(Boolean)
                : [];
            if (detectedParties.length > 0) {
                setParties(prev => {
                    const next = { ...prev };
                    const assigned = new Set<string>(
                        Object.values(next)
                            .map(value => value.trim().toLowerCase())
                            .filter(Boolean)
                    );
                    let candidateIndex = 0;
                    for (const field of PARTY_FIELDS) {
                        if (next[field.key]?.trim()) continue;
                        while (candidateIndex < detectedParties.length) {
                            const candidate = detectedParties[candidateIndex++];
                            const normalized = candidate.toLowerCase();
                            if (assigned.has(normalized)) continue;
                            next[field.key] = candidate;
                            assigned.add(normalized);
                            break;
                        }
                    }
                    return next;
                });
            }
            setManualPartyName('');
            addToast('Belgeler başarıyla analiz edildi!', 'success');
            setCurrentStep(3);
        } catch (e: any) {
            setError(`Analiz hatası: ${e.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleGenerateKeywords = async () => {
        if (!analysisData?.summary) return;
        setIsGeneratingKeywords(true);
        setError(null);
        try {
            const keywords = await generateSearchKeywords(analysisData.summary, userRole);
            setSearchKeywords(keywords);
            await runLegalSearch(keywords);
            addToast('Anahtar kelimeler oluşturuldu!', 'success');
        } catch (e: any) {
            setError(`Hata: ${e.message}`);
        } finally {
            setIsGeneratingKeywords(false);
        }
    };

    const handleSearch = async () => {
        if (searchKeywords.length === 0) {
            setError('Lutfen once arama anahtar kelimelerini olusturun.');
            return;
        }
        setIsSearching(true);
        setError(null);
        try {
            const result = await performWebSearch(searchKeywords);
            setWebSearchResult(result);
            addToast('Web araması tamamlandı!', 'success');
        } catch (e: any) {
            setError(`Hata: ${e.message}`);
        } finally {
            setIsSearching(false);
        }
    };

    const handleLegalSearch = async () => {
        if (searchKeywords.length === 0) {
            setError('Lutfen once arama anahtar kelimelerini olusturun.');
            return;
        }

        await runLegalSearch(searchKeywords);
    };

    const openDecisionModal = async (result: AlternativeLegalSearchResult, index: number) => {
        setSelectedDecision(result);
        setIsDecisionModalOpen(true);
        setIsDecisionContentLoading(true);

        try {
            const content = await getLegalDocument({
                source: 'yargitay',
                documentId: result.documentId || result.id || `${result.title || 'karar'}-${index}`,
                title: result.title,
                esasNo: result.esasNo,
                kararNo: result.kararNo,
                tarih: result.tarih,
                daire: result.daire,
                ozet: result.ozet,
                snippet: result.snippet,
            });
            setSelectedDecisionContent(content || result.ozet || result.snippet || 'Tam metin getirilemedi.');
        } catch {
            setSelectedDecisionContent(result.ozet || result.snippet || 'Tam metin getirilemedi.');
        } finally {
            setIsDecisionContentLoading(false);
        }
    };

    const handleCaseDetailChange = useCallback((field: keyof CaseDetails, value: string) => {
        setCaseDetails(prev => ({ ...prev, [field]: value }));
    }, []);

    const isPartyAssigned = useCallback((partyName: string) => {
        const normalized = partyName.trim().toLowerCase();
        if (!normalized) return false;
        return Object.values(parties).some(value => value.trim().toLowerCase() === normalized);
    }, [parties]);

    const assignPartyToFirstEmptySlot = useCallback((partyName: string) => {
        const normalized = partyName.trim();
        if (!normalized) return;

        setParties(prev => {
            const next = { ...prev };
            const alreadyAssigned = Object.values(next).some(value => value.trim().toLowerCase() === normalized.toLowerCase());
            if (alreadyAssigned) return next;

            const firstEmptyField = PARTY_FIELDS.find(field => !next[field.key]?.trim());
            if (firstEmptyField) {
                next[firstEmptyField.key] = normalized;
                return next;
            }

            next.diger = normalized;
            return next;
        });
    }, []);

    const addManualParty = useCallback(() => {
        const normalized = manualPartyName.trim();
        if (!normalized) return;

        if (!analysisData) {
            setError('Taraf eklemek icin once belge analizi yapin.');
            return;
        }

        const existingParties = Array.isArray(analysisData.potentialParties) ? analysisData.potentialParties : [];
        const exists = existingParties.some(name => name.trim().toLowerCase() === normalized.toLowerCase());
        if (exists) {
            addToast('Bu taraf zaten listede mevcut.', 'info');
            setManualPartyName('');
            return;
        }

        setAnalysisData(prev => {
            if (!prev) return prev;
            const currentPotentialParties = Array.isArray(prev.potentialParties) ? prev.potentialParties : [];
            return {
                ...prev,
                potentialParties: [...currentPotentialParties, normalized],
            };
        });
        assignPartyToFirstEmptySlot(normalized);
        setManualPartyName('');
        addToast('Harici taraf eklendi.', 'success');
    }, [manualPartyName, analysisData, addToast, assignPartyToFirstEmptySlot]);

    const updateLawyerInfoField = useCallback((field: keyof LawyerInfo, value: string) => {
        setAnalysisData(prev => {
            if (!prev) return prev;
            const current = prev.lawyerInfo ? { ...prev.lawyerInfo } : { ...DEFAULT_LAWYER_INFO };
            return {
                ...prev,
                lawyerInfo: {
                    ...current,
                    [field]: value,
                },
            };
        });
    }, []);

    const clearLawyerInfo = useCallback(() => {
        setAnalysisData(prev => {
            if (!prev) return prev;
            return { ...prev, lawyerInfo: undefined };
        });
    }, []);

    const updateContactInfoField = useCallback((index: number, field: keyof ContactInfo, value: string) => {
        setAnalysisData(prev => {
            if (!prev) return prev;
            const currentContacts = [...(prev.contactInfo || [])];
            currentContacts[index] = {
                ...DEFAULT_CONTACT_INFO,
                ...currentContacts[index],
                [field]: value,
            };
            return {
                ...prev,
                contactInfo: currentContacts,
            };
        });
    }, []);

    const addContactInfoRow = useCallback(() => {
        setAnalysisData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                contactInfo: [...(prev.contactInfo || []), { ...DEFAULT_CONTACT_INFO }],
            };
        });
    }, []);

    const removeContactInfoRow = useCallback((index: number) => {
        setAnalysisData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                contactInfo: (prev.contactInfo || []).filter((_, currentIndex) => currentIndex !== index),
            };
        });
    }, []);

    const savePetitionToSupabase = useCallback(async (
        content: string,
        titleOverride?: string,
        metadataOverrides?: Partial<{
            chatHistory: ChatMessage[];
            searchKeywords: string[];
            docContent: string;
            specifics: string;
            webSearchResult: WebSearchResult | null;
            legalSearchResults: AlternativeLegalSearchResult[];
        }>
    ) => {
        if (!user) return;

        try {
            const { error: insertError } = await supabase.from('petitions').insert([
                {
                    user_id: user.id,
                    title: titleOverride || `${petitionType} - ${new Date().toLocaleDateString('tr-TR')}`,
                    petition_type: petitionType,
                    content,
                    status: 'completed',
                    metadata: {
                        chatHistory: metadataOverrides?.chatHistory ?? chatMessages,
                        caseDetails,
                        parties,
                        searchKeywords: metadataOverrides?.searchKeywords ?? searchKeywords,
                        docContent: metadataOverrides?.docContent ?? docContent,
                        specifics: metadataOverrides?.specifics ?? specifics,
                        userRole,
                        analysisData,
                        webSearchResult: metadataOverrides?.webSearchResult ?? webSearchResult,
                        legalSearchResults: metadataOverrides?.legalSearchResults ?? legalSearchResults,
                        lawyerInfo: analysisData?.lawyerInfo,
                        contactInfo: analysisData?.contactInfo,
                    },
                },
            ]);

            if (insertError) throw insertError;
            addToast('Dilekce profile kaydedildi.', 'success');
        } catch (saveError: any) {
            console.error('Error saving petition in AlternativeApp:', saveError);
            addToast('Dilekce profile kaydedilemedi.', 'error');
        }
    }, [
        user,
        petitionType,
        chatMessages,
        caseDetails,
        parties,
        searchKeywords,
        docContent,
        specifics,
        userRole,
        analysisData,
        webSearchResult,
        legalSearchResults,
        addToast,
    ]);

    const handleRewriteText = useCallback(async (text: string): Promise<string> => {
        setError(null);
        try {
            return await rewriteText(text);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata olustu.';
            setError(`Metin gelistirilirken bir hata olustu: ${errorMessage}`);
            throw e;
        }
    }, []);

    const handleReviewPetition = useCallback(async () => {
        if (!generatedPetition) {
            setError('Iyilestirilecek bir dilekce taslagi bulunmuyor.');
            return;
        }
        if (!analysisData?.summary) {
            setError('Dilekce baglami (analiz ozeti) olmadan iyilestirme yapilamaz.');
            return;
        }

        setIsReviewingPetition(true);
        setError(null);

        try {
            const result = await reviewPetition({
                currentPetition: generatedPetition,
                userRole,
                petitionType,
                caseDetails,
                analysisSummary: analysisData.summary,
                webSearchResult: webSearchResult?.summary || '',
                docContent,
                specifics,
                chatHistory: chatMessages,
                parties,
                lawyerInfo: analysisData.lawyerInfo,
                contactInfo: analysisData.contactInfo,
            });
            setGeneratedPetition(result);
            setPetitionVersion(v => v + 1);
            addToast('Dilekce gozden gecirildi ve iyilestirildi!', 'success');
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata olustu.';
            setError(`Dilekce gozden gecirilirken bir hata olustu: ${errorMessage}`);
        } finally {
            setIsReviewingPetition(false);
        }
    }, [generatedPetition, userRole, petitionType, caseDetails, analysisData, webSearchResult, docContent, specifics, chatMessages, parties, addToast]);

    const handleSendToEditor = useCallback(() => {
        if (!generatedPetition || !generatedPetition.trim()) {
            setError('Editor sayfasina gondermek icin once dilekce olusturun.');
            return;
        }

        localStorage.setItem('templateContent', generatedPetition);
        localStorage.setItem('editorReturnRoute', '/alt-app');
        addToast('Taslak editor sayfasina gonderildi.', 'success');
        navigate('/app');
    }, [generatedPetition, addToast, navigate]);

    const handleSendChatMessage = useCallback(async (message: string, files?: File[]) => {
        const normalizedMessage = (message || '').trim();
        let chatFiles: { name: string; mimeType: string; data: string }[] = [];
        if (files && files.length > 0) {
            chatFiles = await Promise.all(
                files.map(async (file) => ({
                    name: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    data: await fileToBase64(file),
                }))
            );
        }

        const userMessage: ChatMessage = {
            role: 'user',
            text: normalizedMessage || (chatFiles.length > 0 ? `[Dosya] ${chatFiles.length} dosya yuklendi` : ''),
            files: chatFiles.length > 0 ? chatFiles : undefined,
        };
        const newMessages: ChatMessage[] = [...chatMessages, userMessage];
        setChatMessages(newMessages);
        setIsLoadingChat(true);
        setError(null);
        setChatProgressText(chatFiles.length > 0 ? 'Yuklenen dosyalar analiz ediliyor...' : 'Dusunuyorum...');

        let mergedKeywords = [...searchKeywords];
        let mergedWebSearchResult: WebSearchResult | null = webSearchResult;
        let mergedLegalResults = [...legalSearchResults];
        let mergedDocContent = docContent;
        let assistantText = '';
        const userRequestedPetition = isLikelyPetitionRequest(normalizedMessage);

        try {
            const responseStream = streamChatResponse(
                newMessages,
                analysisData?.summary || '',
                {
                    keywords: mergedKeywords.join(', '),
                    searchSummary: mergedWebSearchResult?.summary || '',
                    docContent: mergedDocContent,
                    specifics,
                },
                chatFiles
            );
            const modelMessage: ChatMessage = { role: 'model', text: '' };
            setChatMessages(prev => [...prev, modelMessage]);

            let functionCallDetected = false;
            let addedKeywordsCount = 0;
            let generatedDocument = false;
            let pendingGeneratedPayload: { title: string; content: string } | null = null;

            for await (const chunk of responseStream) {
                if (chunk.functionCallResults && chunk.searchResults) {
                    setChatProgressText('Emsal kararlar baglama ekleniyor...');
                    const newResults = normalizeLegalSearchResults(chunk.searchResults);
                    if (newResults.length > 0) {
                        mergedLegalResults = mergeUniqueLegalResults(mergedLegalResults, newResults);
                        mergeLegalResults(newResults);
                        addToast(`${newResults.length} adet emsal karar bulundu!`, 'success');

                        const formattedSummary = newResults
                            .slice(0, 5)
                            .map(result => {
                                const meta = [
                                    result.esasNo ? `E. ${result.esasNo}` : '',
                                    result.kararNo ? `K. ${result.kararNo}` : '',
                                    result.tarih ? `T. ${result.tarih}` : '',
                                ].filter(Boolean).join(' ');
                                return `${result.title}${meta ? ` (${meta})` : ''}`;
                            })
                            .join('\n');

                        const streamSummary = typeof chunk.text === 'string' ? chunk.text.trim() : '';
                        const nextSearchResult: WebSearchResult = {
                            summary: streamSummary || formattedSummary,
                            sources: [],
                        };
                        mergedWebSearchResult = mergeWebSearchResults(mergedWebSearchResult, nextSearchResult);
                        if (mergedWebSearchResult) {
                            setWebSearchResult(mergedWebSearchResult);
                        }
                    }
                }

                const getText = (c: any): string => {
                    if (typeof c.text === 'string') return c.text;
                    if (c.candidates?.[0]?.content?.parts) {
                        return c.candidates[0].content.parts
                            .filter((p: any) => p.text)
                            .map((p: any) => p.text)
                            .join('');
                    }
                    return '';
                };

                const chunkText = getText(chunk);
                if (chunkText) {
                    assistantText += chunkText;
                    setChatMessages(prev => prev.map((msg, index) =>
                        index === prev.length - 1 ? { ...msg, text: msg.text + chunkText } : msg
                    ));
                }

                const getFunctionCalls = (c: any): any[] => {
                    if (Array.isArray(c.functionCalls)) return c.functionCalls;
                    if (c.candidates?.[0]?.content?.parts) {
                        return c.candidates[0].content.parts
                            .filter((p: any) => p.functionCall)
                            .map((p: any) => p.functionCall);
                    }
                    return [];
                };

                const functionCalls = getFunctionCalls(chunk);
                if (functionCalls.length === 0) continue;

                for (const fc of functionCalls) {
                    if (fc.name === 'update_search_keywords') {
                        functionCallDetected = true;
                        setChatProgressText('Anahtar kelimeler baglama ekleniyor...');

                        const args = parseFunctionCallArgs(fc.args);
                        const rawKeywords = Array.isArray(args.keywordsToAdd) ? args.keywordsToAdd : [];
                        const cleanedKeywords = rawKeywords
                            .map(keyword => typeof keyword === 'string' ? keyword.trim() : '')
                            .filter(Boolean);

                        if (cleanedKeywords.length > 0) {
                            const nextKeywords = Array.from(new Set([...mergedKeywords, ...cleanedKeywords]));
                            addedKeywordsCount += nextKeywords.length - mergedKeywords.length;
                            mergedKeywords = nextKeywords;
                            setSearchKeywords(nextKeywords);
                        }
                    }

                    if (fc.name === 'search_yargitay') {
                        functionCallDetected = true;
                        setChatProgressText('Emsal kararlar aran�yor...');

                        const args = parseFunctionCallArgs(fc.args);
                        const queryKeywords = typeof args.searchQuery === 'string'
                            ? extractKeywordCandidates(args.searchQuery)
                            : [];
                        const explicitKeywords = Array.isArray(args.keywords)
                            ? args.keywords
                                .map((keyword: unknown) => typeof keyword === 'string' ? keyword.trim() : '')
                                .filter(Boolean)
                            : [];
                        const mergedFromCall = Array.from(new Set([...queryKeywords, ...explicitKeywords]));

                        if (mergedFromCall.length > 0) {
                            mergedKeywords = Array.from(new Set([...mergedKeywords, ...mergedFromCall]));
                            setSearchKeywords(mergedKeywords);
                        }
                    }

                    if (fc.name === 'generate_document') {
                        setChatProgressText('Dilekce olusturuluyor...');
                        const payload = extractGeneratedDocumentPayload(fc.args);
                        if (!payload || generatedDocument) {
                            continue;
                        }

                        generatedDocument = true;
                        pendingGeneratedPayload = payload;
                        setGeneratedPetition(payload.content);
                        setPetitionVersion(v => v + 1);
                        setCurrentStep(4);

                        const generationNote = `\n\n${payload.title} olusturuldu.\n\nBelge "Olusturulan Dilekce" bolumune eklendi.`;
                        assistantText += generationNote;
                        setChatMessages(prev => prev.map((msg, index) =>
                            index === prev.length - 1
                                ? { ...msg, text: msg.text + generationNote }
                                : msg
                        ));

                        addToast(`${payload.title} olusturuldu.`, 'success');
                    }
                }
            }

            if (chatFiles.length > 0 && assistantText.trim()) {
                setChatProgressText('Dosya analizi baglama kaydediliyor...');
                const fileNames = chatFiles.map(file => file.name).join(', ');
                const analysisSnippet = assistantText.trim().slice(0, 1600);
                const contextEntry = [
                    'Sohbet dosya analizi:',
                    `Dosyalar: ${fileNames}`,
                    analysisSnippet,
                ].join('\n');

                mergedDocContent = [mergedDocContent, contextEntry].filter(Boolean).join('\n\n').trim();
                setDocContent(mergedDocContent);
                addToast('Dosya analizi dilekce baglamina eklendi.', 'success');
            }

            if (addedKeywordsCount > 0 && mergedKeywords.length > 0 && (!mergedWebSearchResult?.summary || mergedWebSearchResult.summary.trim().length === 0)) {
                setChatProgressText('Web arastirmasi yapiliyor...');
                try {
                    const autoWebSearchResult = await performWebSearch(mergedKeywords);
                    mergedWebSearchResult = mergeWebSearchResults(mergedWebSearchResult, autoWebSearchResult);
                    if (mergedWebSearchResult) {
                        setWebSearchResult(mergedWebSearchResult);
                    }
                    addToast('Web arastirmasi tamamlandi ve baglama eklendi.', 'success');
                } catch (searchError) {
                    console.error('Auto web search after keyword update failed:', searchError);
                }
            }

            if (functionCallDetected && addedKeywordsCount > 0 && !generatedDocument && assistantText.trim() === '') {
                const confirmation = `Tamam, ${addedKeywordsCount} adet anahtar kelime baglama eklendi.`;
                assistantText += confirmation;
                setChatMessages(prev => prev.map((msg, index) =>
                    index === prev.length - 1 ? { ...msg, text: confirmation } : msg
                ));
            }

            if (userRequestedPetition && !generatedDocument) {
                setChatProgressText('Dilekce olusturma adimi tamamlan�yor...');
                let fallbackPetition = '';

                if (analysisData?.summary?.trim()) {
                    try {
                        fallbackPetition = await generatePetition({
                            userRole,
                            petitionType,
                            caseDetails,
                            analysisSummary: analysisData.summary,
                            webSearchResult: mergedWebSearchResult?.summary || '',
                            legalSearchResult: buildLegalResultsPrompt(mergedLegalResults),
                            docContent: mergedDocContent,
                            specifics,
                            chatHistory: [...newMessages, { role: 'model', text: assistantText }],
                            parties,
                            lawyerInfo: analysisData.lawyerInfo,
                            contactInfo: analysisData.contactInfo,
                        });
                    } catch (fallbackError) {
                        console.error('Fallback petition generation failed:', fallbackError);
                    }
                }

                if (!fallbackPetition && assistantText.trim().length > 180) {
                    fallbackPetition = assistantText.trim();
                }

                if (fallbackPetition) {
                    setGeneratedPetition(fallbackPetition);
                    setPetitionVersion(v => v + 1);
                    setCurrentStep(4);
                    addToast('Dilekce olusturuldu ve taslak alana eklendi.', 'success');

                    if (user) {
                        await savePetitionToSupabase(fallbackPetition, 'Sohbetten Uretilen Dilekce', {
                            chatHistory: [...newMessages, { role: 'model', text: assistantText }],
                            searchKeywords: mergedKeywords,
                            docContent: mergedDocContent,
                            specifics,
                            webSearchResult: mergedWebSearchResult,
                            legalSearchResults: mergedLegalResults,
                        });
                    }
                }
            }

            if (pendingGeneratedPayload && user) {
                await savePetitionToSupabase(pendingGeneratedPayload.content, pendingGeneratedPayload.title, {
                    chatHistory: [...newMessages, { role: 'model', text: assistantText }],
                    searchKeywords: mergedKeywords,
                    docContent: mergedDocContent,
                    specifics,
                    webSearchResult: mergedWebSearchResult,
                    legalSearchResults: mergedLegalResults,
                });
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata olustu.';
            setError(`Sohbet sirasinda bir hata olustu: ${errorMessage}`);
            setChatMessages(prev => prev.slice(0, -1));
        } finally {
            setIsLoadingChat(false);
            setChatProgressText('');
        }
    }, [
        chatMessages,
        analysisData,
        searchKeywords,
        webSearchResult,
        legalSearchResults,
        docContent,
        specifics,
        mergeLegalResults,
        addToast,
        user,
        savePetitionToSupabase,
        userRole,
        petitionType,
        caseDetails,
        parties,
    ]);

    const handleGeneratePetition = async () => {
        if (!analysisData?.summary) {
            setError('Önce analiz aşaması tamamlanmalıdır.');
            return;
        }
        setIsLoadingPetition(true);
        setError(null);
        try {
            const legalResultsText = buildLegalResultsPrompt(legalSearchResults);

            const result = await generatePetition({
                userRole, petitionType, caseDetails,
                analysisSummary: analysisData.summary,
                webSearchResult: webSearchResult?.summary || '',
                legalSearchResult: legalResultsText,
                docContent, specifics, chatHistory: chatMessages, parties,
                lawyerInfo: analysisData.lawyerInfo, contactInfo: analysisData.contactInfo,
            });
            setGeneratedPetition(result);
            setPetitionVersion(v => v + 1);
            setCurrentStep(4);
            addToast('Dilekçe başarıyla oluşturuldu! ✅', 'success');

            if (user) {
                await savePetitionToSupabase(result);
            }
        } catch (e: any) {
            setError(`Dilekçe üretim hatası: ${e.message}`);
        } finally {
            setIsLoadingPetition(false);
        }
    };

    const lawyerInfo = analysisData?.lawyerInfo || DEFAULT_LAWYER_INFO;
    const contactInfoList = analysisData?.contactInfo || [];
    const detectedPartyCandidates = Array.isArray(analysisData?.potentialParties) ? analysisData.potentialParties : [];

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0A0B] text-gray-200 flex flex-col font-sans">
                <Header onShowLanding={() => navigate('/')} />
                <div className="flex-grow flex items-center justify-center">
                    <LoadingSpinner className="w-10 h-10 text-red-500" />
                </div>
            </div>
        );
    }

    if (!user && !petitionFromState) {
        return (
            <div className="min-h-screen bg-[#0A0A0B] text-gray-200 flex flex-col font-sans">
                <Header onShowLanding={() => navigate('/')} />
                <div className="flex-grow flex items-center justify-center p-8">
                    <div className="max-w-md w-full bg-[#111113] rounded-2xl border border-white/10 p-8 text-center shadow-2xl">
                        <h2 className="text-2xl font-bold text-white mb-4">Giriş Gerekli</h2>
                        <p className="text-gray-400 mb-8">Dilekçe oluşturmak için hesabınıza giriş yapmalısınız.</p>
                        <button onClick={() => navigate('/login')} className="w-full px-6 py-3 bg-white hover:bg-gray-200 text-black rounded-xl transition-all font-bold shadow-lg shadow-white/10">
                            Giriş Yap
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0A0A0B] text-gray-200 font-sans selection:bg-blue-500/30 flex flex-col overflow-hidden">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <Header onShowLanding={() => navigate('/')} />

            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar / Stepper */}
                <aside className="w-80 bg-[#111113] border-r border-white/5 flex flex-col overflow-y-auto shrink-0">
                    <div className="p-6">
                        <h2 className="text-xl font-bold text-white mb-8 tracking-tight">Oluşturma Sihirbazı</h2>
                        <div className="space-y-6">
                            {STEPS.map((step, index) => {
                                const isActive = currentStep === step.id;
                                const isCompleted = currentStep > step.id;
                                return (
                                    <div
                                        key={step.id}
                                        className={`relative flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all duration-200 ${isActive ? 'bg-[#1C1C1F] border border-red-500/30 shadow-lg shadow-red-900/10' : 'hover:bg-[#1C1C1F]/50 border border-transparent'
                                            }`}
                                        onClick={() => setCurrentStep(step.id)}
                                    >
                                        {/* Connecting line */}
                                        {index < STEPS.length - 1 && (
                                            <div className="absolute left-[2.25rem] top-14 bottom-[-1.5rem] w-[2px] bg-white/5" />
                                        )}

                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold z-10 transition-colors ${isActive ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' :
                                            isCompleted ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-gray-500'
                                            }`}>
                                            {isCompleted ? <SparklesIcon className="w-5 h-5" /> : step.id}
                                        </div>

                                        <div>
                                            <h3 className={`font-semibold text-base mb-1 ${isActive ? 'text-white' : 'text-gray-400'}`}>
                                                {step.title}
                                            </h3>
                                            <p className="text-xs text-gray-500">{step.description}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </aside>

                {/* Main Content Area */}
                <main className="flex-1 overflow-y-auto bg-[#0A0A0B] relative">
                    <div className="max-w-4xl mx-auto p-8 lg:p-12 pb-32">

                        {/* Main Stage based on Current Step */}
                        <div className="animate-fade-in">
                            {currentStep === 1 && (
                                <div className="space-y-8 animate-fade-in">
                                    <div className="mb-10">
                                        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Temel Bilgileri Belirleyin</h1>
                                        <p className="text-gray-400">Dilekçenizin kategorisini ve sizin davanızdaki rolünüzü seçerek başlayın.</p>
                                    </div>

                                    {/* Category Selection */}
                                    <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 sm:p-8 shadow-sm">
                                        <label className="block text-sm font-medium text-gray-400 uppercase tracking-wider mb-6">Ana Yargılama Türü</label>
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                            {Object.values(PetitionCategory).map(cat => (
                                                <button
                                                    key={cat}
                                                    onClick={() => {
                                                        setSelectedCategory(cat);
                                                        setOpenSubcategory(null);
                                                    }}
                                                    className={`p-4 rounded-xl text-sm font-medium transition-all border ${selectedCategory === cat
                                                        ? 'bg-gradient-to-r from-red-600/20 to-red-600/10 text-red-400 border-red-500/50 shadow-lg shadow-red-900/20'
                                                        : 'bg-[#1A1A1D] text-gray-400 border-white/5 hover:bg-[#1C1C1F] hover:text-gray-200 hover:border-red-500/30'
                                                        }`}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Subcategory Accordions */}
                                    <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 sm:p-8 shadow-sm">
                                        <label className="block text-sm font-medium text-gray-400 uppercase tracking-wider mb-6 flex items-center justify-between">
                                            <span>Alt Kategori ve Dilekçe Türü</span>
                                            {petitionType && <span className="text-xs font-semibold text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">Seçili: {petitionType}</span>}
                                        </label>
                                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                            {availableSubcategories.map(subcat => (
                                                <SubcategoryDropdown
                                                    key={subcat}
                                                    subcategory={subcat}
                                                    isOpen={openSubcategory === subcat}
                                                    onToggle={() => setOpenSubcategory(openSubcategory === subcat ? null : subcat)}
                                                    selectedType={petitionType}
                                                    onSelectType={setPetitionType}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 sm:p-8 shadow-sm">
                                        <label className="block text-sm font-medium text-gray-400 uppercase tracking-wider mb-6">Rolünüz</label>
                                        <div className="relative">
                                            <select
                                                value={userRole}
                                                onChange={(e) => setUserRole(e.target.value as UserRole)}
                                                className="w-full bg-[#1A1A1D] border border-white/10 hover:border-white/20 rounded-xl px-5 py-4 text-white font-medium focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-all appearance-none cursor-pointer"
                                            >
                                                {availableRoles.map(role => (
                                                    <option key={role} value={role} className="bg-[#1A1A1D] text-white">{role}</option>
                                                ))}
                                            </select>
                                            <div className="absolute inset-y-0 right-0 flex items-center px-5 pointer-events-none text-gray-400">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <button onClick={() => setCurrentStep(2)} className="px-8 py-3.5 bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 border border-transparent rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-red-900/50">
                                            Sonraki Adım
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {currentStep === 2 && (
                                <div className="space-y-8">
                                    <div className="mb-10">
                                        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Belgeleri Yükleyin</h1>
                                        <p className="text-gray-400">Davanızla ilgili PDF, resim veya metin belgelerini ekleyin. AI bunları analiz edecektir.</p>
                                    </div>

                                    <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden group">
                                        <input
                                            type="file"
                                            multiple
                                            onChange={(e) => handleSelectedFiles(e.target.files)}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="w-16 h-16 bg-[#1A1A1D] rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                        </div>
                                        <span className="text-lg font-medium text-white mb-2">Dosyaları Sürükleyin veya Seçin</span>
                                        <span className="text-sm text-gray-500">PDF, PNG, JPG, UDF (Maks 10 dosya)</span>

                                        {files.length > 0 && (
                                            <div className="absolute inset-x-0 bottom-0 bg-[#1C1C1F] p-4 text-sm text-red-400 text-center font-medium border-t border-white/5">
                                                {files.length} dosya seçildi
                                            </div>
                                        )}
                                    </div>

                                    {/* Seçilen dosyalar listesi */}
                                    {files.length > 0 && (
                                        <div className="bg-[#111113] border border-white/5 rounded-xl p-4 mt-4">
                                            <h4 className="text-sm font-medium text-gray-400 mb-3 px-2">Yüklenen Dosyalar</h4>
                                            <ul className="space-y-2">
                                                {files.map((file, idx) => {
                                                    const isPdf = file.name.toLowerCase().endsWith('.pdf');
                                                    const isImg = file.type.startsWith('image/');
                                                    const isUdf = file.name.toLowerCase().endsWith('.udf');

                                                    return (
                                                        <li key={idx} className="flex items-center justify-between p-3 bg-[#1A1A1D] rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                                            <div className="flex items-center gap-3 overflow-hidden">
                                                                <div className="shrink-0 w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                                                                    {isPdf ? <span className="text-xl">📕</span> :
                                                                        isImg ? <span className="text-xl">🖼️</span> :
                                                                            isUdf ? <span className="text-xl">📄</span> :
                                                                                <span className="text-xl">📁</span>}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-medium text-gray-200 truncate">{file.name}</p>
                                                                    <p className="text-xs text-gray-500 uppercase">{file.name.split('.').pop()}</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                                                                className="shrink-0 p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                                title="Dosyayı kaldır"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    )}

                                    <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 sm:p-8 shadow-sm">
                                        <div className="mb-4 flex items-center justify-between gap-3">
                                            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Ek Metin / Notlar</h3>
                                            <VoiceInputButton
                                                onTranscript={(text) => setDocContent(prev => (prev.trim() ? `${prev}\n${text}` : text))}
                                                className="bg-[#1A1A1D] border-white/10 hover:bg-[#232327]"
                                            />
                                        </div>
                                        <textarea
                                            value={docContent}
                                            onChange={(e) => setDocContent(e.target.value)}
                                            placeholder="Dosya yüklemek yerine veya dosyalara ek olarak buraya metin yapıştırabilirsiniz..."
                                            className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all min-h-[150px] resize-y"
                                        />
                                    </div>

                                    <div className="flex justify-between">
                                        <button onClick={() => setCurrentStep(1)} className="px-6 py-3 bg-[#1A1A1D] border border-white/10 hover:bg-[#2A2A2D] text-gray-300 hover:text-white rounded-xl transition-all shadow-sm flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                            Geri
                                        </button>
                                        <button
                                            onClick={handleAnalyze}
                                            disabled={isAnalyzing || (files.length === 0 && !docContent)}
                                            className="px-8 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:opacity-50 text-white rounded-xl font-medium transition-all shadow-lg shadow-red-900/50 flex items-center gap-2"
                                        >
                                            {isAnalyzing ? <LoadingSpinner className="w-5 h-5 text-white" /> : 'Analiz Et'}
                                            {isAnalyzing ? 'Analiz Ediliyor...' : '✨'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {currentStep === 3 && (
                                <div className="space-y-8">
                                    <div className="mb-10">
                                        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Yapay Zeka Analizi & Araştırma</h1>
                                        <p className="text-gray-400">Belgeleriniz analiz edildi. Yapay zeka ile web ve içtihat araması yaparak dilekçenizi güçlendirebilirsiniz.</p>
                                    </div>
                                    <div className="bg-[#111113] border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                                        <div className="p-6 bg-[#1A1A1D] border-b border-white/5 flex items-center justify-between">
                                            <h3 className="font-semibold text-white">Analiz Özeti</h3>
                                            <span className="px-3 py-1 bg-green-500/10 text-green-400 text-xs font-bold rounded-full border border-green-500/20">Tamamlandı</span>
                                        </div>
                                        <div className="p-6 sm:p-8 prose prose-invert max-w-none text-gray-300 whitespace-pre-wrap leading-relaxed">
                                            {analysisData?.summary || "Henüz bir analiz bulunmuyor."}
                                        </div>
                                    </div>

                                    {analysisData && (
                                        <div className="bg-[#111113] border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                                            <div className="p-6 bg-[#1A1A1D] border-b border-white/5 flex items-center justify-between">
                                                <h3 className="font-semibold text-white">Analiz Sonrasi Dava Kunyeleri ve Taraf Yonetimi</h3>
                                                <span className="px-3 py-1 bg-indigo-500/10 text-indigo-300 text-xs font-bold rounded-full border border-indigo-500/20">Gelismis Form</span>
                                            </div>

                                            <div className="p-6 sm:p-8 space-y-8">
                                                <div className="space-y-4">
                                                    <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Mahkeme ve Esas Bilgileri</h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-xs text-gray-400 mb-2">Mahkeme</label>
                                                            <input
                                                                type="text"
                                                                value={caseDetails.court}
                                                                onChange={(event) => handleCaseDetailChange('court', event.target.value)}
                                                                placeholder="Orn: Ankara 3. Asliye Hukuk Mahkemesi"
                                                                className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-400 transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs text-gray-400 mb-2">Esas No / Dosya No</label>
                                                            <input
                                                                type="text"
                                                                value={caseDetails.fileNumber}
                                                                onChange={(event) => handleCaseDetailChange('fileNumber', event.target.value)}
                                                                placeholder="Orn: 2025/123 E."
                                                                className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-400 transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs text-gray-400 mb-2">Karar No</label>
                                                            <input
                                                                type="text"
                                                                value={caseDetails.decisionNumber}
                                                                onChange={(event) => handleCaseDetailChange('decisionNumber', event.target.value)}
                                                                placeholder="Orn: 2025/456 K."
                                                                className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-400 transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs text-gray-400 mb-2">Karar Tarihi</label>
                                                            <input
                                                                type="text"
                                                                value={caseDetails.decisionDate}
                                                                onChange={(event) => handleCaseDetailChange('decisionDate', event.target.value)}
                                                                placeholder="GG/AA/YYYY"
                                                                className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-400 transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                                    <div className="bg-[#0F0F11] border border-white/10 rounded-2xl p-5 space-y-5">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Taraflar ve Harici Taraf Ekleme</h4>
                                                            <span className="text-xs text-gray-500">{detectedPartyCandidates.length} tespit edilen taraf</span>
                                                        </div>

                                                        <div className="space-y-3">
                                                            <p className="text-xs text-gray-500">Analizden gelen taraflar. Tiklayarak otomatik olarak ilk bos alana yerlestirebilirsiniz.</p>
                                                            {detectedPartyCandidates.length > 0 ? (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {detectedPartyCandidates.map((partyName, index) => (
                                                                        <button
                                                                            key={`${partyName}-${index}`}
                                                                            type="button"
                                                                            onClick={() => assignPartyToFirstEmptySlot(partyName)}
                                                                            className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${isPartyAssigned(partyName)
                                                                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                                                                : 'bg-[#1A1A1D] border-white/10 text-gray-300 hover:border-indigo-400/40 hover:text-white'
                                                                                }`}
                                                                        >
                                                                            {partyName}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <p className="text-xs text-gray-500">Analizde dogrudan taraf tespit edilemedi. Harici taraf ekleyebilirsiniz.</p>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-col sm:flex-row gap-2">
                                                            <input
                                                                type="text"
                                                                value={manualPartyName}
                                                                onChange={(event) => setManualPartyName(event.target.value)}
                                                                onKeyDown={(event) => {
                                                                    if (event.key === 'Enter') {
                                                                        event.preventDefault();
                                                                        addManualParty();
                                                                    }
                                                                }}
                                                                placeholder="Harici taraf adi soyadi / kurum unvani"
                                                                className="flex-1 bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-400 transition-all"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={addManualParty}
                                                                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-xl transition-colors"
                                                            >
                                                                Harici Taraf Ekle
                                                            </button>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            {PARTY_FIELDS.map(field => (
                                                                <div key={field.key}>
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <label className="text-xs font-medium text-gray-300">{field.label}</label>
                                                                        <span className="text-[11px] text-gray-500">{field.hint}</span>
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        list={`party-suggestions-${field.key}`}
                                                                        value={parties[field.key] || ''}
                                                                        onChange={(event) => setParties(prev => ({ ...prev, [field.key]: event.target.value }))}
                                                                        placeholder={`${field.label} bilgisi`}
                                                                        className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-400 transition-all"
                                                                    />
                                                                    <datalist id={`party-suggestions-${field.key}`}>
                                                                        {detectedPartyCandidates.map((partyName, index) => (
                                                                            <option key={`${field.key}-${partyName}-${index}`} value={partyName} />
                                                                        ))}
                                                                    </datalist>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="bg-[#0F0F11] border border-white/10 rounded-2xl p-5 space-y-4">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Vekil Bilgileri</h4>
                                                            <button
                                                                type="button"
                                                                onClick={clearLawyerInfo}
                                                                className="text-xs text-gray-400 hover:text-white transition-colors"
                                                            >
                                                                Temizle
                                                            </button>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-xs text-gray-400 mb-2">Ad Soyad</label>
                                                                <input
                                                                    type="text"
                                                                    value={lawyerInfo.name || ''}
                                                                    onChange={(event) => updateLawyerInfoField('name', event.target.value)}
                                                                    className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-400 mb-2">Unvan</label>
                                                                <input
                                                                    type="text"
                                                                    value={lawyerInfo.title || ''}
                                                                    onChange={(event) => updateLawyerInfoField('title', event.target.value)}
                                                                    placeholder="Avukat"
                                                                    className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-400 mb-2">Baro</label>
                                                                <input
                                                                    type="text"
                                                                    value={lawyerInfo.bar || ''}
                                                                    onChange={(event) => updateLawyerInfoField('bar', event.target.value)}
                                                                    placeholder="Orn: Istanbul Barosu"
                                                                    className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-400 mb-2">Baro Sicil No</label>
                                                                <input
                                                                    type="text"
                                                                    value={lawyerInfo.barNumber || ''}
                                                                    onChange={(event) => updateLawyerInfoField('barNumber', event.target.value)}
                                                                    className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-400 mb-2">Telefon</label>
                                                                <input
                                                                    type="text"
                                                                    value={lawyerInfo.phone || ''}
                                                                    onChange={(event) => updateLawyerInfoField('phone', event.target.value)}
                                                                    className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-400 mb-2">E-posta</label>
                                                                <input
                                                                    type="text"
                                                                    value={lawyerInfo.email || ''}
                                                                    onChange={(event) => updateLawyerInfoField('email', event.target.value)}
                                                                    className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-400 mb-2">TC / VKN</label>
                                                                <input
                                                                    type="text"
                                                                    value={lawyerInfo.tcNo || ''}
                                                                    onChange={(event) => updateLawyerInfoField('tcNo', event.target.value)}
                                                                    className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
                                                                />
                                                            </div>
                                                            <div className="sm:col-span-2">
                                                                <label className="block text-xs text-gray-400 mb-2">Adres</label>
                                                                <textarea
                                                                    value={lawyerInfo.address || ''}
                                                                    onChange={(event) => updateLawyerInfoField('address', event.target.value)}
                                                                    rows={3}
                                                                    className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white resize-y"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-[#0F0F11] border border-white/10 rounded-2xl p-5 space-y-4">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Ek Taraf / Iletisim Kayitlari</h4>
                                                        <button
                                                            type="button"
                                                            onClick={addContactInfoRow}
                                                            className="px-3 py-1.5 bg-[#1A1A1D] border border-white/10 rounded-lg text-xs text-white hover:border-indigo-400/40 transition-colors"
                                                        >
                                                            + Yeni Kayit
                                                        </button>
                                                    </div>

                                                    {contactInfoList.length === 0 ? (
                                                        <p className="text-xs text-gray-500">Analizde ek taraf/iletisim bilgisi bulunamadi. Istiyorsaniz manuel kayit ekleyebilirsiniz.</p>
                                                    ) : (
                                                        <div className="space-y-4">
                                                            {contactInfoList.map((contact, index) => (
                                                                <div key={`contact-${index}`} className="border border-white/10 rounded-xl p-4 bg-[#111113]">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Kayit #{index + 1}</h5>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => removeContactInfoRow(index)}
                                                                            className="text-xs text-red-300 hover:text-red-200 transition-colors"
                                                                        >
                                                                            Sil
                                                                        </button>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                        <input
                                                                            type="text"
                                                                            value={contact.name || ''}
                                                                            onChange={(event) => updateContactInfoField(index, 'name', event.target.value)}
                                                                            placeholder="Ad Soyad / Kurum"
                                                                            className="bg-[#1A1A1D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            value={contact.tcNo || ''}
                                                                            onChange={(event) => updateContactInfoField(index, 'tcNo', event.target.value)}
                                                                            placeholder="TC / VKN"
                                                                            className="bg-[#1A1A1D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            value={contact.phone || ''}
                                                                            onChange={(event) => updateContactInfoField(index, 'phone', event.target.value)}
                                                                            placeholder="Telefon"
                                                                            className="bg-[#1A1A1D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            value={contact.email || ''}
                                                                            onChange={(event) => updateContactInfoField(index, 'email', event.target.value)}
                                                                            placeholder="E-posta"
                                                                            className="bg-[#1A1A1D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                                                        />
                                                                        <textarea
                                                                            value={contact.address || ''}
                                                                            onChange={(event) => updateContactInfoField(index, 'address', event.target.value)}
                                                                            placeholder="Adres"
                                                                            rows={2}
                                                                            className="sm:col-span-2 bg-[#1A1A1D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-y"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 shadow-sm">
                                            <h3 className="font-semibold text-white mb-4">Web Araştırması</h3>
                                            <p className="text-sm text-gray-400 mb-6">Benzer davalar veya hukuki argümanlar için internet araması yapın.</p>
                                            {searchKeywords.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-6">
                                                    {searchKeywords.map((k, i) => (
                                                        <span key={i} className="px-3 py-1.5 bg-[#1A1A1D] border border-white/10 rounded-lg text-xs text-gray-300">{k}</span>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="flex flex-col gap-3">
                                                <button
                                                    onClick={handleGenerateKeywords}
                                                    disabled={isGeneratingKeywords}
                                                    className="w-full py-2.5 bg-[#1A1A1D] hover:bg-[#1C1C1F] border border-white/10 text-white rounded-lg text-sm font-medium transition-all"
                                                >
                                                    {isGeneratingKeywords ? 'Oluşturuluyor...' : 'Arama Terimleri Öner'}
                                                </button>
                                                <button
                                                    onClick={handleSearch}
                                                    disabled={isSearching || searchKeywords.length === 0}
                                                    className="w-full py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-red-900/50"
                                                >
                                                    {isSearching ? <span className="flex items-center justify-center gap-2"><LoadingSpinner className="w-4 h-4 text-white" /> Aranıyor...</span> : 'Web\'de Araştır'}
                                                </button>
                                                <button
                                                    onClick={handleLegalSearch}
                                                    disabled={isLegalSearching || searchKeywords.length === 0}
                                                    className="w-full py-2.5 bg-[#1A1A1D] hover:bg-[#1C1C1F] border border-white/10 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all"
                                                >
                                                    {isLegalSearching ? <span className="flex items-center justify-center gap-2"><LoadingSpinner className="w-4 h-4 text-white" /> Ictihat Araniyor...</span> : 'Yargitay Karari Ara (MCP)'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bg-[#111113] border border-white/5 rounded-2xl p-6 shadow-sm">
                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                <h3 className="font-semibold text-white">Özel Talimatlar</h3>
                                                <VoiceInputButton
                                                    onTranscript={(text) => setSpecifics(prev => (prev.trim() ? `${prev}\n${text}` : text))}
                                                    className="bg-[#1A1A1D] border-white/10 hover:bg-[#232327]"
                                                />
                                            </div>
                                            <p className="text-sm text-gray-400 mb-6">Dilekçede mutlaka vurgulanmasını istediğiniz notları ekleyin.</p>
                                            <textarea
                                                value={specifics}
                                                onChange={(e) => setSpecifics(e.target.value)}
                                                placeholder="Örn: Manevi tazminat talebinin altını özellikler çiz..."
                                                className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all min-h-[120px] resize-y"
                                            />
                                        </div>
                                    </div>

                                    {(isSearching || webSearchResult) && (
                                        <div className="bg-[#111113] border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                                            <div className="p-6 bg-[#1A1A1D] border-b border-white/5 flex items-center justify-between">
                                                <h3 className="font-semibold text-white">Web Arama Sonuclari</h3>
                                                <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded-full border border-blue-500/20">
                                                    {webSearchResult?.sources?.length || 0} kaynak
                                                </span>
                                            </div>
                                            <div className="p-6 sm:p-8 space-y-6">
                                                {isSearching && (
                                                    <div className="flex items-center gap-2 text-sm text-gray-400">
                                                        <LoadingSpinner className="w-4 h-4 text-white" />
                                                        Sonuclar getiriliyor...
                                                    </div>
                                                )}
                                                {webSearchResult && (
                                                    <>
                                                        <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                            {webSearchResult.summary}
                                                        </div>
                                                        {webSearchResult.sources?.length > 0 && (
                                                            <div className="space-y-2">
                                                                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Kaynaklar</h4>
                                                                <div className="space-y-2">
                                                                    {webSearchResult.sources.map((source, index) => (
                                                                        <a
                                                                            key={`${source.uri}-${index}`}
                                                                            href={source.uri}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="block text-sm text-blue-300 hover:text-blue-200 underline break-all"
                                                                        >
                                                                            {source.title || source.uri}
                                                                        </a>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {(isLegalSearching || legalSearchResults.length > 0) && (
                                        <div className="bg-[#111113] border border-white/5 rounded-2xl overflow-hidden shadow-sm">
                                            <div className="p-6 bg-[#1A1A1D] border-b border-white/5 flex items-center justify-between">
                                                <h3 className="font-semibold text-white">Yargitay Kararlari (MCP)</h3>
                                                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/20">
                                                    {legalSearchResults.length} karar
                                                </span>
                                            </div>
                                            <div className="p-6 sm:p-8">
                                                {isLegalSearching && (
                                                    <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
                                                        <LoadingSpinner className="w-4 h-4 text-white" />
                                                        Yargitay kararlari aran1yor...
                                                    </div>
                                                )}
                                                {!isLegalSearching && legalSearchResults.length === 0 && (
                                                    <p className="text-sm text-gray-400">Bu konuda listelenecek karar bulunamadi.</p>
                                                )}
                                                {legalSearchResults.length > 0 && (
                                                    <div className="space-y-4">
                                                        {legalSearchResults.map((result, index) => (
                                                            <button
                                                                key={`${result.title}-${index}`}
                                                                onClick={() => openDecisionModal(result, index)}
                                                                className="w-full text-left border border-white/10 rounded-xl p-4 bg-[#151518] hover:border-red-500/40 transition-colors"
                                                            >
                                                                <div className="flex items-start justify-between gap-3 mb-2">
                                                                    <p className="text-sm font-semibold text-white">{result.title}</p>
                                                                    {typeof result.relevanceScore === 'number' && (
                                                                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                                                                            Skor: {Math.round(result.relevanceScore)}/100
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-gray-400 mb-2">
                                                                    {result.daire ? `${result.daire} ` : ''}
                                                                    {result.esasNo ? `E. ${result.esasNo} ` : ''}
                                                                    {result.kararNo ? `K. ${result.kararNo} ` : ''}
                                                                    {result.tarih ? `T. ${result.tarih}` : ''}
                                                                </p>
                                                                {result.ozet && <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">{result.ozet}</p>}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-between mt-8">
                                        <button
                                            onClick={() => setCurrentStep(2)}
                                            className="group px-6 py-3 bg-gradient-to-r from-[#1B1B1F] via-[#202027] to-[#15151A] border border-white/15 hover:border-amber-400/60 text-white rounded-xl font-semibold transition-all shadow-lg shadow-black/40 hover:shadow-amber-900/30 flex items-center gap-2"
                                        >
                                            <svg className="w-4 h-4 text-amber-300 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                            </svg>
                                            <span className="tracking-wide">Geri</span>
                                        </button>
                                        <button
                                            onClick={handleGeneratePetition}
                                            disabled={isLoadingPetition}
                                            className="px-8 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:opacity-50 text-white rounded-xl font-medium transition-all shadow-lg shadow-red-900/50 flex items-center gap-2"
                                        >
                                            {isLoadingPetition ? <LoadingSpinner className="w-5 h-5 text-white" /> : <SparklesIcon className="w-5 h-5" />}
                                            {isLoadingPetition ? 'Üretiliyor...' : 'Nihai Dilekçeyi Üret'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {currentStep === 5 && (
                                <div className="-mx-8 -mt-4">
                                    <PetitionPreview
                                        key={`preview-${petitionVersion}`}
                                        petition={generatedPetition}
                                        setPetition={setGeneratedPetition}
                                        onRewrite={handleRewriteText}
                                        onReview={handleReviewPetition}
                                        isReviewing={isReviewingPetition}
                                        petitionVersion={petitionVersion}
                                        officeLogoUrl={profile?.office_logo_url}
                                        corporateHeader={profile?.corporate_header}
                                        sources={webSearchResult?.sources || []}
                                        onGoBack={() => setCurrentStep(4)}
                                    />
                                </div>
                            )}

                            {currentStep === 4 && (
                                <div className="space-y-8">
                                    <div className="mb-6 flex items-center justify-between">
                                        <div>
                                            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Dilekçe Hazır</h1>
                                            <p className="text-gray-400">Üretilen dilekçeyi inceleyin, düzenleyin.</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {generatedPetition && (
                                                <button
                                                    onClick={handleSendToEditor}
                                                    className="px-4 py-2 bg-[#1C1C1F] hover:bg-[#27272A] border border-white/10 text-white rounded-lg font-medium transition-all text-sm"
                                                >
                                                    Editöre Gönder
                                                </button>
                                            )}
                                            {generatedPetition && (
                                                <button
                                                    onClick={() => setCurrentStep(5)}
                                                    className="group flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-semibold transition-all text-sm shadow-lg shadow-emerald-900/30"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                    Ön İzleme & İndirme
                                                    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {generatedPetition ? (
                                        <div className="bg-[#111113] border border-white/5 rounded-2xl overflow-hidden shadow-2xl min-h-[800px]">
                                            <PetitionView
                                                key={petitionVersion}
                                                petition={generatedPetition}
                                                setGeneratedPetition={setGeneratedPetition}
                                                sources={webSearchResult?.sources || []}
                                                isLoading={isLoadingPetition}
                                                onRewrite={handleRewriteText}
                                                onReview={handleReviewPetition}
                                                isReviewing={isReviewingPetition}
                                                petitionVersion={petitionVersion}
                                                officeLogoUrl={profile?.office_logo_url}
                                                corporateHeader={profile?.corporate_header}
                                            />
                                        </div>
                                    ) : (
                                        <div className="bg-[#111113] border border-white/5 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
                                            <div className="w-16 h-16 bg-[#1A1A1D] rounded-full flex items-center justify-center mb-4">
                                                <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-xl font-medium text-white mb-2">Henuz Dilekce Uretilmedi</h3>
                                            <p className="text-gray-400 max-w-sm mb-6">Onceki adimlara donup belgelerinizi analiz edin ve dilekceyi olustur butonuna tiklayin.</p>
                                            <button onClick={() => setCurrentStep(3)} className="px-6 py-2.5 bg-[#1C1C1F] hover:bg-[#27272A] border border-white/10 text-white rounded-lg text-sm font-medium transition-all">
                                                Onceki Adima Don
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                    </div>
                </main >
            </div >

            {isDecisionModalOpen && (
                <div
                    className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setIsDecisionModalOpen(false)}
                >
                    <div
                        className="w-full max-w-4xl max-h-[90vh] bg-[#111113] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 p-5 border-b border-white/10">
                            <div className="min-w-0">
                                <h3 className="text-lg font-semibold text-white truncate">{selectedDecision?.title || 'Karar Detayi'}</h3>
                                <p className="text-xs text-gray-400 mt-1">
                                    {selectedDecision?.esasNo ? `E. ${selectedDecision.esasNo} ` : ''}
                                    {selectedDecision?.kararNo ? `K. ${selectedDecision.kararNo} ` : ''}
                                    {selectedDecision?.tarih ? `T. ${selectedDecision.tarih}` : ''}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsDecisionModalOpen(false)}
                                className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                            >
                                <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto max-h-[72vh]">
                            {isDecisionContentLoading ? (
                                <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                                    <LoadingSpinner className="w-8 h-8 text-white mb-3" />
                                    Tam metin yukleniyor...
                                </div>
                            ) : (
                                <pre className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed font-sans">
                                    {selectedDecisionContent}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            )
            }

            {/* Floating Chat Button */}
            <button
                onClick={() => setIsChatOpen(true)}
                className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-2xl shadow-red-900/40 flex items-center justify-center transition-all duration-300 hover:scale-110 ${isChatOpen ? 'opacity-0 pointer-events-none scale-75' : 'opacity-100 scale-100'}`}
                title="DilekAI Asistan"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {chatMessages.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-red-600 text-[10px] font-bold rounded-full flex items-center justify-center shadow">
                        {chatMessages.length}
                    </span>
                )}
            </button>

            {/* Sliding Chat Panel */}
            {
                isChatOpen && (
                    <div className="fixed inset-0 z-[70] flex justify-end">
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setIsChatOpen(false)}
                        />
                        {/* Panel */}
                        <div className="relative w-full max-w-lg h-full bg-[#111113] border-l border-white/10 shadow-2xl flex flex-col animate-slide-in-right">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0A0A0B]">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-r from-red-600 to-red-700 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-white">DilekAI Asistan</h3>
                                        <p className="text-xs text-gray-400">Hukuk asistanınız</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsChatOpen(false)}
                                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                                >
                                    <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            {/* ChatView Body */}
                            <div className="flex-1 overflow-hidden min-h-0">
                                <ChatView
                                    messages={chatMessages}
                                    onSendMessage={handleSendChatMessage}
                                    isLoading={isLoadingChat}
                                    statusText={chatProgressText}
                                    searchKeywords={searchKeywords}
                                    setSearchKeywords={setSearchKeywords}
                                    webSearchResult={webSearchResult}
                                    setWebSearchResult={setWebSearchResult}
                                    docContent={docContent}
                                    setDocContent={setDocContent}
                                    specifics={specifics}
                                    setSpecifics={setSpecifics}
                                />
                            </div>
                        </div>
                    </div>
                )
            }

            {
                error && (
                    <div className="fixed bottom-6 right-6 bg-red-500/10 border border-red-500/50 text-red-200 p-4 rounded-xl shadow-2xl max-w-md z-50 backdrop-blur-md animate-fade-in flex items-start gap-4">
                        <svg className="w-6 h-6 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                            <h4 className="font-semibold mb-1 text-white">Hata</h4>
                            <p className="text-sm opacity-90">{error}</p>
                        </div>
                        <button onClick={() => setError(null)} className="text-white/50 hover:text-white transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                )
            }
        </div >
    );
}






