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
import { buildLegalKeywordQuery, searchLegalDecisions } from '../utils/legalSearch';
import { resolveLegalSourceForQuery } from '../utils/legalSource';
import {
  clearTransientStorageItem,
  readTransientStorageItem,
  TRANSIENT_STORAGE_KEYS,
  writeTransientStorageItem,
} from '../utils/transientStorage';
import {
  buildMissingInfoQuestions,
  getMissingInfoAnswerCounts,
  mergeSpecificsWithChecklist,
} from '../../components/missingInfoChecklist';
import type { MissingInfoQuestion } from '../../components/missingInfoChecklist';

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

const CHAT_INLINE_SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
]);

const normalizeChatMimeType = (value: string): string => String(value || '')
  .split(';')[0]
  .trim()
  .toLowerCase();

const isChatMimeTypeSupported = (mimeType: string): boolean => {
  const normalized = normalizeChatMimeType(mimeType);
  if (!normalized) return false;
  return CHAT_INLINE_SUPPORTED_MIME_TYPES.has(normalized) || normalized.startsWith('text/');
};

const resolveChatMimeType = (file: File): string => {
  const directType = typeof file.type === 'string' ? file.type.trim() : '';
  if (directType) return normalizeChatMimeType(directType);

  const lowerName = String(file.name || '').toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.udf')) return 'application/zip';
  if (lowerName.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lowerName.endsWith('.doc')) return 'application/msword';
  if (lowerName.endsWith('.txt')) return 'text/plain';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.tif') || lowerName.endsWith('.tiff')) return 'image/tiff';

  return 'application/octet-stream';
};

let toastIdCounter = 0;
const createToastId = (): string => {
  toastIdCounter += 1;
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${toastIdCounter}-${randomPart}`;
};

const sanitizeChatFilesForApi = (
  files?: { name: string; mimeType: string; data: string }[]
): { name: string; mimeType: string; data: string }[] | undefined => {
  if (!Array.isArray(files) || files.length === 0) return undefined;
  const sanitized = files
    .map(file => ({
      name: String(file?.name || '').trim(),
      mimeType: normalizeChatMimeType(file?.mimeType || ''),
      data: typeof file?.data === 'string' ? file.data.trim() : '',
    }))
    .filter(file => Boolean(file.name) && Boolean(file.data) && isChatMimeTypeSupported(file.mimeType));

  return sanitized.length > 0 ? sanitized : undefined;
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
              mimeType: 'image/png',
              data: base64Data,
            });
          } catch (tiffError) {
            console.error(`Error processing TIFF file ${file.name}:`, tiffError);
            setError(`TIFF dosyasi islenirken hata: ${file.name}`);
          }
        } else if (file.type.startsWith('image/')) {
          allUploadedFiles.push({
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
        const searchQuery = buildLegalKeywordQuery(keywords, { maxTerms: 8, maxLength: 220 }) || keywords.slice(0, 5).join(' ');
        const resolvedSource = resolveLegalSourceForQuery(searchQuery, 'all');
        const newResults = await searchLegalDecisions({
          source: resolvedSource,
          keyword: searchQuery,
        });

        if (newResults.length > 0) {
          mergeLegalResults(newResults);
          addToast(`${newResults.length} adet emsal karar bulundu!`, 'success');
        } else {
          addToast('Bu konuda emsal karar bulunamadi.', 'info');
        }
      } catch (searchError) {
        console.error('Auto legal search error:', searchError);
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
      // Format legal search results for the prompt
      const legalResultsText = legalSearchResults.length > 0
        ? legalSearchResults.map(r =>
          `- ${r.title || 'Karar'} ${r.esasNo ? `E.${r.esasNo}` : ''} ${r.kararNo ? `K.${r.kararNo}` : ''} ${r.tarih || ''}: ${r.ozet || ''}`
        ).join('\n')
        : '';

      const result = await generatePetition({
        userRole,
        petitionType,
        caseDetails,
        analysisSummary: analysisData.summary,
        webSearchResult: webSearchResult?.summary || '',
        legalSearchResult: legalResultsText, // Add legal search results
        docContent,
        specifics: specificsWithMissingInfo,
        searchKeywords,
        chatHistory: chatMessages,
        parties,
        webSourceCount: webSearchResult?.sources?.length || 0,
        legalResultCount: legalSearchResults.length,
        lawyerInfo: analysisData.lawyerInfo,
        contactInfo: analysisData.contactInfo,
      });
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

  const savePetitionToSupabase = async (content: string, specificsOverride?: string) => {
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
            chatHistory: chatMessages,
            caseDetails,
            parties,
            searchKeywords,
            docContent,
            specifics: specificsOverride ?? specifics,
            userRole,
            analysisData,
            webSearchResult,
            legalSearchResults,
            lawyerInfo: analysisData?.lawyerInfo,
            contactInfo: analysisData?.contactInfo,
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
    // Convert files to base64 if provided
    const chatSourceFiles = Array.isArray(files) ? files : [];
    let chatFiles: { name: string; mimeType: string; data: string }[] = [];
    const skippedChatFileNames: string[] = [];
    if (chatSourceFiles.length > 0) {
      const preparedFiles = await Promise.all(
        chatSourceFiles.map(async (file) => {
          const resolvedMimeType = normalizeChatMimeType(resolveChatMimeType(file));
          if (!isChatMimeTypeSupported(resolvedMimeType)) {
            skippedChatFileNames.push(file.name || 'isimsiz dosya');
            return null;
          }

          return {
            name: file.name,
            mimeType: resolvedMimeType,
            data: await fileToBase64(file),
          };
        })
      );

      chatFiles = preparedFiles.filter((file): file is { name: string; mimeType: string; data: string } => Boolean(file));
    }

    if (skippedChatFileNames.length > 0) {
      const previewNames = skippedChatFileNames.slice(0, 3).join(', ');
      const remainingCount = skippedChatFileNames.length - 3;
      const remainingSuffix = remainingCount > 0 ? ` +${remainingCount} dosya` : '';
      addToast(`Bazı dosyalar sohbet ekine eklenemedi: ${previewNames}${remainingSuffix}.`, 'warning');
    }

    const userMessage: ChatMessage = {
      role: 'user',
      text: message || (chatSourceFiles.length > 0 ? `${chatSourceFiles.length} dosya yüklendi${message ? ': ' + message : ''}` : ''),
      files: chatFiles.length > 0 ? chatFiles : undefined
    };
    const newMessages: ChatMessage[] = [...chatMessages, userMessage];
    setChatMessages(newMessages);
    setIsLoadingChat(true);
    setError(null);

    try {
      const chatHistoryForApi = newMessages.map(msg => ({
        ...msg,
        files: sanitizeChatFilesForApi(msg.files),
      }));

      const responseStream = streamChatResponse(
        chatHistoryForApi,
        analysisData?.summary || '',
        {
          keywords: searchKeywords.join(', '),
          searchSummary: webSearchResult?.summary || '',
          legalSummary: legalSearchResults.length > 0
            ? legalSearchResults
              .map(r => `${r.title || 'Karar'} ${r.esasNo ? `E.${r.esasNo}` : ''} ${r.kararNo ? `K.${r.kararNo}` : ''} ${r.tarih || ''}: ${r.ozet || ''}`)
              .join('\n')
            : '',
          webSourceCount: webSearchResult?.sources?.length || 0,
          legalResultCount: legalSearchResults.length,
          docContent: docContent,
          specifics: specificsWithMissingInfo,
          analysisSummary: analysisData?.summary || '',
          currentDraft: generatedPetition || '',
          petitionType,
        },
        sanitizeChatFilesForApi(chatFiles)
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
              if (missingInfoBlockingUnansweredCount > 0) {
                const blockedText = `Belge olusturma engellendi. Eksikleri Tara alaninda ${missingInfoBlockingUnansweredCount} bloklayici soru bos. Lutfen once yanitlayin.`;
                setError(blockedText);
                setChatMessages(prev => prev.map((msg, index) =>
                  index === prev.length - 1
                    ? { ...msg, text: `${msg.text}\n\n${blockedText}`.trim() }
                    : msg
                ));
                continue;
              }

              const payload = extractGeneratedDocumentPayload(fc.args);
              if (!payload || generatedDocument) {
                continue;
              }

              generatedDocument = true;

              // Set the generated petition
              setGeneratedPetition(payload.content);
              setPetitionVersion(v => v + 1);

              // Persist chat-generated petition for profile history
              if (user) {
                await savePetitionToSupabase(payload.content, specificsWithMissingInfo);
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
  }, [chatMessages, analysisData, searchKeywords, webSearchResult, legalSearchResults, docContent, specificsWithMissingInfo, mergeLegalResults, addToast, user, savePetitionToSupabase, missingInfoBlockingUnansweredCount, generatedPetition, petitionType]);

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
    // Reset all state
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
        <main className="py-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
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




