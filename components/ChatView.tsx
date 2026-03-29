import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, WebSearchResult } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import {
    PaperAirplaneIcon,
    UserCircleIcon,
    SparklesIcon as AiIcon,
    ChevronDownIcon,
    PencilIcon,
    ClipboardDocumentListIcon,
    KeyIcon,
    GlobeAltIcon,
    DocumentTextIcon,
    LightBulbIcon,
} from './Icon';
import { Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
import { VoiceInputButton } from './VoiceInputButton';
import { parseLegalResearchBatchMessage } from '../lib/legal/chatLegalIntent';

type ExpandedFieldKey = 'keywords' | 'searchSummary' | 'precedents' | 'docContent' | 'specifics';

type ContextFieldConfig = {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    helpText?: string;
    rows: number;
};

const ChatContextPanel: React.FC<{
    searchKeywords: string[];
    setSearchKeywords: (keywords: string[]) => void;
    webSearchResult: WebSearchResult | null;
    setWebSearchResult: (result: React.SetStateAction<WebSearchResult | null>) => void;
    precedentContext: string;
    setPrecedentContext: React.Dispatch<React.SetStateAction<string>>;
    docContent: string;
    setDocContent: React.Dispatch<React.SetStateAction<string>>;
    specifics: string;
    setSpecifics: React.Dispatch<React.SetStateAction<string>>;
}> = (props) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [expandedField, setExpandedField] = useState<ExpandedFieldKey | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const [localKeywords, setLocalKeywords] = useState(props.searchKeywords.join(', '));
    const [localSearchSummary, setLocalSearchSummary] = useState(props.webSearchResult?.summary || '');
    const [localPrecedentContext, setLocalPrecedentContext] = useState(props.precedentContext || '');
    const [localDocContent, setLocalDocContent] = useState(props.docContent);
    const [localSpecifics, setLocalSpecifics] = useState(props.specifics);

    useEffect(() => {
        if (!isEditing) {
            setLocalKeywords(props.searchKeywords.join(', '));
            setLocalSearchSummary(props.webSearchResult?.summary || '');
            setLocalPrecedentContext(props.precedentContext || '');
            setLocalDocContent(props.docContent);
            setLocalSpecifics(props.specifics);
        }
    }, [isEditing, props.searchKeywords, props.webSearchResult, props.precedentContext, props.docContent, props.specifics]);

    const handleCancel = () => {
        setLocalKeywords(props.searchKeywords.join(', '));
        setLocalSearchSummary(props.webSearchResult?.summary || '');
        setLocalPrecedentContext(props.precedentContext || '');
        setLocalDocContent(props.docContent);
        setLocalSpecifics(props.specifics);
        setIsEditing(false);
        setExpandedField(null);
    };

    const handleSave = () => {
        props.setSearchKeywords(localKeywords.split(',').map((k) => k.trim()).filter(Boolean));
        props.setWebSearchResult((prev) => ({ summary: localSearchSummary, sources: prev?.sources || [] }));
        props.setPrecedentContext(localPrecedentContext);
        props.setDocContent(localDocContent);
        props.setSpecifics(localSpecifics);
        setIsEditing(false);
        setExpandedField(null);
    };

    const fieldConfigs: Record<ExpandedFieldKey, ContextFieldConfig> = {
        keywords: {
            label: 'Arama Anahtar Kelimeleri',
            value: localKeywords,
            onChange: setLocalKeywords,
            placeholder: 'tazminat, haksiz fesih, is hukuku...',
            helpText: 'Virgulle ayirin',
            rows: 10,
        },
        searchSummary: {
            label: 'Web Arastirmasi Ozeti',
            value: localSearchSummary,
            onChange: setLocalSearchSummary,
            placeholder: 'Web arastirmasindan elde edilen hukuki bilgiler...',
            helpText: 'AI tarafindan otomatik doldurulur',
            rows: 14,
        },
        precedents: {
            label: 'Bulunan Emsal Karar Metinleri',
            value: localPrecedentContext,
            onChange: setLocalPrecedentContext,
            placeholder: 'Bulunan emsal karar ozetleri ve karar metinleri burada gorunecek.',
            helpText: 'Ictihat aramasindan otomatik doldurulur',
            rows: 16,
        },
        docContent: {
            label: 'Ek Metin ve Belgeler',
            value: localDocContent,
            onChange: setLocalDocContent,
            placeholder: 'Ek belgelerden alinan metin icerikleri...',
            rows: 14,
        },
        specifics: {
            label: 'Ozel Talimatlar',
            value: localSpecifics,
            onChange: setLocalSpecifics,
            placeholder: "AI'ya ozel talimatlariniz (orn: daha resmi bir dil kullan)...",
            helpText: 'Istege bagli',
            rows: 14,
        },
    };

    const expandedFieldConfig = expandedField ? fieldConfigs[expandedField] : null;

    const ContextItem: React.FC<{
        fieldKey: ExpandedFieldKey;
        icon: React.ReactNode;
        label: string;
        value: string;
        onChange: (val: string) => void;
        rows?: number;
        placeholder?: string;
        helpText?: string;
    }> = ({ fieldKey, icon, label, value, onChange, rows = 2, placeholder = '', helpText }) => (
        <div className="group">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-300">
                <span className="text-red-400">{icon}</span>
                {label}
                {helpText && <span className="ml-auto text-xs font-normal text-gray-500">{helpText}</span>}
            </div>
            <button
                type="button"
                onClick={() => setExpandedField(fieldKey)}
                className={`w-full rounded-lg text-left transition-all duration-200 ${isEditing ? 'cursor-pointer' : 'cursor-zoom-in'}`}
            >
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    readOnly
                    rows={rows}
                    placeholder={placeholder}
                    className={`pointer-events-none w-full resize-none rounded-lg p-3 text-sm transition-all duration-200 ${
                        isEditing
                            ? 'border-2 border-red-500/50 bg-gray-700 text-white'
                            : 'border border-gray-700 bg-gray-800/50 text-gray-300'
                    } ${!value && !isEditing ? 'italic text-gray-500' : ''}`}
                />
            </button>
        </div>
    );

    const hasContent = props.searchKeywords.length > 0
        || props.webSearchResult?.summary
        || props.precedentContext
        || props.docContent
        || props.specifics;

    return (
        <div className="relative mb-4 flex-shrink-0 overflow-hidden rounded-xl border border-gray-700 bg-gray-800/50 shadow-lg" ref={panelRef}>
            <div
                className="flex cursor-pointer items-center justify-between p-4 transition-colors hover:bg-gray-700/30"
                onClick={() => setIsOpen((prev) => !prev)}
            >
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-red-600/20 p-2">
                        <ClipboardDocumentListIcon className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Dilekce Baglami</h3>
                        <p className="text-xs text-gray-400">
                            {hasContent ? 'AI bu bilgileri dilekce olustururken kullanacak' : 'Henuz baglam bilgisi eklenmedi'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {!isEditing ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsEditing(true);
                                setIsOpen(true);
                            }}
                            className="flex items-center gap-2 rounded-lg border border-red-600/30 bg-red-600/10 px-3 py-1.5 text-sm text-red-400 transition-all hover:bg-red-600/20 hover:text-red-300"
                        >
                            <PencilIcon className="h-4 w-4" />
                            <span>Duzenle</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={handleCancel}
                                className="rounded-lg bg-gray-700 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-600 hover:text-white"
                            >
                                Iptal
                            </button>
                            <button
                                onClick={handleSave}
                                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                            >
                                Kaydet
                            </button>
                        </div>
                    )}
                    <div
                        className={`rounded-lg p-1 transition-all hover:bg-gray-600/50 ${isOpen ? 'bg-gray-600/30' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen((prev) => !prev);
                        }}
                    >
                        <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </div>

            <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[520px] overflow-y-auto opacity-100' : 'max-h-0 overflow-hidden opacity-0'}`}>
                <div className="space-y-4 border-t border-gray-700/50 p-4 pt-0">
                    {isEditing && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-600/30 bg-red-600/10 p-3">
                            <PencilIcon className="h-4 w-4 text-red-400" />
                            <span className="text-sm text-red-300">Duzenleme modu aktif. Alanlara tiklayip tam ekranda duzenleyebilirsiniz.</span>
                        </div>
                    )}

                    <ContextItem
                        fieldKey="keywords"
                        icon={<KeyIcon className="h-4 w-4" />}
                        label="Arama Anahtar Kelimeleri"
                        value={localKeywords}
                        onChange={setLocalKeywords}
                        placeholder="tazminat, haksiz fesih, is hukuku..."
                        helpText="Virgulle ayirin"
                    />

                    <ContextItem
                        fieldKey="searchSummary"
                        icon={<GlobeAltIcon className="h-4 w-4" />}
                        label="Web Arastirmasi Ozeti"
                        value={localSearchSummary}
                        onChange={setLocalSearchSummary}
                        rows={4}
                        placeholder="Web arastirmasindan elde edilen hukuki bilgiler..."
                        helpText="AI tarafindan otomatik doldurulur"
                    />

                    <ContextItem
                        fieldKey="precedents"
                        icon={<DocumentTextIcon className="h-4 w-4" />}
                        label="Bulunan Emsal Karar Metinleri"
                        value={localPrecedentContext}
                        onChange={setLocalPrecedentContext}
                        rows={5}
                        placeholder="Bulunan emsal karar ozetleri ve karar metinleri burada gorunecek."
                        helpText="Ictihat aramasindan otomatik doldurulur"
                    />

                    <ContextItem
                        fieldKey="docContent"
                        icon={<DocumentTextIcon className="h-4 w-4" />}
                        label="Ek Metin ve Belgeler"
                        value={localDocContent}
                        onChange={setLocalDocContent}
                        rows={3}
                        placeholder="Ek belgelerden alinan metin icerikleri..."
                    />

                    <ContextItem
                        fieldKey="specifics"
                        icon={<LightBulbIcon className="h-4 w-4" />}
                        label="Ozel Talimatlar"
                        value={localSpecifics}
                        onChange={setLocalSpecifics}
                        rows={3}
                        placeholder="AI'ya ozel talimatlariniz (orn: daha resmi bir dil kullan)..."
                        helpText="Istege bagli"
                    />
                </div>
            </div>

            {expandedFieldConfig && (
                <div className="absolute inset-0 z-30 bg-[#0A0A0B]">
                    <div className="flex h-full flex-col">
                        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                            <div>
                                <h4 className="text-base font-semibold text-white">{expandedFieldConfig.label}</h4>
                                {expandedFieldConfig.helpText && <p className="mt-1 text-xs text-gray-400">{expandedFieldConfig.helpText}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                                {isEditing && (
                                    <button
                                        type="button"
                                        onClick={handleSave}
                                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                                    >
                                        Kaydet
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setExpandedField(null)}
                                    className="rounded-lg p-2 transition-colors hover:bg-white/5"
                                >
                                    <X className="h-5 w-5 text-gray-300" />
                                </button>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 p-4">
                            <textarea
                                value={expandedFieldConfig.value}
                                onChange={(e) => expandedFieldConfig.onChange(e.target.value)}
                                readOnly={!isEditing}
                                rows={expandedFieldConfig.rows}
                                placeholder={expandedFieldConfig.placeholder}
                                className={`h-full w-full resize-none rounded-xl p-4 text-sm transition-all duration-200 ${
                                    isEditing
                                        ? 'border-2 border-red-500/50 bg-gray-700 text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20'
                                        : 'border border-gray-700 bg-gray-800/50 text-gray-300'
                                }`}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

interface ChatViewProps {
    messages: ChatMessage[];
    onSendMessage: (message: string, files?: File[]) => void;
    isLoading: boolean;
    statusText?: string;
    searchKeywords: string[];
    setSearchKeywords: (keywords: string[]) => void;
    webSearchResult: WebSearchResult | null;
    setWebSearchResult: (result: React.SetStateAction<WebSearchResult | null>) => void;
    precedentContext: string;
    setPrecedentContext: React.Dispatch<React.SetStateAction<string>>;
    docContent: string;
    setDocContent: React.Dispatch<React.SetStateAction<string>>;
    specifics: string;
    setSpecifics: React.Dispatch<React.SetStateAction<string>>;
}

const CHAT_ALLOWED_EXTENSIONS = ['.pdf', '.udf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'];

const hasAllowedChatExtension = (fileName: string): boolean => {
    const lowerName = String(fileName || '').toLowerCase();
    return CHAT_ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
};

const isImageLikeFile = (file: File): boolean => {
    if (file.type.startsWith('image/')) return true;
    const lowerName = file.name.toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'].some((ext) => lowerName.endsWith(ext));
};

const LegalResearchBatchCards: React.FC<{ message: string }> = ({ message }) => {
    const items = parseLegalResearchBatchMessage(message);
    if (items.length === 0) {
        return <p className="break-words whitespace-pre-wrap text-sm">{message}</p>;
    }

    return (
        <div className="space-y-3 py-1">
            {items.map((item, index) => (
                <article key={`${item.title}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3 text-left">
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-300">
                        {item.daire ? <span>{item.daire}</span> : null}
                        {item.esasNo ? <span>E. {item.esasNo}</span> : null}
                        {item.kararNo ? <span>K. {item.kararNo}</span> : null}
                        {item.tarih ? <span>T. {item.tarih}</span> : null}
                    </div>
                    {item.sourceUrl ? (
                        <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center text-xs font-medium text-red-300 underline-offset-2 hover:underline"
                        >
                            Kaynak ↗
                        </a>
                    ) : null}
                </article>
            ))}
        </div>
    );
};

export const ChatView: React.FC<ChatViewProps> = (props) => {
    const { messages, onSendMessage, isLoading, statusText } = props;
    const [input, setInput] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if ((input.trim() || selectedFiles.length > 0) && !isLoading) {
            onSendMessage(input.trim(), selectedFiles.length > 0 ? selectedFiles : undefined);
            setInput('');
            setSelectedFiles([]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles: File[] = Array.from(e.target.files);
            const validFiles = newFiles.filter((f: File) => hasAllowedChatExtension(f.name));
            if (validFiles.length !== newFiles.length) {
                alert('Sadece PDF, UDF, Word (.doc/.docx), TXT ve resim (.jpg/.png/.webp/.tif) dosyalari desteklenmektedir.');
            }
            setSelectedFiles((prev) => [...prev, ...validFiles].slice(0, 5));
        }
        e.target.value = '';
    };

    const removeFile = (index: number) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const isPetitionRequested = props.messages.some(m => 
        m.role === 'user' && /(dilekce|dilekçe|belge|taslak|template|ihtarname|itiraz|temyiz|feragat|talep|sozlesme|sözleşme)/i.test(m.text || '') && /(olustur|olutur|hazirla|hazırla|yaz)/i.test(m.text || '')
    );
    
    const hasMeaningfulContext = props.searchKeywords.length > 0 || !!props.webSearchResult?.summary || !!props.precedentContext || !!props.docContent || !!props.specifics;
    
    // Yalnızca dilekçe istendiğinde veya bağlam doluysa göster
    const showContextPanel = isPetitionRequested || hasMeaningfulContext;

    const introMessage = `Merhaba! Ben sizin hukuk asistaninizim. Dilekcenizi olusturmadan once konuyu netlestirmek, hukuki terimleri aciklamak veya dava stratejisi uzerine beyin firtinasi yapmak icin benimle sohbet edebilirsiniz.`;

    return (
        <div className="h-full min-h-0 flex flex-col p-4 ai-theme">
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 ai-scrollable">
                {showContextPanel && (
                    <ChatContextPanel
                        searchKeywords={props.searchKeywords}
                        setSearchKeywords={props.setSearchKeywords}
                        webSearchResult={props.webSearchResult}
                        setWebSearchResult={props.setWebSearchResult}
                        precedentContext={props.precedentContext}
                        setPrecedentContext={props.setPrecedentContext}
                        docContent={props.docContent}
                        setDocContent={props.setDocContent}
                        specifics={props.specifics}
                        setSpecifics={props.setSpecifics}
                    />
                )}
                <div className="min-h-[220px] space-y-4">
                    {messages.length === 0 ? (
                        <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-gray-400">
                            <AiIcon className="mb-4 h-12 w-12 ai-icon-accent" />
                            <p className="max-w-sm">{introMessage}</p>
                        </div>
                    ) : (
                        messages.map((msg, index) => (
                            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                {msg.role === 'model' && <AiIcon className="mt-1 h-6 w-6 flex-shrink-0 ai-icon-accent" />}
                                <div className={`max-w-[85%] rounded-xl px-3 py-2 sm:max-w-lg sm:px-4 ${msg.role === 'user' ? 'ai-bubble-user' : 'ai-bubble-model'}`}>
                                    {msg.role === 'model' ? (
                                        <LegalResearchBatchCards message={msg.text} />
                                    ) : (
                                        <p className="break-words whitespace-pre-wrap text-sm">{msg.text}</p>
                                    )}
                                </div>
                                {msg.role === 'user' && <UserCircleIcon className="mt-1 h-6 w-6 flex-shrink-0 text-gray-400" />}
                            </div>
                        ))
                    )}
                    {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                        <div className="flex items-start gap-3">
                            <AiIcon className="mt-1 h-6 w-6 flex-shrink-0 ai-icon-accent" />
                            <div className="max-w-lg rounded-xl px-4 py-3 ai-card">
                                {statusText && <p className="mb-2 text-xs text-gray-300">{statusText}</p>}
                                <LoadingSpinner className="h-5 w-5 text-gray-300" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>
            <form onSubmit={handleSend} className="mt-4 flex-shrink-0 space-y-2">
                {selectedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 rounded-lg border border-gray-700 bg-gray-800/50 p-2">
                        {selectedFiles.map((file, index) => (
                            <div key={index} className="flex items-center gap-2 rounded-lg bg-gray-700 px-2 py-1 text-sm">
                                {isImageLikeFile(file) ? (
                                    <ImageIcon className="h-4 w-4 text-blue-400" />
                                ) : (
                                    <FileText className="h-4 w-4 text-red-400" />
                                )}
                                <span className="max-w-[100px] truncate text-gray-300">{file.name}</span>
                                <button
                                    type="button"
                                    onClick={() => removeFile(index)}
                                    className="rounded p-0.5 hover:bg-gray-600"
                                >
                                    <X className="h-3 w-3 text-gray-400" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="relative flex items-end">
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.udf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp,.tif,.tiff"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <div className="ai-input flex-1 flex items-end rounded-xl border border-gray-600 bg-gray-800/80 focus-within:border-red-500/50 focus-within:ring-1 focus-within:ring-red-500/30 transition-all">
                        <div className="flex items-center gap-1 pl-3 pb-3">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                                title="Dosya Ekle (PDF, UDF, Word, TXT, Resim)"
                                disabled={isLoading || selectedFiles.length >= 5}
                            >
                                <Paperclip className="h-5 w-5" />
                            </button>
                            <VoiceInputButton
                                disabled={isLoading}
                                onTranscript={(text) => {
                                    const newVal = input.trim().length > 0 ? `${input} ${text}` : text;
                                    setInput(newVal);
                                    if (textareaRef.current) {
                                        setTimeout(() => {
                                            if (textareaRef.current) {
                                                textareaRef.current.style.height = 'auto';
                                                textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
                                            }
                                        }, 10);
                                    }
                                }}
                            />
                        </div>
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend(e);
                                }
                            }}
                            placeholder={selectedFiles.length > 0 ? 'Bu belgeler hakkinda soru sorun...' : 'AI asistana bir mesaj gonder...'}
                            className="min-h-[48px] flex-1 resize-none bg-transparent p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-0 border-none overflow-y-auto outline-none shadow-none"
                            style={{ height: '48px', maxHeight: '200px' }}
                            disabled={isLoading}
                            rows={1}
                        />
                        <div className="flex items-center pr-2 pb-3">
                            <button
                                type="submit"
                                disabled={isLoading || (!input.trim() && selectedFiles.length === 0)}
                                className="rounded-lg bg-red-600 p-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <PaperAirplaneIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
};
