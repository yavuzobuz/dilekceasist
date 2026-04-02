import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { ChatView } from '../../components/ChatView';
import { ToastContainer, ToastType } from '../../components/Toast';
import { Scale } from 'lucide-react';
import { ChatMessage, WebSearchResult, AnalysisData, UserRole } from '../../types';
import { analyzeDocuments, generateSearchKeywords, performWebSearch, streamChatResponse, generatePetition } from '../../services/geminiService';
import { prepareChatAttachmentsForAnalysis, mergeAnalysisData } from '../utils/chatAttachmentProcessing';
import { buildHybridSearchVariants, buildLegalSearchInputs, normalizeLegalSearchResults as normalizeSharedLegalSearchResults, searchLegalDecisionsDetailed, getLegalDocument, type NormalizedLegalDecision } from '../utils/legalSearch';
import { resolveLegalSourceForQuery } from '../utils/legalSource';
import { buildLegalResearchBatchMessage, detectLegalSearchIntent } from '../lib/legal/chatLegalIntent';
import { useLegalSearch } from '../hooks/useLegalSearch';

type AlternativeLegalSearchResult = NormalizedLegalDecision;

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
    const content = (args.documentContent ?? args.document_content ?? args.content ?? args.petitionContent ?? args.dilekceMetni ?? '');
    const title = (args.documentTitle ?? args.document_title ?? args.title ?? 'Belge');
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (!normalizedContent) return null;
    return { title: typeof title === 'string' && title.trim() ? title.trim() : 'Belge', content: normalizedContent };
};

const inferMimeType = (file: File): string => {
    if (file.type) return file.type;
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (lowerName.endsWith('.doc')) return 'application/msword';
    return 'application/pdf';
};

const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = String(reader.result || '').split(',')[1] || '';
            resolve(base64String);
        };
        reader.onerror = (error) => reject(error);
    });

const normalizeKeywordText = (value: string): string => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0131/g, 'i').replace(/[^a-z0-9\s./-]/g, ' ').replace(/\s+/g, ' ').trim();

const KEYWORD_STOPWORDS = new Set(['ve', 'veya', 'ile', 'olan', 'oldugu', 'iddia', 'edilen', 'uzerine', 'kapsaminda', 'gibi', 'icin', 'uzere', 'bu', 'su', 'o', 'bir', 'de', 'da', 'mi', 'mu']);
const KEYWORD_DRAFTING_TERMS = new Set(['dilekce', 'savunma', 'belge', 'sozlesme', 'taslak', 'yaz', 'yazalim', 'hazirla', 'olustur', 'uret', 'detayli', 'olmasi', 'olmali', 'koruyacak', 'haklarini', 'muvekkil', 'muvekkilin', 'vekil', 'vekili', 'bana', 'lutfen', 'yardim', 'hazir', 'yapalim']);
const FACT_SIGNAL_REGEX = /\b(tck|cmk|hmk|tmk|anayasa|madde|maddesi|esas|karar|uyusturucu|hirsizlik|dolandiricilik|tehdit|yaralama|oldurme|gozalti|tutuk|delil|kamera|tanik|rapor|bilirkisi|ele gecir|kullanim siniri|ticaret|satici|isveren|kidem|ihbar|fesih|veraset|tapu|imar|ruhsat)\b/i;
const DATE_ONLY_REGEX = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const DIGITS_ONLY_REGEX = /^\d+$/;
const BARE_MADDE_REGEX = /^\d{1,3}\.?\s*maddesi?$/i;
const LAW_REFERENCE_REGEX = /\b(tck|cmk|hmk|tmk|tbk|iik|ttk|vuk|kmk|anayasa|imar kanunu|is kanunu)\b/i;

const hasFactSignal = (rawValue: string): boolean => FACT_SIGNAL_REGEX.test(normalizeKeywordText(rawValue));
const isNoisyKeywordCandidate = (value: string): boolean => {
    const cleaned = String(value || '').replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return true;
    if (DATE_ONLY_REGEX.test(cleaned) || DIGITS_ONLY_REGEX.test(cleaned) || (BARE_MADDE_REGEX.test(cleaned) && !LAW_REFERENCE_REGEX.test(cleaned))) return true;
    return false;
};

const extractKeywordCandidates = (rawValue: string): string[] => {
    const text = String(rawValue || '').trim();
    if (!text) return [];
    const normalizedText = normalizeKeywordText(text);
    const candidates: string[] = [];
    const seen = new Set<string>();

    const addCandidate = (value: string) => {
        const cleaned = String(value || '').replace(/[“”"']/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleaned || cleaned.length < 3 || isNoisyKeywordCandidate(cleaned)) return;
        const normalizedKey = normalizeKeywordText(cleaned);
        if (!normalizedKey || normalizedKey.length < 3) return;
        const words = normalizedKey.split(/\s+/).filter(Boolean);
        const nonStopWords = words.filter(word => !KEYWORD_STOPWORDS.has(word));
        if (nonStopWords.length === 0) return;
        if (!hasFactSignal(normalizedKey) && nonStopWords.length < 2) return;
        if (nonStopWords.some(w => KEYWORD_DRAFTING_TERMS.has(w)) && !hasFactSignal(normalizedKey)) return;
        if (seen.has(normalizedKey)) return;
        seen.add(normalizedKey);
        candidates.push(cleaned);
    };

    text.match(/TCK\s*\d+(?:\s*\/\s*\d+)?(?:\s*[-–]\s*\d+)?/gi)?.forEach(addCandidate);
    text.split(/[,\n;]+/g).forEach(chunk => {
        const normalizedChunk = normalizeKeywordText(chunk);
        if (!hasFactSignal(chunk) && (normalizedChunk ? normalizedChunk.split(/\s+/).filter(Boolean).length : 0) > 8) return;
        addCandidate(chunk);
    });

    normalizedText.split(/[\s,;:.!?()\/\\-]+/g).map(t => t.trim())
        .filter(t => t.length >= 4 && !KEYWORD_STOPWORDS.has(t) && !KEYWORD_DRAFTING_TERMS.has(t) && hasFactSignal(t))
        .forEach(t => { if (candidates.length < 12) addCandidate(t); });

    return candidates.slice(0, 12);
};

const isExplicitKeywordAddRequest = (raw: string): boolean => {
    const norm = normalizeKeywordText(raw);
    return norm ? /(anahtar\s*kelime|arama\s*terimi|keyword)/i.test(norm) && /(ekle|ekleyin|ekleyelim|ekler misin|eklensin|ilave et|kaydet|guncelle)/i.test(norm) : false;
};

const extractExplicitKeywordsFromMessage = (raw: string): string[] => {
    const message = String(raw || '').trim();
    if (!message || !isExplicitKeywordAddRequest(message)) return [];
    const candidates: string[] = [];
    Array.from(message.matchAll(/"([^"]{2,120})"/g)).forEach(m => candidates.push((m[1] || '').trim()));
    Array.from(message.matchAll(/'([^']{2,120})'/g)).forEach(m => candidates.push((m[1] || '').trim()));
    return candidates.filter(Boolean);
};

const hasSearchOptOutIntent = (rawMessage: string): boolean => {
    const norm = normalizeKeywordText(rawMessage);
    if (!norm) return false;
    return /(arama|arastirma|ictihat|emsal|yargitay|danistay|web|internet).*(yapma|istemiyorum|olmasin|gerek yok|gerekli degil|yapmayin)|\b(yapma|istemiyorum|olmasin|gerek yok|gerekli degil|yapmayin).*(arama|arastirma|ictihat|emsal|yargitay|danistay|web|internet)\b/i.test(norm);
};

const isExplicitWebSearchRequest = (raw: string): boolean => {
    const norm = normalizeKeywordText(raw);
    if (!norm || hasSearchOptOutIntent(norm)) return false;
    // "web araması yap", "internetten ara", "google'da bul" vb.
    const hasWebTerm = /(web|internet|google|internetten|webde|webden)/i.test(norm);
    const hasSearchVerb = /(ara|bul|tara|getir|incele|listele|arastir)/i.test(norm);
    return hasWebTerm && hasSearchVerb;
};

const isLikelyPetitionRequest = (rawMessage: string): boolean => {
    if (!rawMessage) return false;
    return /(dilekce|dilekçe|belge|taslak|template|ihtarname|itiraz|temyiz|feragat|talep|sozlesme|sözleşme)/i.test(rawMessage) && /(olustur|olutur|hazirla|hazırla|yaz)/i.test(rawMessage);
};

const hasWebEvidence = (result: WebSearchResult | null): boolean => {
    if (!result) return false;
    const summary = typeof result.summary === 'string' ? result.summary.trim() : '';
    const hasSource = Array.isArray(result.sources) && result.sources.some((source: any) => typeof source?.uri === 'string' && source.uri.trim().length > 0);
    return summary.length >= 40 && hasSource;
};

const getLegalResultPreviewText = (result: Partial<AlternativeLegalSearchResult>): string => {
    return (typeof result.ozet === 'string' ? result.ozet.trim() : '') || (typeof result.snippet === 'string' ? result.snippet.trim() : '');
};

const hasLegalEvidenceForChat = (results: AlternativeLegalSearchResult[]): boolean => {
    return results.some(r => {
        const title = typeof r.title === 'string' ? r.title.trim() : '';
        return title.length > 0 && getLegalResultPreviewText(r).length > 0;
    });
};

const buildLegalResultsPrompt = (results: AlternativeLegalSearchResult[]): string => {
    if (results.length === 0) return '';
    return results.map(r => `- ${r.title} ${r.esasNo ? `E. ${r.esasNo}` : ''} ${r.kararNo ? `K. ${r.kararNo}` : ''} ${r.tarih ? `T. ${r.tarih}` : ''} ${getLegalResultPreviewText(r)}`.trim()).join('\n');
};

const mergeWebSearchResults = (existing: WebSearchResult | null, incoming: WebSearchResult | null): WebSearchResult | null => {
    if (!existing) return incoming;
    if (!incoming) return existing;
    const summary = [existing.summary, incoming.summary].filter(Boolean).join('\n\n').trim();
    const sourceMap = new Map();
    [...existing.sources, ...incoming.sources].filter(s => s?.uri).forEach(s => sourceMap.set(s.uri, { uri: s.uri, title: s.title || s.uri }));
    return { summary, sources: Array.from(sourceMap.values()) };
};

const getLegalResultIdentityKey = (result: Partial<AlternativeLegalSearchResult>): string => {
    const documentId = String(result.documentId || '').trim();
    if (documentId && !/^(search-|legal-|ai-summary|sem-|template-decision-)/i.test(documentId)) {
        return `doc:${documentId}`;
    }
    return `meta:${result.title || ''}|${result.esasNo || ''}|${result.kararNo || ''}|${result.tarih || ''}`;
};

const mergeUniqueLegalResults = (existing: AlternativeLegalSearchResult[], incoming: AlternativeLegalSearchResult[]): AlternativeLegalSearchResult[] => {
    const seen = new Set<string>();
    return [...existing, ...incoming].filter(result => {
        const key = getLegalResultIdentityKey(result);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const normalizeSharedLegalSearchResultsWrapper = (payload: any): AlternativeLegalSearchResult[] => normalizeSharedLegalSearchResults(payload) as AlternativeLegalSearchResult[];

let toastIdCounter = 0;
const createToastId = (): string => `${Date.now()}-${++toastIdCounter}-${Math.random().toString(36).slice(2, 10)}`;

export default function ChatPage() {
    const navigate = useNavigate();
    const { search: searchLegalFromIntent } = useLegalSearch();
    const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: ToastType }>>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    const [chatProgressText, setChatProgressText] = useState('');
    const [searchKeywords, setSearchKeywords] = useState<string[]>([]);
    const [webSearchResult, setWebSearchResult] = useState<WebSearchResult | null>(null);
    const [precedentContext, setPrecedentContext] = useState('');
    const [docContent, setDocContent] = useState('');
    const [specifics, setSpecifics] = useState('');
    const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
    const [legalSearchResults, setLegalSearchResults] = useState<NormalizedLegalDecision[]>([]);
    const [error, setError] = useState<string | null>(null);

    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = createToastId();
        setToasts(prev => [...prev.slice(-4), { id, message, type }]); // Keep max 5
        setTimeout(() => removeToast(id), 5000);
    }, []);

    const removeToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);

    const runLegalSearch = useCallback(async (queryInput: string | string[], options: { silent?: boolean; suppressError?: boolean; } = {}): Promise<AlternativeLegalSearchResult[]> => {
        try {
            const { keyword, rawQuery, legalSearchPacket } = buildLegalSearchInputs({
                queryInput,
                legalSearchPacket: analysisData?.legalSearchPacket || null,
                preserveKeywords: searchKeywords,
                fallbackSummary: analysisData?.summary || '',
                fallbackKeywords: searchKeywords,
            });

            const detailedResult = await searchLegalDecisionsDetailed({
                keyword, rawQuery, legalSearchPacket, source: 'all', searchMode: 'pro', filters: { searchArea: 'auto' }
            });

            if (detailedResult.normalizedResults && detailedResult.normalizedResults.length > 0) {
                const normalizedResults = detailedResult.normalizedResults as AlternativeLegalSearchResult[];
                
                // ALT-APP'den kopyalanan yapı: İlk kararların (veya özeti boş olanların) metinlerini çek
                const enrichedResults = await Promise.all(normalizedResults.map(async (result, index) => {
                    if ((result.ozet || result.snippet || '').trim()) {
                        return result;
                    }

                    try {
                        const resolvedSource =
                            String(result.source || '').trim() ||
                            resolveLegalSourceForQuery(
                                [
                                    result.source || '',
                                    result.title || '',
                                    result.daire || '',
                                ],
                                'all'
                            );

                        const content = await getLegalDocument({
                            source: resolvedSource,
                            documentId: result.documentId || result.id || `${result.title || 'karar'}-${index}`,
                            title: result.title,
                            esasNo: result.esasNo,
                            kararNo: result.kararNo,
                            tarih: result.tarih,
                            daire: result.daire,
                            ozet: result.ozet,
                            snippet: result.snippet,
                        });

                        const plainText = String(content || '').replace(/[#*_>`-]+/g, ' ').replace(/\s+/g, ' ').trim();
                        const preview = plainText.length > 600 ? `${plainText.slice(0, 599)}...` : plainText;
                        if (!preview) return result;
                        return {
                            ...result,
                            ozet: result.ozet || preview,
                            snippet: result.snippet || preview,
                            summaryText: plainText,
                        };
                    } catch {
                        return result;
                    }
                }));

                if (!options.silent) addToast(`${enrichedResults.length} karar bulundu.`, 'success');
                return enrichedResults;
            }

            if (!options.silent) addToast('Karar bulunamadı.', 'warning');
            return [];
        } catch (searchError: any) {
            if (!options.suppressError && !options.silent) addToast(`Arama hatası: ${searchError.message}`, 'error');
            return [];
        }
    }, [analysisData, searchKeywords, addToast]);

    const handleSendChatMessage = useCallback(async (message: string, files?: File[]) => {
        const normalizedMessage = (message || '').trim();
        const chatSourceFiles = Array.isArray(files) ? files : [];
        let mergedAnalysisData = analysisData;
        let mergedAnalysisSummary = analysisData?.summary?.trim() || '';

        const userMessage: ChatMessage = { role: 'user', text: normalizedMessage || (chatSourceFiles.length > 0 ? `[Dosya] ${chatSourceFiles.length} dosya yüklendi` : '') };
        const newMessages = [...chatMessages, userMessage];
        setChatMessages(newMessages);
        setIsLoadingChat(true);
        setError(null);
        setChatProgressText(chatSourceFiles.length > 0 ? 'Dosyalar analiz ediliyor...' : 'Düşünüyorum...');

        let mergedKeywords = [...searchKeywords];
        let mergedWebSearchResult = webSearchResult;
        let mergedLegalResults = [...legalSearchResults];
        let mergedDocContent = docContent;
        let assistantText = '';

        try {
            if (detectLegalSearchIntent(normalizedMessage)) {
                setChatProgressText('Emsal karar aranıyor...');
                const firstAttachment = chatSourceFiles[0];
                const documentBase64 = firstAttachment ? await fileToBase64(firstAttachment) : undefined;
                const searchedResults = await searchLegalFromIntent({
                    text: normalizedMessage || undefined,
                    documentBase64,
                    mimeType: firstAttachment ? inferMimeType(firstAttachment) : undefined,
                });

                if (searchedResults.length > 0) {
                    mergedLegalResults = mergeUniqueLegalResults(mergedLegalResults, searchedResults);
                    setLegalSearchResults(mergedLegalResults);
                    setPrecedentContext(buildLegalResultsPrompt(mergedLegalResults));

                    const batchMessage = buildLegalResearchBatchMessage(searchedResults);
                    if (batchMessage) {
                        setChatMessages(prev => [...prev, { role: 'model', text: batchMessage }]);
                    }
                }

                return;
            }

            if (chatSourceFiles.length > 0) {
                const preparedAttachments = await prepareChatAttachmentsForAnalysis(chatSourceFiles);
                if (preparedAttachments.uploadedFiles.length > 0 || preparedAttachments.udfTextContent || preparedAttachments.wordTextContent) {
                    const chatAnalysis = await analyzeDocuments(preparedAttachments.uploadedFiles, preparedAttachments.udfTextContent, preparedAttachments.wordTextContent);
                    mergedAnalysisData = mergeAnalysisData(mergedAnalysisData, chatAnalysis);
                    mergedAnalysisSummary = mergedAnalysisData?.summary?.trim() || '';
                    setAnalysisData(mergedAnalysisData);

                    const extractedContextText = [preparedAttachments.udfTextContent, preparedAttachments.wordTextContent].filter(Boolean).join('\n\n').trim();
                    const chatAnalysisSummary = String(chatAnalysis?.summary || '').trim();
                    const analysisContextBlock = chatAnalysisSummary ? `--- Sohbet Analizi ---\n${chatAnalysisSummary}` : '';
                    
                    const nextContextBlocks = [mergedDocContent];
                    if (analysisContextBlock && !mergedDocContent.includes(analysisContextBlock)) nextContextBlocks.push(analysisContextBlock);
                    if (extractedContextText && !mergedDocContent.includes(extractedContextText)) nextContextBlocks.push(extractedContextText);
                    
                    mergedDocContent = nextContextBlocks.filter(Boolean).join('\n\n').trim();
                    setDocContent(mergedDocContent);
                    addToast('Belge bağlama eklendi.', 'info');
                }
            }

            if (isExplicitKeywordAddRequest(normalizedMessage)) {
                const explicitKeys = extractExplicitKeywordsFromMessage(normalizedMessage);
                if (explicitKeys.length > 0) setSearchKeywords(mergedKeywords = Array.from(new Set([...mergedKeywords, ...explicitKeys])));
            }

            let isWebExplicit = isExplicitWebSearchRequest(normalizedMessage);
            let isLegalExplicit = detectLegalSearchIntent(normalizedMessage);
            const isPetition = isLikelyPetitionRequest(normalizedMessage);

            // Sadece biri isteniyorsa diğerini eziyoruz, böylece her ikisi de aynı anda gereksiz yere çalışmaz. 
            // Belge istenirse her ikisine de izin veriyoruz.
            if (isPetition) {
                isWebExplicit = true;
                isLegalExplicit = true;
            } else if (isWebExplicit && isLegalExplicit) {
                // Eğer cümlede "sadece web" veya "web araması yap" ağırlıktaysa legal iptal, vs...
                // Ya da basitçe ikisini de koruruz ancak biz burada en ağır basanı seçeceğiz,
                // Ama genellikle biri açıkça istendiği için diğerinin "false positive" olma ihtimali yüksektir. 
                // Örn: "Yargıtay kararını webden araştır" cümlesinde legal search ağırlıklıdır.
                if (/(web aramasi yap|sadece web|internetten ara)/i.test(normalizeKeywordText(normalizedMessage))) {
                    isLegalExplicit = false;
                }
            }

            const allowWebSearch = isWebExplicit;
            const allowLegalSearch = isLegalExplicit;

            let evidenceKeywords = mergedKeywords.length > 0 ? mergedKeywords : extractKeywordCandidates([mergedAnalysisSummary, mergedDocContent, normalizedMessage].filter(Boolean).join('\n'));
            
            // Fallback: anahtar kelime çıkarılamadıysa mesajın kendisini kullan
            if (evidenceKeywords.length === 0 && normalizedMessage.length > 5) {
                evidenceKeywords = [normalizedMessage];
            }

            if (allowWebSearch && evidenceKeywords.length > 0) {
                setChatProgressText('Web araştırması yapılıyor...');
                try {
                    mergedWebSearchResult = mergeWebSearchResults(mergedWebSearchResult, await performWebSearch(evidenceKeywords));
                    setWebSearchResult(mergedWebSearchResult);
                    // Sonuçları anında chat'e göster
                    if (mergedWebSearchResult?.summary) {
                        const sourcesText = (mergedWebSearchResult.sources || [])
                            .filter((s: any) => s?.title || s?.uri)
                            .map((s: any) => {
                                const name = s.title || (s.uri ? new URL(s.uri).hostname.replace('www.', '') : 'Bilinmeyen Kaynak');
                                return `- ${name}`;
                            })
                            .join('\n');
                        const webResultMsg = `📌 **Web Araştırması Sonuçları:**\n\n${mergedWebSearchResult.summary}\n\n${sourcesText ? `**Kaynaklar:**\n${sourcesText}` : ''}`;
                        setChatMessages(prev => [...prev, { role: 'model', text: webResultMsg }]);
                    }
                } catch (e) { console.error('Web search error', e); }
            }

            if (allowLegalSearch && evidenceKeywords.length > 0) {
                setChatProgressText('Emsal karar aranıyor...');
                try {
                    // Orijinal mesajı rawQuery olarak gönder, ayrıca son mesajlardan oluşan bağlamı (context) AI asistanının anlaması için ekle
                    const recentMessagesText = newMessages.slice(Math.max(0, newMessages.length - 6))
                        .map(m => `${m.role === 'user' ? 'Kullanıcı' : 'Yapay Zeka'}: ${m.text}`).join('\n');
                    const enrichedContextQuery = `Sorgu: ${normalizedMessage || evidenceKeywords.join(', ')}\n\n--- Sohbet Geçmişi (Bağlam) ---\n${recentMessagesText}`;
                    
                    const hybridQuery = buildHybridSearchVariants(enrichedContextQuery)[0] || enrichedContextQuery;
                    const searchedResults = await runLegalSearch(hybridQuery, { silent: true, suppressError: true });
                    mergedLegalResults = mergeUniqueLegalResults(mergedLegalResults, searchedResults);
                    setLegalSearchResults(mergedLegalResults);
                    setPrecedentContext(buildLegalResultsPrompt(mergedLegalResults));
                    // Sonuçları anında chat'e göster
                    if (mergedLegalResults.length > 0) {
                        const batchMessage = buildLegalResearchBatchMessage(mergedLegalResults);
                        if (batchMessage) {
                            setChatMessages(prev => [...prev, { role: 'model', text: batchMessage }]);
                        }
                    }
                } catch (e) { console.error('Legal search error', e); }
            }
            // Sohbet geçmişinden modelin "yapamıyorum" gibi zararlı eski cevaplarını temizle
            const cleanedMessages = newMessages.map(({ files: _files, ...msg }) => {
                if (msg.role === 'model' && msg.text && /(web arama[sı]?\s*(yap[aı]m[ıi]yorum|yetene[gğ]im|bulunmam)|internete\s*eri[sş]em|b[oö]yle bir [oö]zelli[gğ]im|arama yetene[gğ]im yok)/i.test(msg.text)) {
                    return { ...msg, text: msg.text.replace(/(web arama[sı]?\s*(yap[aı]m[ıi]yorum|yetene[gğ]im|bulunmam)|internete\s*eri[sş]em|b[oö]yle bir [oö]zelli[gğ]im|arama yetene[gğ]im yok)[^.]*\./gi,
                        'Sistem arka planda web araştırması ve emsal karar taraması yapmaktadır.') };
                }
                return msg;
            });

            const responseStream = streamChatResponse(
                cleanedMessages,
                mergedAnalysisSummary,
                {
                    keywords: evidenceKeywords.join(', '),
                    searchSummary: mergedWebSearchResult?.summary || '',
                    legalSummary: buildLegalResultsPrompt(mergedLegalResults.slice(0, 3)),
                    webSources: (mergedWebSearchResult?.sources || []).slice(0, 4),
                    legalSearchResults: mergedLegalResults.slice(0, 3).map(r => ({
                        title: r.title, esasNo: r.esasNo, kararNo: r.kararNo, tarih: r.tarih,
                        ozet: (r.ozet || '').slice(0, 150),
                    })),
                    webSourceCount: mergedWebSearchResult?.sources?.length || 0,
                    legalResultCount: mergedLegalResults.length,
                    docContent: mergedDocContent,
                    specifics: specifics,
                    allowWebSearch: allowWebSearch,
                    allowLegalSearch: allowLegalSearch,
                    disableDocumentGeneration: false,
                },
                undefined
            );
            
            setChatMessages(prev => [...prev, { role: 'model', text: '' }]);
            
            for await (const chunk of responseStream) {
                const text = typeof chunk.text === 'string' ? chunk.text : chunk.candidates?.[0]?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join('') || '';
                
                if (chunk.functionCallResults && chunk.searchResults && (allowWebSearch || allowLegalSearch)) {
                    setChatProgressText('Emsal karar bağlama ekleniyor...');
                    const newResults = normalizeSharedLegalSearchResultsWrapper(chunk.searchResults);
                    mergedLegalResults = mergeUniqueLegalResults(mergedLegalResults, newResults);
                    setLegalSearchResults(mergedLegalResults);
                    setPrecedentContext(buildLegalResultsPrompt(mergedLegalResults));
                }

                if (text) {
                    assistantText += text;
                    setChatMessages(prev => prev.map((msg, idx) => idx === prev.length - 1 ? { ...msg, text: msg.text + text } : msg));
                }

                const functionCalls = Array.isArray(chunk.functionCalls) ? chunk.functionCalls : chunk.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall) || [];
                for (const fc of functionCalls) {
                    if (fc.name === 'generate_document') {
                        const payload = extractGeneratedDocumentPayload(fc.args);
                        if (payload) {
                            if (mergedAnalysisSummary || hasWebEvidence(mergedWebSearchResult) || hasLegalEvidenceForChat(mergedLegalResults)) {
                                setChatProgressText('Dilekçe oluşturuluyor...');
                                try {
                                    const generated = await generatePetition({
                                        userRole: UserRole.Vekil,
                                        petitionType: 'Genel Dilekce' as any,
                                        caseDetails: {} as any,
                                        analysisSummary: mergedAnalysisSummary || 'Kullanıcı chat talebi',
                                        searchKeywords: mergedKeywords,
                                        webSearchResult: mergedWebSearchResult?.summary || '',
                                        webSources: mergedWebSearchResult?.sources || [],
                                        legalSearchResult: buildLegalResultsPrompt(mergedLegalResults),
                                        legalSearchResults: mergedLegalResults,
                                        docContent: mergedDocContent, specifics: specifics, chatHistory: newMessages, parties: {},
                                        webSourceCount: mergedWebSearchResult?.sources?.length || 0,
                                        legalResultCount: mergedLegalResults.length,
                                    });
                                    addToast(`Dilekçe başarıyla oluşturuldu: ${payload.title}`, 'success');
                                    const note = `\n\n[Dilekçe/Belge Oluşturuldu: ${payload.title}]\n\n${generated}`;
                                    assistantText += note;
                                    setChatMessages(prev => prev.map((msg, idx) => idx === prev.length - 1 ? { ...msg, text: msg.text + note } : msg));
                                } catch (genErr) {
                                    console.error('generatePetition error', genErr);
                                    addToast(`Hızlı modda dilekçe oluşturuldu: ${payload.title}`, 'success');
                                    const note = `\n\n[Dilekçe/Belge Oluşturuldu: ${payload.title}]\n\n${payload.content}`;
                                    assistantText += note;
                                    setChatMessages(prev => prev.map((msg, idx) => idx === prev.length - 1 ? { ...msg, text: msg.text + note } : msg));
                                }
                            } else {
                                addToast(`Dilekçe taslağı oluşturuldu: ${payload.title}`, 'success');
                                const note = `\n\n[Dilekçe/Belge Oluşturuldu: ${payload.title}]\n\n${payload.content}`;
                                assistantText += note;
                                setChatMessages(prev => prev.map((msg, idx) => idx === prev.length - 1 ? { ...msg, text: msg.text + note } : msg));
                            }
                        }
                    }
                }
            }
        } catch (e: any) {
            setError(e.message);
            setChatMessages(prev => prev.slice(0, -1));
        } finally {
            setIsLoadingChat(false);
            setChatProgressText('');
        }
    }, [chatMessages, analysisData, searchKeywords, webSearchResult, legalSearchResults, docContent, specifics, runLegalSearch, addToast, searchLegalFromIntent]);

    return (
        <div className="min-h-screen bg-[#0F0F11] font-sans flex flex-col text-gray-300">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <Header />

            <div className="bg-gradient-to-br from-[#111113] via-[#0A0A0B] to-black text-white pt-10 pb-16 px-4 shrink-0 relative overflow-hidden border-b border-white/5">
                <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-red-600/10 to-transparent pointer-events-none"></div>
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-red-500/5 rounded-full blur-3xl pointer-events-none"></div>
                
                <div className="relative max-w-4xl mx-auto flex items-center gap-4">
                    <div className="inline-flex items-center justify-center p-3 bg-[#1A1A1D] border border-white/10 rounded-full shadow-lg shadow-red-500/10 shrink-0">
                        <Scale className="w-8 h-8 text-red-500" />
                    </div>
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">
                            Yapay Zeka Asistanı
                        </h1>
                        <p className="text-gray-400 font-light">
                            Hukuki araştırma, analiz ve belge oluşturma işlemleriniz için serbest modda sohbet edin.
                        </p>
                    </div>
                </div>
            </div>

            <div className="relative z-10 -mt-8 px-4 sm:px-6 w-full max-w-5xl mx-auto flex-1 flex flex-col bg-[#0A0A0B] rounded-2xl shadow-2xl border border-white/5 overflow-hidden min-h-[600px] mb-12">
                {error && (
                    <div className="bg-red-900/40 border-l-4 border-red-500 p-4 m-4 rounded shrink-0">
                        <p className="text-sm font-bold text-red-400">Hata Oluştu</p>
                        <p className="text-sm text-red-300">{error}</p>
                    </div>
                )}
                <ChatView 
                    messages={chatMessages}
                    onSendMessage={handleSendChatMessage}
                    isLoading={isLoadingChat}
                    statusText={chatProgressText}
                    searchKeywords={searchKeywords}
                    setSearchKeywords={setSearchKeywords}
                    webSearchResult={webSearchResult}
                    setWebSearchResult={setWebSearchResult}
                    precedentContext={precedentContext}
                    setPrecedentContext={setPrecedentContext}
                    docContent={docContent}
                    setDocContent={setDocContent}
                    specifics={specifics}
                    setSpecifics={setSpecifics}
                />
            </div>
            
            <Footer />
        </div>
    );
}
