import React, { useRef, useState, useEffect } from 'react';
import {
  PetitionType,
  PetitionCategory,
  PetitionSubcategory,
  CategoryToSubcategories,
  SubcategoryToPetitionTypes,
  CategoryToRoles,
  WebSearchResult,
  AnalysisData,
  UserRole,
  CaseDetails,
  LegalSearchResult
} from '../types';
import { SparklesIcon, DocumentPlusIcon, XCircleIcon, KeyIcon, LinkIcon, ChevronDownIcon } from './Icon';
import { Scale, Trash2 } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { VoiceInputButton } from './VoiceInputButton';
import { MissingInfoChecklistPanel } from './MissingInfoChecklistPanel';
import type { MissingInfoQuestion } from './missingInfoChecklist';

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
  onOpenLegalSearch: () => void;
  legalSearchResults: LegalSearchResult[];
  onRemoveLegalResult: (index: number) => void;

  // Step 4: Additions
  docContent: string;
  setDocContent: React.Dispatch<React.SetStateAction<string>>;
  specifics: string;
  setSpecifics: React.Dispatch<React.SetStateAction<string>>;
  missingInfoQuestions: MissingInfoQuestion[];
  missingInfoAnswers: Record<string, string>;
  hasScannedMissingInfo: boolean;
  onRunMissingInfoScan: () => void;
  onMissingInfoAnswerChange: (questionId: string, value: string) => void;
  missingInfoBlockingUnansweredCount: number;
  missingInfoTotalUnansweredCount: number;

  // Step 5: Generate
  onGenerate: () => void;
  isLoading: boolean; // This is isLoadingPetition
}

const StepHeader: React.FC<{ number: number; title: string; }> = ({ number, title }) => (
  <div className="flex items-center gap-3">
    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#1A1A1D] text-blue-300 font-bold border border-white/10">{number}</span>
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
    <div className="mt-4 pt-4 border-t border-white/10">
      <label className="block text-xs font-medium text-gray-400 mb-1">Listede Olmayan Tarafı Ekle</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={manualParty}
          onChange={(e) => setManualParty(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full p-2 bg-[#111113] border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-200 placeholder-gray-500"
          placeholder="Taraf adını yazıp Enter'a basın"
        />
        <button onClick={handleAdd} className="bg-[#1A1A1D] hover:bg-[#232327] text-white font-semibold px-4 rounded-lg transition-colors text-sm flex-shrink-0">Ekle</button>
      </div>
    </div>
  );
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
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-[#111113] hover:bg-[#1A1A1D] transition-colors text-left"
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
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all ${selectedType === type
                ? 'bg-red-600 text-white'
                : 'text-gray-300 hover:bg-[#1A1A1D]'
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


export const InputPanel: React.FC<InputPanelProps> = ({
  petitionType, setPetitionType, userRole, setUserRole,
  caseDetails, setCaseDetails,
  files, setFiles,
  onAnalyze, isAnalyzing, analysisData, addManualParty,
  onGenerateKeywords, isGeneratingKeywords, searchKeywords, setSearchKeywords,
  onSearch, isSearching, webSearchResult, onOpenLegalSearch,
  legalSearchResults, onRemoveLegalResult,
  docContent, setDocContent, specifics, setSpecifics,
  missingInfoQuestions, missingInfoAnswers, hasScannedMissingInfo, onRunMissingInfoScan, onMissingInfoAnswerChange,
  missingInfoBlockingUnansweredCount, missingInfoTotalUnansweredCount,
  parties, setParties,
  onGenerate, isLoading
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const FILE_BATCH_SIZE = 15;
  const MAX_UPLOAD_BATCHES = 3;
  const MAX_TOTAL_UPLOAD_FILES = FILE_BATCH_SIZE * MAX_UPLOAD_BATCHES;
  const [enabledUploadBatches, setEnabledUploadBatches] = useState(1);
  const activeUploadLimit = enabledUploadBatches * FILE_BATCH_SIZE;
  const canUnlockNextUploadBatch = enabledUploadBatches < MAX_UPLOAD_BATCHES;
  const canSelectMoreFiles = files.length < Math.min(activeUploadLimit, MAX_TOTAL_UPLOAD_FILES);

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

  useEffect(() => {
    if (files.length === 0 && enabledUploadBatches !== 1) {
      setEnabledUploadBatches(1);
    }
  }, [files.length, enabledUploadBatches]);
  // Get party labels based on category
  const getPartyLabels = (): { [key: string]: string } => {
    switch (selectedCategory) {
      case PetitionCategory.Hukuk:
        return { plaintiff: 'Davacı', defendant: 'Davalı' };
      case PetitionCategory.Ceza:
        return { complainant: 'Müşteki / Mağdur', suspect: 'Sanık / Şüpheli' };
      case PetitionCategory.Icra:
        return { creditor: 'Alacaklı', debtor: 'Borçlu' };
      case PetitionCategory.KanunYollari:
        return { appellant: 'Başvuran', counterparty: 'Karşı Taraf' };
      case PetitionCategory.Idari:
        return { applicant: 'Davacı / Başvuran', administration: 'Davalı İdare' };
      case PetitionCategory.DegisikIs:
        return { applicant: 'Başvuran / Talep Eden', respondent: 'Karşı Taraf / Muhatap' };
      default:
        return { party1: 'Taraf 1', party2: 'Taraf 2' };
    }
  };

  const partyLabels = getPartyLabels();

  const handlePartyChange = (key: string, value: string) => {
    setParties({ ...parties, [key]: value });
  };


  const handleFileChange = (newFiles: File[]) => {
    const currentBatchRemaining = activeUploadLimit - files.length;
    const totalRemaining = MAX_TOTAL_UPLOAD_FILES - files.length;
    const availableSlots = Math.min(currentBatchRemaining, totalRemaining);

    if (availableSlots <= 0) {
      if (files.length >= MAX_TOTAL_UPLOAD_FILES) {
        alert(`En fazla ${MAX_TOTAL_UPLOAD_FILES} dosya yükleyebilirsiniz.`);
      } else {
        alert(`${FILE_BATCH_SIZE} dosyalik bu parcayi doldurdunuz. Yeni 15 dosya icin "Ekleme Yap" butonuna basin.`);
      }
      return;
    }
    const allowedExtensions = ['.pdf', '.udf', '.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.doc', '.docx', '.txt'];
    const allowedFiles = newFiles.filter(f =>
      allowedExtensions.some(ext => f.name.toLowerCase().endsWith(ext))
    );

    if (allowedFiles.length !== newFiles.length) {
      alert('Lutfen sadece PDF, UDF, Word (.doc, .docx), TXT veya resim (.jpg, .png, .webp, .tif) dosyalari yukleyin.');
    }
    if (allowedFiles.length > availableSlots) {
      alert(`Bu adimda en fazla ${availableSlots} dosya ekleyebilirsiniz.`);
    }
    setFiles([...files, ...allowedFiles.slice(0, availableSlots)]);
  };

  const handleUnlockNextUploadBatch = () => {
    if (!canUnlockNextUploadBatch) return;
    setEnabledUploadBatches(prev => Math.min(prev + 1, MAX_UPLOAD_BATCHES));
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

  const normalizeDateInputValue = (value: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const parts = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (!parts) return '';

    const day = Number(parts[1]);
    const month = Number(parts[2]);
    const year = Number(parts[3].length === 2 ? `20${parts[3]}` : parts[3]);

    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return '';
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return '';

    const yyyy = String(year).padStart(4, '0');
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  return (
    <div className="bg-[#111113] rounded-xl shadow-2xl shadow-red-900/10 p-6 space-y-8 h-full flex flex-col border border-white/10 hover:border-red-600/30 transition-all duration-500">
      <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-4 flex items-center gap-2">
        <span className="inline-block w-1 h-8 bg-gradient-to-b from-red-500 to-red-600 rounded-full animate-pulse"></span>
        İşlem Adımları
      </h2>

      {/* Step 1: Basic Info - Cascading Selection */}
      <div className="space-y-4">
        <StepHeader number={1} title="Dilekçe Türü ve Rolünüz" />

        {/* Category Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Ana Yargılama Türü</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.values(PetitionCategory).map(cat => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  setOpenSubcategory(null);
                }}
                className={`p-3 rounded-lg text-sm font-medium transition-all ${selectedCategory === cat
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'bg-[#1A1A1D] text-gray-300 hover:bg-[#232327]'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Subcategory Accordions */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Alt Kategori ve Dilekçe Türü
            {petitionType && <span className="ml-2 text-xs text-red-400">Seçili: {petitionType}</span>}
          </label>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
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

        {/* Role Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Sizin Rolünüz</label>
          <select
            value={userRole}
            onChange={(e) => setUserRole(e.target.value as UserRole)}
            className="w-full p-2.5 bg-[#1A1A1D] border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-blue-400 transition-all duration-200 text-gray-200 cursor-pointer"
          >
            {availableRoles.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Step 2: Case Details & Documents */}
      <div className="space-y-4">
        <StepHeader number={2} title="Dava Künyesi ve Belgeler" />
        <div className="bg-[#111113]/70 p-4 rounded-lg border border-white/10 space-y-4">
          <h4 className="text-md font-semibold text-gray-200">Dava Künyesi Bilgileri (Varsa)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="transform transition-all duration-200 hover:scale-[1.01]">
              <label htmlFor="court" className="block text-sm font-medium text-gray-300 mb-1">Mahkeme Adı</label>
              <input id="court" type="text" value={caseDetails.court} onChange={e => handleCaseDetailsChange('court', e.target.value)} className="w-full p-2 bg-[#1A1A1D] border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 hover:border-blue-400 transition-all duration-200 text-gray-200" placeholder="Örn: Ankara 3. İş Mahkemesi" />
            </div>
            <div className="transform transition-all duration-200 hover:scale-[1.01]">
              <label htmlFor="fileNumber" className="block text-sm font-medium text-gray-300 mb-1">Dosya Numarası (Esas No)</label>
              <input id="fileNumber" type="text" value={caseDetails.fileNumber} onChange={e => handleCaseDetailsChange('fileNumber', e.target.value)} className="w-full p-2 bg-[#1A1A1D] border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 hover:border-blue-400 transition-all duration-200 text-gray-200" placeholder="Örn: 2023/123 Esas" />
            </div>
            <div className="transform transition-all duration-200 hover:scale-[1.01]">
              <label htmlFor="decisionNumber" className="block text-sm font-medium text-gray-300 mb-1">Karar Numarası</label>
              <input id="decisionNumber" type="text" value={caseDetails.decisionNumber} onChange={e => handleCaseDetailsChange('decisionNumber', e.target.value)} className="w-full p-2 bg-[#1A1A1D] border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 hover:border-blue-400 transition-all duration-200 text-gray-200" placeholder="Örn: 2024/456 Karar" />
            </div>
            <div className="transform transition-all duration-200 hover:scale-[1.01]">
              <label htmlFor="decisionDate" className="block text-sm font-medium text-gray-300 mb-1">Karar Tarihi</label>
              <input id="decisionDate" type="date" value={normalizeDateInputValue(caseDetails.decisionDate)} onChange={e => handleCaseDetailsChange('decisionDate', e.target.value)} className="w-full p-2 bg-[#1A1A1D] border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 hover:border-blue-400 transition-all duration-200 text-gray-200" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Belgeleri Yukleyin (PDF, UDF, Word, TXT, Resim)</label>
          <div onClick={() => { if (canSelectMoreFiles) fileInputRef.current?.click(); }} onDragOver={(e) => handleDragEvents(e, true)} onDragLeave={(e) => handleDragEvents(e, false)} onDrop={handleDrop} className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-all duration-300 transform hover:scale-[1.01] ${canSelectMoreFiles ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'} ${isDragging ? 'border-blue-500 bg-[#1A1A1D]/80 scale-[1.02] shadow-lg shadow-blue-500/20' : 'border-white/10 hover:border-blue-500 hover:bg-[#1A1A1D]/30'}`}>
            <div className="space-y-1 text-center">
              <DocumentPlusIcon className="mx-auto h-12 w-12 text-gray-400" />
              <div className="flex text-sm text-gray-400">
                <p className="pl-1">Dosya secmek icin tiklayin veya surukleyip birakin</p>
              </div>
              <p className="text-xs text-gray-500">PDF, UDF, Word, TXT, JPG, PNG, WEBP, TIF (15 dosya x 3 parca, toplam 45)</p>
              {!canSelectMoreFiles && canUnlockNextUploadBatch && (
                <p className="text-xs text-amber-400">Bu parcayi doldurdunuz. Yeni 15 dosya icin "Ekleme Yap" butonuna basin.</p>
              )}
            </div>
          </div>
          <input ref={fileInputRef} type="file" multiple disabled={!canSelectMoreFiles} accept=".pdf,.udf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.doc,.docx,.txt" onChange={onFileInputChange} className="hidden" />
          {files.length >= activeUploadLimit && canUnlockNextUploadBatch && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={handleUnlockNextUploadBatch}
                className="px-4 py-2 bg-[#1A1A1D] border border-red-500/50 text-red-300 hover:bg-red-500/10 hover:text-red-200 rounded-lg text-sm font-medium transition-colors"
              >
                Ekleme Yap (+15 Dosya)
              </button>
            </div>
          )}
          {files.length > 0 && <div className="mt-4 space-y-2 animate-fade-in-up"><h4 className="text-sm font-medium text-gray-300">Yuklenen Dosyalar ({files.length} / {MAX_TOTAL_UPLOAD_FILES})</h4><ul className="space-y-1">{files.map((file, index) => (<li key={index} className="flex items-center justify-between bg-[#1A1A1D] p-2 rounded-md text-sm transform transition-all duration-200 hover:scale-[1.02] hover:bg-[#232327] animate-scale-in"><span className="text-gray-200 truncate pr-2">{file.name}</span><button onClick={() => handleRemoveFile(index)} className="text-gray-400 hover:text-red-400 transition-all duration-200 flex-shrink-0 hover:scale-110 active:scale-95"><XCircleIcon className="h-5 w-5" /></button></li>))}</ul></div>}
        </div>
      </div>

      {/* Step 3: Analysis & Search */}
      <div className="space-y-4">
        <StepHeader number={3} title="Analiz ve Araştırma" />
        <button onClick={onAnalyze} disabled={isAnalyzing || files.length === 0} className="w-full flex items-center justify-center bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-[#111113] disabled:to-[#0A0A0B] disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg shadow-lg hover:shadow-red-500/30 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
          <span className="relative">{isAnalyzing ? <><LoadingSpinner className="h-5 w-5 mr-2" /> Analiz Ediliyor...</> : '1. Belgeleri Analiz Et'}</span>
        </button>
        {(isAnalyzing || analysisData) && (
          <div className="space-y-4 pt-4 border-t border-white/10 mt-4">
            <div>
              <label htmlFor="analysis-result" className="block text-sm font-medium text-gray-300 mb-2">Analiz Özeti:</label>
              <textarea id="analysis-result" readOnly value={isAnalyzing ? 'AI belgeleri inceliyor...' : analysisData?.summary || ''} rows={6} className="w-full p-3 bg-[#111113] border border-white/10 rounded-lg text-gray-300 placeholder-gray-500" placeholder="Belge analizi sonuçları burada görünecek." />
            </div>
            {analysisData?.potentialParties && analysisData.potentialParties.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 pt-4">Tarafları Belirle</label>
                <div className="space-y-3 bg-[#111113]/70 p-4 rounded-lg border border-white/10">
                  {Object.entries(partyLabels).map(([key, label]) => (
                    <div key={key} className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2 sm:gap-3">
                      <label htmlFor={`party-${key}`} className="text-sm font-medium text-gray-300 sm:col-span-1">{label}</label>
                      <select
                        id={`party-${key}`}
                        value={parties[key] || ''}
                        onChange={(e) => handlePartyChange(key, e.target.value)}
                        className="w-full sm:col-span-2 p-2 bg-[#1A1A1D] border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-200"
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
              <button onClick={onGenerateKeywords} disabled={isGeneratingKeywords || !analysisData?.summary || isAnalyzing} className="w-full flex items-center justify-center bg-gradient-to-r from-[#1A1A1D] to-[#111113] hover:from-[#232327] hover:to-[#1A1A1D] disabled:from-[#111113] disabled:to-[#0A0A0B] disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg shadow-lg hover:shadow-white/5 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                <span className="relative">{isGeneratingKeywords ? <><LoadingSpinner className="h-5 w-5 mr-2" /> Oluşturuluyor...</> : <><KeyIcon className="h-5 w-5 mr-2" /> 2. Anahtar Kelime Oluştur</>}</span>
              </button>
              <button onClick={onSearch} disabled={isSearching || searchKeywords.length === 0 || isAnalyzing || isGeneratingKeywords} className="w-full flex items-center justify-center bg-gradient-to-r from-[#1A1A1D] to-[#111113] hover:from-[#232327] hover:to-[#1A1A1D] disabled:from-[#111113] disabled:to-[#0A0A0B] disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg shadow-lg hover:shadow-white/5 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                <span className="relative">{isSearching ? <><LoadingSpinner className="h-5 w-5 mr-2" /> Aranıyor...</> : '3. Web Araması Yap'}</span>
              </button>
            </div>
            {/* İçtihat Arama Butonu */}
            <button onClick={onOpenLegalSearch} className="w-full flex items-center justify-center bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold py-2.5 px-4 rounded-lg shadow-lg hover:shadow-red-500/20 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden mt-3">
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              <span className="relative flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
                ⚖️ İçtihat Ara (Yargıtay, Danıştay, AYM)
              </span>
            </button>
            {(isGeneratingKeywords || searchKeywords.length > 0) && <div className="pt-2"><label htmlFor="keywords-input" className="block text-sm font-medium text-gray-300 mb-2">Arama Anahtar Kelimeleri</label><textarea id="keywords-input" value={isGeneratingKeywords ? 'AI anahtar kelimeleri hazırlıyor...' : searchKeywords.join(', ')} onChange={(e) => setSearchKeywords(e.target.value.split(',').map(k => k.trim()).filter(Boolean))} rows={3} className="w-full p-3 bg-[#111113] border border-white/10 rounded-lg text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" placeholder="Aramak için anahtar kelimeleri virgülle ayırarak girin." /></div>}
            {(isSearching || webSearchResult) && (
              <div className="pt-2">
                <label htmlFor="web-search-result" className="block text-sm font-medium text-gray-300 mb-2">Web Araştırması Özeti:</label>
                <textarea
                  id="web-search-result"
                  readOnly
                  value={isSearching ? 'AI webde araştırma yapıyor...' : webSearchResult?.summary || ''}
                  rows={6}
                  className="w-full p-3 bg-[#111113] border border-white/10 rounded-lg text-gray-300 placeholder-gray-500"
                  placeholder="Web araması özeti burada görünecek."
                />
                {webSearchResult?.sources && webSearchResult.sources.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-300 mb-2 flex items-center text-sm">
                      <LinkIcon className="h-4 w-4 mr-2 text-blue-400" />
                      Web Araması Kaynakları
                    </h4>
                    <div className="max-h-32 overflow-y-auto bg-[#111113] p-3 rounded-lg border border-white/10">
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
            {/* Selected Legal Decisions */}
            {legalSearchResults && legalSearchResults.length > 0 && (
              <div className="pt-3">
                <h4 className="font-semibold text-gray-300 mb-2 flex items-center text-sm">
                  <Scale className="h-4 w-4 mr-2 text-red-400" />
                  Seçilen İçtihatlar ({legalSearchResults.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto bg-[#111113] p-3 rounded-lg border border-white/10">
                  {legalSearchResults.map((result, index) => (
                    <div key={index} className="flex items-start justify-between gap-2 p-2 bg-[#111113] rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-white font-medium truncate flex-1">
                            {result.daire || result.title}
                          </p>
                          {result.relevanceScore !== undefined && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${result.relevanceScore >= 70 ? 'bg-green-500/20 text-green-400' :
                                result.relevanceScore >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-red-500/20 text-red-400'
                              }`}>
                              %{result.relevanceScore}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          {result.esasNo && `E. ${result.esasNo} `}
                          {result.kararNo && `K. ${result.kararNo} `}
                          {result.tarih && `T. ${result.tarih}`}
                        </p>
                        {result.ozet && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{result.ozet}</p>
                        )}
                      </div>
                      <button
                        onClick={() => onRemoveLegalResult(index)}
                        className="p-1 hover:bg-red-600/20 text-red-400 hover:text-red-300 rounded transition-colors"
                        title="İçtihatı Kaldır"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 4: Additional Info */}
      <div className="space-y-4">
        <StepHeader number={4} title="Ek Bilgiler ve Özel Talimatlar" />
        <div className="transform transition-all duration-200 hover:scale-[1.005]">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="doc-content" className="block text-sm font-medium text-gray-300">Ek Metin (İsteğe Bağlı)</label>
            <VoiceInputButton
              onTranscript={(text) => setDocContent((prev) => prev.trim() ? `${prev}\n${text}` : text)}
            />
          </div>
          <textarea
            id="doc-content"
            rows={4}
            className="w-full p-3 bg-[#111113] border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-blue-400 transition-all duration-200 text-gray-200 placeholder-gray-500"
            placeholder="PDF'lere ek olarak, hızlıca kopyalayıp yapıştırmak istediğiniz metinleri veya notları buraya ekleyin."
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
          />
        </div>
        <div className="transform transition-all duration-200 hover:scale-[1.005]">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="specifics" className="block text-sm font-medium text-gray-300">Özel Talimatlar ve Notlar</label>
            <VoiceInputButton
              onTranscript={(text) => setSpecifics((prev) => prev.trim() ? `${prev}\n${text}` : text)}
            />
          </div>
          <textarea
            id="specifics"
            rows={4}
            className="w-full p-3 bg-[#111113] border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-blue-400 transition-all duration-200 text-gray-200 placeholder-gray-500"
            placeholder="Dilekçede özellikle vurgulanmasını istediğiniz noktaları, taleplerinizi veya AI'ın bilmesi gereken diğer önemli detayları buraya yazın."
            value={specifics}
            onChange={(e) => setSpecifics(e.target.value)}
          />
          <MissingInfoChecklistPanel
            questions={missingInfoQuestions}
            answers={missingInfoAnswers}
            hasScanned={hasScannedMissingInfo}
            onRunScan={onRunMissingInfoScan}
            onAnswerChange={onMissingInfoAnswerChange}
            blockingUnansweredCount={missingInfoBlockingUnansweredCount}
            totalUnansweredCount={missingInfoTotalUnansweredCount}
          />
        </div>
      </div>

      {/* Step 5: Generate */}
      <div className="mt-auto pt-6 border-t border-white/10 space-y-4">
        <StepHeader number={5} title="Nihai Dilekçeyi Oluştur" />
        <button onClick={onGenerate} disabled={isLoading || !analysisData || isAnalyzing || isSearching || isGeneratingKeywords} className="w-full flex items-center justify-center bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-500 hover:via-red-600 hover:to-red-500 disabled:from-[#111113] disabled:via-[#1A1A1D] disabled:to-[#111113] disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg shadow-xl shadow-red-500/30 hover:shadow-red-400/50 transition-all duration-500 transform hover:scale-105 disabled:scale-100 group relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
          <div className="absolute inset-0 blur-xl bg-red-500/20 group-hover:bg-red-400/30 transition-all duration-500"></div>
          <span className="relative">{isLoading ? <><LoadingSpinner className="h-5 w-5 mr-2" /> Oluşturuluyor...</> : <><SparklesIcon className="h-5 w-5 mr-2 animate-spin" style={{ animationDuration: '3s' }} /> Dilekçeyi Oluştur</>}</span>
        </button>
        {missingInfoBlockingUnansweredCount > 0 && (
          <p className="text-xs text-red-300 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
            Eksikleri Tara alaninda {missingInfoBlockingUnansweredCount} bloklayici soru bos. Uretim denemesinden once bu sorulari yanitlayin.
          </p>
        )}
      </div>
    </div>
  );
};


