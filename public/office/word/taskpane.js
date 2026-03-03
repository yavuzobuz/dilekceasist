const el = {
    sourceText: document.getElementById('sourceText'),
    promptText: document.getElementById('promptText'),
    resultText: document.getElementById('resultText'),
    status: document.getElementById('status'),
    apiBaseUrl: document.getElementById('apiBaseUrl'),
    apiKey: document.getElementById('apiKey'),
    autoReplace: document.getElementById('autoReplace'),
    readSelectionBtn: document.getElementById('readSelectionBtn'),
    replaceSelectionBtn: document.getElementById('replaceSelectionBtn'),
    sendChatBtn: document.getElementById('sendChatBtn'),
    actionButtons: Array.from(document.querySelectorAll('[data-action]')),
};

const QUICK_PROMPTS = {
    'decision-search': 'Bu konu icin emsal Yargitay ve Danistay kararlari ara. Her karar icin daire, esas no, karar no, tarih ve kisa ozet ver.',
    'text-fix': 'Asagidaki metni anlami degistirmeden dil bilgisi, imla, noktalama ve akicilik acisindan duzelt.',
    brainstorm: 'Bu konu icin farkli hukuki strateji seceneklerini, avantaj ve riskleriyle madde madde beyin firtinasi yap.',
    'web-search': 'Bu konu icin web aramasi yap. Guvenilir kaynaklardan kisa ozet ve uygulanabilir oneriler sun.',
};

const MAX_HISTORY_MESSAGES = 8;
let chatHistory = [];
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
    el.sendChatBtn.disabled = busy;
    el.actionButtons.forEach((btn) => { btn.disabled = busy; });
};

const resolveApiBaseUrl = () => {
    const raw = (el.apiBaseUrl.value || '').trim();
    if (!raw) return window.location.origin;
    return raw.replace(/\/+$/, '');
};

const limitHistory = (history) => history.slice(-MAX_HISTORY_MESSAGES);

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

const buildUserMessage = ({ prompt, selectionText }) => {
    if (!selectionText) return prompt;
    return `${prompt}\n\nWord secimi:\n"""${selectionText}"""`;
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

const callChatApi = async ({ history, selectionText, onTextChunk }) => {
    const apiBase = resolveApiBaseUrl();
    const apiKey = (el.apiKey.value || '').trim();
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    const response = await fetch(`${apiBase}/api/gemini/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            chatHistory: history,
            analysisSummary: selectionText || '',
            context: {
                keywords: '',
                searchSummary: '',
                docContent: selectionText || '',
                specifics: '',
            },
        }),
    });

    if (!response.ok) {
        const rawError = await response.text();
        let message = `Chat API failed (HTTP ${response.status})`;
        if (rawError) {
            try {
                const parsed = JSON.parse(rawError);
                if (parsed?.error) message = parsed.error;
            } catch {
                message = rawError;
            }
        }
        throw new Error(message);
    }

    if (!response.body) {
        throw new Error('Chat API response body bos geldi.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

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

    return fullText.trim();
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

    const selectionText = (el.sourceText.value || '').trim();
    const userMessage = buildUserMessage({ prompt, selectionText });
    const requestHistory = limitHistory([...chatHistory, { role: 'user', text: userMessage }]);

    setBusy(true);
    try {
        setStatus('Chatbot yaniti uretiyor...');
        el.resultText.value = '';

        const responseText = await callChatApi({
            history: requestHistory,
            selectionText,
            onTextChunk: (textChunk) => {
                el.resultText.value += textChunk;
            },
        });

        const finalText = (responseText || el.resultText.value || '').trim();
        if (!finalText) {
            throw new Error('Chatbot bos yanit dondurdu.');
        }

        el.resultText.value = finalText;
        chatHistory = limitHistory([...requestHistory, { role: 'model', text: finalText }]);

        if (el.autoReplace.checked) {
            await replaceSelection(finalText);
            setStatus('Chatbot sonucu Word secimine uygulandi.', 'success');
        } else {
            setStatus('Chatbot sonucu hazirlandi. Isterseniz "Secime Uygula" ile yazabilirsiniz.', 'success');
        }
    } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Chatbot islemi basarisiz.', 'error');
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

const initialize = () => {
    el.apiBaseUrl.value = window.location.origin;
    el.readSelectionBtn.addEventListener('click', handleReadSelection);
    el.replaceSelectionBtn.addEventListener('click', handleReplaceSelection);
    el.sendChatBtn.addEventListener('click', () => sendChat());
    el.actionButtons.forEach((btn) => {
        btn.addEventListener('click', () => handleQuickAction(btn.dataset.action || ''));
    });
    setStatus('Hazir. Word secimini alin, hizli aksiyon secin ve chatbot ile devam edin.');
};

Office.onReady((info) => {
    if (info.host !== Office.HostType.Word) {
        setStatus('Bu panel yalnizca Word icin tasarlanmistir.', 'error');
        return;
    }
    initialize();
});
