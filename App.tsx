
import React from 'react';
import { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import UTIF from 'utif2';
import mammoth from 'mammoth';
import { PetitionType, ChatMessage, UploadedFile, WebSearchResult, AnalysisData, UserRole, CaseDetails } from './types';
import { analyzeDocuments, generateSearchKeywords, performWebSearch, generatePetition, streamChatResponse, rewriteText, reviewPetition } from './services/geminiService';
import { Header } from './components/Header';
import { InputPanel } from './components/InputPanel';
import { OutputPanel } from './components/OutputPanel';
import { ProgressSummary } from './components/ProgressSummary';
import { ToastContainer, ToastType } from './components/Toast';
import { LandingPage } from './components/LandingPage';

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

export default function App() {
  // Inputs from user
  const [petitionType, setPetitionType] = useState<PetitionType>(PetitionType.Dava);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.Davaci);
  const [caseDetails, setCaseDetails] = useState<CaseDetails>({ court: '', fileNumber: '', decisionNumber: '', decisionDate: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [docContent, setDocContent] = useState('');
  const [specifics, setSpecifics] = useState('');
  const [parties, setParties] = useState<{ [key: string]: string }>({});
  
  // Initialize chat messages from localStorage
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const storedHistory = localStorage.getItem('chatHistory');
      if (storedHistory) {
        return JSON.parse(storedHistory);
      }
    } catch (error) {
      console.error('Failed to parse chat history from localStorage:', error);
    }
    return [];
  });
  
  // Step-by-step results
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [searchKeywords, setSearchKeywords] = useState<string[]>([]);
  const [webSearchResult, setWebSearchResult] = useState<WebSearchResult | null>(null);

  // Final output
  const [generatedPetition, setGeneratedPetition] = useState('');
  const [petitionVersion, setPetitionVersion] = useState(0);
  
  // Loading states for each step
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingPetition, setIsLoadingPetition] = useState(false);
  const [isReviewingPetition, setIsReviewingPetition] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  
  // Toast notifications
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: ToastType }>>([]);
  
  // Landing page state
  const [showLanding, setShowLanding] = useState(() => {
    // Check if user has visited before
    const hasVisited = localStorage.getItem('hasVisited');
    return !hasVisited;
  });
  
  const handleGetStarted = useCallback(() => {
    localStorage.setItem('hasVisited', 'true');
    setShowLanding(false);
    addToast('Hoş geldiniz! Hemen başlayalım 🚀', 'success');
  }, []);
  
  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);
  
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Persist chat messages to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('chatHistory', JSON.stringify(chatMessages));
    } catch (error) {
      console.error('Failed to save chat history to localStorage:', error);
    }
  }, [chatMessages]);

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0) {
      setError('Lütfen önce analiz edilecek PDF, UDF veya resim dosyalarını yükleyin.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    setAnalysisData(null);
    setParties({}); // Reset party selection on new analysis
    setSearchKeywords([]);
    setWebSearchResult(null);
    setGeneratedPetition('');

    try {
        const allUploadedFiles: UploadedFile[] = [];
        let udfContent = '';
        let wordContent = '';
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
                    console.log(`Processing TIFF file: ${file.name}, size: ${file.size} bytes`);
                    const arrayBuffer = await file.arrayBuffer();
                    console.log(`ArrayBuffer loaded, length: ${arrayBuffer.byteLength}`);
                    
                    // UTIF2 kullanarak TIFF dosyasını decode et
                    const ifds = UTIF.decode(arrayBuffer);
                    console.log(`TIFF decoded, ${ifds.length} image(s) found`);
                    
                    // İlk sayfayı al (çoğu TIFF tek sayfalıdır)
                    const firstPage = ifds[0];
                    UTIF.decodeImage(arrayBuffer, firstPage);
                    
                    const rgba = UTIF.toRGBA8(firstPage);
                    console.log(`TIFF dimensions: ${firstPage.width}x${firstPage.height}`);
                    
                    // Canvas oluştur ve RGBA verisini çiz
                    const canvas = document.createElement('canvas');
                    canvas.width = firstPage.width;
                    canvas.height = firstPage.height;
                    const ctx = canvas.getContext('2d');
                    
                    if (!ctx) {
                        throw new Error('Canvas context oluşturulamadı');
                    }
                    
                    const imageData = ctx.createImageData(firstPage.width, firstPage.height);
                    imageData.data.set(rgba);
                    ctx.putImageData(imageData, 0, 0);
                    
                    console.log(`Canvas created: ${canvas.width}x${canvas.height}`);
                    
                    const dataUrl = canvas.toDataURL('image/png');
                    const base64Data = dataUrl.split(',')[1];
                    
                    allUploadedFiles.push({
                        mimeType: 'image/png', // Convert TIFF to PNG
                        data: base64Data,
                    });
                    console.log(`✅ TIFF processed successfully: ${file.name}`);
                } catch (tiffError) {
                    console.error(`❌ Error processing TIFF file ${file.name}:`, tiffError);
                    setError(`TIFF dosyası işlenirken hata: ${file.name}. Lütfen dosyanın geçerli bir TIFF formatında olduğundan emin olun.`);
                    // Continue with other files instead of breaking
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
                        // Fallback if no XML file is found
                        xmlContent = 'UDF arşivi içinde .xml uzantılı içerik dosyası bulunamadı.';
                    }
                    
                    udfContent += `\n\n--- UDF Belgesi: ${file.name} ---\n${xmlContent}`;
                } catch (zipError) {
                    console.error(`Error processing UDF file ${file.name}:`, zipError);
                    udfContent += `\n\n--- UDF Belgesi: ${file.name} (HATA) ---\nBu dosya geçerli bir UDF (ZIP) arşivi olarak işlenemedi.`;
                }
            } else if (extension === 'doc' || extension === 'docx') {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    wordContent += `\n\n--- Word Belgesi: ${file.name} ---\n${result.value}`;
                } catch (wordError) {
                    console.error(`Error processing Word file ${file.name}:`, wordError);
                    wordContent += `\n\n--- Word Belgesi: ${file.name} (HATA) ---\nBu Word belgesi işlenemedi.`;
                }
            }
        }
        
        const result = await analyzeDocuments(allUploadedFiles, udfContent.trim(), wordContent.trim());
        setAnalysisData(result);
        if (result.caseDetails) {
            setCaseDetails(prevDetails => ({ ...prevDetails, ...result.caseDetails }));
        }
        addToast('Belgeler başarıyla analiz edildi! ✓', 'success');

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata oluştu.';
      setError(`Belge analizi sırasında bir hata oluştu: ${errorMessage}`);
    } finally {
        setIsAnalyzing(false);
    }
  }, [files]);
  
  const addManualParty = (partyName: string) => {
    if (partyName && analysisData && !analysisData.potentialParties.includes(partyName)) {
        setAnalysisData({
            ...analysisData,
            potentialParties: [...analysisData.potentialParties, partyName]
        });
    }
  };

  const handleGenerateKeywords = useCallback(async () => {
    if (!analysisData?.summary) {
        setError('Lütfen önce belgeleri analiz edin.');
        return;
    }
    setIsGeneratingKeywords(true);
    setError(null);
    setSearchKeywords([]);
    setWebSearchResult(null);

    try {
        const keywords = await generateSearchKeywords(analysisData.summary, userRole);
        setSearchKeywords(keywords);
        addToast('Anahtar kelimeler oluşturuldu! 🔑', 'success');
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata oluştu.';
        setError(`Anahtar kelime oluşturulurken bir hata oluştu: ${errorMessage}`);
    } finally {
        setIsGeneratingKeywords(false);
    }
  }, [analysisData, userRole]);
  
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
        addToast('Web araması tamamlandı! 🔍', 'success');
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata oluştu.';
        setError(`Web araması sırasında bir hata oluştu: ${errorMessage}`);
    } finally {
        setIsSearching(false);
    }
  }, [searchKeywords]);

  const handleGeneratePetition = useCallback(async () => {
    if (!analysisData?.summary) {
      setError('Dilekçe oluşturmadan önce en azından belge analizi adımını tamamlamalısınız.');
      return;
    }
    setIsLoadingPetition(true);
    setError(null);
    setGeneratedPetition('');

    try {
      const result = await generatePetition({
        userRole,
        petitionType,
        caseDetails,
        analysisSummary: analysisData.summary,
        webSearchResult: webSearchResult?.summary || '', // Can be empty
        docContent,
        specifics,
        chatHistory: chatMessages,
        parties,
      });
      setGeneratedPetition(result);
      setPetitionVersion(v => v + 1); // Increment version to force re-mount of editor
      addToast('Dilekçe başarıyla oluşturuldu! ✨', 'success');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata oluştu.';
      setError(`Dilekçe oluşturulurken bir hata oluştu: ${errorMessage}`);
    } finally {
      setIsLoadingPetition(false);
    }
  }, [userRole, petitionType, caseDetails, analysisData, webSearchResult, docContent, specifics, chatMessages, parties]);

  const handleSendChatMessage = useCallback(async (message: string) => {
    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', text: message }];
    setChatMessages(newMessages);
    setIsLoadingChat(true);
    setError(null);

    try {
      const responseStream = streamChatResponse(
        newMessages,
        analysisData?.summary || '',
        {
          keywords: searchKeywords.join(', '),
          searchSummary: webSearchResult?.summary || '',
          docContent: docContent,
          specifics: specifics,
        }
      );
      const modelMessage: ChatMessage = { role: 'model', text: '' };
      setChatMessages(prev => [...prev, modelMessage]);

      let functionCallDetected = false;
      let addedKeywordsCount = 0;
      
      for await (const chunk of responseStream) {
        // Check if there are non-text parts (thoughtSignature, functionCall, etc.)
        // These are internal API metadata and can be safely logged/ignored
        const candidate = chunk.candidates?.[0];
        const hasNonTextParts = candidate?.content?.parts?.some((part: any) => 
          !part.text && (part.thoughtSignature || part.functionCall || part.executableCode)
        );
        
        if (hasNonTextParts) {
          console.log('[AI Response] Contains non-text parts (internal metadata) - processing text and function calls');
        }

        // Handle text chunks for streaming response
        if (chunk.text) {
          setChatMessages(prev => prev.map((msg, index) => 
            index === prev.length - 1 ? { ...msg, text: msg.text + chunk.text } : msg
          ));
        }

        // Handle function call chunks
        if (chunk.functionCalls) {
            for (const fc of chunk.functionCalls) {
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
            }
        }
      }
      
      // If function was called but no text was returned, add a confirmation message
      if (functionCallDetected && addedKeywordsCount > 0) {
        setChatMessages(prev => prev.map((msg, index) => 
          index === prev.length - 1 && msg.text.trim() === '' 
            ? { ...msg, text: `✅ ${addedKeywordsCount} adet anahtar kelime eklendi. Anahtar kelimeleri "Belge Analizi ve Anahtar Kelimeler" bölümünden görebilirsiniz.` }
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
  }, [chatMessages, analysisData, searchKeywords, webSearchResult, docContent, specifics]);
  
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
      });
      setGeneratedPetition(result);
      setPetitionVersion(v => v + 1);
      addToast('Dilekçe gözden geçirildi ve iyileştirildi! 🔍', 'success');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Bilinmeyen bir hata oluştu.';
      setError(`Dilekçe gözden geçirilirken bir hata oluştu: ${errorMessage}`);
    } finally {
      setIsReviewingPetition(false);
    }
  }, [generatedPetition, userRole, petitionType, caseDetails, analysisData, webSearchResult, docContent, specifics, chatMessages, parties]);


  // Show landing page if user hasn't visited
  if (showLanding) {
    return (
      <>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <LandingPage onGetStarted={handleGetStarted} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col font-sans">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Header onShowLanding={() => setShowLanding(true)} />
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
            
            docContent={docContent}
            setDocContent={setDocContent}
            specifics={specifics}
            setSpecifics={setSpecifics}
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
            searchKeywords={searchKeywords}
            setSearchKeywords={setSearchKeywords}
            webSearchResult={webSearchResult}
            setWebSearchResult={setWebSearchResult}
            docContent={docContent}
            setDocContent={setDocContent}
            specifics={specifics}
            setSpecifics={setSpecifics}
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
    </div>
  );
}