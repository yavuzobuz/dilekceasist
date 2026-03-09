// Quick test for search pipeline - CJS format
const path = require('path');

async function main() {
    const mod = await import(new URL('file:///' + path.join(process.cwd(), 'lib', 'legal', 'mcpLegalSearch.js')).href);
    const mcpSearch = mod;

    // Uzun bir olay örgüsü (Dilekçe asistanına sorulabilecek tarzda)
    const longQuery = "Müvekkilim 5 yıldır bir tekstil fabrikasında dikiş makinesi operatörü olarak çalışmaktadır. Son zamanlarda ustabaşı tarafından sürekli hakarete uğramış ve mobbinge maruz kalmıştır. Kendisi durumu insan kaynaklarına bildirdikten üç gün sonra performans düşüklüğü bahane edilerek ve yazılı veya sözlü savunması dahi alınmadan iş sözleşmesi feshedilmiştir. Feshin geçersizliğine, müvekkilin işe iadesine ve boşta geçen süre ile işe başlatmama tazminatına hükmedilmesi talebini içeren uyuşmazlığa dair emsal kararlara ihtiyacım var.";

    // AI modülünün uzundan çıkardığı kısa keyword gibi farzediyoruz
    const extractedKeyword = "işe iade feshin geçersizliği mobbing savunma alınmaması";

    console.log('=== TEST SEMANTİK ARAMA: Uzun Olay Metni ===');
    console.log(`RAW QUERY: ${longQuery.slice(0, 120)}...`);
    console.log(`KEYWORD: ${extractedKeyword}`);

    try {
        const result = await mcpSearch.searchLegalDecisionsViaMcp({
            source: 'all',
            keyword: extractedKeyword,
            rawQuery: longQuery,
            filters: {},
        });

        console.log(`\n================================`);
        console.log(`BULUNAN SONUÇLAR: ${result.results?.length || 0}`);
        console.log(`================================`);

        (result.results || []).forEach((r, i) => {
            console.log(`\n[${i + 1}] ${r.daire || r.title} (Skor: ${Math.round(r.relevanceScore)})`);
            console.log(`    Seviye: ${r.matchTier.toUpperCase()} | Sebep: ${r.matchReason}`);
            if (r.ozet || r.snippet) {
                const text = (r.ozet || r.snippet || '').replace(/\n/g, ' ').slice(0, 180);
                console.log(`    Özet/Snippet: ${text}...`);
            }
        });

        if (result.warning) {
            console.log(`\nUyarı: ${result.warning}`);
        }
    } catch (err) {
        console.error('ERROR:', err.message);
    }
    process.exit(0);
}

main();
