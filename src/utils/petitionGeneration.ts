import type {
    AnalysisData,
    CaseDetails,
    ChatMessage,
    GeneratePetitionParams,
    LegalSearchResult,
    PetitionType,
    UserRole,
    WebSearchResult,
} from '../../types';

interface BuildGeneratePetitionParamsArgs {
    userRole: UserRole;
    petitionType: PetitionType;
    caseDetails: CaseDetails;
    analysisData: AnalysisData;
    webSearchResult: WebSearchResult | null;
    legalSearchResults: LegalSearchResult[];
    docContent: string;
    specifics: string;
    searchKeywords: string[] | string;
    chatHistory: ChatMessage[];
    parties: { [key: string]: string };
}

const trimText = (value: string, maxChars: number): string => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars - 1).trim()}...`;
};

const trimChatHistory = (history: ChatMessage[] = []): ChatMessage[] =>
    (Array.isArray(history) ? history : [])
        .slice(-8)
        .map((message) => ({
            ...message,
            text: trimText(message.text, 1200),
        }));

const trimWebSources = (sources: WebSearchResult['sources'] = []): WebSearchResult['sources'] =>
    (Array.isArray(sources) ? sources : [])
        .filter((source) => typeof source?.uri === 'string' && source.uri.trim().length > 0)
        .slice(0, 4)
        .map((source) => ({
            ...source,
            title: trimText(String(source?.title || ''), 120),
            uri: trimText(String(source?.uri || ''), 220),
        }));

const trimLegalResults = (results: LegalSearchResult[] = []): LegalSearchResult[] =>
    (Array.isArray(results) ? results : [])
        .slice(0, 5)
        .map((result) => ({
            ...result,
            title: trimText(String(result.title || ''), 140),
            ozet: trimText(String(result.ozet || ''), 500),
            snippet: trimText(String(result.snippet || ''), 500),
            selectionReason: trimText(String(result.selectionReason || ''), 240),
        }));

export const buildLegalSearchResultSummary = (results: LegalSearchResult[] = []): string =>
    (Array.isArray(results) ? results : [])
        .map((result) => {
            const reference = [
                result.title || 'Karar',
                result.esasNo ? `E.${result.esasNo}` : '',
                result.kararNo ? `K.${result.kararNo}` : '',
                result.tarih || '',
            ]
                .filter(Boolean)
                .join(' ');
            const summary =
                result.ozet
                || result.snippet
                || result.selectionReason
                || '';

            return summary ? `- ${reference}: ${summary}` : `- ${reference}`;
        })
        .filter(Boolean)
        .join('\n');

export const buildGeneratePetitionParams = ({
    userRole,
    petitionType,
    caseDetails,
    analysisData,
    webSearchResult,
    legalSearchResults,
    docContent,
    specifics,
    searchKeywords,
    chatHistory,
    parties,
}: BuildGeneratePetitionParamsArgs): GeneratePetitionParams => ({
    userRole,
    petitionType,
    caseDetails,
    analysisSummary: trimText(analysisData.summary, 5000),
    webSearchResult: trimText(webSearchResult?.summary || '', 2500),
    webSources: trimWebSources(webSearchResult?.sources || []),
    legalSearchResult: trimText(buildLegalSearchResultSummary(legalSearchResults), 5000),
    legalSearchResults: trimLegalResults(legalSearchResults),
    docContent: trimText(docContent, 8000),
    specifics: trimText(specifics, 3000),
    searchKeywords,
    chatHistory: trimChatHistory(chatHistory),
    parties,
    webSourceCount: trimWebSources(webSearchResult?.sources || []).length,
    legalResultCount: trimLegalResults(legalSearchResults).length,
    lawyerInfo: analysisData.lawyerInfo,
    contactInfo: analysisData.contactInfo,
    analysisInsights: analysisData.analysisInsights,
});

