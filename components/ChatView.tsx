import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, WebSearchResult, ChatUploadedFile } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { PaperAirplaneIcon, UserCircleIcon, SparklesIcon as AiIcon, ChevronDownIcon, PencilIcon, ClipboardDocumentListIcon, KeyIcon, GlobeAltIcon, DocumentTextIcon, LightBulbIcon } from './Icon';
import { Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';

// Enhanced component for the editable context panel
const ChatContextPanel: React.FC<{
    searchKeywords: string[];
    setSearchKeywords: (keywords: string[]) => void;
    webSearchResult: WebSearchResult | null;
    setWebSearchResult: (result: React.SetStateAction<WebSearchResult | null>) => void;
    docContent: string;
    setDocContent: (content: string) => void;
    specifics: string;
    setSpecifics: (specifics: string) => void;
}> = (props) => {
    const [isOpen, setIsOpen] = useState(true); // Start open by default
    const [isEditing, setIsEditing] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Local state for edits
    const [localKeywords, setLocalKeywords] = useState(props.searchKeywords.join(', '));
    const [localSearchSummary, setLocalSearchSummary] = useState(props.webSearchResult?.summary || '');
    const [localDocContent, setLocalDocContent] = useState(props.docContent);
    const [localSpecifics, setLocalSpecifics] = useState(props.specifics);

    useEffect(() => {
        if (!isEditing) {
            setLocalKeywords(props.searchKeywords.join(', '));
            setLocalSearchSummary(props.webSearchResult?.summary || '');
            setLocalDocContent(props.docContent);
            setLocalSpecifics(props.specifics);
        }
    }, [isEditing, props.searchKeywords, props.webSearchResult, props.docContent, props.specifics]);

    const handleCancel = () => {
        // Reset local state to original values
        setLocalKeywords(props.searchKeywords.join(', '));
        setLocalSearchSummary(props.webSearchResult?.summary || '');
        setLocalDocContent(props.docContent);
        setLocalSpecifics(props.specifics);
        setIsEditing(false);
    };

    const handleSave = () => {
        props.setSearchKeywords(localKeywords.split(',').map(k => k.trim()).filter(Boolean));
        props.setWebSearchResult(prev => ({ summary: localSearchSummary, sources: prev?.sources || [] }));
        props.setDocContent(localDocContent);
        props.setSpecifics(localSpecifics);
        setIsEditing(false);
    };

    const toggleDropdown = () => {
        setIsOpen(!isOpen);
    };

    const ContextItem: React.FC<{
        icon: React.ReactNode;
        label: string;
        value: string;
        onChange: (val: string) => void;
        rows?: number;
        placeholder?: string;
        helpText?: string;
    }> = ({ icon, label, value, onChange, rows = 2, placeholder = '', helpText }) => (
        <div className="group">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <span className="text-red-400">{icon}</span>
                {label}
                {helpText && (
                    <span className="text-xs text-gray-500 font-normal ml-auto">
                        {helpText}
                    </span>
                )}
            </label>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                readOnly={!isEditing}
                rows={rows}
                placeholder={placeholder}
                className={`w-full p-3 rounded-lg text-sm transition-all duration-200 resize-none
                    ${isEditing
                        ? 'bg-gray-700 border-2 border-red-500/50 text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20'
                        : 'bg-gray-800/50 border border-gray-700 text-gray-300 cursor-default'
                    }
                    ${!value && !isEditing ? 'text-gray-500 italic' : ''}
                `}
            />
        </div>
    );

    const hasContent = props.searchKeywords.length > 0 ||
        props.webSearchResult?.summary ||
        props.docContent ||
        props.specifics;

    return (
        <div className="flex-shrink-0 bg-gray-800/50 border border-gray-700 rounded-xl mb-4 overflow-hidden shadow-lg" ref={panelRef}>
            {/* Header */}
            <div
                className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-700/30 transition-colors"
                onClick={toggleDropdown}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-600/20 rounded-lg">
                        <ClipboardDocumentListIcon className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Dilekçe Bağlamı</h3>
                        <p className="text-xs text-gray-400">
                            {hasContent ? 'AI bu bilgileri dilekçe oluştururken kullanacak' : 'Henüz bağlam bilgisi eklenmedi'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {!isEditing ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); setIsOpen(true); }}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 bg-red-600/10 hover:bg-red-600/20 border border-red-600/30 rounded-lg transition-all"
                        >
                            <PencilIcon className="h-4 w-4" />
                            <span>Düzenle</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={handleCancel}
                                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-lg"
                            >
                                Kaydet
                            </button>
                        </div>
                    )}
                    <div
                        className={`p-1 rounded-lg hover:bg-gray-600/50 transition-all ${isOpen ? 'bg-gray-600/30' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleDropdown(); }}
                    >
                        <ChevronDownIcon
                            className={`h-5 w-5 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                        />
                    </div>
                </div>
            </div>

            {/* Collapsible Content */}
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
            >
                <div className="p-4 pt-0 space-y-4 border-t border-gray-700/50">
                    {/* Edit Mode Indicator */}
                    {isEditing && (
                        <div className="flex items-center gap-2 p-3 bg-red-600/10 border border-red-600/30 rounded-lg">
                            <PencilIcon className="h-4 w-4 text-red-400" />
                            <span className="text-sm text-red-300">Düzenleme modu aktif - değişikliklerinizi kaydetmeyi unutmayın</span>
                        </div>
                    )}

                    <ContextItem
                        icon={<KeyIcon className="h-4 w-4" />}
                        label="Arama Anahtar Kelimeleri"
                        value={localKeywords}
                        onChange={setLocalKeywords}
                        placeholder="tazminat, haksız fesih, iş hukuku..."
                        helpText="Virgülle ayırın"
                    />

                    <ContextItem
                        icon={<GlobeAltIcon className="h-4 w-4" />}
                        label="Web Araştırması Özeti"
                        value={localSearchSummary}
                        onChange={setLocalSearchSummary}
                        rows={4}
                        placeholder="Web araştırmasından elde edilen hukuki bilgiler..."
                        helpText="AI tarafından otomatik doldurulur"
                    />

                    <ContextItem
                        icon={<DocumentTextIcon className="h-4 w-4" />}
                        label="Ek Metin ve Belgeler"
                        value={localDocContent}
                        onChange={setLocalDocContent}
                        rows={3}
                        placeholder="Ek belgelerden alınan metin içerikleri..."
                    />

                    <ContextItem
                        icon={<LightBulbIcon className="h-4 w-4" />}
                        label="Özel Talimatlar"
                        value={localSpecifics}
                        onChange={setLocalSpecifics}
                        rows={3}
                        placeholder="AI'ya özel talimatlarınız (örn: daha resmi bir dil kullan)..."
                        helpText="İsteğe bağlı"
                    />
                </div>
            </div>
        </div>
    );
};


interface ChatViewProps {
    messages: ChatMessage[];
    onSendMessage: (message: string, files?: File[]) => void;
    isLoading: boolean;
    // Context props
    searchKeywords: string[];
    setSearchKeywords: (keywords: string[]) => void;
    webSearchResult: WebSearchResult | null;
    setWebSearchResult: (result: React.SetStateAction<WebSearchResult | null>) => void;
    docContent: string;
    setDocContent: (content: string) => void;
    specifics: string;
    setSpecifics: (specifics: string) => void;
}

export const ChatView: React.FC<ChatViewProps> = (props) => {
    const { messages, onSendMessage, isLoading } = props;
    const [input, setInput] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            const validFiles = newFiles.filter((f: File) => allowedTypes.includes(f.type));
            if (validFiles.length !== newFiles.length) {
                alert('Sadece PDF ve resim dosyaları desteklenmektedir.');
            }
            setSelectedFiles(prev => [...prev, ...validFiles].slice(0, 5)); // Max 5 files
        }
        e.target.value = '';
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const introMessage = `Merhaba! Ben sizin hukuk asistanınızım. Dilekçenizi oluşturmadan önce konuyu netleştirmek, hukuki terimleri açıklamak veya dava stratejisi üzerine beyin fırtınası yapmak için benimle sohbet edebilirsiniz. Yukarıdaki "Dilekçe Bağlamı" bölümünden anahtar bilgileri düzenleyebilirsiniz.`;

    return (
        <div className="h-full flex flex-col p-4 ai-theme">
            <ChatContextPanel
                searchKeywords={props.searchKeywords}
                setSearchKeywords={props.setSearchKeywords}
                webSearchResult={props.webSearchResult}
                setWebSearchResult={props.setWebSearchResult}
                docContent={props.docContent}
                setDocContent={props.setDocContent}
                specifics={props.specifics}
                setSpecifics={props.setSpecifics}
            />
            <div className="flex-grow overflow-y-auto pr-2 space-y-4 ai-scrollable">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                        <AiIcon className="h-12 w-12 ai-icon-accent mb-4" />
                        <p className="max-w-sm">{introMessage}</p>
                    </div>
                ) : (
                    messages.map((msg, index) => (
                        <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                            {msg.role === 'model' && <AiIcon className="h-6 w-6 ai-icon-accent flex-shrink-0 mt-1" />}
                            <div className={`max-w-[85%] sm:max-w-lg rounded-xl px-3 sm:px-4 py-2 ${msg.role === 'user' ? 'ai-bubble-user' : 'ai-bubble-model'}`}>
                                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                            </div>
                            {msg.role === 'user' && <UserCircleIcon className="h-6 w-6 text-gray-400 flex-shrink-0 mt-1" />}
                        </div>
                    ))
                )}
                {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                    <div className="flex items-start gap-3">
                        <AiIcon className="h-6 w-6 ai-icon-accent flex-shrink-0 mt-1" />
                        <div className="max-w-lg rounded-xl px-4 py-3 ai-card">
                            <LoadingSpinner className="h-5 w-5 text-gray-300" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSend} className="flex-shrink-0 mt-4 space-y-2">
                {/* File Preview */}
                {selectedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
                        {selectedFiles.map((file, index) => (
                            <div key={index} className="flex items-center gap-2 px-2 py-1 bg-gray-700 rounded-lg text-sm">
                                {file.type.startsWith('image/') ? (
                                    <ImageIcon className="w-4 h-4 text-blue-400" />
                                ) : (
                                    <FileText className="w-4 h-4 text-red-400" />
                                )}
                                <span className="text-gray-300 max-w-[100px] truncate">{file.name}</span>
                                <button
                                    type="button"
                                    onClick={() => removeFile(index)}
                                    className="p-0.5 hover:bg-gray-600 rounded"
                                >
                                    <X className="w-3 h-3 text-gray-400" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                {/* Input Row */}
                <div className="flex items-center gap-2">
                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    {/* File upload button */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
                        title="Dosya Ekle (PDF, Resim)"
                        disabled={isLoading || selectedFiles.length >= 5}
                    >
                        <Paperclip className="h-5 w-5" />
                    </button>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={selectedFiles.length > 0 ? "Bu belgeler hakkında soru sorun..." : "AI asistana bir mesaj gönder..."}
                        className="flex-1 p-3 ai-input rounded-lg transition-colors placeholder-gray-400"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || (!input.trim() && selectedFiles.length === 0)}
                        className="ai-button p-3 rounded-lg disabled:cursor-not-allowed transition-colors"
                    >
                        <PaperAirplaneIcon className="h-6 w-6" />
                    </button>
                </div>
            </form>
        </div>
    );
};