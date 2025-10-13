import React, { useRef, useState } from 'react';
import { PetitionType, WebSearchResult, AnalysisData, UserRole, CaseDetails } from '../types';
import { SparklesIcon, DocumentPlusIcon, XCircleIcon, KeyIcon, LinkIcon } from './Icon';
import { LoadingSpinner } from './LoadingSpinner';

interface InputPanelProps {
  // Step 1: Type & Role
  petitionType: PetitionType;
  setPetitionType: (type: PetitionType) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;

  // Step 2: Case & Docs
  caseDetails: CaseDetails;
  setCaseDetails: (details: CaseDetails) => void;
  files: File[];
  setFiles: (files: File[]) => void;
  
  // Step 3: Analysis & Search
  onAnalyze: () => void;
  isAnalyzing: boolean;
  analysisData: AnalysisData | null;
  addManualParty: (name: string) => void;
  parties: { [key: string]: string };
  setParties: (parties: { [key: string]: string }) => void;
  onGenerateKeywords: () => void;
  isGeneratingKeywords: boolean;
  searchKeywords: string[];
  setSearchKeywords: (keywords: string[]) => void;
  onSearch: () => void;
  isSearching: boolean;
  webSearchResult: WebSearchResult | null;

  // Step 4: Additions
  docContent: string;
  setDocContent: (content: string) => void;
  specifics: string;
  setSpecifics: (specifics: string) => void;
  
  // Step 5: Generate
  onGenerate: () => void;
  isLoading: boolean; // This is isLoadingPetition
}

const petitionTypes = Object.values(PetitionType);
const userRoles = Object.values(UserRole);

const StepHeader: React.FC<{ number: number; title: string; }> = ({ number, title }) => (
    <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-700 text-blue-300 font-bold border border-gray-600">{number}</span>
        <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
    </div>
);

const ManualPartyAdder: React.FC<{ onAddParty: (name: string) => void }> = ({ onAddParty }) => {
    const [manualParty, setManualParty] = useState('');

    const handleAdd = () => {
        if (manualParty.trim()) {
            onAddParty(manualParty.trim());
            setManualParty('');
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    }

    return (
        <div className="mt-4 pt-4 border-t border-gray-700">
            <label className="block text-xs font-medium text-gray-400 mb-1">Listede Olmayan Tarafı Ekle</label>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={manualParty}
                    onChange={(e) => setManualParty(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full p-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-200 placeholder-gray-500"
                    placeholder="Taraf adını yazıp Enter'a basın"
                />
                <button onClick={handleAdd} className="bg-gray-600 hover:bg-gray-500 text-white font-semibold px-4 rounded-lg transition-colors text-sm flex-shrink-0">Ekle</button>
            </div>
        </div>
    );
};


export const InputPanel: React.FC<InputPanelProps> = ({
  petitionType, setPetitionType, userRole, setUserRole,
  caseDetails, setCaseDetails,
  files, setFiles,
  onAnalyze, isAnalyzing, analysisData, addManualParty,
  onGenerateKeywords, isGeneratingKeywords, searchKeywords, setSearchKeywords,
  onSearch, isSearching, webSearchResult,
  docContent, setDocContent, specifics, setSpecifics,
  parties, setParties,
  onGenerate, isLoading
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const getPartyLabels = (petitionType: PetitionType): { [key: string]: string } => {
    switch (petitionType) {
      case PetitionType.Dava:
      case PetitionType.Cevap:
        return { plaintiff: 'Davacı', defendant: 'Davalı' };
      case PetitionType.Istinaf:
      case PetitionType.Temyiz:
        return { appellant: 'Başvuran (Davacı/Davalı)', counterparty: 'Karşı Taraf (Davacı/Davalı)' };
      case PetitionType.Sikayet:
        return { complainant: 'Müşteki / Şikayetçi', suspect: 'Şüpheli' };
      case PetitionType.Itiraz:
      case PetitionType.BilirkişiRaporunaItiraz:
        return { appellant: 'İtiraz Eden', counterparty: 'Karşı Taraf' };
      default:
        return { party1: 'Taraf 1', party2: 'Taraf 2' };
    }
  };

  const partyLabels = getPartyLabels(petitionType);

  const handlePartyChange = (key: string, value: string) => {
    setParties({ ...parties, [key]: value });
  };


  const handleFileChange = (newFiles: File[]) => {
    if (files.length + newFiles.length > 10) {
        alert("En fazla 10 dosya yükleyebilirsiniz.");
        return;
    }
    const allowedExtensions = ['.pdf', '.udf', '.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.doc', '.docx'];
    const allowedFiles = newFiles.filter(f => 
        allowedExtensions.some(ext => f.name.toLowerCase().endsWith(ext))
    );

    if (allowedFiles.length !== newFiles.length) {
        alert("Lütfen sadece PDF, UDF, Word (.doc, .docx) veya resim formatında (.jpg, .png, .webp, .tif) dosyalar yükleyin.");
    }
    setFiles([...files, ...allowedFiles]);
  };

  const onFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
        handleFileChange(Array.from(event.target.files));
    }
    event.target.value = ''; // Reset for same file upload
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    setFiles(newFiles);
  };

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, isOver: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(isOver);
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files) {
        handleFileChange(Array.from(e.dataTransfer.files));
    }
  }

  const handleCaseDetailsChange = (field: keyof CaseDetails, value: string) => {
    setCaseDetails({ ...caseDetails, [field]: value });
  };

  return (
    <div className="bg-gray-800 rounded-xl shadow-2xl p-6 space-y-8 h-full flex flex-col">
      <h2 className="text-2xl font-bold text-white border-b border-gray-700 pb-4">İşlem Adımları</h2>
      
      {/* Step 1: Basic Info */}
      <div className="space-y-4">
        <StepHeader number={1} title="Temel Bilgiler" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Dilekçe Türü Seçin</label>
                <select value={petitionType} onChange={(e) => setPetitionType(e.target.value as PetitionType)} className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-200">
                    {petitionTypes.map(pt => (<option key={pt} value={pt}>{pt}</option>))}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Sizin Rolünüz</label>
                <select value={userRole} onChange={(e) => setUserRole(e.target.value as UserRole)} className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-200">
                    {userRoles.map(role => (<option key={role} value={role}>{role}</option>))}
                </select>
            </div>
        </div>
      </div>
      
      {/* Step 2: Case Details & Documents */}
      <div className="space-y-4">
        <StepHeader number={2} title="Dava Künyesi ve Belgeler" />
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-4">
            <h4 className="text-md font-semibold text-gray-200">Dava Künyesi Bilgileri (Varsa)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="court" className="block text-sm font-medium text-gray-300 mb-1">Mahkeme Adı</label>
                    <input id="court" type="text" value={caseDetails.court} onChange={e => handleCaseDetailsChange('court', e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-200" placeholder="Örn: Ankara 3. İş Mahkemesi"/>
                </div>
                 <div>
                    <label htmlFor="fileNumber" className="block text-sm font-medium text-gray-300 mb-1">Dosya Numarası (Esas No)</label>
                    <input id="fileNumber" type="text" value={caseDetails.fileNumber} onChange={e => handleCaseDetailsChange('fileNumber', e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-200" placeholder="Örn: 2023/123 Esas"/>
                </div>
                <div>
                    <label htmlFor="decisionNumber" className="block text-sm font-medium text-gray-300 mb-1">Karar Numarası</label>
                    <input id="decisionNumber" type="text" value={caseDetails.decisionNumber} onChange={e => handleCaseDetailsChange('decisionNumber', e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-200" placeholder="Örn: 2024/456 Karar"/>
                </div>
                <div>
                    <label htmlFor="decisionDate" className="block text-sm font-medium text-gray-300 mb-1">Karar Tarihi</label>
                    <input id="decisionDate" type="date" value={caseDetails.decisionDate} onChange={e => handleCaseDetailsChange('decisionDate', e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-200" />
                </div>
            </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Belgeleri Yükleyin (PDF, UDF, Word, Resim)</label>
          <div onClick={() => fileInputRef.current?.click()} onDragOver={(e) => handleDragEvents(e, true)} onDragLeave={(e) => handleDragEvents(e, false)} onDrop={handleDrop} className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-gray-700/50' : 'border-gray-600 hover:border-blue-500'}`}>
            <div className="space-y-1 text-center"><DocumentPlusIcon className="mx-auto h-12 w-12 text-gray-400"/><div className="flex text-sm text-gray-400"><p className="pl-1">Dosya seçmek için tıklayın veya sürükleyip bırakın</p></div><p className="text-xs text-gray-500">PDF, UDF, Word, JPG, PNG, WEBP, TIF (en fazla 10 dosya)</p></div>
          </div>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.udf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.doc,.docx" onChange={onFileInputChange} className="hidden"/>
          {files.length > 0 && <div className="mt-4 space-y-2"><h4 className="text-sm font-medium text-gray-300">Yüklenen Dosyalar:</h4><ul className="space-y-1">{files.map((file, index) => (<li key={index} className="flex items-center justify-between bg-gray-700 p-2 rounded-md text-sm"><span className="text-gray-200 truncate pr-2">{file.name}</span><button onClick={() => handleRemoveFile(index)} className="text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"><XCircleIcon className="h-5 w-5" /></button></li>))}</ul></div>}
        </div>
      </div>
      
      {/* Step 3: Analysis & Search */}
      <div className="space-y-4">
        <StepHeader number={3} title="Analiz ve Araştırma" />
        <button onClick={onAnalyze} disabled={isAnalyzing || files.length === 0} className="w-full flex items-center justify-center bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg shadow-lg transition-all">{isAnalyzing ? <><LoadingSpinner className="h-5 w-5 mr-2" /> Analiz Ediliyor...</> : '1. Belgeleri Analiz Et'}</button>
        {(isAnalyzing || analysisData) && (
            <div className="space-y-4 pt-4 border-t border-gray-700 mt-4">
                <div>
                    <label htmlFor="analysis-result" className="block text-sm font-medium text-gray-300 mb-2">Analiz Özeti:</label>
                    <textarea id="analysis-result" readOnly value={isAnalyzing ? 'AI belgeleri inceliyor...' : analysisData?.summary || ''} rows={6} className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-gray-300 placeholder-gray-500" placeholder="Belge analizi sonuçları burada görünecek."/>
                </div>
                 {analysisData?.potentialParties && analysisData.potentialParties.length > 0 && (
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2 pt-4">Tarafları Belirle</label>
                        <div className="space-y-3 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                            {Object.entries(partyLabels).map(([key, label]) => (
                                <div key={key} className="grid grid-cols-3 items-center gap-3">
                                    <label htmlFor={`party-${key}`} className="text-sm font-medium text-gray-300 col-span-1">{label}</label>
                                    <select
                                        id={`party-${key}`}
                                        value={parties[key] || ''}
                                        onChange={(e) => handlePartyChange(key, e.target.value)}
                                        className="w-full col-span-2 p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-200"
                                    >
                                        <option value="" disabled>Seçiniz...</option>
                                        {analysisData.potentialParties.map((pName) => (
                                            <option key={pName} value={pName}>{pName}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                            <ManualPartyAdder onAddParty={addManualParty} />
                        </div>
                    </div>
                 )}
                 <div className='flex flex-col md:flex-row gap-4 pt-4'>
                    <button onClick={onGenerateKeywords} disabled={isGeneratingKeywords || !analysisData?.summary || isAnalyzing} className="w-full flex items-center justify-center bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg transition-all">{isGeneratingKeywords ? <><LoadingSpinner className="h-5 w-5 mr-2" /> Oluşturuluyor...</> : <><KeyIcon className="h-5 w-5 mr-2" /> 2. Anahtar Kelime Oluştur</>}</button>
                    <button onClick={onSearch} disabled={isSearching || searchKeywords.length === 0 || isAnalyzing || isGeneratingKeywords} className="w-full flex items-center justify-center bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg transition-all">{isSearching ? <><LoadingSpinner className="h-5 w-5 mr-2" /> Aranıyor...</> : '3. Web Araması Yap'}</button>
                 </div>
                 {(isGeneratingKeywords || searchKeywords.length > 0) && <div className="pt-2"><label htmlFor="keywords-input" className="block text-sm font-medium text-gray-300 mb-2">Arama Anahtar Kelimeleri</label><textarea id="keywords-input" value={isGeneratingKeywords ? 'AI anahtar kelimeleri hazırlıyor...' : searchKeywords.join(', ')} onChange={(e) => setSearchKeywords(e.target.value.split(',').map(k => k.trim()).filter(Boolean))} rows={3} className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" placeholder="Aramak için anahtar kelimeleri virgülle ayırarak girin."/></div>}
                 {(isSearching || webSearchResult) && (
                    <div className="pt-2">
                        <label htmlFor="web-search-result" className="block text-sm font-medium text-gray-300 mb-2">Web Araştırması Özeti:</label>
                        <textarea
                            id="web-search-result"
                            readOnly
                            value={isSearching ? 'AI webde araştırma yapıyor...' : webSearchResult?.summary || ''}
                            rows={6}
                            className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-gray-300 placeholder-gray-500"
                            placeholder="Web araması özeti burada görünecek."
                        />
                        {webSearchResult?.sources && webSearchResult.sources.length > 0 && (
                            <div className="mt-4">
                                <h4 className="font-semibold text-gray-300 mb-2 flex items-center text-sm">
                                    <LinkIcon className="h-4 w-4 mr-2 text-blue-400" />
                                    Web Araması Kaynakları
                                </h4>
                                <div className="max-h-32 overflow-y-auto bg-gray-900 p-3 rounded-lg border border-gray-700">
                                    <ul className="space-y-2 text-xs">
                                        {webSearchResult.sources.map((source, index) => (
                                            <li key={index} className="flex items-start">
                                                <a 
                                                    href={source.uri} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="text-blue-400 hover:text-blue-300 hover:underline break-all"
                                                    title={source.uri}
                                                >
                                                    {source.title || source.uri}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}
      </div>
      
      {/* Step 4: Additional Info */}
      <div className="space-y-4">
        <StepHeader number={4} title="Ek Bilgiler ve Özel Talimatlar" />
        <div><label htmlFor="doc-content" className="block text-sm font-medium text-gray-300 mb-2">Ek Metin (İsteğe Bağlı)</label><textarea id="doc-content" rows={4} className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-200 placeholder-gray-500" placeholder="PDF'lere ek olarak, hızlıca kopyalayıp yapıştırmak istediğiniz metinleri veya notları buraya ekleyin." value={docContent} onChange={(e) => setDocContent(e.target.value)}/></div>
        <div><label htmlFor="specifics" className="block text-sm font-medium text-gray-300 mb-2">Özel Talimatlar ve Notlar</label><textarea id="specifics" rows={4} className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-200 placeholder-gray-500" placeholder="Dilekçede özellikle vurgulanmasını istediğiniz noktaları, taleplerinizi veya AI'ın bilmesi gereken diğer önemli detayları buraya yazın." value={specifics} onChange={(e) => setSpecifics(e.target.value)}/></div>
      </div>
      
       {/* Step 5: Generate */}
       <div className="mt-auto pt-6 border-t border-gray-700 space-y-4">
         <StepHeader number={5} title="Nihai Dilekçeyi Oluştur" />
         <button onClick={onGenerate} disabled={isLoading || !analysisData || isAnalyzing || isSearching || isGeneratingKeywords} className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg shadow-lg transition-all transform hover:scale-105 disabled:scale-100">{isLoading ? <><LoadingSpinner className="h-5 w-5 mr-2" /> Oluşturuluyor...</> : <><SparklesIcon className="h-5 w-5 mr-2" /> Dilekçeyi Oluştur</>}</button>
       </div>
    </div>
  );
};