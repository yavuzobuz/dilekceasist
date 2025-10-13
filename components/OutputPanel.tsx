
import React, { useState } from 'react';
import { ChatMessage, GroundingSource, WebSearchResult } from '../types';
import { PetitionView } from './PetitionView';
import { ChatView } from './ChatView';

interface OutputPanelProps {
  // Petition props
  petitionVersion: number;
  generatedPetition: string;
  setGeneratedPetition: (petition: string) => void;
  onRewrite: (text: string) => Promise<string>;
  sources: GroundingSource[];
  isLoadingPetition: boolean;
  onReview: () => void;
  isReviewing: boolean;

  // Chat props
  chatMessages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoadingChat: boolean;

  // Context props for ChatView
  searchKeywords: string[];
  setSearchKeywords: (keywords: string[]) => void;
  webSearchResult: WebSearchResult | null;
  setWebSearchResult: (result: React.SetStateAction<WebSearchResult | null>) => void;
  docContent: string;
  setDocContent: (content: string) => void;
  specifics: string;
  setSpecifics: (specifics: string) => void;
}

type Tab = 'petition' | 'chat';

export const OutputPanel: React.FC<OutputPanelProps> = (props) => {
  const [activeTab, setActiveTab] = useState<Tab>('petition');

  const TabButton: React.FC<{tabId: Tab; children: React.ReactNode}> = ({tabId, children}) => (
     <button
        onClick={() => setActiveTab(tabId)}
        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2
            ${activeTab === tabId 
                ? 'text-blue-400 border-blue-400' 
                : 'text-gray-400 border-transparent hover:text-white hover:border-gray-500'}`}
    >
        {children}
    </button>
  );

  return (
    <div className="bg-gray-800 rounded-xl shadow-2xl flex flex-col h-full min-h-[500px] lg:min-h-0">
      <div className="flex border-b border-gray-700 px-4">
        <TabButton tabId="petition">Oluşturulan Dilekçe</TabButton>
        <TabButton tabId="chat">AI Sohbet</TabButton>
      </div>
      <div className="flex-grow p-1 overflow-hidden relative">
        {activeTab === 'petition' && (
          <PetitionView 
            key={props.petitionVersion}
            petition={props.generatedPetition}
            setGeneratedPetition={props.setGeneratedPetition}
            sources={props.sources}
            isLoading={props.isLoadingPetition}
            onRewrite={props.onRewrite}
            onReview={props.onReview}
            isReviewing={props.isReviewing}
          />
        )}
        {activeTab === 'chat' && (
          <ChatView 
            messages={props.chatMessages}
            onSendMessage={props.onSendMessage}
            isLoading={props.isLoadingChat}
            searchKeywords={props.searchKeywords}
            setSearchKeywords={props.setSearchKeywords}
            webSearchResult={props.webSearchResult}
            setWebSearchResult={props.setWebSearchResult}
            docContent={props.docContent}
            setDocContent={props.setDocContent}
            specifics={props.specifics}
            setSpecifics={props.setSpecifics}
          />
        )}
      </div>
    </div>
  );
};
