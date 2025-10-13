
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
  
  // Reset function
  onReset?: () => void;
}

type Tab = 'petition' | 'chat';

export const OutputPanel: React.FC<OutputPanelProps> = (props) => {
  const [activeTab, setActiveTab] = useState<Tab>('petition');

  const TabButton: React.FC<{tabId: Tab; children: React.ReactNode}> = ({tabId, children}) => (
     <button
        onClick={() => setActiveTab(tabId)}
        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2
            ${activeTab === tabId 
                ? 'text-red-500 border-red-500' 
                : 'text-gray-400 border-transparent hover:text-white hover:border-red-600/50'}`}
    >
        {children}
    </button>
  );

  return (
    <div className="bg-gradient-to-br from-black via-gray-900 to-black rounded-xl shadow-2xl shadow-red-900/10 flex flex-col h-full min-h-[500px] lg:min-h-0 border border-gray-800/50">
      <div className="flex items-center justify-between border-b border-gray-800 px-4">
        <div className="flex">
          <TabButton tabId="petition">Oluşturulan Dilekçe</TabButton>
          <TabButton tabId="chat">AI Sohbet</TabButton>
        </div>
        {props.onReset && (
          <button
            onClick={props.onReset}
            className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg transition-all duration-300 transform hover:scale-105 active:scale-95 border border-gray-600 hover:border-red-500 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Yeni Dilekçe
          </button>
        )}
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
