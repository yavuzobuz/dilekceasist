import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const childProcessMocks = vi.hoisted(() => ({
    spawn: vi.fn(),
}));

const throttleMocks = vi.hoisted(() => ({
    yargiRequest: vi.fn(async (fn: () => unknown) => await fn()),
}));

vi.mock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        default: {
            ...actual,
            spawn: childProcessMocks.spawn,
        },
        spawn: childProcessMocks.spawn,
    };
});

vi.mock('../lib/legal/requestThrottle.js', () => ({
    yargiRequest: throttleMocks.yargiRequest,
}));

const createMockChild = () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    return child;
};

describe('cliBedestenBridge', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
        vi.useRealTimers();
        childProcessMocks.spawn.mockReset();
        throttleMocks.yargiRequest.mockReset();
        throttleMocks.yargiRequest.mockImplementation(async (fn: () => unknown) => await fn());
        vi.stubEnv('YARGI_CLI_BIN', 'fake-yargi');
    });

    it('parses Bedesten search JSON from CLI stdout', async () => {
        const child = createMockChild();
        childProcessMocks.spawn.mockReturnValue(child);

        const { searchDecisionsViaYargiCli } = await import('../lib/legal/cliBedestenBridge.js');
        const promise = searchDecisionsViaYargiCli({
            phrase: 'tazminat',
            courtTypes: ['YARGITAYKARARI'],
            filters: { page: 2 },
            birimAdi: 'H9',
        });

        child.stdout.emit('data', JSON.stringify({
            decisions: [
                {
                    documentId: '123',
                    birimAdi: '9. Hukuk Dairesi',
                    esasNo: '2024/1',
                },
            ],
        }));
        child.emit('close', 0);

        await expect(promise).resolves.toEqual([
            expect.objectContaining({
                documentId: '123',
                birimAdi: '9. Hukuk Dairesi',
            }),
        ]);
        expect(childProcessMocks.spawn).toHaveBeenCalledWith(
            'fake-yargi',
            ['bedesten', 'search', 'tazminat', '-p', '2', '-c', 'YARGITAYKARARI', '-b', 'H9'],
            expect.objectContaining({ windowsHide: true })
        );
    });

    it('normalizes operator-heavy phrases before sending them to CLI', async () => {
        const child = createMockChild();
        childProcessMocks.spawn.mockReturnValue(child);

        const { searchDecisionsViaYargiCli } = await import('../lib/legal/cliBedestenBridge.js');
        const promise = searchDecisionsViaYargiCli({
            phrase: '+\"ise iade\" +\"gecersiz fesih\"',
            courtTypes: ['YARGITAYKARARI'],
        });

        child.stdout.emit('data', JSON.stringify({ decisions: [] }));
        child.emit('close', 0);
        await promise;

        expect(childProcessMocks.spawn).toHaveBeenCalledWith(
            'fake-yargi',
            ['bedesten', 'search', 'ise iade gecersiz fesih', '-p', '1', '-c', 'YARGITAYKARARI'],
            expect.objectContaining({ windowsHide: true })
        );
    });

    it('parses Bedesten doc JSON from CLI stdout', async () => {
        const child = createMockChild();
        childProcessMocks.spawn.mockReturnValue(child);

        const { getDocumentViaYargiCli } = await import('../lib/legal/cliBedestenBridge.js');
        const promise = getDocumentViaYargiCli({ documentId: '998877' });

        child.stdout.emit('data', JSON.stringify({
            documentId: '998877',
            markdownContent: '# Karar\n\nMetin',
            sourceUrl: 'https://mevzuat.adalet.gov.tr/ictihat/998877',
            mimeType: 'text/html',
        }));
        child.emit('close', 0);

        await expect(promise).resolves.toEqual({
            documentId: '998877',
            markdownContent: '# Karar\n\nMetin',
            sourceUrl: 'https://mevzuat.adalet.gov.tr/ictihat/998877',
            mimeType: 'text/html',
        });
        expect(throttleMocks.yargiRequest).toHaveBeenCalledTimes(1);
    });

    it('surfaces CLI command errors as backend errors', async () => {
        const child = createMockChild();
        childProcessMocks.spawn.mockReturnValue(child);

        const { searchDecisionsViaYargiCli } = await import('../lib/legal/cliBedestenBridge.js');
        const promise = searchDecisionsViaYargiCli({ phrase: 'tazminat' });

        child.stdout.emit('data', JSON.stringify({ error: 'CLI hata verdi' }));
        child.emit('close', 1);

        await expect(promise).rejects.toMatchObject({
            code: 'yargi_cli_command_failed',
            message: 'CLI hata verdi',
        });
    });

    it('aborts the running CLI command when the request is cancelled', async () => {
        const child = createMockChild();
        childProcessMocks.spawn.mockReturnValue(child);

        const { searchDecisionsViaYargiCli } = await import('../lib/legal/cliBedestenBridge.js');
        const controller = new AbortController();
        const promise = searchDecisionsViaYargiCli({
            phrase: 'tazminat',
            abortSignal: controller.signal,
        });

        controller.abort();

        await expect(promise).rejects.toMatchObject({
            code: 'REQUEST_ABORTED',
        });
        expect(child.kill).toHaveBeenCalledTimes(1);
    });

    it('rejects immediately on CLI timeout without waiting for close', async () => {
        vi.useFakeTimers();
        const child = createMockChild();
        childProcessMocks.spawn.mockReturnValue(child);

        const { searchDecisionsViaYargiCli } = await import('../lib/legal/cliBedestenBridge.js');
        const promise = searchDecisionsViaYargiCli({
            phrase: 'tazminat',
            timeoutMs: 25,
        });
        const rejection = expect(promise).rejects.toMatchObject({
            code: 'yargi_cli_timeout',
        });

        await vi.advanceTimersByTimeAsync(30);

        await rejection;
        expect(child.kill).toHaveBeenCalledTimes(1);
    });
});
