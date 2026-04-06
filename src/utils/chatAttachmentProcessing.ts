import JSZip from 'jszip';
import UTIF from 'utif2';
import mammoth from 'mammoth';

import type {
    AnalysisData,
    CaseDetails,
    ContactInfo,
    DetailedAnalysis,
    LawyerInfo,
    LegalSearchPacket,
    PrecedentSearchPlan,
    UploadedFile,
    WebSearchPlan,
} from '../../types';

const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = String(reader.result || '').split(',')[1] || '';
            resolve(base64String);
        };
        reader.onerror = (error) => reject(error);
    });

const mergeStringField = (currentValue: string | undefined, incomingValue: string | undefined): string => {
    const incoming = typeof incomingValue === 'string' ? incomingValue.trim() : '';
    if (incoming) return incoming;
    return typeof currentValue === 'string' ? currentValue : '';
};

const mergeCaseDetails = (
    currentValue?: CaseDetails,
    incomingValue?: CaseDetails
): CaseDetails | undefined => {
    if (!currentValue && !incomingValue) return undefined;

    return {
        caseTitle: mergeStringField(currentValue?.caseTitle, incomingValue?.caseTitle),
        court: mergeStringField(currentValue?.court, incomingValue?.court),
        fileNumber: mergeStringField(currentValue?.fileNumber, incomingValue?.fileNumber),
        decisionNumber: mergeStringField(currentValue?.decisionNumber, incomingValue?.decisionNumber),
        decisionDate: mergeStringField(currentValue?.decisionDate, incomingValue?.decisionDate),
    };
};

const mergeLawyerInfo = (
    currentValue?: LawyerInfo,
    incomingValue?: LawyerInfo
): LawyerInfo | undefined => {
    if (!currentValue && !incomingValue) return undefined;

    return {
        name: mergeStringField(currentValue?.name, incomingValue?.name),
        address: mergeStringField(currentValue?.address, incomingValue?.address),
        phone: mergeStringField(currentValue?.phone, incomingValue?.phone),
        email: mergeStringField(currentValue?.email, incomingValue?.email),
        barNumber: mergeStringField(currentValue?.barNumber, incomingValue?.barNumber),
        bar: mergeStringField(currentValue?.bar, incomingValue?.bar),
        title: mergeStringField(currentValue?.title, incomingValue?.title) || 'Avukat',
        tcNo: mergeStringField(currentValue?.tcNo, incomingValue?.tcNo) || undefined,
    };
};

const mergeContactInfo = (
    currentValue?: ContactInfo[],
    incomingValue?: ContactInfo[]
): ContactInfo[] | undefined => {
    const combined = [...(Array.isArray(currentValue) ? currentValue : []), ...(Array.isArray(incomingValue) ? incomingValue : [])];
    if (combined.length === 0) return undefined;

    const seen = new Set<string>();
    const merged: ContactInfo[] = [];

    for (const item of combined) {
        const normalized = {
            name: mergeStringField('', item?.name),
            address: mergeStringField('', item?.address),
            phone: mergeStringField('', item?.phone),
            email: mergeStringField('', item?.email),
            tcNo: mergeStringField('', item?.tcNo) || undefined,
            barNumber: mergeStringField('', item?.barNumber) || undefined,
        };
        const key = [
            normalized.name,
            normalized.address,
            normalized.phone,
            normalized.email,
            normalized.tcNo || '',
            normalized.barNumber || '',
        ].join('|');
        if (!key.trim() || seen.has(key)) continue;
        seen.add(key);
        merged.push(normalized);
    }

    return merged.length > 0 ? merged : undefined;
};

const mergeUniqueStringList = (currentValue?: string[], incomingValue?: string[]): string[] | undefined => {
    const combined = [
        ...(Array.isArray(currentValue) ? currentValue : []),
        ...(Array.isArray(incomingValue) ? incomingValue : []),
    ]
        .map((item) => String(item || '').trim())
        .filter(Boolean);

    if (combined.length === 0) return undefined;
    return Array.from(new Set(combined));
};

const mergeLegalSearchPacket = (
    currentValue?: LegalSearchPacket,
    incomingValue?: LegalSearchPacket
): LegalSearchPacket | undefined => {
    if (!currentValue && !incomingValue) return undefined;
    if (!currentValue) return incomingValue;
    if (!incomingValue) return currentValue;

    return {
        primaryDomain: mergeStringField(currentValue.primaryDomain, incomingValue.primaryDomain) as LegalSearchPacket['primaryDomain'],
        caseType: mergeStringField(currentValue.caseType, incomingValue.caseType),
        coreIssue: mergeStringField(currentValue.coreIssue, incomingValue.coreIssue),
        requiredConcepts: mergeUniqueStringList(currentValue.requiredConcepts, incomingValue.requiredConcepts),
        supportConcepts: mergeUniqueStringList(currentValue.supportConcepts, incomingValue.supportConcepts),
        evidenceConcepts: mergeUniqueStringList(currentValue.evidenceConcepts, incomingValue.evidenceConcepts),
        negativeConcepts: mergeUniqueStringList(currentValue.negativeConcepts, incomingValue.negativeConcepts),
        preferredSource: mergeStringField(currentValue.preferredSource, incomingValue.preferredSource) as LegalSearchPacket['preferredSource'],
        preferredBirimCodes: mergeUniqueStringList(currentValue.preferredBirimCodes, incomingValue.preferredBirimCodes),
        searchSeedText: mergeStringField(currentValue.searchSeedText, incomingValue.searchSeedText),
        queryMode: mergeStringField(currentValue.queryMode, incomingValue.queryMode) as LegalSearchPacket['queryMode'],
    };
};

const mergeWebSearchPlan = (
    currentValue?: WebSearchPlan,
    incomingValue?: WebSearchPlan
): WebSearchPlan | undefined => {
    if (!currentValue && !incomingValue) return undefined;

    return {
        coreQueries: mergeUniqueStringList(currentValue?.coreQueries, incomingValue?.coreQueries),
        supportQueries: mergeUniqueStringList(currentValue?.supportQueries, incomingValue?.supportQueries),
        negativeQueries: mergeUniqueStringList(currentValue?.negativeQueries, incomingValue?.negativeQueries),
        focusTopics: mergeUniqueStringList(currentValue?.focusTopics, incomingValue?.focusTopics),
    };
};

const mergePrecedentSearchPlan = (
    currentValue?: PrecedentSearchPlan,
    incomingValue?: PrecedentSearchPlan
): PrecedentSearchPlan | undefined => {
    if (!currentValue && !incomingValue) return undefined;

    return {
        requiredConcepts: mergeUniqueStringList(currentValue?.requiredConcepts, incomingValue?.requiredConcepts),
        supportConcepts: mergeUniqueStringList(currentValue?.supportConcepts, incomingValue?.supportConcepts),
        evidenceConcepts: mergeUniqueStringList(currentValue?.evidenceConcepts, incomingValue?.evidenceConcepts),
        negativeConcepts: mergeUniqueStringList(currentValue?.negativeConcepts, incomingValue?.negativeConcepts),
        preferredSource: mergeStringField(currentValue?.preferredSource, incomingValue?.preferredSource) as PrecedentSearchPlan['preferredSource'],
        preferredBirimCodes: mergeUniqueStringList(currentValue?.preferredBirimCodes, incomingValue?.preferredBirimCodes),
        searchSeedText: mergeStringField(currentValue?.searchSeedText, incomingValue?.searchSeedText),
        queryMode: mergeStringField(currentValue?.queryMode, incomingValue?.queryMode) as PrecedentSearchPlan['queryMode'],
    };
};

const mergeDetailedAnalysis = (
    currentValue?: DetailedAnalysis,
    incomingValue?: DetailedAnalysis
): DetailedAnalysis | undefined => {
    if (!currentValue && !incomingValue) return undefined;

    return {
        documentType: mergeStringField(currentValue?.documentType, incomingValue?.documentType),
        caseStage: mergeStringField(currentValue?.caseStage, incomingValue?.caseStage),
        primaryDomain: mergeStringField(currentValue?.primaryDomain, incomingValue?.primaryDomain) as DetailedAnalysis['primaryDomain'],
        secondaryDomains: mergeUniqueStringList(currentValue?.secondaryDomains, incomingValue?.secondaryDomains),
        caseType: mergeStringField(currentValue?.caseType, incomingValue?.caseType),
        coreIssue: mergeStringField(currentValue?.coreIssue, incomingValue?.coreIssue),
        keyFacts: mergeUniqueStringList(currentValue?.keyFacts, incomingValue?.keyFacts),
        timeline: mergeUniqueStringList(currentValue?.timeline, incomingValue?.timeline),
        claims: mergeUniqueStringList(currentValue?.claims, incomingValue?.claims),
        defenses: mergeUniqueStringList(currentValue?.defenses, incomingValue?.defenses),
        evidenceSummary: mergeUniqueStringList(currentValue?.evidenceSummary, incomingValue?.evidenceSummary),
        legalIssues: mergeUniqueStringList(currentValue?.legalIssues, incomingValue?.legalIssues),
        risksAndWeakPoints: mergeUniqueStringList(currentValue?.risksAndWeakPoints, incomingValue?.risksAndWeakPoints),
        missingCriticalInfo: mergeUniqueStringList(currentValue?.missingCriticalInfo, incomingValue?.missingCriticalInfo),
        suggestedNextSteps: mergeUniqueStringList(currentValue?.suggestedNextSteps, incomingValue?.suggestedNextSteps),
        webSearchPlan: mergeWebSearchPlan(currentValue?.webSearchPlan, incomingValue?.webSearchPlan),
        precedentSearchPlan: mergePrecedentSearchPlan(currentValue?.precedentSearchPlan, incomingValue?.precedentSearchPlan),
    };
};

export const mergeAnalysisData = (
    currentValue: AnalysisData | null | undefined,
    incomingValue: AnalysisData | null | undefined
): AnalysisData | null => {
    if (!currentValue && !incomingValue) return null;
    if (!currentValue && incomingValue) return incomingValue;
    if (currentValue && !incomingValue) return currentValue;

    const summaryParts = [
        String(currentValue?.summary || '').trim(),
        String(incomingValue?.summary || '').trim(),
    ].filter(Boolean);

    const uniqueSummaryParts: string[] = [];
    const seenSummary = new Set<string>();
    for (const part of summaryParts) {
        if (seenSummary.has(part)) continue;
        seenSummary.add(part);
        uniqueSummaryParts.push(part);
    }

    return {
        summary: uniqueSummaryParts.join('\n\n').trim(),
        potentialParties: Array.from(
            new Set([
                ...(Array.isArray(currentValue?.potentialParties) ? currentValue.potentialParties : []),
                ...(Array.isArray(incomingValue?.potentialParties) ? incomingValue.potentialParties : []),
            ].filter(Boolean))
        ),
        caseDetails: mergeCaseDetails(currentValue?.caseDetails, incomingValue?.caseDetails),
        lawyerInfo: mergeLawyerInfo(currentValue?.lawyerInfo, incomingValue?.lawyerInfo),
        contactInfo: mergeContactInfo(currentValue?.contactInfo, incomingValue?.contactInfo),
        legalSearchPacket: mergeLegalSearchPacket(currentValue?.legalSearchPacket, incomingValue?.legalSearchPacket),
        analysisInsights: mergeDetailedAnalysis(currentValue?.analysisInsights, incomingValue?.analysisInsights),
    };
};

export interface PreparedChatAttachmentPayload {
    uploadedFiles: UploadedFile[];
    udfTextContent: string;
    wordTextContent: string;
    skippedFileNames: string[];
    processedFileNames: string[];
}

export async function prepareChatAttachmentsForAnalysis(files: File[]): Promise<PreparedChatAttachmentPayload> {
    const uploadedFiles: UploadedFile[] = [];
    const skippedFileNames: string[] = [];
    const processedFileNames: string[] = [];
    let udfTextContent = '';
    let wordTextContent = '';

    if (!Array.isArray(files) || files.length === 0) {
        return {
            uploadedFiles,
            udfTextContent,
            wordTextContent,
            skippedFileNames,
            processedFileNames,
        };
    }

    const zip = new JSZip();

    for (const sourceFile of files) {
        const extension = String(sourceFile?.name || '').split('.').pop()?.toLowerCase();

        try {
            if (extension === 'pdf') {
                uploadedFiles.push({
                    name: sourceFile.name,
                    mimeType: 'application/pdf',
                    data: await fileToBase64(sourceFile),
                });
                processedFileNames.push(sourceFile.name);
                continue;
            }

            if (extension === 'tif' || extension === 'tiff') {
                const arrayBuffer = await sourceFile.arrayBuffer();
                const ifds = UTIF.decode(arrayBuffer);
                const firstPage = ifds[0];
                if (!firstPage) {
                    skippedFileNames.push(sourceFile.name);
                    continue;
                }

                UTIF.decodeImage(arrayBuffer, firstPage);
                const rgba = UTIF.toRGBA8(firstPage);
                const canvas = document.createElement('canvas');
                canvas.width = firstPage.width;
                canvas.height = firstPage.height;
                const context = canvas.getContext('2d');
                if (!context) {
                    skippedFileNames.push(sourceFile.name);
                    continue;
                }

                const imageData = context.createImageData(firstPage.width, firstPage.height);
                imageData.data.set(rgba);
                context.putImageData(imageData, 0, 0);

                const base64Data = canvas.toDataURL('image/png').split(',')[1] || '';
                if (!base64Data) {
                    skippedFileNames.push(sourceFile.name);
                    continue;
                }

                uploadedFiles.push({
                    name: sourceFile.name,
                    mimeType: 'image/png',
                    data: base64Data,
                });
                processedFileNames.push(sourceFile.name);
                continue;
            }

            if (String(sourceFile.type || '').startsWith('image/')) {
                uploadedFiles.push({
                    name: sourceFile.name,
                    mimeType: sourceFile.type,
                    data: await fileToBase64(sourceFile),
                });
                processedFileNames.push(sourceFile.name);
                continue;
            }

            if (extension === 'udf') {
                const loadedZip = await zip.loadAsync(sourceFile);
                let xmlContent = '';
                let xmlFile = null;

                for (const fileName in loadedZip.files) {
                    if (!Object.prototype.hasOwnProperty.call(loadedZip.files, fileName)) continue;
                    const fileObject = loadedZip.files[fileName];
                    if (!fileObject.dir && fileObject.name.toLowerCase().endsWith('.xml')) {
                        xmlFile = fileObject;
                        break;
                    }
                }

                if (xmlFile) {
                    xmlContent = await xmlFile.async('string');
                }

                if (!xmlContent.trim()) {
                    skippedFileNames.push(sourceFile.name);
                    continue;
                }

                udfTextContent += `\n\n--- UDF Belgesi: ${sourceFile.name} ---\n${xmlContent}`;
                processedFileNames.push(sourceFile.name);
                continue;
            }

            if (extension === 'doc' || extension === 'docx') {
                const arrayBuffer = await sourceFile.arrayBuffer();
                const extracted = await mammoth.extractRawText({ arrayBuffer });
                wordTextContent += `\n\n--- Word Belgesi: ${sourceFile.name} ---\n${extracted.value}`;
                processedFileNames.push(sourceFile.name);
                continue;
            }

            if (extension === 'txt') {
                const textContent = await sourceFile.text();
                wordTextContent += `\n\n--- Metin Belgesi: ${sourceFile.name} ---\n${textContent}`;
                processedFileNames.push(sourceFile.name);
                continue;
            }

            skippedFileNames.push(sourceFile.name);
        } catch (error) {
            console.error(`Chat attachment preprocessing failed for ${sourceFile.name}:`, error);
            skippedFileNames.push(sourceFile.name);
        }
    }

    return {
        uploadedFiles,
        udfTextContent: udfTextContent.trim(),
        wordTextContent: wordTextContent.trim(),
        skippedFileNames,
        processedFileNames,
    };
}
