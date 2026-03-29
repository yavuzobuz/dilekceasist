import { searchLegalDecisionsViaPlaywright } from '../lib/legal/playwrightMevzuatSearch.js';

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
    console.error('Missing query. Usage: node scripts/legal-playwright-search.mjs "<query>"');
    process.exit(1);
}

const payload = await searchLegalDecisionsViaPlaywright({
    query,
    headless: true,
    limit: 10,
});

console.log(JSON.stringify(payload, null, 2));
