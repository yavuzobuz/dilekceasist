import { describe, expect, it } from 'vitest';
import { getCurrentDateContext } from '../backend/gemini/current-date.js';
import { __testables as chatTestables } from '../backend/gemini/chat.js';

describe('current date context', () => {
    it('builds a current-date instruction with iso date and timezone', () => {
        const context = getCurrentDateContext();

        expect(context.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(context.timeZone).toBe('Europe/Istanbul');
        expect(context.instruction).toContain('BUGUNUN TARIHI:');
        expect(context.instruction).toContain(context.isoDate);
    });

    it('injects current date into chat system instruction', () => {
        const instruction = chatTestables.buildSystemInstruction({
            analysisSummary: 'Iscilik alacagi uyusmazligi',
            context: {},
        });
        const normalizedInstruction = instruction.toLocaleLowerCase('tr-TR');

        expect(instruction).toContain('BUGUNUN TARIHI:');
        expect(instruction).toContain('Europe/Istanbul');
        expect(normalizedInstruction).toContain('zamanasimi');
    });
});
