import { describe, it, expect } from 'vitest';
import { ICRA_TEMPLATES, IS_HUKUKU_TEMPLATES } from '../templates-part1.js';
import {
    TUKETICI_TEMPLATES,
    TICARET_TEMPLATES,
    MIRAS_TEMPLATES,
    CEZA_TEMPLATES,
    IDARI_TEMPLATES,
} from '../templates-part2.js';

const ALL_TEMPLATES = [
    ...ICRA_TEMPLATES,
    ...IS_HUKUKU_TEMPLATES,
    ...TUKETICI_TEMPLATES,
    ...TICARET_TEMPLATES,
    ...MIRAS_TEMPLATES,
    ...CEZA_TEMPLATES,
    ...IDARI_TEMPLATES,
];

describe('template catalog integrity', () => {
    it('should include expanded Ceza and Idari template counts', () => {
        expect(CEZA_TEMPLATES.length).toBeGreaterThanOrEqual(12);
        expect(IDARI_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    });

    it('should keep all template ids unique across the full catalog', () => {
        const ids = ALL_TEMPLATES.map(template => template.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    it('should contain the expected Ceza expansion ids (25-34)', () => {
        const cezaExtraIds = CEZA_TEMPLATES
            .map(template => Number(template.id))
            .filter(id => id >= 25 && id <= 34)
            .sort((a, b) => a - b);

        expect(cezaExtraIds).toEqual([25, 26, 27, 28, 29, 30, 31, 32, 33, 34]);
    });

    it('should contain the expected Idari expansion ids (35-44)', () => {
        const idariExtraIds = IDARI_TEMPLATES
            .map(template => Number(template.id))
            .filter(id => id >= 35 && id <= 44)
            .sort((a, b) => a - b);

        expect(idariExtraIds).toEqual([35, 36, 37, 38, 39, 40, 41, 42, 43, 44]);
    });

    it('should enforce minimum schema fields for every template', () => {
        for (const template of ALL_TEMPLATES) {
            expect(typeof template.id).toBe('string');
            expect(template.id.length).toBeGreaterThan(0);
            expect(typeof template.category).toBe('string');
            expect(template.category.length).toBeGreaterThan(0);
            expect(typeof template.title).toBe('string');
            expect(template.title.length).toBeGreaterThan(0);
            expect(typeof template.description).toBe('string');
            expect(template.description.length).toBeGreaterThan(0);
            expect(typeof template.content).toBe('string');
            expect(template.content.length).toBeGreaterThan(20);
            expect(Array.isArray(template.variables)).toBe(true);
            expect(template.variables.length).toBeGreaterThan(0);

            for (const variable of template.variables) {
                expect(typeof variable.key).toBe('string');
                expect(variable.key.length).toBeGreaterThan(0);
                expect(typeof variable.label).toBe('string');
                expect(variable.label.length).toBeGreaterThan(0);
                expect(typeof variable.type).toBe('string');
                expect(variable.type.length).toBeGreaterThan(0);
            }
        }
    });

    it('should include user-guided field blocks for Ceza expansion templates', () => {
        const extraCeza = CEZA_TEMPLATES.filter(template => Number(template.id) >= 25 && Number(template.id) <= 34);

        for (const template of extraCeza) {
            const keys = template.variables.map(v => v.key);
            expect(keys).toContain('SAVCILIK');
            expect(keys).toContain('SIKAYETCI_AD');
            expect(keys).toContain('SUPHELI_AD');
            expect(keys).toContain('OLAY_ANLATIMI');
            expect(keys).toContain('DELILLER');
            expect(keys).toContain('TALEPLER');
        }
    });

    it('should include user-guided field blocks for Idari expansion templates', () => {
        const extraIdari = IDARI_TEMPLATES.filter(template => Number(template.id) >= 35 && Number(template.id) <= 44);

        for (const template of extraIdari) {
            const keys = template.variables.map(v => v.key);
            expect(keys).toContain('MAHKEME');
            expect(keys).toContain('DAVALI_IDARE');
            expect(keys).toContain('DELILLER');
            expect(keys).toContain('SONUC_TALEBI');
        }
    });
});

