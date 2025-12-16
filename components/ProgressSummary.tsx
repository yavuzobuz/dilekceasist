import React from 'react';
import { PetitionType, UserRole, CaseDetails, AnalysisData, WebSearchResult } from '../types';
import { DocumentTextIcon, UserCircleIcon, UsersIcon, BuildingLibraryIcon } from './Icon';

interface ProgressSummaryProps {
    petitionType: PetitionType;
    userRole: UserRole;
    caseDetails: CaseDetails;
    parties: { [key: string]: string };
    files: File[];
    analysisData: AnalysisData | null;
    webSearchResult: WebSearchResult | null;
    generatedPetition: string;
}

type StepStatus = 'completed' | 'current' | 'upcoming';

const steps = [
    "Temel Bilgiler",
    "Belge Yükleme",
    "Analiz",
    "Araştırma",
    "Dilekçe Hazır",
];

const SummaryItem: React.FC<{ icon: React.ReactNode; label: string; value: string | React.ReactNode; }> = ({ icon, label, value }) => (
    <div className="flex items-start text-sm">
        <span className="text-red-500 mr-2 mt-0.5">{icon}</span>
        <span className="font-semibold text-gray-300 mr-1.5">{label}:</span>
        <span className="text-white">{value || <span className="text-gray-500">Belirtilmedi</span>}</span>
    </div>
);

const StepIndicator: React.FC<{ status: StepStatus; label: string; isLast?: boolean }> = ({ status, label, isLast }) => {
    const statusClasses = {
        completed: {
            circle: 'bg-red-600 border-red-500',
            text: 'text-red-400',
            line: 'bg-red-600'
        },
        current: {
            circle: 'bg-red-700 border-red-400 ring-2 ring-red-500',
            text: 'text-white font-semibold',
            line: 'bg-gray-700'
        },
        upcoming: {
            circle: 'bg-gray-800 border-gray-700',
            text: 'text-gray-500',
            line: 'bg-gray-700'
        }
    };
    const classes = statusClasses[status];

    return (
        <div className="flex items-center">
            <div className="flex flex-col items-center">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${classes.circle}`}>
                    {status === 'completed' && <span className="text-white text-xs font-bold">✓</span>}
                </div>
                <p className={`text-xs mt-1 text-center transition-colors ${classes.text}`}>{label}</p>
            </div>
            {!isLast && <div className={`flex-1 h-0.5 mx-2 transition-colors ${classes.line}`} />}
        </div>
    );
};


export const ProgressSummary: React.FC<ProgressSummaryProps> = ({
    petitionType, userRole, caseDetails, parties, files, analysisData, webSearchResult, generatedPetition
}) => {
    const calculateCurrentStep = (): number => {
        if (generatedPetition) return 5;
        if (webSearchResult) return 4;
        if (analysisData) return 3;
        if (files.length > 0) return 2;
        return 1;
    };

    const currentStep = calculateCurrentStep();

    const getPartyDisplay = () => {
        const partyValues = Object.values(parties).filter(p => p);
        if (partyValues.length === 0) return null;
        return partyValues.join(' / ');
    };

    const getCaseDetailsDisplay = () => {
        const details = [
            caseDetails.court,
            caseDetails.fileNumber
        ].filter(Boolean).join(' - ');
        return details;
    }

    return (
        <div className="bg-gradient-to-br from-black via-gray-900 to-black backdrop-blur-sm border border-gray-800 rounded-xl my-6 p-4 shadow-lg shadow-red-900/10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Side: Progress Bar */}
                <div className="flex flex-col justify-center">
                    <h3 className="text-base font-semibold text-white mb-3">İlerleme Durumu</h3>
                    <div className="flex items-center w-full overflow-x-auto pb-2 sm:overflow-visible sm:pb-0">
                        {steps.map((step, index) => {
                            const stepNumber = index + 1;
                            const status: StepStatus = stepNumber < currentStep ? 'completed' : (stepNumber === currentStep ? 'current' : 'upcoming');
                            return <StepIndicator key={step} status={status} label={step} isLast={index === steps.length - 1} />;
                        })}
                    </div>
                </div>

                {/* Right Side: Summary */}
                <div className="border-t border-gray-800 md:border-t-0 md:border-l md:border-gray-800 md:pl-6 pt-4 md:pt-0">
                    <h3 className="text-base font-semibold text-white mb-3">Dilekçe Özeti</h3>
                    <div className="space-y-2">
                        <SummaryItem icon={<DocumentTextIcon className="w-4 h-4" />} label="Tür" value={petitionType} />
                        <SummaryItem icon={<UserCircleIcon className="w-4 h-4" />} label="Rolünüz" value={userRole} />
                        <SummaryItem icon={<UsersIcon className="w-4 h-4" />} label="Taraflar" value={getPartyDisplay()} />
                        <SummaryItem icon={<BuildingLibraryIcon className="w-4 h-4" />} label="Dava" value={getCaseDetailsDisplay()} />
                    </div>
                </div>
            </div>
        </div>
    );
};
