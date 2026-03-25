import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { yargiRequest } from './requestThrottle.js';

const YARGI_CLI_TIMEOUT_MS = Math.max(
    5000,
    Math.min(60000, Number(process.env.YARGI_CLI_TIMEOUT_MS || 20000))
);
const YARGI_CLI_DEBUG = process.env.YARGI_CLI_DEBUG !== '0';

const summarizeText = (value = '', limit = 220) => {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
};

const isBrokenPipeConsoleError = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    const message = String(error?.message || error || '');
    return code === 'EPIPE' || /broken pipe/i.test(message);
};

const logCliDebug = (level = 'info', message = '', details = undefined) => {
    if (!YARGI_CLI_DEBUG) return;
    const payload = details && typeof details === 'object'
        ? ` ${JSON.stringify(details)}`
        : '';
    const logger = typeof console[level] === 'function' ? console[level] : console.info;
    try {
        logger(`[YARGI_CLI] ${message}${payload}`);
    } catch (error) {
        if (!isBrokenPipeConsoleError(error)) {
            throw error;
        }
    }
};

const createCliError = (message, code = 'yargi_cli_error') => {
    const error = new Error(message);
    error.code = code;
    return error;
};

const createAbortError = () => createCliError('REQUEST_ABORTED', 'REQUEST_ABORTED');

const normalizeDateValue = (value = '') => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] || normalized;
};

const normalizeCliChamberCode = (value = '') => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized || normalized === 'ALL') return 'ALL';
    if (/^(?:H|C|D)\d{1,2}$/.test(normalized)) return normalized;
    if (/^(?:HGK|CGK|VDDK|IDDK|DBGK|IBK|IIK|DBK|BGK|HBK|CBK|AYIM|AYIMDK|AYIMB|AYIM1|AYIM2|AYIM3)$/.test(normalized)) {
        return normalized;
    }
    return 'ALL';
};

const normalizePhraseForCliSearch = (value = '') => {
    let normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';

    if (/\+\s*"[^"]+"/.test(normalized)) {
        normalized = normalized
            .replace(/\+\s*"([^"]+)"/g, '$1')
            .replace(/["']/g, ' ')
            .replace(/\b(?:AND|OR|NOT)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    return normalized;
};

const getLocalYargiCliScript = () =>
    path.resolve(process.cwd(), 'node_modules', '@saidsrc', 'yargi', 'bin', 'yargi.js');

const getLocalYargiCliShim = () =>
    process.platform === 'win32'
        ? path.resolve(process.cwd(), 'node_modules', '.bin', 'yargi.cmd')
        : path.resolve(process.cwd(), 'node_modules', '.bin', 'yargi');

const getWindowsCmdCommand = () => process.env.ComSpec || 'cmd.exe';

const resolveYargiCliCommand = () => {
    const configuredBinary = String(process.env.YARGI_CLI_BIN || '').trim();
    if (configuredBinary) {
        if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(configuredBinary)) {
            return {
                command: getWindowsCmdCommand(),
                baseArgs: ['/d', '/s', '/c', configuredBinary],
            };
        }
        return {
            command: configuredBinary,
            baseArgs: [],
        };
    }

    const localCliShim = getLocalYargiCliShim();
    if (existsSync(localCliShim)) {
        if (process.platform === 'win32') {
            return {
                command: getWindowsCmdCommand(),
                baseArgs: ['/d', '/s', '/c', localCliShim],
            };
        }
        return {
            command: localCliShim,
            baseArgs: [],
        };
    }

    const localCliScript = getLocalYargiCliScript();
    if (existsSync(localCliScript)) {
        return {
            command: process.execPath,
            baseArgs: [localCliScript],
        };
    }

    return {
        command: process.platform === 'win32' ? getWindowsCmdCommand() : 'npx',
        baseArgs: process.platform === 'win32'
            ? ['/d', '/s', '/c', 'npx', '--no-install', 'yargi']
            : ['--no-install', 'yargi'],
    };
};

export const isYargiCliLikelyAvailable = () => {
    if (String(process.env.YARGI_CLI_BIN || '').trim()) return true;
    return existsSync(getLocalYargiCliShim()) || existsSync(getLocalYargiCliScript());
};

const parseCliJson = (stdout = '') => {
    const trimmed = String(stdout || '').trim();
    if (!trimmed) {
        throw createCliError('Yargi CLI bos cevap dondu.', 'yargi_cli_empty_output');
    }

    try {
        return JSON.parse(trimmed);
    } catch {
        throw createCliError('Yargi CLI gecersiz JSON dondu.', 'yargi_cli_invalid_json');
    }
};

const runYargiCliJson = (args = [], { abortSignal = null, timeoutMs = YARGI_CLI_TIMEOUT_MS } = {}) =>
    new Promise((resolve, reject) => {
        const { command, baseArgs } = resolveYargiCliCommand();
        const fullArgs = [...baseArgs, ...args];
        logCliDebug('info', 'spawn:start', {
            command,
            args: fullArgs,
            timeoutMs,
        });

        const child = spawn(command, fullArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            env: {
                ...process.env,
                FORCE_COLOR: '0',
            },
        });

        let stdout = '';
        let stderr = '';
        let settled = false;
        let timedOut = false;
        let aborted = false;
        let stdoutChunks = 0;
        let stderrChunks = 0;

        const terminateChild = () => {
            try {
                logCliDebug('warn', 'spawn:terminate', {
                    pid: child.pid || null,
                    timedOut,
                    aborted,
                });
                child.kill('SIGTERM');
            } catch {
                // best effort only
            }
        };

        const cleanup = () => {
            if (abortSignal) {
                abortSignal.removeEventListener('abort', onAbort);
            }
            clearTimeout(timer);
        };

        const finalizeError = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            logCliDebug('error', 'spawn:error', {
                pid: child.pid || null,
                code: error?.code || null,
                message: summarizeText(error?.message || error),
                stdoutChunks,
                stderrChunks,
                stdoutPreview: summarizeText(stdout, 300),
                stderrPreview: summarizeText(stderr, 300),
            });
            reject(error);
        };

        const finalizeSuccess = (value) => {
            if (settled) return;
            settled = true;
            cleanup();
            logCliDebug('info', 'spawn:success', {
                pid: child.pid || null,
                stdoutChunks,
                stderrChunks,
                stdoutPreview: summarizeText(stdout, 300),
                stderrPreview: summarizeText(stderr, 300),
            });
            resolve(value);
        };

        const onAbort = () => {
            aborted = true;
            terminateChild();
            finalizeError(createAbortError());
        };

        if (abortSignal?.aborted) {
            onAbort();
            return;
        }

        if (abortSignal) {
            abortSignal.addEventListener('abort', onAbort, { once: true });
        }

        const timer = setTimeout(() => {
            timedOut = true;
            logCliDebug('warn', 'spawn:timeout', {
                pid: child.pid || null,
                timeoutMs,
                stdoutChunks,
                stderrChunks,
            });
            terminateChild();
            finalizeError(createCliError('Yargi CLI zaman asimina ugradi.', 'yargi_cli_timeout'));
        }, timeoutMs);

        child.stdout?.on('data', (chunk) => {
            const text = String(chunk || '');
            stdout += text;
            stdoutChunks += 1;
            logCliDebug('info', 'spawn:stdout', {
                pid: child.pid || null,
                chunk: stdoutChunks,
                preview: summarizeText(text, 180),
            });
        });

        child.stderr?.on('data', (chunk) => {
            const text = String(chunk || '');
            stderr += text;
            stderrChunks += 1;
            logCliDebug('warn', 'spawn:stderr', {
                pid: child.pid || null,
                chunk: stderrChunks,
                preview: summarizeText(text, 180),
            });
        });

        child.once('error', (error) => {
            if (aborted) {
                finalizeError(createAbortError());
                return;
            }
            if (error?.code === 'ENOENT') {
                finalizeError(createCliError('Yargi CLI bulunamadi.', 'yargi_cli_unavailable'));
                return;
            }
            finalizeError(createCliError(error?.message || 'Yargi CLI calistirilamadi.', 'yargi_cli_spawn_error'));
        });

        child.once('spawn', () => {
            logCliDebug('info', 'spawn:ready', {
                pid: child.pid || null,
            });
        });

        child.once('close', (code) => {
            logCliDebug('info', 'spawn:close', {
                pid: child.pid || null,
                code: code ?? null,
                timedOut,
                aborted,
                stdoutChunks,
                stderrChunks,
            });
            if (settled) return;
            if (aborted) {
                finalizeError(createAbortError());
                return;
            }
            if (timedOut) {
                finalizeError(createCliError('Yargi CLI zaman asimina ugradi.', 'yargi_cli_timeout'));
                return;
            }

            let payload;
            try {
                payload = parseCliJson(stdout);
            } catch (error) {
                finalizeError(error);
                return;
            }
            if (code !== 0 || payload?.error) {
                const errorMessage = String(payload?.error || stderr || `Yargi CLI cikis kodu: ${code || 1}`).trim();
                finalizeError(createCliError(errorMessage, 'yargi_cli_command_failed'));
                return;
            }

            finalizeSuccess(payload);
        });
    });

export const searchDecisionsViaYargiCli = async ({
    phrase = '',
    courtTypes = [],
    filters = {},
    birimAdi = '',
    abortSignal = null,
    timeoutMs = YARGI_CLI_TIMEOUT_MS,
} = {}) => {
    const normalizedPhrase = normalizePhraseForCliSearch(phrase);
    if (!normalizedPhrase) return [];

    const args = ['bedesten', 'search', normalizedPhrase];
    const pageNumber = Math.max(1, Number(filters?.page || filters?.pageNumber || 1));
    args.push('-p', String(pageNumber));

    const normalizedCourtTypes = Array.isArray(courtTypes) ? courtTypes.filter(Boolean) : [];
    if (normalizedCourtTypes.length > 0) {
        args.push('-c', ...normalizedCourtTypes);
    }

    const normalizedChamber = normalizeCliChamberCode(birimAdi || filters?.birimAdi);
    if (normalizedChamber !== 'ALL') {
        args.push('-b', normalizedChamber);
    }

    const dateStart = normalizeDateValue(filters?.dateStart || filters?.kararTarihiStart);
    const dateEnd = normalizeDateValue(filters?.dateEnd || filters?.kararTarihiEnd);
    if (dateStart) args.push('--date-start', dateStart);
    if (dateEnd) args.push('--date-end', dateEnd);

    logCliDebug('info', 'search:request', {
        phrase: normalizedPhrase,
        courtTypes: normalizedCourtTypes,
        birimAdi: normalizedChamber,
        timeoutMs,
    });

    const payload = await yargiRequest(() => runYargiCliJson(args, {
        abortSignal,
        timeoutMs,
    }));
    logCliDebug('info', 'search:response', {
        decisionCount: Array.isArray(payload?.decisions) ? payload.decisions.length : 0,
    });
    return Array.isArray(payload?.decisions) ? payload.decisions : [];
};

export const getDocumentViaYargiCli = async ({
    documentId = '',
    abortSignal = null,
    skipThrottle = false,
} = {}) => {
    const normalizedDocumentId = String(documentId || '').trim();
    if (!normalizedDocumentId) {
        throw createCliError('documentId gereklidir.', 'yargi_cli_document_missing_id');
    }

    logCliDebug('info', 'doc:request', { documentId: normalizedDocumentId });
    const fetchDocument = () => runYargiCliJson(['bedesten', 'doc', normalizedDocumentId], { abortSignal });
    const payload = skipThrottle
        ? await fetchDocument()
        : await yargiRequest(fetchDocument);
    logCliDebug('info', 'doc:response', {
        documentId: String(payload?.documentId || normalizedDocumentId).trim(),
        hasMarkdown: Boolean(String(payload?.markdownContent || '').trim()),
    });
    return {
        documentId: String(payload?.documentId || normalizedDocumentId).trim(),
        markdownContent: String(payload?.markdownContent || '').trim(),
        sourceUrl: String(payload?.sourceUrl || `https://mevzuat.adalet.gov.tr/ictihat/${normalizedDocumentId}`).trim(),
        mimeType: String(payload?.mimeType || 'text/markdown').trim(),
    };
};

export const __testables = {
    normalizeCliChamberCode,
    normalizeDateValue,
    normalizePhraseForCliSearch,
    parseCliJson,
    resolveYargiCliCommand,
};
