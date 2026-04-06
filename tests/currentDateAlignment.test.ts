import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

const read = (relativePath: string) =>
    fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

describe('current date alignment', () => {
    it('injects shared current-date helper into review flow', () => {
        const reviewSource = read('backend/gemini/review.js');
        expect(reviewSource).toContain("getCurrentDateContext");
        expect(reviewSource).toContain("GUNCEL TARIH BAGLAMI");
    });

    it('injects shared current-date helper into rewrite flow', () => {
        const rewriteSource = read('backend/gemini/rewrite.js');
        expect(rewriteSource).toContain("getCurrentDateContext");
        expect(rewriteSource).toContain("GUNCEL TARIH BAGLAMI");
    });

    it('injects shared current-date helper into word assistant flow', () => {
        const wordSource = read('backend/word/respond.js');
        expect(wordSource).toContain("getCurrentDateContext");
        expect(wordSource).toContain("Guncel tarih baglami:");
    });
});
