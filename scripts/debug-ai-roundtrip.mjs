import 'dotenv/config';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { searchLegalDecisionsViaMcp } from '../lib/legal/mcpLegalSearch.js';

const DEMO_QUERIES = {
    ceza: `Saniklar hakkinda, banka hesaplarinin baskalari adina kullandirildigi, bu hesaplara suc gelirlerinin aktarildigi, uyusturucu madde ticareti ve nitelikli dolandiricilik suclarina iliskin iletisim tespit tutanaklari, fiziki takip, arama ve elkoyma islemleri ile dijital materyal incelemeleri bulundugu, saniklardan ele gecirilen maddelerin satisa hazir paketler halinde oldugu, tanik beyanlari ile para transfer kayitlarinin birbiriyle uyumlu oldugu, TCK 188 ve baglantili ceza sorusturmasi kapsaminda kamu davasi acilmasini gerektirir yeterli suphe olustugu anlasilmistir.`,
    idare: `Davaci sirket hakkinda duzenlenen vergi inceleme raporunda sahte fatura kullanimina dayali KDV indirimi reddedilmis, tarhiyat ve vergi ziyai cezasi kesilmis, uzlasma saglanamamasi uzerine vergi mahkemesinde iptal davasi acilmistir. Dosyada vergi teknigi raporu, inceleme tutanagi, savunma dilekceleri ve idari isleme dayanak belgeler bulunmaktadir. Uyusmazligin ticari iliski degil, dogrudan idari vergi islemi ve tarhiyat denetimi niteliginde oldugu gorulmektedir.`,
};

function getArg(name, fallback = '') {
    const index = process.argv.indexOf(name);
    if (index === -1) return fallback;
    return process.argv[index + 1] || fallback;
}

function buildPrompt(queryText = '') {
    return `Sen Turk hukukunda emsal karar aramasi yapan uzman bir arama planlayicisisin. Yalnizca gecerli JSON don.
Gorevin: uzun veya daginik kullanici metnini, hukuki cekirdege indirgemek ve dogru aday havuzunu buyutecek arama planini cikarmak.
Kurallar:
- source sadece "yargitay", "danistay", "uyap", "anayasa", "all"
- domain sadece "ceza", "hukuk", "is_hukuku", "idare", "anayasa", "istinaf", "karma"
- subdomain sadece su listeden biri olsun: "icra", "aile", "ticaret", "tuketici", "miras", "gayrimenkul", "vergi", "imar", "disiplin", "ihale", "uyusturucu", "hakaret", "dolandiricilik", "is_ise_iade", "is_alacak", "none"
- primaryProfile sadece "is_hukuku", "hukuk", "icra", "aile", "ticaret", "idare", "ceza", "istinaf", "anayasa"
- profiles sadece su id'lerden olussun: ["is_hukuku", "hukuk", "icra", "aile", "ticaret", "idare", "ceza", "istinaf", "anayasa"]
- profiles bos donme; en uygun 1-3 profil sec. Gereksiz profile ekleme.
- initialKeyword en fazla 12 kelime olsun
- semanticQuery en fazla 28 kelime olsun ve dogal dil hukuki anlatim olsun
- topicHeadings en fazla 4 adet olsun
- candidateQueries en fazla 6 adet olsun
- keywordPhrases en fazla 10 adet olsun
- candidateQueries 3-9 kelimelik arama cumlecikleri olsun; birbirinin kopyasi olmasin.
- candidateQueries icinde en az 1 adet resmi karar diline yakin, 1 adet biraz daha genel, 1 adet biraz daha dar sorgu olustur.
- Kisi adi, sirket adi, adres, ada/parsel, tarih, belge no gibi detaylari initialKeyword veya candidateQueries icine alma.
- Olay hikayesini degil dava turunu, hukuki kurumu, resmi islemi veya suc tipini one cikar.
- Metinde bulunmayan yeni bir hukuki iddia, suc vasfi veya talep uretme. Sadece metinde acikca bulunan veya cok yakin hukuki es anlamli karsiliklari kullan.
- Ceza / tck / sanik / tutuklama / uyusturucu / dolandiricilik agirlikli sorgularda source genelde yargitay veya uyap sec.
- Is hukuku / ise iade / kidem / ihbar / fazla mesai agirlikli sorgularda source genelde yargitay sec.
- Aile / bosanma / velayet / nafaka / ziynet agirlikli sorgularda source genelde yargitay sec.
- Ticaret / asliye ticaret / genel kurul / anonim sirket / cek / bono / konkordato agirlikli sorgularda source genelde yargitay sec.
- Icra / itirazin iptali / menfi tespit / haczedilmezlik / istirdat agirlikli sorgularda source genelde yargitay veya uyap sec.
- Idari / vergi / imar / ruhsat / yikim / encumen / disiplin / ihale sorgularinda source genelde danistay sec.
- "sahte fatura", "KDV indirimi", "tarhiyat", "vergi ziyai" geciyorsa bunu ticaret degil vergi/idare olarak yorumla; source genelde danistay sec.
- "universite ogrencisi", "yuksekogretim", "ogrenci disiplin cezasi" geciyorsa bunu idare/disiplin olarak yorumla; source genelde danistay sec.
- "kamulastirmasiz el atma" sorgularinda gorev ayrimi karisabilir: imar plani, kamu hizmeti, idari yargi, hukuki el atma sinyali varsa danistay; sadece bedel/tazminat odakliysa ve ayrim net degilse source all sec.
- Hak ihlali / bireysel basvuru / anayasa mahkemesi sorgularinda source anayasa sec.
- Istinaf usulu / BAM / bolge adliye agirlikli sorgularda domain istinaf sec; source gerekirse all olabilir.
- Emin degilsen source all sec.
- initialKeyword sadece ilk aday cekmek icin kullanilacak kisa resmi arama ifadesi olsun.

JSON:
{
  "source": "yargitay|danistay|uyap|anayasa|all",
  "domain": "ceza|hukuk|is_hukuku|idare|anayasa|istinaf|karma",
  "subdomain": "icra|aile|ticaret|tuketici|miras|gayrimenkul|vergi|imar|disiplin|ihale|uyusturucu|hakaret|dolandiricilik|is_ise_iade|is_alacak|none",
  "primaryProfile": "is_hukuku|hukuk|icra|aile|ticaret|idare|ceza|istinaf|anayasa",
  "profiles": ["ceza", "hukuk"],
  "initialKeyword": "ilk adaylari cekecek kisa resmi arama ifadesi",
  "shortQuery": "shortQuery kullaniliyorsa initialKeyword ile ayni olsun",
  "semanticQuery": "hukuki cekirdegi dogal dilde anlatan tek cumle",
  "topicHeadings": ["konu 1", "konu 2"],
  "candidateQueries": ["arama 1", "arama 2", "arama 3"],
  "keywordPhrases": ["ifade 1", "ifade 2", "ifade 3"],
  "reason": "kisa aciklama"
}

Sorgu:
"""${String(queryText || '').trim()}"""`;
}

function readQueryText() {
    const query = getArg('--query', '');
    if (query) return query;

    const queryFile = getArg('--query-file', '');
    if (queryFile) return fs.readFileSync(queryFile, 'utf8').trim();

    const demo = getArg('--demo', 'ceza').toLowerCase();
    return DEMO_QUERIES[demo] || DEMO_QUERIES.ceza;
}

function parseMaybeJson(text = '') {
    const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    if (!cleaned) return null;
    try {
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

async function main() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY veya VITE_GEMINI_API_KEY bulunamadi.');
    }

    const source = getArg('--source', 'all');
    const searchArea = getArg('--area', 'auto');
    const keyword = getArg('--keyword', '');
    const queryText = readQueryText();
    const prompt = buildPrompt(queryText);
    const ai = new GoogleGenAI({ apiKey });

    console.log('=== GIDEN PROMPT BASLANGIC ===');
    console.log(prompt);
    console.log('=== GIDEN PROMPT BITIS ===');

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 0.1 },
    });

    const rawText = String(response.text || '');
    console.log('=== DONEN HAM AI CEVABI BASLANGIC ===');
    console.log(rawText);
    console.log('=== DONEN HAM AI CEVABI BITIS ===');

    const parsed = parseMaybeJson(rawText) || {};
    const effectiveKeyword = keyword || parsed.initialKeyword || parsed.shortQuery || queryText.split(/\s+/).slice(0, 8).join(' ');

    console.log('=== ARAMA CAGRISI BASLANGIC ===');
    console.log(JSON.stringify({ source, searchArea, keyword: effectiveKeyword, rawQueryPreview: queryText.slice(0, 400) }, null, 2));

    const data = await searchLegalDecisionsViaMcp({
        source,
        keyword: effectiveKeyword,
        rawQuery: queryText,
        filters: { searchArea },
    });

    console.log('=== ARAMA CEVABI OZETI ===');
    console.log(JSON.stringify({
        keyword: data?.keyword || '',
        warning: data?.warning || '',
        routing: data?.routing || {},
        resultCount: Array.isArray(data?.results) ? data.results.length : 0,
        top3: Array.isArray(data?.results)
            ? data.results.slice(0, 3).map((item) => ({
                title: item?.title || '',
                source: item?.source || '',
                relevanceScore: item?.relevanceScore || 0,
            }))
            : [],
    }, null, 2));
    console.log('=== ARAMA CAGRISI BITIS ===');
}

main().catch((error) => {
    console.error('DEBUG_SCRIPT_ERROR:', error?.stack || error?.message || error);
    process.exit(1);
});
