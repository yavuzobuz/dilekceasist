import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, WebSearchResult } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { PaperAirplaneIcon, UserCircleIcon, SparklesIcon as AiIcon, ChevronDownIcon, PencilIcon, ClipboardDocumentListIcon, KeyIcon, GlobeAltIcon, DocumentTextIcon, LightBulbIcon } from './Icon';

// New component for the editable context panel
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
    const [isOpen, setIsOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

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
        setIsEditing(false);
    };

    const handleSave = () => {
        props.setSearchKeywords(localKeywords.split(',').map(k => k.trim()).filter(Boolean));
        props.setWebSearchResult(prev => ({ summary: localSearchSummary, sources: prev?.sources || [] }));
        props.setDocContent(localDocContent);
        props.setSpecifics(localSpecifics);
        setIsEditing(false);
    };
    
    const ContextItem: React.FC<{ icon: React.ReactNode; label: string; value: string; onChange: (val: string) => void; rows?: number; }> = ({ icon, label, value, onChange, rows = 2 }) => (
        <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-1.5">
                {icon}
                {label}
            </label>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                readOnly={!isEditing}
                rows={rows}
                className="w-full p-2 ai-input rounded-lg text-sm placeholder-gray-500 read-only:opacity-80 read-only:cursor-default transition-colors"
            />
        </div>
    );

    return (
        <div className="flex-shrink-0 ai-card ai-border rounded-lg mb-4">
            <div className="w-full flex justify-between items-center p-3">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                    <ClipboardDocumentListIcon className="h-5 w-5 ai-icon-accent" />
                    <h3 className="font-semibold">Dilekçe Bağlamı</h3>
                </div>
                <div className="flex items-center gap-4">
                    {!isEditing ? (
                        <div onClick={(e) => { e.stopPropagation(); setIsEditing(true); setIsOpen(true); }} className="flex items-center gap-1.5 text-xs ai-link transition-colors cursor-pointer">
                            <PencilIcon className="h-4 w-4" /> Düzenle
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div onClick={(e) => { e.stopPropagation(); handleCancel(); }} className="text-xs text-gray-400 hover:text-white transition-colors cursor-pointer">İptal</div>
                            <div onClick={(e) => { e.stopPropagation(); handleSave(); }} className="text-xs ai-button font-semibold px-3 py-1 rounded-md transition-colors cursor-pointer">Kaydet</div>
                        </div>
                    )}
                    <ChevronDownIcon 
                        className={`h-5 w-5 text-gray-400 transition-transform cursor-pointer ${isOpen ? 'rotate-180' : ''}`} 
                        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                    />
                </div>
            </div>
            {isOpen && (
                <div className="p-3 border-t border-gray-700 space-y-4">
                    <ContextItem icon={<KeyIcon className="h-4 w-4" />} label="Arama Anahtar Kelimeleri" value={localKeywords} onChange={setLocalKeywords} />
                    <ContextItem icon={<GlobeAltIcon className="h-4 w-4" />} label="Web Araştırması Özeti" value={localSearchSummary} onChange={setLocalSearchSummary} rows={4} />
                    <ContextItem icon={<DocumentTextIcon className="h-4 w-4" />} label="Ek Metin" value={localDocContent} onChange={setLocalDocContent} rows={3} />
                    <ContextItem icon={<LightBulbIcon className="h-4 w-4" />} label="Özel Talimatlar ve Notlar" value={localSpecifics} onChange={setLocalSpecifics} rows={3} />
                </div>
            )}
        </div>
    );
};


interface ChatViewProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
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
                 <AiIcon className="h-12 w-12 ai-icon-accent mb-4"/>
                <p className="max-w-sm">{introMessage}</p>
            </div>
        ) : (
            messages.map((msg, index) => (
                <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    {msg.role === 'model' && <AiIcon className="h-6 w-6 ai-icon-accent flex-shrink-0 mt-1" />}
                    <div className={`max-w-lg rounded-xl px-4 py-2 ${msg.role === 'user' ? 'ai-bubble-user' : 'ai-bubble-model'}`}>
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
      <form onSubmit={handleSend} className="flex-shrink-0 mt-4 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="AI asistana bir mesaj gönder..."
          className="w-full p-3 ai-input rounded-lg transition-colors placeholder-gray-400"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="ai-button p-3 rounded-lg disabled:cursor-not-allowed transition-colors"
        >
          <PaperAirplaneIcon className="h-6 w-6" />
        </button>
      </form>
    </div>
  );
};