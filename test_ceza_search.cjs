// Quick test for search pipeline - CJS format
const path = require('path');

async function main() {
    const mod = await import(new URL('file:///' + path.join(process.cwd(), 'lib', 'legal', 'mcpLegalSearch.js')).href);
    const mcpSearch = mod;

    // Uyuşturucu davasıyla ilgili uzun query
    const longQuery = "İddianameye konu suçlamanın yegâne dayanağı, tanık (şüpheli) Muhammed Ali Özden’in müvekkilden 1.700,00 TL bedel karşılığında uyuşturucu madde satın aldığı yönündeki soyut ve yan delillerden yoksun beyanıdır. Ne var ki söz konusu iddia, dosya münderecatındaki maddi vakıalarla açıkça çelişmektedir. Şöyle ki; iddia edilen satış eyleminin hemen akabinde müvekkilin ikametinde icra edilen adli aramada, suça konu satıştan elde edildiği öne sürülen 1.700,00 TL ele geçirilememiştir. Bu durum, isnadın maddi dayanaktan yoksun olduğunu ve gerçeği yansıtmadığını ortaya koymaktadır.";

    // AI çıkarımı (User's log'dan)
    const keyword = "uyusturucu madde iddianameye konu suclamanin yegane dayanagi tanik supheli muhammed ozden muvekkilden bedel karsiliginda satin aldigi yonundeki soyut delillerden yoksun beyanidir konusu";

    console.log('=== TEST CEZA ARAMA ===');
    try {
        const result = await mcpSearch.searchLegalDecisionsViaMcp({
            source: 'all',
            keyword,
            rawQuery: longQuery,
            filters: {},
        });

        console.log(`\n================================`);
        console.log(`BULUNAN SONUÇLAR: ${result.results?.length || 0}`);
        console.log(`================================`);

        (result.results || []).forEach((r, i) => {
            console.log(`\n[${i + 1}] ${r.daire || r.title} (Skor: ${Math.round(r.relevanceScore)})`);
            console.log(`    Seviye: ${r.matchTier.toUpperCase()} | Sebep: ${r.matchReason}`);
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
