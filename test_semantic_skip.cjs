// Quick test for search pipeline - CJS format
const path = require('path');

async function main() {
    process.env.LEGAL_USE_MCP_SEMANTIC = '1'; // Force semantic

    const mod = await import(new URL('file:///' + path.join(process.cwd(), 'lib', 'legal', 'mcpLegalSearch.js')).href);
    const mcpSearch = mod;

    const longQuery = "Gerek müvekkilin üst aramasında gerekse ikametgahında yapılan aramalarda suç geliri olduğu iddia edilen paranın bulunamamış olması, tanık beyanının maddi gerçekten uzak olduğunun en somut delilidir.";
    const keyword = "uyusturucu madde gerek muvekkilin aramasinda gerekse ikametgahinda aramalarda geliri oldugu iddia paranin bulunamamis olmasi tanik beyaninin maddi gercekten uzak oldugunun somut delilidir";

    console.log('=== TEST CEZA ARAMA - SEMANTIC ===');
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
            console.log(`\n[${i + 1}] ${r.daire || r.title}`);
        });

        if (result.warningParts && result.warningParts.length > 0) {
            console.log(`\nUyarılar:`);
            console.log(result.warningParts.join('\n'));
        }
    } catch (err) {
        console.error('ERROR:', err.message);
    }
    process.exit(0);
}

main();
