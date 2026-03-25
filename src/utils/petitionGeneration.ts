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
    analysisSummary: analysisData.summary,
    webSearchResult: webSearchResult?.summary || '',
    webSources: webSearchResult?.sources || [],
    legalSearchResult: buildLegalSearchResultSummary(legalSearchResults),
    legalSearchResults,
    docContent,
    specifics,
    searchKeywords,
    chatHistory,
    parties,
    webSourceCount: webSearchResult?.sources?.length || 0,
    legalResultCount: legalSearchResults.length,
    lawyerInfo: analysisData.lawyerInfo,
    contactInfo: analysisData.contactInfo,
    analysisInsights: analysisData.analysisInsights,
});
