import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.vercel',
  'ekranresmi',
]);

const TEXT_EXTENSIONS = new Set([
  '.js',
  '.ts',
  '.tsx',
  '.json',
  '.md',
  '.html',
  '.xml',
  '.css',
]);

const BROKEN_TOKENS_RE = /(Ã.|Ä.|Å.|Â.|â€™|â€œ|â€|â€“|â€”)/;

const collectFiles = (dir, out) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.codex_')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, out);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext)) {
      out.push(fullPath);
    }
  }
};

const files = [];
collectFiles(ROOT_DIR, files);

const findings = [];
for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!BROKEN_TOKENS_RE.test(line)) return;
    if (line.includes('MOJIBAKE_DETECTION')) return;
    findings.push(`${path.relative(ROOT_DIR, filePath)}:${index + 1}`);
  });
}

if (findings.length > 0) {
  console.error('Mojibake bulundu. Duzeltmek icin: npm run encoding:normalize');
  findings.slice(0, 200).forEach(item => console.error(item));
  process.exit(1);
}

console.log('encoding-check passed');
