import { buildLegalResultsPrompt } from './legal-search-context.js';

export const buildAssistantChatContext = ({
    keywords = [],
    webSearchResult = null,
    legalSearchResults = [],
    docContent = '',
    specifics = '',
    allowWebSearch = false,
    allowLegalSearch = false,
    disableDocumentGeneration = true,
} = {}) => ({
    keywords: Array.isArray(keywords) ? keywords.join(', ') : String(keywords || ''),
    searchKeywords: Array.isArray(keywords) ? keywords : [],
    searchSummary: String(webSearchResult?.summary || '').trim(),
    webSearchSummary: String(webSearchResult?.summary || '').trim(),
    webSources: Array.isArray(webSearchResult?.sources) ? webSearchResult.sources.slice(0, 6) : [],
    legalSummary: buildLegalResultsPrompt(Array.isArray(legalSearchResults) ? legalSearchResults.slice(0, 5) : []),
    legalSearchResults: Array.isArray(legalSearchResults) ? legalSearchResults.slice(0, 5) : [],
    docContent: String(docContent || '').trim(),
    specifics: String(specifics || '').trim(),
    allowWebSearch: Boolean(allowWebSearch),
    allowLegalSearch: Boolean(allowLegalSearch),
    disableDocumentGeneration: Boolean(disableDocumentGeneration),
});
