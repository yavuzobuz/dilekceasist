import { buildRoutedSkillPackage, __testables as routerTestables } from './domain-skills/index.js';
import { SKILL_ID } from './domain-skills/shared.js';
import { sanitizeLegalInput } from './legal-text-utils.js';

export const buildSkillBackedSearchPackage = ({
    rawText = '',
    preferredSource = 'all',
} = {}) => {
    const sanitized = sanitizeLegalInput(rawText, { preserveLayout: true });
    return buildRoutedSkillPackage({ rawText: sanitized.text, preferredSource });
};

export const __testables = {
    skillId: SKILL_ID,
    ...routerTestables,
};
