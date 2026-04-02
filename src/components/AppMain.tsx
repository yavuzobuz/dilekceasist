import React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import UTIF from 'utif2';
import mammoth from 'mammoth';
import { PetitionType, ChatMessage, UploadedFile, WebSearchResult, AnalysisData, UserRole, CaseDetails, LegalSearchResult } from '../../types';
import { analyzeDocuments, generateSearchKeywords, performWebSearch, generatePetition, streamChatResponse, rewriteText, reviewPetition } from '../../services/geminiService';
import { Header } from '../../components/Header';
import { InputPanel } from '../../components/InputPanel';
import { OutputPanel } from '../../components/OutputPanel';
import { PetitionView } from '../../components/PetitionView';
import { ProgressSummary } from '../../components/ProgressSummary';
import { ToastContainer, ToastType } from '../../components/Toast';
import { LegalSearchPanel } from './LegalSearchPanel';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { SparklesIcon } from '../../components/Icon';
import { Petition, supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { buildLegalResearchBatchMessage, detectLegalSearchIntent } from '../../lib/legal/chatLegalIntent';
import { useLegalSearch } from '../hooks/useLegalSearch';
import { buildLegalKeywordQuery, compactLegalSearchQuery, getLegalDocument, searchLegalDecisionsDetailed } from '../utils/legalSearch';
import { resolveLegalSourceForQuery } from '../utils/legalSource';
import { buildGeneratePetitionParams, buildLegalSearchResultSummary } from '../utils/petitionGeneration';
import {
  clearTransientStorageItem,
  readTransientStorageItem,
  TRANSIENT_STORAGE_KEYS,
  writeTransientStorageItem,
} from '../utils/transientStorage';
import { mergeAnalysisData, prepareChatAttachmentsForAnalysis } from '../utils/chatAttachmentProcessing';
import {
  buildMissingInfoQuestions,
  getMissingInfoAnswerCounts,
  mergeSpecificsWithChecklist,
} from '../../components/missingInfoChecklist';
import type { MissingInfoQuestion } from '../../components/missingInfoChecklist';
import EmsalPanel from '../components/EmsalPanel';

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

let toastIdCounter = 0;
const createToastId = (): string => {
  toastIdCounter += 1;
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${toastIdCounter}-${randomPart}`;
};

const hasWebEvidence = (result: WebSearchResult | null): boolean => {
  if (!result) return false;
  const summary = typeof result.summary === 'string' ? result.summary.trim() : '';
  const hasSummary = summary.length >= 40;
  const hasSource = Array.isArray(result.sources) && result.sources.some(source => typeof source?.uri === 'string' && source.uri.trim().length > 0);
  return hasSummary && hasSource;
};

const hasLegalEvidenceForGeneration = (results: LegalSearchResult[]): boolean =>
  buildLegalSearchResultSummary(results).trim().length > 0;

const getLegalResultIdentityKey = (result: Partial<LegalSearchResult>): string => {
  const documentId = String(result.documentId || '').trim();
  if (documentId && !/^(search-|legal-|ai-summary|sem-|template-decision-)/i.test(documentId)) {
    return `doc:${documentId}`;
  }

  return `meta:${result.title || ''}|${result.esasNo || ''}|${result.kararNo || ''}|${result.tarih || ''}`;
};

const mergeUniqueLegalResults = (existing: LegalSearchResult[], incoming: LegalSearchResult[]): LegalSearchResult[] => {
  const seen = new Set<string>();
  return [...existing, ...incoming].filter(result => {
    const key = getLegalResultIdentityKey(result);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildDecisionPreviewText = (value: string): string => {
  const plain = String(value || '')
    .replace(/[#*_>`-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plain) return '';
  if (plain.length <= 320) return plain;
  return `${plain.slice(0, 319).trim()}...`;
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

export const AppMain: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { search: searchLegalFromChat } = useLegalSearch();
  const petitionFromState = (location.state as { petition?: Petition })?.petition;

  // Inputs from user
  const [petitionType, setPetitionType] = useState<PetitionType>(
    petitionFromState?.petition_type as PetitionType || PetitionType.DavaDilekcesi
  );
  const [userRole, setUserRole] = useState<UserRole>(UserRole.Davaci);
  const [caseDetails, setCaseDetails] = useState<CaseDetails>({ caseTitle: '', court: '', fileNumber: '', decisionNumber: '', decisionDate: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [docContent, setDocContent] = useState('');
  const [specifics, setSpecifics] = useState('');
  const [parties, setParties] = useState<{ [key: string]: string }>({});
  const [missingInfoQuestions, setMissingInfoQuestions] = useState<MissingInfoQuestion[]>([]);
  const [missingInfoAnswers, setMissingInfoAnswers] = useState<Record<string, string>>({});
  const [hasScannedMissingInfo, setHasScannedMissingInfo] = useState(false);

  // Initialize chat messages from petition metadata or empty array
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    // If loaded from profile, use petition's chat history
    if (petitionFromState?.metadata?.chatHistory) {
      return petitionFromState.metadata.chatHistory;
    }
    return [];
  });

  // Step-by-step results
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [searchKeywords, setSearchKeywords] = useState<string[]>([]);
  const [webSearchResult, setWebSearchResult] = useState<WebSearchResult | null>(null);
  const [legalSearchResults, setLegalSearchResults] = useState<LegalSearchResult[]>([]);
  const [precedentContext, setPrecedentContext] = useState('');

  // Final output
  const [generatedPetition, setGeneratedPetition] = useState(
    petitionFromState?.content || ''
  );
  const [petitionVersion, setPetitionVersion] = useState(0);

  // Loading states for each step
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingPetition, setIsLoadingPetition] = useState(false);
  const [isReviewingPetition, setIsReviewingPetition] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isFullPageEditorMode, setIsFullPageEditorMode] = useState(false);
  const [editorReturnRoute, setEditorReturnRoute] = useState('/app');
  const [isLegalSearchOpen, setIsLegalSearchOpen] = useState(false);
  const [isEmsalPanelOpen, setIsEmsalPanelOpen] = useState(false);

  useEffect(() => {
    setPrecedentContext(buildLegalSearchResultSummary(legalSearchResults));
  }, [legalSearchResults]);

  const {
    totalUnanswered: missingInfoTotalUnansweredCount,
    blockingUnanswered: missingInfoBlockingUnansweredCount,
  } = getMissingInfoAnswerCounts(missingInfoQuestions, missingInfoAnswers);
  const specificsWithMissingInfo = mergeSpecificsWithChecklist(specifics, missingInfoQuestions, missingInfoAnswers);

  // Toast notifications
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: ToastType }>>([]);
  const addToast = useCallback((message: string, type: ToastType) => {
    const id = createToastId();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);


  // Load petition from state if provided (only on mount or when petitionFromState changes)
  useEffect(() => {
    const templateContent = readTransientStorageItem(TRANSIENT_STORAGE_KEYS.templateContent);
    const storedEditorReturnRoute = readTransientStorageItem(TRANSIENT_STORAGE_KEYS.editorReturnRoute);
    if (templateContent) {
      setGeneratedPetition(templateContent);
      setPetitionVersion(v => v + 1);
      setIsFullPageEditorMode(true);
      setEditorReturnRoute(storedEditorReturnRoute === '/alt-app' ? '/alt-app' : '/app');
      clearTransientStorageItem(TRANSIENT_STORAGE_KEYS.templateContent);
      clearTransientStorageItem(TRANSIENT_STORAGE_KEYS.editorReturnRoute);
      addToast('Şablon yüklendi! ?', 'success');
    } else if (petitionFromState) {
      setGeneratedPetition(petitionFromState.content || '');
      setPetitionVersion(v => v + 1);
      setEditorReturnRoute('/app');

      // Restore all context data from metadata
      const metadata = petitionFromState.metadata;
      if (metadata) {
        if (metadata.caseDetails) {
          setCaseDetails(prevDetails => ({ ...prevDetails, ...metadata.caseDetails }));
        }
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

      addToast('Dilekçe yüklendi.', 'success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petitionFromState?.id]); // Only re-run if petition ID changes

  const handleExitFullPageEditor = useCallback(() => {
    if (editorReturnRoute === '/alt-app') {
      if (generatedPetition?.trim()) {
        writeTransientStorageItem(TRANSIENT_STORAGE_KEYS.templateContent, generatedPetition);
      }
      navigate('/alt-app');
      return;
    }

    setIsFullPageEditorMode(false);
  }, [editorReturnRoute, generatedPetition, navigate]);

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0 && !docContent.trim()) {
      setError('Lutfen once analiz edilecek belge veya metin ekleyin.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    setAnalysisData(null);
    setParties({});
    setSearchKeywords([]);
    setWebSearchResult(null);
    setGeneratedPetition('');
    setMissingInfoQuestions([]);
    setMissingInfoAnswers({});
    setHasScannedMissingInfo(false);

    try {
      const allUploadedFiles: UploadedFile[] = [];
      let udfContent = '';
      let wordContent = '';
      let plainTextContent = docContent.trim()
        ? `\n\n--- Manuel Metin ---\n${docContent.trim()}`
        : '';
      const zip = new JSZip();

      for (const file of files) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (extension === 'pdf') {
          allUploadedFiles.push({
            name: file.name,
            mimeType: 'application/pdf',
            data: await fileToBase64(file),
          });
        } else if (extension === 'tif' || extension === 'tiff') {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const ifds = UTIF.decode(arrayBuffer);
            const firstPage = ifds[0];
            UTIF.decodeImage(arrayBuffer, firstPage);

            const rgba = UTIF.toRGBA8(firstPage);
            const canvas = document.createElement('canvas');
            canvas.width = firstPage.width;
            canvas.height = firstPage.height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              throw new Error('Canvas context olusturulamadi');
            }

            const imageData = ctx.createImageData(firstPage.width, firstPage.height);
            imageData.data.set(rgba);
            ctx.putImageData(imageData, 0, 0);

            const dataUrl = canvas.toDataURL('image/png');
            const base64Data = dataUrl.split(',')[1];

            allUploadedFiles.push({
              name: file.name,
              mimeType: 'image/png',
              data: base64Data,
            });
          } catch (tiffError) {
            console.error(`Error processing TIFF file ${file.name}:`, tiffError);
            setError(`TIFF dosyasi islenirken hata: ${file.name}`);
          }
        } else if (file.type.startsWith('image/')) {
          allUploadedFiles.push({
            name: file.name,
            mimeType: file.type,
            data: await fileToBase64(file),
          });
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
              xmlContent = 'UDF arsivi icinde .xml uzantili icerik dosyasi bulunamadi.';
            }

            udfContent += `\n\n--- UDF Belgesi: ${file.name} ---\n${xmlContent}`;
          } catch (zipError) {
            console.error(`Error processing UDF file ${file.name}:`, zipError);
            udfContent += `\n\n--- UDF Belgesi: ${file.name} (HATA) ---\nBu dosya gecerli bir UDF (ZIP) arsivi olarak islenemedi.`;
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
        } else if (extension === 'txt') {
          try {
            const textContent = await file.text();
            plainTextContent += `\n\n--- Metin Belgesi: ${file.name} ---\n${textContent}`;
          } catch (textError) {
            console.error(`Error processing text file ${file.name}:`, textError);
            plainTextContent += `\n\n--- Metin Belgesi: ${file.name} (HATA) ---\nBu metin dosyasi islenemedi.`;
          }
        }
      }

      const combinedWordText = [wordContent.trim(), plainTextContent.trim()].filter(Boolean).join('\n\n');
      const result = await analyzeDocuments(allUploadedFiles, udfContent.trim(), combinedWordText);
      setAnalysisData(result);
      if (result.caseDetails) {
        setCaseDetails(prevDetails => ({ ...prevDetails, ...result.caseDetails }));
      }
      addToast('Belgeler basariyla analiz edildi!', 'success');

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata olustu.';
      setError(`Belge analizi sirasinda bir hata olustu: ${errorMessage}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [files, docContent, addToast]);

  const handleRunMissingInfoScan = useCallback(() => {
    const nextQuestions = buildMissingInfoQuestions({
      petitionType,
      caseDetails,
      parties,
      analysisSummary: analysisData?.summary || '',
      docContent,
      specifics,
    });

    setMissingInfoQuestions(nextQuestions);
    setMissingInfoAnswers(prev => nextQuestions.reduce<Record<string, string>>((acc, question) => {
      const preservedAnswer = String(prev[question.id] || '').trim();
      if (preservedAnswer) {
        acc[question.id] = preservedAnswer;
      }
      return acc;
    }, {}));
    setHasScannedMissingInfo(true);

    if (nextQuestions.length === 0) {
      addToast('Eksik bilgi bulunmadi. Dilersen dogrudan uretime gecebilirsin.', 'success');
      return;
    }

    addToast(`${nextQuestions.length} soru uretildi. Bloklayici olanlari once cevaplayin.`, 'info');
  }, [petitionType, caseDetails, parties, analysisData, docContent, specifics, addToast]);

  const handleMissingInfoAnswerChange = useCallback((questionId: string, value: string) => {
    setMissingInfoAnswers(prev => ({
      ...prev,
      [questionId]: value,
    }));
  }, []);

  const addManualParty = (partyName: string) => {
    if (partyName && analysisData && !analysisData.potentialParties.includes(partyName)) {
      setAnalysisData({
        ...analysisData,
        potentialParties: [...analysisData.potentialParties, partyName]
      });
    }
  };

  const mergeLegalResults = useCallback((incoming: LegalSearchResult[]) => {
    if (incoming.length === 0) return;

    setLegalSearchResults(prev => mergeUniqueLegalResults(prev, incoming));
  }, []);

  const handleGenerateKeywords = useCallback(async () => {
    const keywordSeed = [
      analysisData?.summary || '',
      docContent || '',
      files.map(file => file.name).join(' '),
    ]
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!keywordSeed) {
      setError('Lutfen once belge/metin icerigi ekleyip analiz edin.');
      return;
    }

    setIsGeneratingKeywords(true);
    setError(null);
    setSearchKeywords([]);
    setWebSearchResult(null);

    try {
      const keywords = await generateSearchKeywords(keywordSeed, userRole);
      if (keywords.length === 0) {
        setError('Anahtar kelime uretilemedi. Analiz icerigini kontrol edip tekrar deneyin.');
        return;
      }

      setSearchKeywords(keywords);
      addToast('Anahtar kelimeler olusturuldu!', 'success');

      addToast('Ictihat aramasi baslatiliyor...', 'info');
      try {
        const baseSearchQuery = buildLegalKeywordQuery(keywords, { maxTerms: 8, maxLength: 220 }) || keywords.slice(0, 5).join(' ');
        const rawSearchQuery = [analysisData?.legalSearchPacket?.searchSeedText || '', baseSearchQuery]
          .filter(Boolean)
          .join(' ')
          .trim();
        const keyword = compactLegalSearchQuery(rawSearchQuery, { preserveKeywords: keywords }) || rawSearchQuery;
        const detailedResult = await searchLegalDecisionsDetailed({
          source: 'all',
          keyword,
          rawQuery: rawSearchQuery,
          legalSearchPacket: analysisData?.legalSearchPacket,
          userRole,
          apiBaseUrl: '',
        });
        const normalizedResults = detailedResult.normalizedResults as LegalSearchResult[];
        const newResults = await Promise.all(normalizedResults.map(async (result, index) => {
          const summary = String(result.ozet || (result as any).snippet || '').trim();
          if (summary || index >= 3) {
            return result;
          }

          try {
            const resolvedSource =
              String((result as any).source || '').trim() ||
              resolveLegalSourceForQuery(
                [
                  (result as any).source || '',
                  result.title || '',
                  result.daire || '',
                ],
                'all'
              );

            const content = await getLegalDocument({
              source: resolvedSource,
              documentId: (result as any).documentId || (result as any).id || `${result.title || 'karar'}-${index}`,
              title: result.title,
              esasNo: result.esasNo,
              kararNo: result.kararNo,
              tarih: result.tarih,
              daire: result.daire,
              ozet: result.ozet,
              snippet: (result as any).snippet,
              apiBaseUrl: '',
            });

            const preview = buildDecisionPreviewText(content || '');
            if (!preview) return result;

            return {
              ...result,
              ozet: result.ozet || preview,
              snippet: (result as any).snippet || preview,
            } as LegalSearchResult;
          } catch {
            return result;
          }
        }));

        if (newResults.length > 0) {
          mergeLegalResults(newResults);
          addToast(`${newResults.length} adet emsal karar bulundu!`, 'success');
        } else {
          addToast('Bu konuda emsal karar bulunamadi.', 'info');
        }
      } catch (searchError) {
        console.error('Auto legal search error:', searchError);
        const message = searchError instanceof Error ? searchError.message : 'Ictihat aramasi basarisiz oldu.';
        setError(`Ictihat aramasi sirasinda bir hata olustu: ${message}`);
        addToast('Ictihat aramasi tamamlanamadi.', 'warning');
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata olustu.';
      setError(`Anahtar kelime olusturulurken bir hata olustu: ${errorMessage}`);
    } finally {
      setIsGeneratingKeywords(false);
    }
  }, [analysisData, userRole, addToast, mergeLegalResults, docContent, files]);

  const handleSearch = useCallback(async () => {
    if (searchKeywords.length === 0) {
      setError('Lütfen önce web araması için anahtar kelimeler oluşturun veya girin.');
      return;
    }
    setIsSearching(true);
    setError(null);
    setWebSearchResult(null);
    setGeneratedPetition('');

    try {
      const result = await performWebSearch(searchKeywords);
      setWebSearchResult(result);
      addToast('Web araması tamamlandı.', 'success');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata oluştu.';
      setError(`Web araması sırasında bir hata oluştu: ${errorMessage}`);
    } finally {
      setIsSearching(false);
    }
  }, [searchKeywords]);

  // Handler to add legal content from LegalSearchPanel to petition
  const handleAddLegalContent = useCallback((text: string, resultData?: { title: string; esasNo?: string; kararNo?: string; tarih?: string; daire?: string; ozet?: string }) => {
    // Store structured data for petition generation
    if (resultData) {
      mergeLegalResults([resultData]);
    }
    // Also add text to petition if already generated
    if (generatedPetition) {
      setGeneratedPetition(prev => prev + text);
    }
    setIsLegalSearchOpen(false);
    addToast('İçtihat eklendi. Dilekçe oluştururken kullanılacak.', 'success');
  }, [generatedPetition, mergeLegalResults]);

  // Handler to remove a legal search result
  const handleRemoveLegalResult = useCallback((index: number) => {
    setLegalSearchResults(prev => prev.filter((_, i) => i !== index));
    addToast('İçtihat kaldırıldı.', 'info');
  }, [addToast]);

  const handleGeneratePetition = useCallback(async () => {
    if (!analysisData?.summary) {
      setError('Dilekçe oluşturmadan önce en azından belge analizi adımını tamamlamalısınız.');
      return;
    }
    if (missingInfoBlockingUnansweredCount > 0) {
      setError(`Eksikleri Tara alaninda ${missingInfoBlockingUnansweredCount} bloklayici soru bos. Lutfen once yanitlayin.`);
      return;
    }
    setIsLoadingPetition(true);
    setError(null);
    setGeneratedPetition('');

    try {
      const result = await generatePetition(buildGeneratePetitionParams({
        userRole,
        petitionType,
        caseDetails,
        analysisData,
        webSearchResult,
        legalSearchResults,
        docContent,
        specifics: specificsWithMissingInfo,
        searchKeywords,
        chatHistory: chatMessages,
        parties,
      }));
      setGeneratedPetition(result);
      setPetitionVersion(v => v + 1); // Increment version to force re-mount of editor
      setEditorReturnRoute('/app');
      setIsFullPageEditorMode(true); // Switch to full-page editor mode
      addToast('Dilekçe başarıyla oluşturuldu! âœ¨', 'success');

      // Save to Supabase if user is logged in
      if (user) {
        await savePetitionToSupabase(result, specificsWithMissingInfo);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata oluştu.';
      setError(`Dilekçe oluşturulurken bir hata oluştu: ${errorMessage}`);
    } finally {
      setIsLoadingPetition(false);
    }
  }, [userRole, petitionType, caseDetails, analysisData, webSearchResult, legalSearchResults, docContent, specificsWithMissingInfo, searchKeywords, chatMessages, parties, user, missingInfoBlockingUnansweredCount]);

  const savePetitionToSupabase = async (
    content: string,
    specificsOverride?: string,
    metadataOverrides?: Partial<{
      chatHistory: ChatMessage[];
      searchKeywords: string[];
      docContent: string;
      analysisData: AnalysisData | null;
      webSearchResult: WebSearchResult | null;
      legalSearchResults: LegalSearchResult[];
    }>
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase.from('petitions').insert([
        {
          user_id: user.id,
          title: `${petitionType} - ${new Date().toLocaleDateString('tr-TR')}`,
          petition_type: petitionType,
          content: content,
          status: 'completed', // Mark as completed so it appears in the pool
          metadata: {
            chatHistory: metadataOverrides?.chatHistory ?? chatMessages,
            caseDetails,
            parties,
            searchKeywords: metadataOverrides?.searchKeywords ?? searchKeywords,
            docContent: metadataOverrides?.docContent ?? docContent,
            specifics: specificsOverride ?? specifics,
            userRole,
            analysisData: metadataOverrides?.analysisData ?? analysisData,
            webSearchResult: metadataOverrides?.webSearchResult ?? webSearchResult,
            legalSearchResults: metadataOverrides?.legalSearchResults ?? legalSearchResults,
            lawyerInfo: metadataOverrides?.analysisData?.lawyerInfo ?? analysisData?.lawyerInfo,
            contactInfo: metadataOverrides?.analysisData?.contactInfo ?? analysisData?.contactInfo,
          },
        },
      ]);

      if (error) throw error;
      toast.success('Dilekçe kaydedildi');
    } catch (error: any) {
      console.error('Error saving petition:', error);
      toast.error('Dilekçe kaydedilemedi');
    }
  };

  const handleSendChatMessage = useCallback(async (message: string, files?: File[]) => {
    const normalizedMessage = String(message || '').trim();
    const chatSourceFiles = Array.isArray(files) ? files : [];
    let mergedAnalysisData = analysisData;
    let mergedAnalysisSummary = analysisData?.summary || '';
    let mergedDocContent = docContent;
    let mergedWebSearchResult = webSearchResult;
    let mergedLegalResults = [...legalSearchResults];

    const userMessage: ChatMessage = {
      role: 'user',
      text: message || (chatSourceFiles.length > 0 ? `${chatSourceFiles.length} dosya yüklendi${message ? ': ' + message : ''}` : ''),
    };
    const newMessages: ChatMessage[] = [...chatMessages, userMessage];
    setChatMessages(newMessages);
    setIsLoadingChat(true);
    setError(null);

    try {
      let chatAnalyzeFailureMessage = '';
      if (chatSourceFiles.length > 0) {
        const preparedAttachments = await prepareChatAttachmentsForAnalysis(chatSourceFiles);

        if (preparedAttachments.skippedFileNames.length > 0) {
          const previewNames = preparedAttachments.skippedFileNames.slice(0, 3).join(', ');
          const remainingCount = preparedAttachments.skippedFileNames.length - 3;
          const remainingSuffix = remainingCount > 0 ? ` +${remainingCount} dosya` : '';
          addToast(`Bazı dosyalar sohbet analizine eklenemedi: ${previewNames}${remainingSuffix}.`, 'warning');
        }

        const hasPreparedContent = preparedAttachments.uploadedFiles.length > 0
          || Boolean(preparedAttachments.udfTextContent)
          || Boolean(preparedAttachments.wordTextContent);

        if (hasPreparedContent) {
          const chatAnalysis = await analyzeDocuments(
            preparedAttachments.uploadedFiles,
            preparedAttachments.udfTextContent,
            preparedAttachments.wordTextContent
          );
          mergedAnalysisData = mergeAnalysisData(analysisData, chatAnalysis);
          mergedAnalysisSummary = mergedAnalysisData?.summary || '';

          setAnalysisData(mergedAnalysisData);
          const mergedCaseDetails = mergedAnalysisData?.caseDetails;
          if (mergedCaseDetails) {
            setCaseDetails(prev => ({ ...prev, ...mergedCaseDetails }));
          }

          const extractedContextText = [
            preparedAttachments.udfTextContent,
            preparedAttachments.wordTextContent,
          ].filter(Boolean).join('\n\n').trim();

          const chatAnalysisSummary = String(chatAnalysis?.summary || '').trim();
          const processedFileLabel = preparedAttachments.processedFileNames.join(', ') || chatSourceFiles.map(file => file.name).join(', ');
          const analysisContextBlock = chatAnalysisSummary
            ? [
              '--- Sohbet Belge Analizi ---',
              processedFileLabel ? `Dosyalar: ${processedFileLabel}` : '',
              chatAnalysisSummary,
            ].filter(Boolean).join('\n')
            : '';

          const nextContextBlocks = [mergedDocContent];
          if (analysisContextBlock && !mergedDocContent.includes(analysisContextBlock)) {
            nextContextBlocks.push(analysisContextBlock);
          }
          if (extractedContextText && !mergedDocContent.includes(extractedContextText)) {
            nextContextBlocks.push(extractedContextText);
          }
          const nextMergedDocContent = nextContextBlocks.filter(Boolean).join('\n\n').trim();
          if (nextMergedDocContent !== mergedDocContent) {
            mergedDocContent = nextMergedDocContent;
            setDocContent(mergedDocContent);
          }

          addToast('Yuklenen sohbet belgeleri OCR ve belge analizi ile baglama eklendi.', 'info');
        }
        if (!mergedAnalysisSummary.trim()) {
          chatAnalyzeFailureMessage = 'Yuklenen belge analizi tamamlanamadi veya baglama eklenemedi. Lutfen belgeyi tekrar deneyin ya da once Belgeleri Analiz Et adimini calistirin.';
        }
      }

      if (chatAnalyzeFailureMessage) {
        setChatMessages(prev => [...prev, { role: 'model', text: chatAnalyzeFailureMessage }]);
        setError(chatAnalyzeFailureMessage);
        return;
      }

      if (detectLegalSearchIntent(normalizedMessage)) {
        const firstAttachment = chatSourceFiles[0];
        const documentBase64 = firstAttachment ? await fileToBase64(firstAttachment) : undefined;
        const searchedResults = await searchLegalFromChat({
          text: normalizedMessage || undefined,
          documentBase64,
          mimeType: firstAttachment?.type || undefined,
        });

        if (searchedResults.length > 0) {
          mergedLegalResults = mergeUniqueLegalResults(mergedLegalResults, searchedResults);
          setLegalSearchResults(mergedLegalResults);

          const batchMessage = buildLegalResearchBatchMessage(searchedResults);
          if (batchMessage) {
            setChatMessages(prev => [...prev, { role: 'model', text: batchMessage }]);
          }

          addToast(`${searchedResults.length} adet emsal karar bulundu.`, 'success');
        }

        return;
      }

      const chatHistoryForApi = newMessages.map(({ files: _files, ...msg }) => msg);

      const responseStream = streamChatResponse(
        chatHistoryForApi,
        mergedAnalysisSummary,
        {
          keywords: searchKeywords.join(', '),
          searchSummary: mergedWebSearchResult?.summary || '',
          legalSummary: buildLegalSearchResultSummary(mergedLegalResults),
          webSources: mergedWebSearchResult?.sources || [],
          legalSearchResults: mergedLegalResults,
          webSourceCount: mergedWebSearchResult?.sources?.length || 0,
          legalResultCount: mergedLegalResults.length,
          docContent: mergedDocContent,
          specifics: specificsWithMissingInfo,
          analysisSummary: mergedAnalysisSummary,
          currentDraft: generatedPetition || '',
          petitionType,
        },
        undefined
      );
      const modelMessage: ChatMessage = { role: 'model', text: '' };
      setChatMessages(prev => [...prev, modelMessage]);

      let functionCallDetected = false;
      let addedKeywordsCount = 0;
      let generatedDocument = false;

      for await (const chunk of responseStream) {
        if (import.meta.env.DEV) {
          console.warn('[Chat Chunk]', JSON.stringify(chunk).substring(0, 500));
        }

        // Handle search results from function call (search_yargitay)
        if (chunk.functionCallResults && chunk.searchResults) {
          if (import.meta.env.DEV) {
            console.warn('[AI Search Results]', chunk.searchResults);
          }
          // Add search results to legalSearchResults state
          const newResults = chunk.searchResults.map((result: any) => ({
            title: result.title || 'Yargıtay Kararı',
            esasNo: result.esasNo,
            kararNo: result.kararNo,
            tarih: result.tarih,
            daire: result.daire,
            ozet: result.ozet,
            relevanceScore: result.relevanceScore,
          }));
          if (newResults.length > 0) {
            const seen = new Set<string>();
            mergedLegalResults = [...mergedLegalResults, ...newResults].filter((result: any) => {
              const key = `${result.title || ''}|${result.esasNo || ''}|${result.kararNo || ''}|${result.tarih || ''}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            mergeLegalResults(newResults);
            addToast(`${newResults.length} adet emsal karar bulundu.`, 'success');
          }
        }

        // Check if there are non-text parts (thoughtSignature, functionCall, etc.)
        // These are internal API metadata and can be safely logged/ignored
        const candidate = chunk.candidates?.[0];
        const hasNonTextParts = candidate?.content?.parts?.some((part: any) =>
          !part.text && (part.thoughtSignature || part.functionCall || part.executableCode)
        );

        if (hasNonTextParts) {
          if (import.meta.env.DEV) {
            console.warn('[AI Response] Contains non-text parts (internal metadata) - processing text and function calls');
          }
        }

        // Extract text from chunk - handle both direct text and candidates structure
        const getText = (c: any): string => {
          // Try direct text property first
          if (c.text) return c.text;
          // Try extracting from candidates
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
          setChatMessages(prev => prev.map((msg, index) =>
            index === prev.length - 1 ? { ...msg, text: msg.text + chunkText } : msg
          ));
        }

        // Handle function call chunks - extract from candidates structure
        const getFunctionCalls = (c: any): any[] => {
          if (c.functionCalls) return c.functionCalls;
          if (c.candidates?.[0]?.content?.parts) {
            return c.candidates[0].content.parts
              .filter((p: any) => p.functionCall)
              .map((p: any) => p.functionCall);
          }
          return [];
        };

        const functionCalls = getFunctionCalls(chunk);
        if (functionCalls.length > 0) {
          for (const fc of functionCalls) {
            if (fc.name === 'update_search_keywords') {
              functionCallDetected = true;
              // Type guard to ensure args and keywordsToAdd are valid
              const args = fc.args as { keywordsToAdd?: string[] };
              const { keywordsToAdd } = args;
              if (Array.isArray(keywordsToAdd) && keywordsToAdd.length > 0) {
                addedKeywordsCount += keywordsToAdd.length;
                setSearchKeywords(prev => [...new Set([...prev, ...keywordsToAdd])]);
              }
            }

            // Handle document generation from chat
            if (fc.name === 'generate_document') {
              const effectiveAnalysisData = mergedAnalysisData || analysisData;
              const canGenerateDocument = Boolean(
                effectiveAnalysisData?.summary
                && hasWebEvidence(mergedWebSearchResult)
                && hasLegalEvidenceForGeneration(mergedLegalResults)
                && missingInfoBlockingUnansweredCount === 0
              );

              if (!canGenerateDocument) {
                const missingInfoText = missingInfoBlockingUnansweredCount > 0
                  ? ` Eksikleri Tara alaninda ${missingInfoBlockingUnansweredCount} bloklayici soru bos. Lutfen once yanitlayin.`
                  : '';
                const blockedText = `Belge olusturma engellendi. Web arastirmasi, emsal kararlar veya analiz ozeti eksik.${missingInfoText}`;
                setError(blockedText);
                setChatMessages(prev => prev.map((msg, index) =>
                  index === prev.length - 1
                    ? { ...msg, text: `${msg.text}\n\n${blockedText}`.trim() }
                    : msg
                ));
                continue;
              }

              const payload = extractGeneratedDocumentPayload(fc.args);
              if (!payload || generatedDocument || !effectiveAnalysisData) {
                continue;
              }

              const authoritativePetition = await generatePetition(buildGeneratePetitionParams({
                userRole,
                petitionType,
                caseDetails,
                analysisData: effectiveAnalysisData,
                webSearchResult: mergedWebSearchResult,
                legalSearchResults: mergedLegalResults,
                docContent: mergedDocContent,
                specifics: specificsWithMissingInfo,
                searchKeywords,
                chatHistory: [...newMessages, { role: 'model', text: payload.content }],
                parties,
              }));

              generatedDocument = true;

              // Set the generated petition
              setGeneratedPetition(authoritativePetition);
              setPetitionVersion(v => v + 1);

              // Persist chat-generated petition for profile history
              if (user) {
                await savePetitionToSupabase(authoritativePetition, specificsWithMissingInfo, {
                  chatHistory: [...newMessages, { role: 'model', text: authoritativePetition }],
                  searchKeywords,
                  docContent: mergedDocContent,
                  analysisData: effectiveAnalysisData,
                  webSearchResult: mergedWebSearchResult,
                  legalSearchResults: mergedLegalResults,
                });
              }

              // Show success message in chat
              setChatMessages(prev => prev.map((msg, index) =>
                index === prev.length - 1
                  ? { ...msg, text: msg.text + `\n\n${payload.title} olusturuldu.\n\nBelge "Olusturulan Dilekce" bolumune eklendi. Duzenlemek, indirmek veya tam sayfa goruntulemek icin bu bolumu kullanabilirsiniz.` }
                  : msg
              ));

              addToast(`${payload.title} olusturuldu.`, 'success');
            }
          }
        }
      }

      // If function was called but no text was returned, add a confirmation message
      if (functionCallDetected && addedKeywordsCount > 0 && !generatedDocument) {
        setChatMessages(prev => prev.map((msg, index) =>
          index === prev.length - 1 && msg.text.trim() === ''
            ? { ...msg, text: `âœ… ${addedKeywordsCount} adet anahtar kelime eklendi. Anahtar kelimeleri "Belge Analizi ve Anahtar Kelimeler" bölümünden görebilirsiniz.` }
            : msg
        ));
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata oluştu.';
      setError(`Sohbet sırasında bir hata oluştu: ${errorMessage}`);
      setChatMessages(prev => prev.slice(0, -1)); // Remove the empty model message on error
    } finally {
      setIsLoadingChat(false);
    }
  }, [chatMessages, analysisData, searchKeywords, webSearchResult, legalSearchResults, docContent, specificsWithMissingInfo, mergeLegalResults, addToast, user, savePetitionToSupabase, missingInfoBlockingUnansweredCount, generatedPetition, petitionType, searchLegalFromChat]);

  const handleRewriteText = useCallback(async (text: string): Promise<string> => {
    setError(null);
    try {
      const rewrittenText = await rewriteText(text);
      return rewrittenText;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata oluştu.';
      setError(`Metin yeniden yazılırken bir hata oluştu: ${errorMessage}`);
      throw e; // Re-throw to be caught by the calling component
    }
  }, []);

  const handleReviewPetition = useCallback(async () => {
    if (!generatedPetition) {
      setError('İyileştirilecek bir dilekçe taslağı bulunmuyor.');
      return;
    }
    if (!analysisData?.summary) {
      setError('Dilekçe bağlamı (analiz özeti) olmadan iyileştirme yapılamaz.');
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
      addToast('Dilekçe gözden geçirildi ve iyileştirildi.', 'success');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata oluştu.';
      setError(`Dilekçe gözden geçirilirken bir hata oluştu: ${errorMessage}`);
    } finally {
      setIsReviewingPetition(false);
    }
  }, [generatedPetition, userRole, petitionType, caseDetails, analysisData, webSearchResult, docContent, specifics, chatMessages, parties]);

  const handleReset = useCallback(() => {
    setPetitionType(PetitionType.DavaDilekcesi);
    setUserRole(UserRole.Davaci);
    setCaseDetails({ caseTitle: '', court: '', fileNumber: '', decisionNumber: '', decisionDate: '' });
    setFiles([]);
    setDocContent('');
    setSpecifics('');
    setParties({});
    setMissingInfoQuestions([]);
    setMissingInfoAnswers({});
    setHasScannedMissingInfo(false);
    setChatMessages([]);
    setAnalysisData(null);
    setSearchKeywords([]);
    setWebSearchResult(null);
    setGeneratedPetition('');
    setPetitionVersion(0);
    setError(null);
    setIsFullPageEditorMode(false); // Exit full-page mode

    addToast('Yeni dilekçe için hazırsınız.', 'info');
  }, [addToast]);

  // Show login prompt if user is not logged in (except when loading from profile)
  if (!user && !petitionFromState) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-gray-200 flex flex-col font-sans">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <Header onShowLanding={() => navigate('/')} />
        <div className="flex-grow flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-[#111113] rounded-lg border border-white/10 p-8 text-center">
            <div className="text-6xl mb-6">??</div>
            <h2 className="text-2xl font-bold text-white mb-4">Giriş Gerekli</h2>
            <p className="text-gray-300 mb-6">
              Dilekçe oluşturmak için önce giriş yapmanız gerekiyor.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => navigate('/login')}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-semibold"
              >
                Giriş Yap
              </button>
              <button
                onClick={() => navigate('/register')}
                className="flex-1 px-6 py-3 bg-[#1A1A1D] hover:bg-[#1C1C1F] text-white rounded-lg transition-colors font-semibold"
              >
                Kayıt Ol
              </button>
            </div>
            <button
              onClick={() => navigate('/pool')}
              className="mt-4 text-gray-400 hover:text-white transition-colors text-sm"
            >
              Veya Dilekçe Havuzuna göz at ›
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Full-page editor mode render - Clean and spacious design
  if (isFullPageEditorMode && generatedPetition) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-gray-200 flex flex-col font-sans">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <Header onShowLanding={() => navigate('/')} />

        {/* Compact Action Bar */}
        <div className="bg-[#111113]/90 border-b border-white/10 backdrop-blur-sm sticky top-16 z-40">
          <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-2 sm:py-3 flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={handleExitFullPageEditor}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#1A1A1D] hover:bg-[#1C1C1F] text-white rounded-lg transition-all font-medium text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">Düzenlemeye Geri Dön</span>
            </button>

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <button
                onClick={handleReviewPetition}
                disabled={isReviewingPetition}
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all text-sm"
              >
                {isReviewingPetition ? (
                  <>
                    <LoadingSpinner className="h-4 w-4" />
                    <span className="hidden sm:inline">İyileştiriliyor...</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Taslağı İyileştir</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setIsLegalSearchOpen(true)}
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-all text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
                <span className="hidden sm:inline">İçtihat Ara</span>
              </button>

              <button
                onClick={handleReset}
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-[#1A1A1D] hover:bg-[#1C1C1F] text-white rounded-lg transition-all font-medium text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Yeni Dilekçe</span>
              </button>
            </div>
          </div>
        </div>

        {/* Full-width petition editor */}
        <div className="flex-grow overflow-hidden">
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

        {error && (
          <div className="fixed bottom-4 right-4 bg-red-800 text-white p-4 rounded-lg shadow-lg max-w-sm z-50">
            <h4 className="font-bold mb-2">Hata</h4>
            <p>{error}</p>
            <button onClick={() => setError(null)} className="absolute top-2 right-2 text-xl">&times;</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-gray-200 flex flex-col font-sans">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Header onShowLanding={() => navigate('/')} />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ProgressSummary
          petitionType={petitionType}
          userRole={userRole}
          caseDetails={caseDetails}
          parties={parties}
          files={files}
          analysisData={analysisData}
          webSearchResult={webSearchResult}
          generatedPetition={generatedPetition}
        />
        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setIsEmsalPanelOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            {isEmsalPanelOpen ? 'Emsal Panelini Kapat' : 'Emsal Ara'}
          </button>
        </div>

        <main className={isEmsalPanelOpen ? 'py-8 grid grid-cols-1 gap-8 items-start xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]' : 'py-8'}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start min-w-0">
            <InputPanel
              petitionType={petitionType}
              setPetitionType={setPetitionType}
              userRole={userRole}
              setUserRole={setUserRole}
              caseDetails={caseDetails}
              setCaseDetails={setCaseDetails}
              files={files}
              setFiles={setFiles}

              onAnalyze={handleAnalyze}
              isAnalyzing={isAnalyzing}
              analysisData={analysisData}
              addManualParty={addManualParty}

              onGenerateKeywords={handleGenerateKeywords}
              isGeneratingKeywords={isGeneratingKeywords}
              searchKeywords={searchKeywords}
              setSearchKeywords={setSearchKeywords}

              onSearch={handleSearch}
              isSearching={isSearching}
              webSearchResult={webSearchResult}
              onOpenLegalSearch={() => setIsLegalSearchOpen(true)}
              legalSearchResults={legalSearchResults}
              onRemoveLegalResult={handleRemoveLegalResult}

              docContent={docContent}
              setDocContent={setDocContent}
              specifics={specifics}
              setSpecifics={setSpecifics}
              missingInfoQuestions={missingInfoQuestions}
              missingInfoAnswers={missingInfoAnswers}
              hasScannedMissingInfo={hasScannedMissingInfo}
              onRunMissingInfoScan={handleRunMissingInfoScan}
              onMissingInfoAnswerChange={handleMissingInfoAnswerChange}
              missingInfoBlockingUnansweredCount={missingInfoBlockingUnansweredCount}
              missingInfoTotalUnansweredCount={missingInfoTotalUnansweredCount}
              parties={parties}
              setParties={setParties}

              onGenerate={handleGeneratePetition}
              isLoading={isLoadingPetition}
            />
            <OutputPanel
              petitionVersion={petitionVersion}
              generatedPetition={generatedPetition}
              setGeneratedPetition={setGeneratedPetition}
              onRewrite={handleRewriteText}
              sources={webSearchResult?.sources || []}
              isLoadingPetition={isLoadingPetition}
              onReview={handleReviewPetition}
              isReviewing={isReviewingPetition}
              chatMessages={chatMessages}
              onSendMessage={handleSendChatMessage}
              isLoadingChat={isLoadingChat}
              // Pass context and setters to chat
              // Branding props
              officeLogoUrl={profile?.office_logo_url}
              corporateHeader={profile?.corporate_header}

              // Chat context
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

              onReset={handleReset}
              onExpandFullPage={() => {
                setEditorReturnRoute('/app');
                setIsFullPageEditorMode(true);
              }}
            />
          </div>

          {isEmsalPanelOpen ? (
            <aside className="min-w-0">
              <div className="sticky top-6 rounded-3xl border border-white/10 bg-[#0f1115] shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Emsal Paneli</h3>
                    <p className="text-xs text-gray-500">Yan panelden karar arayın.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEmsalPanelOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                  >
                    Kapat
                  </button>
                </div>
                <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-3">
                  <EmsalPanel />
                </div>
              </div>
            </aside>
          ) : null}
        </main>
      </div>
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-800 text-white p-4 rounded-lg shadow-lg max-w-sm z-50">
          <h4 className="font-bold mb-2">Hata</h4>
          <p>{error}</p>
          <button onClick={() => setError(null)} className="absolute top-2 right-2 text-xl">&times;</button>
        </div>
      )}

      {/* Legal Search Panel Modal */}
      <LegalSearchPanel
        isOpen={isLegalSearchOpen}
        onClose={() => setIsLegalSearchOpen(false)}
        onAddToPetition={handleAddLegalContent}
        initialKeywords={searchKeywords}
      />
    </div>
  );
};
