// Quick test for search pipeline - CJS format
const path = require('path');

async function main() {
    const mod = await import(new URL('file:///' + path.join(process.cwd(), 'lib', 'legal', 'mcpLegalSearch.js')).href);
    const mcpSearch = mod;

    console.log('=== TEST: ise iade feshin gecersizligi ===');
    try {
        const result = await mcpSearch.searchLegalDecisionsViaMcp({
            source: 'all',
            keyword: 'ise iade feshin gecersizligi',
            rawQuery: '',
            filters: {},
        });
        console.log(`\nResults: ${result.results?.length || 0}`);
        (result.results || []).forEach((r, i) => {
            console.log(`  ${i + 1}. [score:${r.relevanceScore}] ${r.daire || r.title} | ${r.matchReason}`);
        });
        console.log(`\nWarning: ${result.warning || 'none'}`);
    } catch (err) {
        console.error('ERROR:', err.message);
    }
    process.exit(0);
}

main();
