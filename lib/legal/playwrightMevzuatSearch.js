import { chromium, firefox, webkit } from 'playwright';

const DEFAULT_BASE_URL = 'https://mevzuat.adalet.gov.tr/';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RESULT_LIMIT = 15;

const normalizeText = (value = '') =>
    String(value || '')
        .replace(/\s+/g, ' ')
        .trim();

const extractDocumentId = (url = '') => {
    const match = String(url || '').match(/\/ictihat\/(\d+)/i) || String(url || '').match(/\b(\d{6,})\b/);
    return match?.[1] || '';
};

const buildResultFromLink = (link, containerText = '') => {
    const href = link?.href || link?.dataHref || '';
    const documentId = extractDocumentId(href);
    const title = normalizeText(link?.textContent || link?.title || '');
    const rawText = normalizeText(containerText || link?.context || '');
    return {
        documentId,
        sourceUrl: href || undefined,
        title: title || undefined,
        snippet: rawText || undefined,
    };
};

const defaultSelectors = {
    searchInput: 'input#phrasesKey, input[type="search"], input[placeholder*="Ara"], input[placeholder*="ara"]',
    searchButton: 'button[aria-label*="Ara"], button[title*="Sorgula"], button:has-text("Ara"), [role="button"][aria-label*="Ara"], [role="button"][title*="Sorgula"]',
    resultLink: 'a[href*="/ictihat/"], [data-href*="/ictihat/"], [onclick*="ictihat"]',
    resultRows: '.dx-datagrid-rowsview .dx-data-row',
    ictihatToggle: 'input[type="radio"][value*="ictihat" i], label:has-text("İçtihat"), label:has-text("Ictihat"), .dx-radiobutton:has-text("İçtihat"), .dx-radiobutton:has-text("Ictihat")',
    noData: '.dx-datagrid-nodata',
    gridHeaders: '.dx-datagrid-headers td, .dx-datagrid-headers th',
    viewButton: '[aria-label*="Dosya Görüntüle"], [title*="Dosya Görüntüle"]',
    openNewTabButton: '[aria-label*="Yeni Sekmede"], [title*="Yeni Sekmede"]',
    overlayContent: '.dx-overlay-content, .modal-content, .modal-body, .swal2-popup',
    overlayClose: '.dx-overlay-content [aria-label*="Kapat"], .dx-overlay-content .dx-closebutton, .modal [data-dismiss="modal"], .modal .close, .swal2-close',
    viewerFrame: 'iframe, frame',
};

const extractDocumentPayloadFromPage = async (targetPage) => {
    await targetPage.waitForLoadState('domcontentloaded').catch(() => undefined);
    await targetPage.waitForTimeout(800).catch(() => undefined);

    const html = await targetPage.content().catch(() => '');
    const text = await targetPage.locator('body').innerText().catch(() => '');
    const finalUrl = targetPage.url();

    return {
        documentId: extractDocumentId(finalUrl),
        sourceUrl: finalUrl && !finalUrl.startsWith('about:blank') ? finalUrl : undefined,
        documentHtml: html || undefined,
        documentText: normalizeText(text) || undefined,
    };
};

const extractDocumentPayloadFromFrame = async (frame, urlHint = '') => {
    const html = await frame.content().catch(() => '');
    const text = await frame.locator('body').innerText().catch(() => '');
    const frameUrl = frame.url?.() || urlHint || '';

    return {
        documentId: extractDocumentId(frameUrl),
        sourceUrl: frameUrl && !frameUrl.startsWith('about:blank') ? frameUrl : undefined,
        documentHtml: html || undefined,
        documentText: normalizeText(text) || undefined,
    };
};

const extractDocumentPayloadFromOverlay = async (page, selectors = defaultSelectors) => {
    const overlay = page.locator(selectors.overlayContent).filter({ hasText: /T\.C\.|DOSYA NO|KARAR NO|TÜRK MİLLETİ ADINA/i }).first();
    const count = await overlay.count().catch(() => 0);
    if (count === 0) return null;

    const html = await overlay.evaluate((node) => node.innerHTML || '').catch(() => '');
    const text = await overlay.innerText().catch(() => '');
    return {
        documentId: '',
        sourceUrl: undefined,
        documentHtml: html || undefined,
        documentText: normalizeText(text) || undefined,
    };
};

const closeOverlayIfPresent = async (page, selectors = defaultSelectors) => {
    const closeButton = page.locator(selectors.overlayClose).first();
    if (await closeButton.count().catch(() => 0)) {
        await closeButton.click({ force: true }).catch(() => undefined);
    } else {
        await page.keyboard.press('Escape').catch(() => undefined);
    }
    await page.waitForTimeout(300).catch(() => undefined);
};

const enrichRowsWithDocuments = async ({
    page,
    rows = [],
    limit = 15,
    selectors = defaultSelectors,
    pushLog = () => undefined,
} = {}) => {
    const output = [];
    const count = Math.min(Array.isArray(rows) ? rows.length : 0, Math.max(0, limit));

    for (let index = 0; index < count; index += 1) {
        const row = rows[index] || {};
        const rowLocator = page.locator(selectors.resultRows).nth(index);
        const viewButton = rowLocator.locator(selectors.viewButton).first();
        const openNewTabButton = rowLocator.locator(selectors.openNewTabButton).first();
        const enriched = { ...row };

        const buttonExists = await viewButton.count().catch(() => 0);
        if (buttonExists === 0) {
            pushLog(`view_button_not_found row=${index + 1}`);
            output.push(enriched);
            continue;
        }

        let popup = null;
        try {
            const popupPromise = page.waitForEvent('popup', { timeout: 2500 }).catch(() => null);
            await viewButton.click({ force: true }).catch(() => undefined);
            pushLog(`clicked_view_button row=${index + 1}`);
            popup = await popupPromise;

            if (popup) {
                pushLog(`clicked_view_button row=${index + 1} mode=popup`);
                const payload = await extractDocumentPayloadFromPage(popup);
                output.push({
                    ...enriched,
                    ...payload,
                });
                await popup.close().catch(() => undefined);
                continue;
            }

            await page.waitForTimeout(1200).catch(() => undefined);

            const overlayPayload = await extractDocumentPayloadFromOverlay(page, selectors);
            if (overlayPayload?.documentText || overlayPayload?.documentHtml) {
                pushLog(`clicked_view_button row=${index + 1} mode=overlay`);
                output.push({
                    ...enriched,
                    ...overlayPayload,
                });
                await closeOverlayIfPresent(page, selectors);
                continue;
            }

            const frames = page.frames().filter((frame) => frame !== page.mainFrame());
            let framePayload = null;
            for (const frame of frames) {
                const payload = await extractDocumentPayloadFromFrame(frame, frame.url?.() || '');
                if (payload.documentText || payload.documentHtml) {
                    framePayload = payload;
                    break;
                }
            }
            if (framePayload) {
                pushLog(`clicked_view_button row=${index + 1} mode=frame`);
                output.push({
                    ...enriched,
                    ...framePayload,
                });
                await closeOverlayIfPresent(page, selectors);
                continue;
            }

            const currentUrl = page.url();
            if (currentUrl && !currentUrl.startsWith(DEFAULT_BASE_URL)) {
                pushLog(`clicked_view_button row=${index + 1} mode=same_page`);
                const payload = await extractDocumentPayloadFromPage(page);
                output.push({
                    ...enriched,
                    ...payload,
                });
                await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
                await page.waitForTimeout(500).catch(() => undefined);
                continue;
            }

            if (await openNewTabButton.count().catch(() => 0)) {
                const newTabPopupPromise = page.waitForEvent('popup', { timeout: 2500 }).catch(() => null);
                await openNewTabButton.click({ force: true }).catch(() => undefined);
                pushLog(`clicked_new_tab_button row=${index + 1}`);
                const newTabPopup = await newTabPopupPromise;
                if (newTabPopup) {
                    const payload = await extractDocumentPayloadFromPage(newTabPopup);
                    output.push({
                        ...enriched,
                        ...payload,
                    });
                    await newTabPopup.close().catch(() => undefined);
                    continue;
                }
            }

            pushLog(`view_payload_not_found row=${index + 1}`);
            output.push(enriched);
        } catch (error) {
            pushLog(`view_button_error row=${index + 1} ${error?.message || error}`);
            output.push(enriched);
        }
    }

    return output;
};

export const searchLegalDecisionsViaPlaywright = async ({
    query = '',
    queries = null,
    baseUrl = DEFAULT_BASE_URL,
    limit = DEFAULT_RESULT_LIMIT,
    headless = true,
    browser = 'firefox',
    keepOpen = false,
    debug = false,
    fetchDocuments = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    selectors = defaultSelectors,
} = {}) => {
    const normalizedQueries = Array.isArray(queries) && queries.length > 0
        ? queries
        : (query ? [query] : []);
    const trimmedQueries = normalizedQueries.map(normalizeText).filter(Boolean);
    if (trimmedQueries.length === 0) {
        return { results: [], diagnostics: { applied: false, reason: 'empty_query' } };
    }

    const launcher =
        browser === 'chromium'
            ? chromium
            : (browser === 'webkit' ? webkit : firefox);
    const instance = await launcher.launch({ headless });
    const context = await instance.newContext();
    const page = await context.newPage();
    const debugLog = [];
    const pushLog = (message = '') => {
        const text = normalizeText(message);
        if (!text) return;
        debugLog.push(text);
        if (debug) console.log(`[karakazi] ${text}`);
    };

    try {
        page.setDefaultTimeout(timeoutMs);
        if (debug) {
            page.on('console', (msg) => {
                const type = msg.type();
                const text = msg.text();
                pushLog(`console:${type} ${text}`);
            });
            page.on('pageerror', (err) => {
                pushLog(`pageerror ${err.message}`);
            });
            page.on('requestfailed', (req) => {
                pushLog(`requestfailed ${req.url()} ${req.failure()?.errorText || ''}`);
            });
        }
        const baseUrlTrimmed = baseUrl.replace(/\/+$/g, '');
        const fallbackUrl = `${baseUrlTrimmed}/emsal/`;
        let input = null;
        await page.goto(baseUrlTrimmed, { waitUntil: 'domcontentloaded' });
        pushLog(`goto ${baseUrlTrimmed}`);
        input = await page.$(selectors.searchInput);
        if (!input) {
            await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded' });
            pushLog(`goto_fallback ${fallbackUrl}`);
            input = await page.$(selectors.searchInput);
        }
        if (!input) {
            return {
                results: [],
                diagnostics: { applied: false, reason: 'search_input_not_found', log: debugLog },
            };
        }

        let ictihatClicked = false;
        const ictihatTextCandidates = ['İçtihat', 'Ictihat'];
        for (const label of ictihatTextCandidates) {
            const locator = page.getByText(label, { exact: true }).first();
            const exists = await locator.count().catch(() => 0);
            if (exists > 0) {
                await locator.click().catch(() => undefined);
                pushLog(`clicked_ictihat_toggle ${label}`);
                ictihatClicked = true;
                await page.waitForTimeout(500);
                break;
            }
        }
        if (!ictihatClicked) {
            const ictihatToggle = await page.$(selectors.ictihatToggle);
            if (ictihatToggle) {
                await ictihatToggle.click().catch(() => undefined);
                pushLog('clicked_ictihat_toggle css');
                await page.waitForTimeout(500);
                ictihatClicked = true;
            }
        }
        if (!ictihatClicked) pushLog('ictihat_toggle_not_found');

        let selectedQuery = '';
        let mapped = [];

        for (const candidate of trimmedQueries) {
            selectedQuery = candidate;
            pushLog(`try_query ${candidate}`);
            await input.fill(candidate);
            let clickedButton = false;
            const buttonByLabel = page.getByRole('button', { name: /ara/i }).first();
            if (await buttonByLabel.count().catch(() => 0)) {
                await buttonByLabel.click().catch(() => undefined);
                clickedButton = true;
                pushLog('clicked_search_button role');
            }
            if (!clickedButton) {
                const buttonByTitle = page.locator('[role="button"][title*="Sorgula"], button[title*="Sorgula"]').first();
                if (await buttonByTitle.count().catch(() => 0)) {
                    await buttonByTitle.click().catch(() => undefined);
                    clickedButton = true;
                    pushLog('clicked_search_button title');
                }
            }
            if (!clickedButton) {
                const button = await page.$(selectors.searchButton);
                if (button) {
                    await button.click().catch(() => undefined);
                    clickedButton = true;
                    pushLog('clicked_search_button css');
                }
            }
            if (!clickedButton) pushLog('search_button_not_found');
            await input.press('Enter').catch(() => undefined);
            pushLog('pressed_enter');

            await page.waitForTimeout(800);
            await page.waitForSelector(selectors.resultRows, { timeout: 6000 }).catch(() => undefined);
            const headerTexts = await page.$$eval(selectors.gridHeaders, (nodes) =>
                nodes.map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
            ).catch(() => []);
            if (headerTexts.length > 0) pushLog(`grid_headers ${headerTexts.join(' | ')}`);
            const noDataText = await page.$eval(selectors.noData, (node) => node.textContent || '').catch(() => '');
            if (noDataText) pushLog(`no_data_text ${normalizeText(noDataText)}`);
            const rows = await page.$$eval(selectors.resultRows, (nodes) => {
                return nodes.map((row) => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    return {
                        kararNo: cells[0]?.textContent || '',
                        esasNo: cells[1]?.textContent || '',
                        daire: cells[2]?.textContent || '',
                        mahkeme: cells[3]?.textContent || '',
                        kararTarihi: cells[5]?.textContent || '',
                        rowText: row.textContent || '',
                    };
                });
            });
            pushLog(`rows_found ${rows.length}`);

            if (rows.length > 0) {
                mapped = rows.map((item) => ({
                    documentId: '',
                    sourceUrl: undefined,
                    title: normalizeText(`${item.daire} ${item.kararNo}`),
                    snippet: normalizeText(
                        `${item.esasNo} ${item.mahkeme} ${item.kararTarihi}`.trim()
                    ),
                    kararNo: normalizeText(item.kararNo),
                    esasNo: normalizeText(item.esasNo),
                    daire: normalizeText(item.daire),
                    mahkeme: normalizeText(item.mahkeme),
                    kararTarihi: normalizeText(item.kararTarihi),
                }));
                pushLog(`mapped_rows ${mapped.length}`);
                if (fetchDocuments && mapped.length > 0) {
                    mapped = await enrichRowsWithDocuments({
                        page,
                        rows: mapped,
                        limit,
                        selectors,
                        pushLog,
                    });
                    pushLog(`document_enriched ${mapped.filter((item) => item.documentText || item.documentHtml).length}`);
                }
            } else {
                const results = await page.$$eval(selectors.resultLink, (nodes) => {
                    const output = [];
                    nodes.forEach((node) => {
                        const element = node;
                        const href = element.href || element.getAttribute?.('data-href') || '';
                        const onclick = element.getAttribute?.('onclick') || '';
                        const guessed = onclick.match(/\/ictihat\/(\d+)/i)?.[0] || '';
                        const container = element.closest('article, li, div') || element.parentElement;
                        output.push({
                            href: href || guessed,
                            text: element.textContent || '',
                            containerText: container ? container.textContent || '' : '',
                            dataHref: element.getAttribute?.('data-href') || '',
                            title: element.getAttribute?.('title') || '',
                        });
                    });
                    return output;
                });
                pushLog(`links_found ${results.length}`);
                mapped = results
                    .map((item) =>
                        buildResultFromLink(
                            { href: item.href, textContent: item.text, dataHref: item.dataHref, title: item.title },
                            item.containerText
                        )
                    )
                    .filter((item) => item.documentId || item.sourceUrl)
                    .slice(0, Math.max(1, limit));
                pushLog(`mapped_links ${mapped.length}`);
            }

            if (mapped.length > 0) break;
        }

        return {
            results: mapped,
            diagnostics: {
                applied: true,
                query: selectedQuery,
                triedQueries: trimmedQueries,
                resultCount: mapped.length,
                source: 'playwright',
                log: debugLog,
            },
        };
    } finally {
        if (!keepOpen) {
            await page.close().catch(() => undefined);
            await context.close().catch(() => undefined);
            await instance.close().catch(() => undefined);
        }
    }
};
