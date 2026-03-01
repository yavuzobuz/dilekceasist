import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSupabase } = vi.hoisted(() => ({
    mockSupabase: {
        auth: {
            getUser: vi.fn(),
        },
        from: vi.fn(),
        storage: {
            from: vi.fn(),
        },
    },
}));

vi.mock('../lib/supabase', () => ({
    supabase: mockSupabase,
}));

import { clientService } from '../src/services/clientService';

const createClientQueryChain = () => {
    const chain: any = {};
    chain.select = vi.fn(() => chain);
    chain.order = vi.fn();
    chain.eq = vi.fn(() => chain);
    chain.single = vi.fn();
    chain.insert = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.delete = vi.fn(() => chain);
    return chain;
};

describe('clientService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockSupabase.auth.getUser.mockReset();
        mockSupabase.from.mockReset();
        mockSupabase.storage.from.mockReset();
    });

    it('getClients should return ordered clients list', async () => {
        const chain = createClientQueryChain();
        chain.order.mockResolvedValueOnce({
            data: [{ id: '1', name: 'Ali' }],
            error: null,
        });
        mockSupabase.from.mockReturnValueOnce(chain);

        const result = await clientService.getClients();

        expect(mockSupabase.from).toHaveBeenCalledWith('clients');
        expect(chain.select).toHaveBeenCalledWith('*');
        expect(chain.order).toHaveBeenCalledWith('name');
        expect(result).toEqual([{ id: '1', name: 'Ali' }]);
    });

    it('addClient should throw when user session is missing', async () => {
        mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });

        await expect(
            clientService.addClient({
                name: 'Test',
                email: 'test@example.com',
                phone: '555',
                notes: '',
                client_type: 'INDIVIDUAL',
            } as any)
        ).rejects.toThrow(/Kullan/);
    });

    it('addClient should insert row with current user id', async () => {
        mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } } });
        const chain = createClientQueryChain();
        chain.single.mockResolvedValueOnce({ data: { id: 'c1', name: 'Yeni' }, error: null });
        mockSupabase.from.mockReturnValueOnce(chain);

        const result = await clientService.addClient({
            name: 'Yeni',
            email: 'yeni@example.com',
            phone: '123',
            notes: 'not',
            client_type: 'INDIVIDUAL',
        } as any);

        expect(chain.insert).toHaveBeenCalledWith([
            expect.objectContaining({ name: 'Yeni', user_id: 'user-1' }),
        ]);
        expect(result.id).toBe('c1');
    });

    it('updateClient should update and return single row', async () => {
        const chain = createClientQueryChain();
        chain.single.mockResolvedValueOnce({
            data: { id: 'c2', name: 'Guncel' },
            error: null,
        });
        mockSupabase.from.mockReturnValueOnce(chain);

        const result = await clientService.updateClient('c2', { name: 'Guncel' } as any);

        expect(chain.update).toHaveBeenCalledWith({ name: 'Guncel' });
        expect(chain.eq).toHaveBeenCalledWith('id', 'c2');
        expect(result.name).toBe('Guncel');
    });

    it('deleteClient should delete linked pdf first when exists', async () => {
        const getClientSpy = vi.spyOn(clientService, 'getClient').mockResolvedValueOnce({
            id: 'c3',
            vekalet_pdf_url: 'path/to/file.pdf',
        } as any);
        const deletePdfSpy = vi.spyOn(clientService, 'deleteVekaletPdf').mockResolvedValueOnce();

        const chain = createClientQueryChain();
        chain.eq.mockResolvedValueOnce({ error: null });
        mockSupabase.from.mockReturnValueOnce(chain);

        await clientService.deleteClient('c3');

        expect(getClientSpy).toHaveBeenCalledWith('c3');
        expect(deletePdfSpy).toHaveBeenCalledWith('c3');
        expect(chain.delete).toHaveBeenCalled();
        expect(chain.eq).toHaveBeenCalledWith('id', 'c3');
    });

    it('uploadVekaletPdf should upload and update client with file path', async () => {
        mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-22' } } });

        const upload = vi.fn().mockResolvedValueOnce({ error: null });
        const createSignedUrl = vi.fn().mockResolvedValueOnce({
            data: { signedUrl: 'https://signed.example/url.pdf' },
        });
        mockSupabase.storage.from.mockReturnValue({
            upload,
            createSignedUrl,
        });

        const updateSpy = vi.spyOn(clientService, 'updateClient').mockResolvedValueOnce({} as any);
        const file = new File(['pdf-data'], 'vekalet belgesi.pdf', { type: 'application/pdf' });

        const url = await clientService.uploadVekaletPdf('client-22', file);

        expect(mockSupabase.storage.from).toHaveBeenCalledWith('client-documents');
        expect(upload).toHaveBeenCalledTimes(1);
        expect(createSignedUrl).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith(
            'client-22',
            expect.objectContaining({ vekalet_pdf_url: expect.stringContaining('user-22/client-22/') })
        );
        expect(url).toBe('https://signed.example/url.pdf');
    });

    it('getVekaletPdfUrl should return null on storage error', async () => {
        const createSignedUrl = vi.fn().mockResolvedValueOnce({
            data: null,
            error: new Error('storage fail'),
        });
        mockSupabase.storage.from.mockReturnValue({ createSignedUrl });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await clientService.getVekaletPdfUrl('x/y/z.pdf');

        expect(result).toBeNull();
        expect(errorSpy).toHaveBeenCalled();
    });

    it('deleteVekaletPdf should remove file and clear db field', async () => {
        vi.spyOn(clientService, 'getClient').mockResolvedValueOnce({
            id: 'c5',
            vekalet_pdf_url: 'docs/old.pdf',
        } as any);
        const remove = vi.fn().mockResolvedValueOnce({ error: null });
        mockSupabase.storage.from.mockReturnValueOnce({ remove });
        const updateSpy = vi.spyOn(clientService, 'updateClient').mockResolvedValueOnce({} as any);

        await clientService.deleteVekaletPdf('c5');

        expect(remove).toHaveBeenCalledWith(['docs/old.pdf']);
        expect(updateSpy).toHaveBeenCalledWith('c5', { vekalet_pdf_url: undefined });
    });
});

