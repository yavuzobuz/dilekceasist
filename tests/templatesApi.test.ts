import { beforeEach, describe, expect, it, vi } from 'vitest';
import templatesHandler from '../api/templates.js';
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

interface MockReq {
    method: string;
    query: Record<string, any>;
    body: Record<string, any>;
    url: string;
    originalUrl: string;
}

interface MockRes {
    headers: Record<string, string>;
    statusCode: number;
    body: any;
    ended: boolean;
    setHeader: (name: string, value: string) => MockRes;
    status: (code: number) => MockRes;
    json: (payload: any) => MockRes;
    end: () => MockRes;
}

const createReq = (overrides: Partial<MockReq> = {}): MockReq => ({
    method: 'GET',
    query: {},
    body: {},
    url: '/api/templates',
    originalUrl: '/api/templates',
    ...overrides,
});

const createRes = (): MockRes => {
    const res: MockRes = {
        headers: {},
        statusCode: 200,
        body: null,
        ended: false,
        setHeader(name: string, value: string) {
            this.headers[name] = value;
            return this;
        },
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: any) {
            this.body = payload;
            return this;
        },
        end() {
            this.ended = true;
            return this;
        },
    };
    return res;
};

describe('api/templates handler', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('should handle CORS preflight OPTIONS request', async () => {
        const req = createReq({ method: 'OPTIONS' });
        const res = createRes();

        await templatesHandler(req as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.ended).toBe(true);
        expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
        expect(res.headers['Access-Control-Allow-Methods']).toContain('GET');
        expect(res.headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    });

    it('should return all templates for GET /api/templates', async () => {
        const req = createReq({ method: 'GET', query: {} });
        const res = createRes();

        await templatesHandler(req as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.total).toBe(ALL_TEMPLATES.length);
        expect(res.body.templates.length).toBe(ALL_TEMPLATES.length);
    });

    it('should normalize Turkish/ascii category filters consistently', async () => {
        const reqAscii = createReq({ method: 'GET', query: { category: 'Is Hukuku' } });
        const resAscii = createRes();
        await templatesHandler(reqAscii as any, resAscii as any);

        const reqTurkish = createReq({ method: 'GET', query: { category: 'İş Hukuku' } });
        const resTurkish = createRes();
        await templatesHandler(reqTurkish as any, resTurkish as any);

        expect(resAscii.body.total).toBe(resTurkish.body.total);
        expect(resAscii.body.total).toBe(2);
    });

    it('should return expanded Ceza and Idari categories', async () => {
        const reqCeza = createReq({ method: 'GET', query: { category: 'Ceza' } });
        const resCeza = createRes();
        await templatesHandler(reqCeza as any, resCeza as any);

        const reqIdari = createReq({ method: 'GET', query: { category: 'Idari' } });
        const resIdari = createRes();
        await templatesHandler(reqIdari as any, resIdari as any);

        expect(resCeza.body.total).toBeGreaterThanOrEqual(12);
        expect(resIdari.body.total).toBeGreaterThanOrEqual(12);
    });

    it('should support search filtering by title/description', async () => {
        const req = createReq({ method: 'GET', query: { search: 'KYOK' } });
        const res = createRes();

        await templatesHandler(req as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.body.total).toBeGreaterThanOrEqual(1);
        expect(
            res.body.templates.some((template: any) => String(template.title).toLowerCase().includes('kyok'))
        ).toBe(true);
    });

    it('should return a single template by id', async () => {
        const req = createReq({ method: 'GET', query: { id: '35' } });
        const res = createRes();

        await templatesHandler(req as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.template.id).toBe('35');
        expect(res.body.template.category).toBe('İdari');
    });

    it('should return 404 for unknown template id', async () => {
        const req = createReq({ method: 'GET', query: { id: '9999' } });
        const res = createRes();

        await templatesHandler(req as any, res as any);

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('Sablon bulunamadi');
    });

    it('should return 400 when POST body does not include id', async () => {
        const req = createReq({ method: 'POST', body: {} });
        const res = createRes();

        await templatesHandler(req as any, res as any);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Template ID gerekli');
    });

    it('should generate single filled content in POST mode', async () => {
        const req = createReq({
            method: 'POST',
            body: {
                id: '25',
                variables: {
                    SAVCILIK: 'Ankara Cumhuriyet Bassavciligi',
                    SIKAYETCI_AD: 'Ali Yilmaz',
                    SIKAYETCI_TC: '11111111111',
                    SIKAYETCI_ADRES: 'Ankara',
                    SUPHELI_AD: 'Veli Demir',
                    SUPHELI_BILGI: 'Bilinen tek telefon: 05xx...',
                    OLAY_TARIHI: '2026-03-01',
                    OLAY_YERI: 'Ankara Cankaya',
                    OLAY_ANLATIMI: 'Supheli alenen hakaret etmistir.',
                    DELILLER: 'Ekran goruntusu',
                    TALEPLER: 'Suphelinin ifadesi alinsin.',
                    EKLER: '1- Ekran goruntusu',
                },
            },
        });
        const res = createRes();

        await templatesHandler(req as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.content).toContain('Ali Yilmaz');
        expect(res.body.content).toContain('Veli Demir');
        expect(res.body.content).not.toContain('{{SIKAYETCI_AD}}');
        expect(res.body.content).toContain('[...]');
    });

    it('should generate rows in bulk POST mode', async () => {
        const req = createReq({
            method: 'POST',
            body: {
                id: '42',
                rows: [
                    {
                        DAVACI_AD: 'Ahmet Kaya',
                        DAVALI_IDARE: 'X Belediyesi',
                        TALEP_TUTARI: '250000',
                    },
                    {
                        DAVACI_AD: 'Ayse Kaya',
                        DAVALI_IDARE: 'Y Belediyesi',
                        TALEP_TUTARI: '500000',
                    },
                ],
            },
        });
        const res = createRes();

        await templatesHandler(req as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.total).toBe(2);
        expect(res.body.rows).toHaveLength(2);
        expect(res.body.rows[0].index).toBe(0);
        expect(res.body.rows[1].index).toBe(1);
        expect(res.body.rows[0].content).toContain('Ahmet Kaya');
        expect(res.body.rows[1].content).toContain('Ayse Kaya');
    });
});

