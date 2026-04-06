import { CaseDetails, PetitionType } from '../types';

export type MissingInfoPriority = 'bloklayici' | 'onemli' | 'oneri';

export interface MissingInfoQuestion {
  id: string;
  priority: MissingInfoPriority;
  question: string;
  reason: string;
  placeholder?: string;
}

interface MissingInfoChecklistContext {
  petitionType: PetitionType | string;
  caseDetails: CaseDetails;
  parties: Record<string, string>;
  analysisSummary?: string;
  docContent?: string;
  specifics?: string;
}

const PRIORITY_ORDER: Record<MissingInfoPriority, number> = {
  bloklayici: 0,
  onemli: 1,
  oneri: 2,
};

const normalizeText = (value: string): string => value.toLocaleLowerCase('tr-TR');

const hasKeyword = (value: string, keywords: string[]): boolean => {
  const normalized = normalizeText(value);
  return keywords.some(keyword => normalized.includes(normalizeText(keyword)));
};

const hasDateLike = (value: string): boolean => /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4})/.test(value);

const shouldRequireReferenceNumber = (petitionType: PetitionType | string): boolean => {
  return /(itiraz|istinaf|temyiz|karar|icra|takip|kyok|hagb|yenilenmesi|sure tutum)/i.test(String(petitionType || ''));
};

export const buildMissingInfoQuestions = (context: MissingInfoChecklistContext): MissingInfoQuestion[] => {
  const combinedContext = [
    context.analysisSummary || '',
    context.docContent || '',
    context.specifics || '',
  ].join('\n');

  const hasPartyInfo = Object.values(context.parties || {}).some(value => String(value || '').trim().length >= 2);
  const hasCourtInfo = Boolean(context.caseDetails?.court?.trim()) ||
    hasKeyword(combinedContext, ['mahkeme', 'savcılık', 'savcilik', 'icra dairesi', 'idare']);
  const hasReferenceInfo = Boolean(context.caseDetails?.fileNumber?.trim()) || Boolean(context.caseDetails?.decisionNumber?.trim());
  const hasConcreteDemand = hasKeyword(combinedContext, [
    'talep',
    'sonuç',
    'sonuc',
    'karar verilmesini',
    'hükmedilmesini',
    'iptal',
    'itiraz',
    'kabul',
    'red',
    'tazminat',
    'faiz',
  ]);
  const hasDeadlineInfo = /(\d{1,3}\s*(gun|gün|hafta|ay))/i.test(combinedContext) ||
    hasKeyword(combinedContext, ['süre', 'sure', 'tebliğden itibaren', 'tebligden itibaren', 'son gün']);
  const hasCriticalDateInfo = hasDateLike(combinedContext) || Boolean(context.caseDetails?.decisionDate?.trim());
  const amountRelevant = hasKeyword(`${context.petitionType} ${combinedContext}`, ['tazminat', 'alacak', 'borç', 'borc', 'bedel', 'kira', 'para']);
  const hasAmountInfo = /(\d+[.,]?\d*)\s*(tl|₺|lira)\b/i.test(combinedContext);
  const hasEvidenceInfo = hasKeyword(combinedContext, [
    'delil',
    'ek-',
    'tanık',
    'tanik',
    'kamera',
    'whatsapp',
    'mesaj',
    'e-posta',
    'eposta',
    'sözleşme',
    'sozlesme',
  ]);

  const questions: MissingInfoQuestion[] = [];

  if (!hasCourtInfo) {
    questions.push({
      id: 'court_info',
      priority: 'bloklayici',
      question: 'Hangi mahkeme veya merciye hitaben başvuru yapılacak?',
      reason: 'Yanlış merci seçimi, metni doğrudan kullanılamaz hale getirir.',
      placeholder: 'Örn: İstanbul 5. İş Mahkemesi',
    });
  }

  if (!hasPartyInfo) {
    questions.push({
      id: 'party_info',
      priority: 'bloklayici',
      question: 'Tarafların açık ad-soyad veya unvan bilgilerini yazar mısınız?',
      reason: 'Taraf bilgisi olmadan dilekçenin kimliklendirmesi eksik kalır.',
      placeholder: 'Örn: Davacı Ahmet Yılmaz, Davalı ABC A.Ş.',
    });
  }

  if (shouldRequireReferenceNumber(context.petitionType) && !hasReferenceInfo) {
    questions.push({
      id: 'reference_number',
      priority: 'bloklayici',
      question: 'Dosya/Esas-Karar numarası nedir?',
      reason: 'Kanun yolu ve itiraz başvurularında dosya referansı kritik bilgidir.',
      placeholder: 'Örn: 2024/123 E., 2025/87 K.',
    });
  }

  if (!hasConcreteDemand) {
    questions.push({
      id: 'demand_result',
      priority: 'onemli',
      question: 'Talep sonucunu tek cümlede netleştirir misiniz?',
      reason: 'Talep sonucu net değilse model tahmin yürütmek zorunda kalır.',
      placeholder: 'Örn: Fazlaya ilişkin haklarımız saklı kalmak üzere davanın kabulünü talep ederiz.',
    });
  }

  if (!hasDeadlineInfo) {
    questions.push({
      id: 'deadline_info',
      priority: 'onemli',
      question: 'Karşı tarafa verilecek süre kaç gün olacak?',
      reason: 'Süre bilgisi birçok başvuruda usul açısından önemlidir.',
      placeholder: 'Örn: 7 gün',
    });
  }

  if (!hasCriticalDateInfo) {
    questions.push({
      id: 'critical_dates',
      priority: 'onemli',
      question: 'Olayın kritik tarihlerini paylaşır mısınız? (işlem, tebliğ, öğrenme tarihi)',
      reason: 'Süre ve zamanaşımı değerlendirmesi için tarih bilgisi gerekir.',
      placeholder: 'Örn: Tebliğ tarihi 12.02.2026',
    });
  }

  if (amountRelevant && !hasAmountInfo) {
    questions.push({
      id: 'amount_info',
      priority: 'oneri',
      question: 'Talep edilen tutar veya parasal sınır var mı?',
      reason: 'Parasal taleplerde belirsizlik dilekçe gücünü düşürür.',
      placeholder: 'Örn: 150.000 TL maddi tazminat',
    });
  }

  if (!hasEvidenceInfo) {
    questions.push({
      id: 'evidence_info',
      priority: 'oneri',
      question: 'Destekleyici delilleri kısa bir liste halinde ekler misiniz?',
      reason: 'Delil çerçevesi, metnin ikna gücünü ve tutarlılığını artırır.',
      placeholder: 'Örn: Kamera kaydı, 2 tanık, WhatsApp yazışmaları',
    });
  }

  return questions
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 3);
};

export const getMissingInfoAnswerCounts = (
  questions: MissingInfoQuestion[],
  answers: Record<string, string>
): { totalUnanswered: number; blockingUnanswered: number } => {
  let totalUnanswered = 0;
  let blockingUnanswered = 0;

  for (const question of questions) {
    const answer = String(answers[question.id] || '').trim();
    if (answer) continue;
    totalUnanswered += 1;
    if (question.priority === 'bloklayici') {
      blockingUnanswered += 1;
    }
  }

  return { totalUnanswered, blockingUnanswered };
};

export const mergeSpecificsWithChecklist = (
  specifics: string,
  questions: MissingInfoQuestion[],
  answers: Record<string, string>
): string => {
  const answeredItems = questions
    .map(question => {
      const answer = String(answers[question.id] || '').trim();
      if (!answer) return null;
      return `${question.question}\nCevap: ${answer}`;
    })
    .filter((item): item is string => Boolean(item));

  if (answeredItems.length === 0) {
    return specifics;
  }

  const checklistBlock = ['[Eksik Bilgi Cevaplari]', ...answeredItems].join('\n\n');
  const trimmedSpecifics = String(specifics || '').trim();
  return [trimmedSpecifics, checklistBlock].filter(Boolean).join('\n\n');
};
