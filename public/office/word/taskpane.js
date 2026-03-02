const el = {
    sourceText: document.getElementById('sourceText'),
    resultText: document.getElementById('resultText'),
    status: document.getElementById('status'),
    apiBaseUrl: document.getElementById('apiBaseUrl'),
    apiKey: document.getElementById('apiKey'),
    autoReplace: document.getElementById('autoReplace'),
    readSelectionBtn: document.getElementById('readSelectionBtn'),
    replaceSelectionBtn: document.getElementById('replaceSelectionBtn'),
    modeButtons: Array.from(document.querySelectorAll('[data-mode]')),
};

let isBusy = false;

const setStatus = (message, type = 'info') => {
    el.status.textContent = message || '';
    el.status.classList.remove('error', 'success');
    if (type === 'error') el.status.classList.add('error');
    if (type === 'success') el.status.classList.add('success');
};

const setBusy = (busy) => {
    isBusy = busy;
    el.readSelectionBtn.disabled = busy;
    el.replaceSelectionBtn.disabled = busy;
    el.modeButtons.forEach((btn) => { btn.disabled = busy; });
};

const resolveApiBaseUrl = () => {
    const raw = (el.apiBaseUrl.value || '').trim();
    if (!raw) return window.location.origin;
    return raw.replace(/\/+$/, '');
};

const readSelection = async () => Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.load('text');
    await context.sync();
    return selection.text || '';
});

const replaceSelection = async (text) => Word.run(async (context) => {
    const selection = context.document.getSelection();
    selection.insertText(text, Word.InsertLocation.replace);
    await context.sync();
});

const callRewriteApi = async ({ textToRewrite, mode }) => {
    const apiBase = resolveApiBaseUrl();
    const apiKey = (el.apiKey.value || '').trim();
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    const response = await fetch(`${apiBase}/api/gemini/rewrite`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ textToRewrite, mode, source: 'word-taskpane' }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = payload.error || `API error (${response.status})`;
        throw new Error(message);
    }

    if (typeof payload.text !== 'string' || payload.text.trim().length === 0) {
        throw new Error('API bos sonuc dondurdu.');
    }

    return payload.text.trim();
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

const handleRewrite = async (mode) => {
    if (isBusy) return;
    const sourceText = (el.sourceText.value || '').trim();
    if (!sourceText) {
        setStatus('Islem once secili metin gerekli.', 'error');
        return;
    }

    setBusy(true);
    try {
        setStatus(`AI islemi basladi (${mode})...`);
        const rewrittenText = await callRewriteApi({ textToRewrite: sourceText, mode });
        el.resultText.value = rewrittenText;

        if (el.autoReplace.checked) {
            await replaceSelection(rewrittenText);
            setStatus('AI sonucu Word secimine uygulandi.', 'success');
        } else {
            setStatus('AI sonucu hazirlandi. Isterseniz "Secime Uygula" ile yazabilirsiniz.', 'success');
        }
    } catch (error) {
        setStatus(error instanceof Error ? error.message : 'AI islemi basarisiz.', 'error');
    } finally {
        setBusy(false);
    }
};

const handleReplaceSelection = async () => {
    if (isBusy) return;
    const resultText = (el.resultText.value || '').trim();
    if (!resultText) {
        setStatus('Uygulanacak AI sonucu yok.', 'error');
        return;
    }

    setBusy(true);
    try {
        setStatus('AI sonucu Word secimine yaziliyor...');
        await replaceSelection(resultText);
        setStatus('AI sonucu secime yazildi.', 'success');
    } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Secime yazma basarisiz.', 'error');
    } finally {
        setBusy(false);
    }
};

const initialize = () => {
    el.apiBaseUrl.value = window.location.origin;
    el.readSelectionBtn.addEventListener('click', handleReadSelection);
    el.replaceSelectionBtn.addEventListener('click', handleReplaceSelection);
    el.modeButtons.forEach((btn) => {
        btn.addEventListener('click', () => handleRewrite(btn.dataset.mode || 'rewrite'));
    });
    setStatus('Hazir. Word icinde metin secip islemi baslatin.');
};

Office.onReady((info) => {
    if (info.host !== Office.HostType.Word) {
        setStatus('Bu panel yalnizca Word icin tasarlanmistir.', 'error');
        return;
    }
    initialize();
});
