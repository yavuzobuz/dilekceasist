import React from 'react';
import { MissingInfoQuestion } from './missingInfoChecklist';

interface MissingInfoChecklistPanelProps {
  questions: MissingInfoQuestion[];
  answers: Record<string, string>;
  hasScanned: boolean;
  onRunScan: () => void;
  onAnswerChange: (questionId: string, value: string) => void;
  blockingUnansweredCount: number;
  totalUnansweredCount: number;
}

const PRIORITY_META: Record<MissingInfoQuestion['priority'], { label: string; className: string }> = {
  bloklayici: {
    label: 'Bloklayıcı',
    className: 'bg-red-500/15 text-red-300 border-red-500/30',
  },
  onemli: {
    label: 'Önemli',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  oneri: {
    label: 'Öneri',
    className: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  },
};

export const MissingInfoChecklistPanel: React.FC<MissingInfoChecklistPanelProps> = ({
  questions,
  answers,
  hasScanned,
  onRunScan,
  onAnswerChange,
  blockingUnansweredCount,
  totalUnansweredCount,
}) => {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-[#0E0E10] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Eksikleri Tara</p>
          <p className="text-xs text-gray-400">
            Üretimden önce kritik boşlukları bulur, en fazla 3 soru sorar.
          </p>
        </div>
        <button
          type="button"
          onClick={onRunScan}
          className="px-3 py-1.5 rounded-lg border border-white/15 bg-[#1A1A1D] hover:bg-[#232327] text-xs font-medium text-white transition-colors"
        >
          Eksikleri Tara
        </button>
      </div>

      {hasScanned && questions.length === 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          Bu turda kritik eksik bulunmadı.
        </div>
      )}

      {questions.length > 0 && (
        <div className="space-y-3">
          {questions.map(question => {
            const priorityMeta = PRIORITY_META[question.priority];
            return (
              <div key={question.id} className="rounded-lg border border-white/10 bg-[#141417] p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-white">{question.question}</p>
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${priorityMeta.className}`}>
                    {priorityMeta.label}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{question.reason}</p>
                <textarea
                  rows={2}
                  value={answers[question.id] || ''}
                  onChange={(event) => onAnswerChange(question.id, event.target.value)}
                  placeholder={question.placeholder || 'Kısa ve net cevap yazın.'}
                  className="w-full rounded-lg border border-white/10 bg-[#111113] px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-y"
                />
              </div>
            );
          })}

          {blockingUnansweredCount > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {blockingUnansweredCount} bloklayıcı soru boş. Üretim butonu, bunlar yanıtlanmadan açılmaz.
            </div>
          )}

          {blockingUnansweredCount === 0 && totalUnansweredCount > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Bloklayıcı sorular tamamlandı. İstersen kalan soruları da doldurabilirsin.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
