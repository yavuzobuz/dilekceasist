import { describe, expect, it, vi } from 'vitest';
import {
    HARCLAR_2025,
    AVUKATLIK_UCRET_2025,
    shouldCheckForUpdates,
    getNextCheckDate,
} from '../src/config/feeTariffs';

describe('feeTariffs config and helpers', () => {
    it('should expose non-zero core fee values', () => {
        expect(HARCLAR_2025.basvurmaHarci.asliyeHukuk).toBeGreaterThan(0);
        expect(HARCLAR_2025.nispiHarc.kararIlam).toBeGreaterThan(0);
        expect(AVUKATLIK_UCRET_2025.asliyeMahkeme).toBeGreaterThan(0);
    });

    it('should require check when lastChecked is null', () => {
        expect(shouldCheckForUpdates(null)).toBe(true);
    });

    it('should not require check for a recent date', () => {
        const recent = new Date();
        recent.setDate(recent.getDate() - 20);
        expect(shouldCheckForUpdates(recent.toISOString())).toBe(false);
    });

    it('should require check for an old date', () => {
        const old = new Date();
        old.setMonth(old.getMonth() - 4);
        expect(shouldCheckForUpdates(old.toISOString())).toBe(true);
    });

    it('getNextCheckDate should return now-ish when lastChecked is null', () => {
        const before = Date.now();
        const next = getNextCheckDate(null).getTime();
        const after = Date.now();

        expect(next).toBeGreaterThanOrEqual(before);
        expect(next).toBeLessThanOrEqual(after + 1000);
    });

    it('getNextCheckDate should add 3 months', () => {
        const start = '2025-01-15T00:00:00.000Z';
        const next = getNextCheckDate(start);

        expect(next.getUTCMonth()).toBe(3); // April (0-indexed)
        expect(next.getUTCDate()).toBe(15);
    });
});

