import { buildDocDrivenSkillPackage, detectSkillDomain } from './planner.js';
import { resolveQueryMode } from './shared.js';

export const buildRoutedSkillPackage = ({
    rawText = '',
    preferredSource = 'all',
} = {}) => buildDocDrivenSkillPackage({ rawText, preferredSource });

export const __testables = {
    detectSkillDomain,
    resolveQueryMode,
};
