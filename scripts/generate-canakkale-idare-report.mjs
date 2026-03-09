import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getLegalDocumentViaMcp, searchLegalDecisionsViaMcp } from '../lib/legal/mcpLegalSearch.js';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'reports');
const HTML_PATH = path.join(OUTPUT_DIR, 'canakkale-idare-emsal-raporu.html');
const JSON_PATH = path.join(OUTPUT_DIR, 'canakkale-idare-emsal-raporu.json');
const DECISION_CONTENT_LIMIT = 18000;
const DECISION_CONTENT_CACHE = new Map();

const PETITION_CASE_CONTEXT = `
Canakkale Idare Mahkemesi ne sunulacak iptal ve yurutmenin durdurulmasi talepli dava.
Davali idare Gelibolu Belediyesi.
Uyusmazlik konusu belediye tarafindan tesis edilen yikim karari ve idari para cezasi.
Dosyada imar barisi basvurusu, yapi kayit belgesi sureci, yapi tespit ve durdurma zapti,
yapi tatil tutanaklari, ruhsata aykirilik iddiasi, eski tarihli bina beyannamesi,
Imar Kanunu 32 ve 42 kapsaminda yikim ve para cezasi, savunma hakki, tebligat usulu,
orantililik ilkesi ve IYUK 27 kapsaminda yurutmenin durdurulmasi talepleri yer aliyor.
`;

const TOPICS = [
    {
        id: 'master',
        title: 'Genel dosya ekseni',
        query: 'belediye yikim karari idari para cezasi imar kanunu 32 42 yurutmenin durdurulmasi',
        note: 'Dilekcenin ana govdesi: yikim, para cezasi ve iptal talebi.',
        searchArea: 'auto',
        preferredSource: 'danistay',
    },
    {
        id: 'imar-barisi',
        title: 'Imar barisi ve yapi kayit belgesi',
        query: 'imar barisi yapi kayit belgesi gecici 16 yikim karari',
        note: 'Imar barisi basvurusu ve yapi kayit belgesinin etkisi.',
        searchArea: 'danistay',
        preferredSource: 'danistay',
    },
    {
        id: 'yapi-tatil',
        title: 'Yapi tatil tutanagi ve tebligat',
        query: 'yapi tatil tutanagi tebligat usulsuzlugu savunma hakki imar kanunu 32',
        note: 'Yapi tespit ve durdurma zaptinin sekil, tebligat ve savunma hakki boyutu.',
        searchArea: 'danistay',
        preferredSource: 'danistay',
    },
    {
        id: 'ruhsat-aykirilik',
        title: 'Ruhsata aykirilik ve yikim karari',
        query: 'ruhsata aykiri yapi yikim karari tadilat ruhsati konusuz kalma',
        note: 'Ruhsatli yapida sonradan aykirilik iddiasi ve yikim kararinin iptali.',
        searchArea: 'danistay',
        preferredSource: 'danistay',
    },
    {
        id: 'eski-yapi',
        title: 'Eski tarihli yapi ve geriye yurumezlik',
        query: 'eski tarihli yapi bina beyannamesi iskan geriye yurumeme imar mevzuati',
        note: 'Yapinin eski tarihli oldugu ve yeni mevzuatin geriye yurutulemeyecegi savi.',
        searchArea: 'danistay',
        preferredSource: 'danistay',
    },
    {
        id: 'para-cezasi',
        title: 'Imar para cezasi ve orantililik',
        query: 'imar kanunu 42 idari para cezasi orantililik somut gerekce',
        note: 'Para cezasinin olculu ve gerekceli olmasi gerektigi savi.',
        searchArea: 'danistay',
        preferredSource: 'danistay',
    },
    {
        id: 'islem-iptali',
        title: 'Idari islemin unsurlari ve iptal',
        query: 'idari islemin yetki sekil sebep konu maksat yonlerinden hukuka aykiriligi',
        note: 'Klasik iptal davasi denetimi: yetki, sekil, sebep, konu, maksat.',
        searchArea: 'danistay',
        preferredSource: 'danistay',
    },
    {
        id: 'yd',
        title: 'Yurutmenin durdurulmasi',
        query: 'iyuk 27 yurutmenin durdurulmasi telafisi guc zarar acik hukuka aykirilik',
        note: 'IYUK 27 kapsaminda telafisi guc zarar ve acik hukuka aykirilik.',
        searchArea: 'danistay',
        preferredSource: 'danistay',
    },
];

const esc = (value = '') =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const summarizeText = (value = '', limit = 260) => {
    const compact = String(value || '').replace(/\s+/g, ' ').trim();
    if (!compact) return '';
    return compact.length > limit ? `${compact.slice(0, limit - 3)}...` : compact;
};

const formatScore = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(1) : '-';
};

const getReadableSource = (value = '') => {
    const source = String(value || '').trim().toLowerCase();
    if (source === 'danistay') return 'Danistay';
    if (source === 'yargitay') return 'Yargitay';
    if (source === 'uyap') return 'UYAP';
    if (source === 'anayasa') return 'AYM';
    if (source === 'all') return 'Karma';
    return source || '-';
};

const buildTopicRawQuery = (topic) =>
    [
        PETITION_CASE_CONTEXT.trim(),
        `Odak konu: ${topic.title}.`,
        `Arama ekseni: ${topic.query}.`,
        `Not: ${topic.note}.`,
    ].join('\n');

const buildDecisionKey = (item = {}) =>
    [
        String(item.source || '').trim(),
        String(item.documentId || '').trim(),
        String(item.documentUrl || '').trim(),
    ].join('|');

async function attachDecisionContent(item) {
    const decisionKey = buildDecisionKey(item);
    if (!decisionKey || (!item.documentId && !item.documentUrl)) {
        return { ...item, decisionKey: '', decisionContent: '', decisionContentError: 'Belge kimligi yok.' };
    }

    if (DECISION_CONTENT_CACHE.has(decisionKey)) {
        return { ...item, decisionKey, ...DECISION_CONTENT_CACHE.get(decisionKey) };
    }

    try {
        const payload = await getLegalDocumentViaMcp({
            source: item.source || 'danistay',
            documentId: item.documentId || '',
            documentUrl: item.documentUrl || '',
        });
        const rawContent = String(payload?.document?.content || '').trim();
        const value = {
            decisionContent: summarizeText(rawContent, DECISION_CONTENT_LIMIT),
            decisionContentError: '',
        };
        DECISION_CONTENT_CACHE.set(decisionKey, value);
        return { ...item, decisionKey, ...value };
    } catch (error) {
        const value = {
            decisionContent: '',
            decisionContentError: String(error?.message || error || 'Karar metni alinmadi.'),
        };
        DECISION_CONTENT_CACHE.set(decisionKey, value);
        return { ...item, decisionKey, ...value };
    }
}

async function runTopic(topic) {
    const candidateSources = Array.from(new Set([topic.preferredSource || 'danistay', 'all']));
    const attempts = [];

    for (const source of candidateSources) {
        const payload = await searchLegalDecisionsViaMcp({
            source,
            keyword: topic.query,
            rawQuery: buildTopicRawQuery(topic),
            filters: { searchArea: topic.searchArea || 'auto' },
        });

        const results = Array.isArray(payload?.results) ? payload.results : [];
        const topResults = await Promise.all(
            results.slice(0, 6).map((item, index) =>
                attachDecisionContent({
                    rank: index + 1,
                    title: item?.title || '-',
                    daire: item?.daire || item?.mahkeme || item?.court || '-',
                    esasNo: item?.esasNo || '-',
                    kararNo: item?.kararNo || '-',
                    tarih: item?.tarih || '-',
                    source: item?.source || payload?.source || source,
                    score: Number(item?.relevanceScore || 0),
                    semantic: Number.isFinite(Number(item?.semanticRawScore)) ? Number(item?.semanticRawScore) : null,
                    reason: summarizeText(item?.matchReason || item?.ozet || item?.snippet || '', 220),
                    snippet: summarizeText(item?.snippet || item?.ozet || '', 320),
                    documentId: item?.documentId || item?.id || '',
                    documentUrl: item?.documentUrl || '',
                })
            )
        );

        const attempt = {
            requestedSource: source,
            resolvedSource: payload?.routing?.resolvedSource || payload?.source || source,
            searchArea: payload?.routing?.searchArea || topic.searchArea || 'auto',
            warning: String(payload?.warning || '').trim(),
            aiPlanReason: String(payload?.routing?.aiPlan?.reason || '').trim(),
            aiShortQuery: String(payload?.routing?.aiPlan?.shortQuery || '').trim(),
            aiPhrases: Array.isArray(payload?.aiExtractedPhrases) ? payload.aiExtractedPhrases : [],
            totalResults: results.length,
            topResults,
        };
        attempts.push(attempt);

        if (topResults.length > 0) {
            return {
                ...topic,
                ...attempt,
                attempts,
            };
        }
    }

    return {
        ...topic,
        ...attempts[attempts.length - 1],
        attempts,
    };
}

function buildHtml(report) {
    const decisionContents = Object.fromEntries(
        report.topics.flatMap((topic) =>
            (topic.topResults || [])
                .filter((item) => item.decisionKey)
                .map((item) => [
                    item.decisionKey,
                    {
                        title: item.title || 'Karar detayi',
                        source: item.source || topic.resolvedSource || topic.requestedSource || '',
                        documentId: item.documentId || '',
                        content: item.decisionContent || '',
                        error: item.decisionContentError || '',
                    },
                ])
        )
    );
    const decisionContentsJson = JSON.stringify(decisionContents).replace(/</g, '\\u003c');

    const summaryCards = `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="label">Konu sayisi</div>
                <div class="value">${report.topics.length}</div>
            </div>
            <div class="summary-card">
                <div class="label">Sonuc bulunan konu</div>
                <div class="value">${report.topics.filter((item) => item.totalResults > 0).length}</div>
            </div>
            <div class="summary-card">
                <div class="label">Toplam gosterilen karar</div>
                <div class="value">${report.topics.reduce((sum, item) => sum + item.topResults.length, 0)}</div>
            </div>
            <div class="summary-card">
                <div class="label">Uretilen tarih</div>
                <div class="value small">${esc(report.generatedAt)}</div>
            </div>
        </div>
    `;

    const topicSections = report.topics
        .map((topic) => {
            const resultRows = topic.topResults.length
                ? topic.topResults
                    .map((item) => {
                        const canOpen = Boolean(item.decisionKey);
                        const openButton = canOpen
                            ? `<button class="decision-button" data-decision-key="${esc(item.decisionKey || '')}" data-title="${esc(item.title)}">Karari ac</button>`
                            : '<span class="muted">Detay yok</span>';

                        return `
                            <tr>
                                <td>${item.rank}</td>
                                <td>${esc(item.title)}</td>
                                <td>${esc(item.daire)}</td>
                                <td>${esc(item.esasNo)}</td>
                                <td>${esc(item.kararNo)}</td>
                                <td>${esc(item.tarih)}</td>
                                <td>${formatScore(item.score)}</td>
                                <td>${item.semantic == null ? '-' : formatScore(item.semantic)}</td>
                                <td>${esc(item.reason || item.snippet || '-')}</td>
                                <td>${openButton}</td>
                            </tr>
                        `;
                    })
                    .join('')
                : `<tr><td colspan="10" class="empty">Bu konu icin sonuc gelmedi.</td></tr>`;

            const phrases = Array.isArray(topic.aiPhrases) && topic.aiPhrases.length
                ? topic.aiPhrases.map((item) => `<span class="chip">${esc(item)}</span>`).join('')
                : '<span class="muted">AI ifade cikarmadi.</span>';

            const warnings = [topic.warning, topic.aiPlanReason].filter(Boolean).join(' ');

            return `
                <section class="topic-card">
                    <div class="topic-head">
                        <div>
                            <h2>${esc(topic.title)}</h2>
                            <p>${esc(topic.note)}</p>
                        </div>
                        <div class="meta-box">
                            <div><strong>Arama:</strong> ${esc(topic.query)}</div>
                            <div><strong>Kaynak:</strong> ${esc(getReadableSource(topic.resolvedSource || topic.requestedSource))}</div>
                            <div><strong>Sonuc:</strong> ${topic.totalResults || 0}</div>
                        </div>
                    </div>
                    <div class="topic-body">
                        <div class="meta-row">
                            <div class="meta-panel">
                                <div class="panel-title">AI ifadeleri</div>
                                <div class="chips">${phrases}</div>
                            </div>
                            <div class="meta-panel">
                                <div class="panel-title">Kisa not</div>
                                <div class="note-text">${esc(warnings || 'Ek uyari yok.')}</div>
                            </div>
                        </div>
                        <div class="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Karar</th>
                                        <th>Daire / Mahkeme</th>
                                        <th>Esas</th>
                                        <th>Karar</th>
                                        <th>Tarih</th>
                                        <th>Skor</th>
                                        <th>Semantik</th>
                                        <th>Eslesme nedeni</th>
                                        <th>Detay</th>
                                    </tr>
                                </thead>
                                <tbody>${resultRows}</tbody>
                            </table>
                        </div>
                    </div>
                </section>
            `;
        })
        .join('');

    return `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Canakkale Idare - Emsal Karar Raporu</title>
    <style>
        :root {
            --bg: #f4efe4;
            --paper: #fffdf8;
            --ink: #1e2430;
            --muted: #596273;
            --line: #dccfb8;
            --accent: #1f4f46;
            --accent-soft: #dfeee8;
            --shadow: 0 20px 50px rgba(38, 35, 27, 0.12);
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: "Segoe UI", "Trebuchet MS", sans-serif;
            color: var(--ink);
            background:
                radial-gradient(circle at top left, rgba(31,79,70,0.12), transparent 28%),
                radial-gradient(circle at bottom right, rgba(122,63,29,0.12), transparent 24%),
                var(--bg);
        }
        .wrap {
            max-width: 1440px;
            margin: 0 auto;
            padding: 32px 20px 56px;
        }
        .hero {
            background: linear-gradient(140deg, rgba(255,253,248,0.97), rgba(245,238,225,0.94));
            border: 1px solid var(--line);
            border-radius: 28px;
            padding: 28px;
            box-shadow: var(--shadow);
            margin-bottom: 24px;
        }
        .eyebrow {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 999px;
            background: var(--accent-soft);
            color: var(--accent);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        h1 {
            margin: 14px 0 10px;
            font-size: clamp(28px, 4vw, 44px);
            line-height: 1.04;
        }
        .hero p {
            margin: 0;
            color: var(--muted);
            line-height: 1.65;
            max-width: 980px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 14px;
            margin: 22px 0 0;
        }
        .summary-card,
        .topic-card {
            background: var(--paper);
            border: 1px solid var(--line);
            border-radius: 24px;
            box-shadow: var(--shadow);
        }
        .summary-card { padding: 18px; }
        .summary-card .label {
            color: var(--muted);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }
        .summary-card .value {
            margin-top: 8px;
            font-size: 30px;
            font-weight: 700;
        }
        .summary-card .value.small {
            font-size: 16px;
            line-height: 1.5;
        }
        .topics { display: grid; gap: 18px; }
        .topic-head {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: flex-start;
            padding: 24px 24px 0;
        }
        .topic-head h2 { margin: 0 0 8px; font-size: 24px; }
        .topic-head p { margin: 0; color: var(--muted); line-height: 1.6; }
        .meta-box {
            min-width: 240px;
            padding: 14px 16px;
            border-radius: 18px;
            background: var(--accent-soft);
            color: var(--accent);
            line-height: 1.6;
            font-size: 14px;
        }
        .topic-body { padding: 20px 24px 24px; }
        .meta-row {
            display: grid;
            grid-template-columns: 1.2fr 1fr;
            gap: 14px;
            margin-bottom: 16px;
        }
        .meta-panel {
            border: 1px solid var(--line);
            border-radius: 18px;
            padding: 14px 16px;
            background: rgba(255, 251, 243, 0.88);
        }
        .panel-title {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
            margin-bottom: 10px;
        }
        .chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .chip {
            display: inline-flex;
            align-items: center;
            padding: 7px 11px;
            border-radius: 999px;
            background: #f1ebe0;
            border: 1px solid var(--line);
            font-size: 13px;
        }
        .muted, .note-text { color: var(--muted); line-height: 1.6; }
        .table-wrap {
            overflow-x: auto;
            border: 1px solid var(--line);
            border-radius: 18px;
        }
        table { width: 100%; border-collapse: collapse; min-width: 1080px; }
        th, td {
            padding: 12px 14px;
            border-bottom: 1px solid rgba(220, 207, 184, 0.75);
            text-align: left;
            vertical-align: top;
            font-size: 14px;
        }
        thead th {
            background: #efe6d4;
            color: #4f4230;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-size: 11px;
        }
        tbody tr:nth-child(even) { background: rgba(251, 247, 239, 0.72); }
        .empty { text-align: center; color: var(--muted); padding: 22px; }
        .decision-button {
            border: 0;
            background: var(--accent);
            color: white;
            border-radius: 999px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            white-space: nowrap;
        }
        .decision-button:hover { opacity: 0.92; }
        .decision-modal {
            position: fixed;
            inset: 0;
            background: rgba(25, 28, 35, 0.58);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .decision-modal.hidden { display: none; }
        .decision-dialog {
            width: min(1000px, 100%);
            max-height: 88vh;
            overflow: auto;
            background: var(--paper);
            border: 1px solid var(--line);
            border-radius: 24px;
            box-shadow: var(--shadow);
            padding: 20px;
        }
        .decision-dialog-head {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: center;
            margin-bottom: 12px;
        }
        .decision-dialog-head h3 { margin: 0; font-size: 24px; }
        .decision-close {
            border: 0;
            background: #e8dcc7;
            color: var(--ink);
            border-radius: 999px;
            padding: 8px 14px;
            cursor: pointer;
        }
        .decision-meta {
            color: var(--muted);
            font-size: 13px;
            margin-bottom: 14px;
        }
        .decision-content {
            white-space: pre-wrap;
            word-break: break-word;
            font-family: Consolas, monospace;
            font-size: 13px;
            line-height: 1.6;
            background: #faf6ee;
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 16px;
            margin: 0;
        }
        .footer {
            margin-top: 18px;
            color: var(--muted);
            font-size: 13px;
            line-height: 1.7;
        }
        @media (max-width: 860px) {
            .wrap { padding: 18px 14px 40px; }
            .hero, .topic-body, .topic-head { padding-left: 16px; padding-right: 16px; }
            .topic-head { flex-direction: column; }
            .meta-box { width: 100%; min-width: 0; }
            .meta-row { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="wrap">
        <section class="hero">
            <span class="eyebrow">Canakkale Idare Dosyasi</span>
            <h1>Yikim karari ve imar para cezasi icin emsal karar raporu</h1>
            <p>
                Bu sayfa, verdigin dilekcedeki ana basliklar baz alinarak canli karar aramasi ile uretildi.
                Her kutu, dosyanin farkli bir hukuki eksenini ayri ayri tarar: imar barisi, yapi tatil
                tutanagi, yikim karari, para cezasi, iptal denetimi ve yurutmenin durdurulmasi gibi.
            </p>
            ${summaryCards}
        </section>

        <div class="topics">${topicSections}</div>

        <div class="footer">
            Uyari: Bu rapor otomatik arama sonucudur. Nihai dilekce kurulumundan once kararlar tek tek acilip
            dosyanin olayina gercekten oturup oturmadigi ayrica kontrol edilmelidir. "Karari ac" dugmesi,
            karar metnini rapor olusurken icine kaydeder ve tiklaninca pencerede gosterir.
        </div>
    </div>

    <div id="decision-modal" class="decision-modal hidden" aria-hidden="true">
        <div class="decision-dialog">
            <div class="decision-dialog-head">
                <h3 id="decision-modal-title">Karar detayi</h3>
                <button id="decision-close" class="decision-close" type="button">Kapat</button>
            </div>
            <div id="decision-modal-meta" class="decision-meta"></div>
            <pre id="decision-modal-content" class="decision-content">Karar metni burada gorunecek.</pre>
        </div>
    </div>

    <script>
        const DECISION_CONTENTS = ${decisionContentsJson};
        const modal = document.getElementById('decision-modal');
        const modalTitle = document.getElementById('decision-modal-title');
        const modalMeta = document.getElementById('decision-modal-meta');
        const modalContent = document.getElementById('decision-modal-content');
        const closeButton = document.getElementById('decision-close');

        const closeModal = () => {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
        };

        closeButton.addEventListener('click', closeModal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal();
        });

        document.querySelectorAll('.decision-button').forEach((button) => {
            button.addEventListener('click', () => {
                const decisionKey = button.dataset.decisionKey || '';
                const title = button.dataset.title || 'Karar detayi';
                const payload = DECISION_CONTENTS[decisionKey] || null;

                modal.classList.remove('hidden');
                modal.setAttribute('aria-hidden', 'false');
                modalTitle.textContent = title;

                if (!payload) {
                    modalMeta.textContent = 'Detay bulunamadi';
                    modalContent.textContent = 'Bu rapor olusurken karar metni kaydedilemedi.';
                    return;
                }

                modalMeta.textContent = 'Kaynak: ' + (payload.source || '-') + (payload.documentId ? ' | DocumentId: ' + payload.documentId : '');
                if (payload.content) {
                    modalContent.textContent = payload.content;
                } else if (payload.error) {
                    modalContent.textContent = 'Karar metni alinamadi: ' + payload.error;
                } else {
                    modalContent.textContent = 'Karar metni bos geldi.';
                }
            });
        });
    </script>
</body>
</html>`;
}

async function main() {
    await mkdir(OUTPUT_DIR, { recursive: true });

    const topics = [];
    for (const topic of TOPICS) {
        const output = await runTopic(topic);
        topics.push(output);
        console.log(`[CANAKKALE_REPORT] ${topic.id} source=${output.resolvedSource || output.requestedSource} results=${output.totalResults || 0}`);
    }

    const report = {
        title: 'Canakkale Idare Mahkemesi - emsal karar raporu',
        generatedAt: new Date().toLocaleString('tr-TR', {
            dateStyle: 'long',
            timeStyle: 'short',
        }),
        petitionContext: PETITION_CASE_CONTEXT.trim(),
        topics,
    };

    const totalResults = topics.reduce((sum, item) => sum + Number(item.totalResults || 0), 0);
    if (totalResults <= 0) {
        console.error('[CANAKKALE_REPORT] no results; existing report will be preserved');
        process.exitCode = 1;
        return;
    }

    await writeFile(JSON_PATH, JSON.stringify(report, null, 2), 'utf8');
    await writeFile(HTML_PATH, buildHtml(report), 'utf8');

    console.log(`[CANAKKALE_REPORT] html=${HTML_PATH}`);
    console.log(`[CANAKKALE_REPORT] json=${JSON_PATH}`);
}

main().catch((error) => {
    console.error('[CANAKKALE_REPORT] fatal', error);
    process.exitCode = 1;
});
