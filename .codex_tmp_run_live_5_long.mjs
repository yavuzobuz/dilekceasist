process.env.LEGAL_MATRIX_VARIANTS = 'long_fact';
process.env.LEGAL_MATRIX_LONG_COUNT = '5';
process.env.LEGAL_MATRIX_SHORT_COUNT = '0';
process.env.LEGAL_MATRIX_DOCUMENT_COUNT = '0';
process.env.LEGAL_MATRIX_CONCURRENCY = '2';
process.env.LEGAL_MATRIX_OUTPUT_PREFIX = 'output/live-5-long-quality-agent-real';
await import('./scripts/legal-live-matrix.mjs');
