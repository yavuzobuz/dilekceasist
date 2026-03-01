
import React from 'react';
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
  setDocContent: React.Dispatch<React.SetStateAction<string>>;
  specifics: string;
  setSpecifics: React.Dispatch<React.SetStateAction<string>>;

  // Reset function
  onReset?: () => void;

  // Full-page mode toggle
  onExpandFullPage?: () => void;

  // Branding props
  officeLogoUrl?: string | null;
  corporateHeader?: string | null;
}

export const OutputPanel: React.FC<OutputPanelProps> = (props) => {
  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Petition Section */}
      <div className="bg-gradient-to-br from-black via-gray-900 to-black rounded-xl shadow-2xl shadow-red-900/10 flex flex-col border border-gray-800/50 min-h-[400px]">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Oluşturulan Dilekçe
          </h2>
          <div className="flex items-center gap-2">
            {/* Full-page expand button */}
            {props.generatedPetition && props.onExpandFullPage && (
              <button
                onClick={props.onExpandFullPage}
                className="px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-300 flex items-center gap-2"
                title="Tam sayfa düzenleme modu"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <span className="hidden sm:inline">Tam Sayfa</span>
              </button>
            )}
            {props.onReset && (
              <button
                onClick={props.onReset}
                className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg transition-all duration-300 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Yeni Dilekçe</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex-grow p-1 overflow-hidden relative">
          <PetitionView
            key={props.petitionVersion}
            petition={props.generatedPetition}
            setGeneratedPetition={props.setGeneratedPetition}
            sources={props.sources}
            isLoading={props.isLoadingPetition}
            onRewrite={props.onRewrite}
            onReview={props.onReview}
            isReviewing={props.isReviewing}
            petitionVersion={props.petitionVersion}
            officeLogoUrl={props.officeLogoUrl}
            corporateHeader={props.corporateHeader}
          />
        </div>
      </div>

      {/* Chat Section - Separate and distinct */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl shadow-2xl shadow-blue-900/10 flex flex-col border border-blue-800/30 min-h-[350px]">
        <div className="flex items-center justify-between border-b border-blue-800/30 px-4 py-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            DilekAI Asistan
            <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full">Sohbet</span>
          </h2>
        </div>
        <div className="flex-grow overflow-hidden relative">
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
        </div>
      </div>
    </div>
  );
};
