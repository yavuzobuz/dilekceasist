import DOMPurify from 'dompurify';

const SANITIZE_OPTIONS = {
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

export const sanitizeHtml = (value: string): string => {
    if (typeof value !== 'string' || value.length === 0) return '';
    return DOMPurify.sanitize(value, SANITIZE_OPTIONS);
};
