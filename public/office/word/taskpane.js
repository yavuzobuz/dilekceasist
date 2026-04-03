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
    modeButtons: Array.from(document.querySelectorAll('[data-mode]')),
    tabButtons: Array.from(document.querySelectorAll('[data-tab]')),
    modeDescription: document.getElementById('modeDescription'),
    activeModeText: document.getElementById('activeModeText'),
    researchState: document.getElementById('researchState'),
    researchSummary: document.getElementById('researchSummary'),
    webResults: document.getElementById('webResults'),
    legalResults: document.getElementById('legalResults'),
};

const MODE_CONTENT = {
    edit: {
        tab: 'text-assistant',
        title: 'Metin Duzelt',
        description: 'Metin duzeltme ve yazim iyilestirme icin kullanin.',
        prompt: 'Asagidaki metni resmi, acik ve profesyonel dille duzelt.',
    },
    brainstorm: {
        tab: 'text-assistant',
        title: 'Beyin Firtinasi',
        description: 'Hukuki strateji ve olasi yaklasimlari arastirma gerekmeksizin tartismak icin kullanin.',
        prompt: 'Bu konu icin farkli hukuki strateji seceneklerini, avantaj ve riskleriyle madde madde degerlendir.',
    },
    web_search: {
        tab: 'research',
        title: 'Web Arastir',
        description: 'Web kaynaklarindan dogrulanabilir bilgi toplayin.',
        prompt: 'Bu konu icin web arastirmasi yap ve pratik sonucunu ozetle.',
    },
    precedent_search: {
        tab: 'research',
        title: 'Emsal Karar Ara',
        description: 'Gercek emsal karar arama zinciri ile Yargitay/Danistay/BAM sonuclarini tarayin.',
        prompt: 'Bu konu icin uygun emsal kararlari ara ve en ilgili olanlari ozetle.',
    },
    research_and_answer: {
        tab: 'research',
        title: 'Arastir + Cevap Yaz',
        description: 'Web arastirmasi ile emsal karar aramasini birlestirip tek bir hukuki cevap uretin.',
        prompt: 'Bu konu icin once web ve emsal karar arastirmasi yap, sonra bunlari kullanarak net bir hukuki degerlendirme yaz.',
    },
};

const WORD_LOGIN_REDIRECT = '/office/word/taskpane.html?v=20260403-1';

let isBusy = false;
let lastPlanUsage = null;
let activeMode = 'edit';

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

const setAuthUiState = (isAuthenticated) => {
    if (!el.loginBtn) return;
    el.loginBtn.style.display = isAuthenticated ? 'none' : '';
};

const setBusy = (busy) => {
    isBusy = busy;
    el.readSelectionBtn.disabled = busy;
    el.replaceSelectionBtn.disabled = busy;
    el.sendChatBtn.disabled = busy;
    if (el.includeDocumentContext) el.includeDocumentContext.disabled = busy;
    if (el.authToken) el.authToken.disabled = busy;
    if (el.loginBtn) el.loginBtn.disabled = busy;
    if (el.upgradePlanBtn) el.upgradePlanBtn.disabled = busy;
    el.modeButtons.forEach((btn) => { btn.disabled = busy; });
    el.tabButtons.forEach((btn) => { btn.disabled = busy; });
};

const resolveApiBaseUrl = () => {
    const raw = (el.apiBaseUrl.value || '').trim();
    if (!raw) return window.location.origin;
    return raw.replace(/\/+$/, '');
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
    return {
        dailyLimit: rawUsage.dailyLimit ?? rawUsage.daily_limit ?? null,
        usedToday: rawUsage.usedToday ?? rawUsage.used_today ?? null,
        remainingToday: rawUsage.remainingToday ?? rawUsage.remaining_today ?? null,
        trialEndsAt: rawUsage.trialEndsAt ?? rawUsage.trial_ends_at ?? null,
    };
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
    setAuthUiState(Boolean(authToken));
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
            throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json().catch(() => ({}));
        const usage = normalizeUsage(payload?.summary);
        if (!usage) throw new Error('Plan ozeti bos geldi.');
        lastPlanUsage = usage;
        applyUsageToUi(usage, 'success');
        return usage;
    } catch (error) {
        lastPlanUsage = null;
        if (!silent) {
            setQuotaInfo(`Kota bilgisi alinamadi: ${error instanceof Error ? error.message : 'bilinmeyen hata'}`, 'error');
        }
        return null;
    }
};

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

const setActiveTab = (tabName) => {
    el.tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tabName);
    });
};

const setActiveMode = (mode) => {
    activeMode = Object.prototype.hasOwnProperty.call(MODE_CONTENT, mode) ? mode : 'edit';
    const config = MODE_CONTENT[activeMode];
    el.modeButtons.forEach((button) => {
        button.classList.toggle('active', (button.dataset.mode || '') === activeMode);
    });
    el.promptText.value = config.prompt;
    el.modeDescription.textContent = config.description;
    el.activeModeText.textContent = `Aktif mod: ${config.title}`;
    setActiveTab(config.tab);
};

const renderResearchState = ({ webSearch = null, legalSearch = null, appliedIntent = 'edit' } = {}) => {
    const webDone = Boolean(webSearch?.summary);
    const legalDone = Array.isArray(legalSearch?.results) && legalSearch.results.length > 0;
    el.researchState.innerHTML = [
        `<div class="pill">Web: ${webDone ? 'yapildi' : 'yapilmadi'}</div>`,
        `<div class="pill">Emsal: ${legalDone ? 'yapildi' : 'yapilmadi'}</div>`,
        `<div class="pill">Intent: ${appliedIntent}</div>`,
    ].join('');
};

const renderWebResults = (webSearch) => {
    if (!webSearch?.summary && !(Array.isArray(webSearch?.sources) && webSearch.sources.length > 0)) {
        el.webResults.className = 'result-list empty-state';
        el.webResults.textContent = 'Henuz web arastirmasi yapilmadi.';
        return;
    }

    const cards = [];
    if (webSearch.summary) {
        cards.push(`
            <article class="result-card">
                <h3>Web Arastirma Ozeti</h3>
                <div class="result-text">${webSearch.summary}</div>
            </article>
        `);
    }
    (webSearch.sources || []).forEach((source) => {
        cards.push(`
            <article class="result-card">
                <h3>${source.title || source.uri}</h3>
                <a class="result-link" href="${source.uri}" target="_blank" rel="noopener noreferrer">${source.uri}</a>
            </article>
        `);
    });

    el.webResults.className = 'result-list';
    el.webResults.innerHTML = cards.join('');
};

const renderLegalResults = (legalSearch) => {
    const results = Array.isArray(legalSearch?.results) ? legalSearch.results : [];
    if (results.length === 0) {
        el.legalResults.className = 'result-list empty-state';
        el.legalResults.textContent = 'Henuz emsal karar aramasi yapilmadi.';
        return;
    }

    el.legalResults.className = 'result-list';
    el.legalResults.innerHTML = results.slice(0, 6).map((result) => {
        const preview = (result.ozet || result.snippet || result.summaryText || '').trim();
        const meta = [result.esasNo ? `E. ${result.esasNo}` : '', result.kararNo ? `K. ${result.kararNo}` : '', result.tarih ? `T. ${result.tarih}` : ''].filter(Boolean).join(' | ');
        const link = result.sourceUrl || result.documentUrl || '';
        return `
            <article class="result-card">
                <h3>${result.title || 'Karar'}</h3>
                <div class="result-meta">${meta || 'Karar metaverisi mevcut degil.'}</div>
                <div class="result-text">${preview || 'Ozet bulunamadi.'}</div>
                ${link ? `<a class="result-link" href="${link}" target="_blank" rel="noopener noreferrer">${link}</a>` : ''}
            </article>
        `;
    }).join('');
};

const renderResearchSummary = (payload) => {
    const summaryParts = [];
    if (payload.analysis?.summary) summaryParts.push(`Analiz: ${payload.analysis.summary}`);
    if (payload.webSearch?.summary) summaryParts.push(`Web: ${payload.webSearch.summary}`);
    if (payload.legalSearch?.summary) summaryParts.push(`Emsal: ${payload.legalSearch.summary}`);
    el.researchSummary.value = summaryParts.join('\n\n').trim();
};

const callWordAssistantApi = async ({ message, selectionText, documentText, mode, includeDocumentContext }) => {
    const apiBase = resolveApiBaseUrl();
    const headers = buildAuthHeaders();
    const response = await fetch(`${apiBase}/api/word-assistant/respond`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            message,
            selectionText,
            documentText,
            mode,
            includeDocumentContext,
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || `Word assistant failed (HTTP ${response.status})`);
    }
    return payload;
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

const sendAssistantRequest = async () => {
    if (isBusy) return;

    const message = (el.promptText.value || '').trim();
    if (!message) {
        setStatus('Lutfen asistan icin bir mesaj girin.', 'error');
        return;
    }

    let selectionText = (el.sourceText.value || '').trim();
    let documentText = '';
    const shouldIncludeDocumentContext = Boolean(el.includeDocumentContext?.checked);
    const authToken = resolveAuthToken();

    if (!authToken) {
        setAuthUiState(false);
        setStatus('Giris gerekli. Once giris yapin.', 'error');
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
            const fullDocumentText = await readDocumentText();
            documentText = truncateContext(fullDocumentText, 12000);
        }

        if (!selectionText && !documentText) {
            setStatus('Lutfen Word icinde secim yapin veya belge metni oldugundan emin olun.', 'error');
            return;
        }

        setStatus('Asistan orkestrasyonu calisiyor...');
        const payload = await callWordAssistantApi({
            message,
            selectionText,
            documentText,
            mode: activeMode,
            includeDocumentContext: shouldIncludeDocumentContext,
        });

        el.resultText.value = String(payload.assistantText || '').trim();
        renderResearchState(payload);
        renderResearchSummary(payload);
        renderWebResults(payload.webSearch);
        renderLegalResults(payload.legalSearch);

        if (el.autoReplace.checked && el.resultText.value.trim()) {
            await replaceSelection(el.resultText.value.trim());
            setStatus('Asistan sonucu Word secimine uygulandi.', 'success');
        } else {
            setStatus('Asistan sonucu hazirlandi.', 'success');
        }

        if (payload.quota) {
            applyUsageToUi(normalizeUsage(payload.quota), 'success');
        } else {
            refreshPlanSummary({ silent: true }).catch(() => {});
        }
    } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Asistan istegi basarisiz.', 'error');
    } finally {
        setBusy(false);
    }
};

const handleReplaceSelection = async () => {
    if (isBusy) return;
    const resultText = (el.resultText.value || '').trim();
    if (!resultText) {
        setStatus('Uygulanacak asistan sonucu yok.', 'error');
        return;
    }

    setBusy(true);
    try {
        setStatus('Asistan sonucu Word secimine yaziliyor...');
        await replaceSelection(resultText);
        setStatus('Asistan sonucu secime yazildi.', 'success');
    } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Secime yazma basarisiz.', 'error');
    } finally {
        setBusy(false);
    }
};

const handleUpgradePlan = () => {
    window.open(`${resolveApiBaseUrl()}/fiyatlandirma`, '_blank', 'noopener,noreferrer');
};

const initialize = () => {
    el.apiBaseUrl.value = window.location.origin;
    setAuthUiState(Boolean(resolveAuthToken()));
    el.readSelectionBtn.addEventListener('click', handleReadSelection);
    el.replaceSelectionBtn.addEventListener('click', handleReplaceSelection);
    el.sendChatBtn.addEventListener('click', sendAssistantRequest);
    if (el.loginBtn) {
        el.loginBtn.addEventListener('click', () => {
            const redirect = encodeURIComponent(WORD_LOGIN_REDIRECT);
            window.location.href = `${resolveApiBaseUrl()}/login?source=word-addin&redirect=${redirect}`;
        });
    }
    if (el.upgradePlanBtn) el.upgradePlanBtn.addEventListener('click', handleUpgradePlan);
    if (el.authToken) {
        el.authToken.addEventListener('change', () => {
            refreshPlanSummary({ silent: true }).catch(() => {});
        });
    }

    el.modeButtons.forEach((button) => {
        button.addEventListener('click', () => setActiveMode(button.dataset.mode || 'edit'));
    });
    el.tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab || 'text-assistant';
            const fallbackMode = tabName === 'research' ? 'research_and_answer' : 'edit';
            setActiveMode(fallbackMode);
        });
    });

    setActiveMode('edit');
    renderResearchState({});
    renderWebResults(null);
    renderLegalResults(null);
    setStatus('Hazir. Word secimini alin ve uygun aksiyonu secin.');
    setQuotaInfo('Kota bilgisi yukleniyor...');
    refreshPlanSummary({ silent: true }).catch(() => {});
};

Office.onReady((info) => {
    if (info.host !== Office.HostType.Word) {
        setStatus('Bu panel yalnizca Word icin tasarlanmistir.', 'error');
        return;
    }
    initialize();
});
