const el = {
    sourceText: document.getElementById('sourceText'),
    promptText: document.getElementById('promptText'),
    resultText: document.getElementById('resultText'),
    status: document.getElementById('status'),
    quotaInfo: document.getElementById('quotaInfo'),
    apiBaseUrl: document.getElementById('apiBaseUrl'),
    apiKey: document.getElementById('apiKey'),
    authToken: document.getElementById('authToken'),
    autoReplace: document.getElementById('autoReplace'),
    includeDocumentContext: document.getElementById('includeDocumentContext'),
    readSelectionBtn: document.getElementById('readSelectionBtn'),
    replaceSelectionBtn: document.getElementById('replaceSelectionBtn'),
    sendChatBtn: document.getElementById('sendChatBtn'),
    loginBtn: document.getElementById('loginBtn'),
    upgradePlanBtn: document.getElementById('upgradePlanBtn'),
    actionButtons: Array.from(document.querySelectorAll('[data-action]')),
};

const QUICK_PROMPTS = {
    'decision-search': 'Bu konu icin emsal Yargitay ve Danistay kararlari ara. Her karar icin daire, esas no, karar no, tarih ve kisa ozet ver.',
    'text-fix': 'Asagidaki metni anlami degistirmeden dil bilgisi, imla, noktalama ve akicilik acisindan duzelt.',
    brainstorm: 'Bu konu icin farkli hukuki strateji seceneklerini, avantaj ve riskleriyle madde madde beyin firtinasi yap.',
    'web-search': 'Bu konu icin web aramasi yap. Guvenilir kaynaklardan kisa ozet ve uygulanabilir oneriler sun.',
};

const MAX_HISTORY_MESSAGES = 8;
const MAX_DOCUMENT_CONTEXT_CHARS = 12000;
let chatHistory = [];
let isBusy = false;
let lastPlanUsage = null;

const setStatus = (message, type = 'info') => {
    el.status.textContent = message || '';
    el.status.classList.remove('error', 'success');
    if (type === 'error') el.status.classList.add('error');
    if (type === 'success') el.status.classList.add('success');
};

const setQuotaInfo = (message, type = 'info') => {
    if (!el.quotaInfo) return;
    el.quotaInfo.textContent = message || '';
    el.quotaInfo.classList.remove('error', 'success');
    if (type === 'error') el.quotaInfo.classList.add('error');
    if (type === 'success') el.quotaInfo.classList.add('success');
};

const setBusy = (busy) => {
    isBusy = busy;
    el.readSelectionBtn.disabled = busy;
    el.replaceSelectionBtn.disabled = busy;
    el.sendChatBtn.disabled = busy;
    if (el.includeDocumentContext) {
        el.includeDocumentContext.disabled = busy;
    }
    if (el.authToken) {
        el.authToken.disabled = busy;
    }
    if (el.loginBtn) {
        el.loginBtn.disabled = busy;
    }
    if (el.upgradePlanBtn) {
        el.upgradePlanBtn.disabled = busy;
    }
    el.actionButtons.forEach((btn) => { btn.disabled = busy; });
};

const resolveApiBaseUrl = () => {
    const raw = (el.apiBaseUrl.value || '').trim();
    if (!raw) return window.location.origin;
    return raw.replace(/\/+$/, '');
};

const hasLoginPromptedFlag = () => {
    try {
        const params = new URLSearchParams(window.location.search || '');
        return params.get('loginPrompted') === '1';
    } catch {
        return false;
    }
};

const buildTaskpaneReturnPath = () => {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('loginPrompted', '1');
    return `${currentUrl.pathname}${currentUrl.search}`;
};

const buildLoginUrl = () => {
    const apiBase = resolveApiBaseUrl();
    const redirectPath = buildTaskpaneReturnPath();
    const query = new URLSearchParams({
        redirect: redirectPath,
        source: 'word-addin',
    });
    return `${apiBase}/login?${query.toString()}`;
};

const redirectToLogin = () => {
    window.location.href = buildLoginUrl();
};

const safeJsonParse = (value) => {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const extractSupabaseTokenCandidate = (payload) => {
    if (!payload) return '';
    if (typeof payload?.access_token === 'string' && payload.access_token.trim()) {
        return payload.access_token.trim();
    }
    if (typeof payload?.currentSession?.access_token === 'string' && payload.currentSession.access_token.trim()) {
        return payload.currentSession.access_token.trim();
    }
    return '';
};

const findTokenFromLocalStorage = () => {
    try {
        const keys = Object.keys(window.localStorage || {});
        for (const key of keys) {
            if (!key.includes('auth-token')) continue;
            const raw = window.localStorage.getItem(key);
            if (!raw) continue;
            const parsed = safeJsonParse(raw);
            if (!parsed) continue;

            if (Array.isArray(parsed)) {
                for (const entry of parsed) {
                    const token = extractSupabaseTokenCandidate(entry);
                    if (token) return token;
                }
                continue;
            }

            const token = extractSupabaseTokenCandidate(parsed);
            if (token) return token;
        }
    } catch (error) {
        console.warn('Auth token localStorage icinden okunamadi:', error);
    }
    return '';
};

const resolveAuthToken = () => {
    const manualToken = (el.authToken?.value || '').trim();
    if (manualToken) return manualToken;
    return findTokenFromLocalStorage();
};

const buildAuthHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    const apiKey = (el.apiKey.value || '').trim();
    if (apiKey) headers['x-api-key'] = apiKey;

    const authToken = resolveAuthToken();
    if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
    }

    return headers;
};

const normalizeUsage = (rawUsage) => {
    if (!rawUsage || typeof rawUsage !== 'object') return null;
    const normalized = {
        dailyLimit: rawUsage.dailyLimit ?? rawUsage.daily_limit ?? null,
        usedToday: rawUsage.usedToday ?? rawUsage.used_today ?? null,
        remainingToday: rawUsage.remainingToday ?? rawUsage.remaining_today ?? null,
        trialEndsAt: rawUsage.trialEndsAt ?? rawUsage.trial_ends_at ?? null,
    };
    return normalized;
};

const formatDate = (isoDate) => {
    if (!isoDate) return null;
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('tr-TR');
};

const formatQuotaText = (usage) => {
    if (!usage) return 'Kota bilgisi alinamadi.';
    if (usage.dailyLimit == null) return 'Kota: Sinirsiz paket.';

    const dailyLimit = Number(usage.dailyLimit);
    const usedToday = usage.usedToday == null
        ? Math.max(0, dailyLimit - Number(usage.remainingToday || 0))
        : Number(usage.usedToday);
    const remainingToday = usage.remainingToday == null
        ? Math.max(0, dailyLimit - usedToday)
        : Number(usage.remainingToday);

    let text = `Kota: ${remainingToday} / ${dailyLimit} (kalan/gunluk)`;
    const trialEndText = formatDate(usage.trialEndsAt);
    if (trialEndText) {
        text += ` | Trial bitis: ${trialEndText}`;
    }
    return text;
};

const isUsageBlocked = (usage) => {
    if (!usage || usage.dailyLimit == null) return false;

    const dailyLimit = Number(usage.dailyLimit);
    const remainingToday = usage.remainingToday == null
        ? Math.max(0, dailyLimit - Number(usage.usedToday || 0))
        : Number(usage.remainingToday);

    return Number.isFinite(remainingToday) && remainingToday <= 0;
};

const applyUsageToUi = (usage, type = 'success') => {
    if (!usage) return;
    setQuotaInfo(formatQuotaText(usage), type);
};

const refreshPlanSummary = async ({ silent = false } = {}) => {
    const authToken = resolveAuthToken();
    if (!authToken) {
        lastPlanUsage = null;
        if (!silent) {
            setQuotaInfo('Kota: giris gerekli. Giris yaptiktan sonra limit otomatik guncellenir.');
        }
        return null;
    }

    const apiBase = resolveApiBaseUrl();
    const headers = buildAuthHeaders();

    try {
        const response = await fetch(`${apiBase}/api/admin-users?action=plan-summary`, {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            const rawError = await response.text();
            let message = `HTTP ${response.status}`;
            if (rawError) {
                const parsed = safeJsonParse(rawError);
                if (parsed?.error) {
                    message = parsed.error;
                } else {
                    message = rawError;
                }
            }
            throw new Error(message);
        }

        const payload = await response.json().catch(() => ({}));
        const usage = normalizeUsage(payload?.summary);
        if (!usage) {
            throw new Error('Plan ozeti bos geldi.');
        }

        lastPlanUsage = usage;
        applyUsageToUi(usage, 'success');
        return usage;
    } catch (error) {
        lastPlanUsage = null;
        if (!silent) {
            setQuotaInfo(
                `Kota bilgisi alinamadi: ${error instanceof Error ? error.message : 'bilinmeyen hata'}`,
                'error'
            );
        }
        return null;
    }
};

const limitHistory = (history) => history.slice(-MAX_HISTORY_MESSAGES);

const readSelection = async () => Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.load('text');
    await context.sync();
    return selection.text || '';
});

const readDocumentText = async () => Word.run(async (context) => {
    const body = context.document.body;
    body.load('text');
    await context.sync();
    return body.text || '';
});

const replaceSelection = async (text) => Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.insertText(text, Word.InsertLocation.replace);
    await context.sync();
});

const truncateContext = (text, maxChars) => {
    const normalized = String(text || '').trim();
    if (!normalized) return '';
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars)}\n\n...[BELGE BAGLAMI KISALTILDI]`;
};

const buildUserMessage = ({ prompt, selectionText, hasDocumentContext }) => {
    if (!selectionText) {
        return hasDocumentContext
            ? `${prompt}\n\nNot: Belgenin tamami baglam olarak eklendi.`
            : prompt;
    }
    const base = `${prompt}\n\nWord secimi:\n"""${selectionText}"""`;
    return hasDocumentContext ? `${base}\n\nNot: Belgenin tamami baglam olarak eklendi.` : base;
};

const extractTextFromChunk = (chunk) => {
    let text = '';
    const parts = chunk?.candidates?.[0]?.content?.parts;

    if (Array.isArray(parts)) {
        parts.forEach((part) => {
            if (typeof part?.text === 'string') {
                text += part.text;
            }
        });
    }

    if (typeof chunk?.text === 'string') {
        text += chunk.text;
    }

    return text;
};

const callChatApi = async ({ history, selectionText, documentText, onTextChunk, onUsage, onQuotaBlocked }) => {
    const apiBase = resolveApiBaseUrl();
    const headers = buildAuthHeaders();

    const contextDoc = [
        selectionText ? `Secili Metin:\n${selectionText}` : '',
        documentText ? `Belge Metni:\n${documentText}` : '',
    ].filter(Boolean).join('\n\n---\n\n');

    const response = await fetch(`${apiBase}/api/gemini/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            chatHistory: history,
            analysisSummary: (selectionText || documentText || '').slice(0, 1500),
            context: {
                keywords: '',
                searchSummary: '',
                docContent: contextDoc,
                specifics: documentText
                    ? `Word belge baglami aktif. Uzunluk: ${documentText.length} karakter.`
                    : 'Yalnizca secili metin baglami aktif.',
            },
        }),
    });

    if (!response.ok) {
        const rawError = await response.text();
        let message = `Chat API failed (HTTP ${response.status})`;
        let errorCode = null;
        if (rawError) {
            const parsed = safeJsonParse(rawError);
            if (parsed?.error) {
                message = parsed.error;
                errorCode = parsed.code || null;
            } else {
                message = rawError;
            }
        }
        const error = new Error(message);
        error.status = response.status;
        error.code = errorCode;
        throw error;
    }

    if (!response.body) {
        throw new Error('Chat API response body bos geldi.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let quotaBlocked = false;
    let quotaMessage = '';
    let usageFromStream = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const chunk = JSON.parse(line);
                const usage = normalizeUsage(chunk?.usage);
                if (usage) {
                    usageFromStream = usage;
                    if (typeof onUsage === 'function') onUsage(usage);
                }

                if (chunk?.quotaBlocked) {
                    quotaBlocked = true;
                    quotaMessage = typeof chunk?.errorMessage === 'string'
                        ? chunk.errorMessage.trim()
                        : (typeof chunk?.text === 'string' ? chunk.text.trim() : 'Belge uretim kotaniz doldu.');
                    if (typeof onQuotaBlocked === 'function') onQuotaBlocked(chunk, quotaMessage);
                }

                const textChunk = extractTextFromChunk(chunk);
                if (textChunk) {
                    fullText += textChunk;
                    if (typeof onTextChunk === 'function') onTextChunk(textChunk);
                }
            } catch {
                // Ignore non-JSON lines from stream to keep UI responsive.
            }
        }
    }

    return {
        text: fullText.trim(),
        quotaBlocked,
        quotaMessage,
        usage: usageFromStream,
    };
};

const handleReadSelection = async () => {
    if (isBusy) return;
    setBusy(true);
    try {
        setStatus('Word secimi okunuyor...');
        const selectedText = await readSelection();
        el.sourceText.value = selectedText;
        if (!selectedText.trim()) {
            setStatus('Lutfen Word icinde bir metin secin.', 'error');
            return;
        }
        setStatus('Secim panele alindi.', 'success');
    } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Secim okunamadi.', 'error');
    } finally {
        setBusy(false);
    }
};

const sendChat = async (promptOverride) => {
    if (isBusy) return;

    const prompt = (promptOverride || el.promptText.value || '').trim();
    if (!prompt) {
        setStatus('Lutfen chatbot icin bir mesaj girin.', 'error');
        return;
    }

    let selectionText = (el.sourceText.value || '').trim();
    let documentText = '';
    const shouldIncludeDocumentContext = Boolean(el.includeDocumentContext?.checked);

    const authToken = resolveAuthToken();
    if (!authToken) {
        setStatus('Giris gerekli. Giris sayfasina yonlendiriliyorsunuz...', 'error');
        setQuotaInfo('Kota: giris olmadan kontrol edilemez.');
        redirectToLogin();
        return;
    }

    const usageBeforeSend = await refreshPlanSummary({ silent: true });
    if (!usageBeforeSend) {
        setStatus('Limit bilgisi alinamadi. Lutfen tekrar deneyin.', 'error');
        return;
    }
    if (isUsageBlocked(usageBeforeSend)) {
        applyUsageToUi(usageBeforeSend, 'error');
        setStatus('Gunluk belge uretim limitiniz dolu. Islem durduruldu.', 'error');
        return;
    }

    setBusy(true);

    try {
        setStatus('Word baglami okunuyor...');

        if (!selectionText) {
            selectionText = (await readSelection()).trim();
            if (selectionText) {
                el.sourceText.value = selectionText;
            }
        }

        if (shouldIncludeDocumentContext) {
            try {
                const fullDocumentText = await readDocumentText();
                documentText = truncateContext(fullDocumentText, MAX_DOCUMENT_CONTEXT_CHARS);
            } catch (error) {
                console.error('Word belge metni okunamadi:', error);
            }
        }

        if (!selectionText && !documentText) {
            setStatus('Lutfen Word icinde secim yapin veya belge metni oldugundan emin olun.', 'error');
            return;
        }

        const userMessage = buildUserMessage({
            prompt,
            selectionText,
            hasDocumentContext: Boolean(documentText),
        });
        const requestHistory = limitHistory([...chatHistory, { role: 'user', text: userMessage }]);

        setStatus('Chatbot yaniti uretiyor...');
        el.resultText.value = '';

        const response = await callChatApi({
            history: requestHistory,
            selectionText,
            documentText,
            onTextChunk: (textChunk) => {
                el.resultText.value += textChunk;
            },
            onUsage: (usage) => {
                applyUsageToUi(usage, 'success');
            },
            onQuotaBlocked: (_chunk, message) => {
                if (message) {
                    setStatus(message, 'error');
                }
            },
        });

        const finalText = (response.text || el.resultText.value || '').trim();
        if (!finalText && !response.quotaBlocked) {
            throw new Error('Chatbot bos yanit dondurdu.');
        }

        if (finalText) {
            el.resultText.value = finalText;
            chatHistory = limitHistory([...requestHistory, { role: 'model', text: finalText }]);
        }

        if (response.usage) {
            applyUsageToUi(response.usage, 'success');
        }

        if (response.quotaBlocked) {
            setStatus(response.quotaMessage || 'Belge uretim kotaniz dolu.', 'error');
            refreshPlanSummary({ silent: true }).catch(() => {});
            return;
        }

        if (el.autoReplace.checked) {
            await replaceSelection(finalText);
            setStatus('Chatbot sonucu Word secimine uygulandi.', 'success');
        } else {
            setStatus('Chatbot sonucu hazirlandi. Isterseniz "Secime Uygula" ile yazabilirsiniz.', 'success');
        }

        refreshPlanSummary({ silent: true }).catch(() => {});
    } catch (error) {
        const status = typeof error?.status === 'number' ? error.status : null;
        const code = typeof error?.code === 'string' ? error.code : '';
        const message = error instanceof Error ? error.message : 'Chatbot islemi basarisiz.';

        if (status === 401 || code === 'AUTH_REQUIRED' || code === 'INVALID_SESSION') {
            setStatus('Oturum gecersiz. Giris sayfasina yonlendiriliyorsunuz...', 'error');
            redirectToLogin();
            return;
        }

        if (status === 429 || code === 'TRIAL_DAILY_LIMIT_REACHED' || code === 'PLAN_DAILY_LIMIT_REACHED' || code === 'TRIAL_EXPIRED') {
            setStatus(message || 'Gunluk limit dolu. Islem durduruldu.', 'error');
            if (lastPlanUsage) {
                applyUsageToUi(lastPlanUsage, 'error');
            }
            return;
        }

        setStatus(message, 'error');
    } finally {
        setBusy(false);
    }
};

const handleQuickAction = (action) => {
    const template = QUICK_PROMPTS[action];
    if (!template) return;
    el.promptText.value = template;
    el.promptText.focus();
    setStatus('Hazir prompt eklendi. "Chatbot\'a Gonder"e basin.');
};

const handleReplaceSelection = async () => {
    if (isBusy) return;
    const resultText = (el.resultText.value || '').trim();
    if (!resultText) {
        setStatus('Uygulanacak chatbot sonucu yok.', 'error');
        return;
    }

    setBusy(true);
    try {
        setStatus('Chatbot sonucu Word secimine yaziliyor...');
        await replaceSelection(resultText);
        setStatus('Chatbot sonucu secime yazildi.', 'success');
    } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Secime yazma basarisiz.', 'error');
    } finally {
        setBusy(false);
    }
};

const handleUpgradePlan = () => {
    const pricingUrl = `${resolveApiBaseUrl()}/fiyatlandirma`;
    window.open(pricingUrl, '_blank', 'noopener,noreferrer');
};

const handleLogin = () => {
    redirectToLogin();
};

const initialize = () => {
    el.apiBaseUrl.value = window.location.origin;
    el.readSelectionBtn.addEventListener('click', handleReadSelection);
    el.replaceSelectionBtn.addEventListener('click', handleReplaceSelection);
    el.sendChatBtn.addEventListener('click', () => sendChat());
    if (el.loginBtn) {
        el.loginBtn.addEventListener('click', handleLogin);
    }
    if (el.upgradePlanBtn) {
        el.upgradePlanBtn.addEventListener('click', handleUpgradePlan);
    }
    if (el.authToken) {
        el.authToken.addEventListener('change', () => {
            refreshPlanSummary({ silent: true }).catch(() => {});
        });
    }
    el.actionButtons.forEach((btn) => {
        btn.addEventListener('click', () => handleQuickAction(btn.dataset.action || ''));
    });
    setStatus('Hazir. Word secimini alin, hizli aksiyon secin ve chatbot ile devam edin.');

    if (!resolveAuthToken()) {
        setQuotaInfo('Kota: giris gerekli.');
        if (!hasLoginPromptedFlag()) {
            setStatus('Giris yapmaniz gerekiyor. Giris sayfasina yonlendiriliyorsunuz...', 'error');
            setTimeout(() => {
                redirectToLogin();
            }, 120);
            return;
        }
        setStatus('Giris yaparak devam edin. Giris butonunu kullanabilirsiniz.', 'error');
        return;
    }

    setQuotaInfo('Kota bilgisi yukleniyor...');
    refreshPlanSummary().catch(() => {});
};

Office.onReady((info) => {
    if (info.host !== Office.HostType.Word) {
        setStatus('Bu panel yalnizca Word icin tasarlanmistir.', 'error');
        return;
    }
    initialize();
});
