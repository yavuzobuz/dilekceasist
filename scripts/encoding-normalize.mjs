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

const BROKEN_MARKER_RE = /(Ãƒ|Ã„|Ã…|Ã‚|Ã§|Ã¼|Ã¶|Ä±|Ä°|ÄŸ|ÅŸ|â€™|â€œ|â€|â€“|â€”)/;

const CP1252_REVERSE_BYTE_MAP = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
  [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
  [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
  [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F],
]);

const decoder = new TextDecoder('utf-8', { fatal: true });

const DIRECT_REPLACEMENTS = [
  ['\u00C3\u00A7', '\u00E7'],
  ['\u00C3\u2021', '\u00C7'],
  ['\u00C3\u0087', '\u00C7'],
  ['\u00C3\u00B6', '\u00F6'],
  ['\u00C3\u2013', '\u00D6'],
  ['\u00C3\u0096', '\u00D6'],
  ['\u00C3\u00BC', '\u00FC'],
  ['\u00C3\u0153', '\u00DC'],
  ['\u00C3\u009C', '\u00DC'],
  ['\u00C4\u00B1', '\u0131'],
  ['\u00C4\u00B0', '\u0130'],
  ['\u00C4\u0178', '\u011F'],
  ['\u00C4\u009F', '\u011F'],
  ['\u00C4\u017E', '\u011E'],
  ['\u00C4\u009E', '\u011E'],
  ['\u00C5\u0178', '\u015F'],
  ['\u00C5\u009F', '\u015F'],
  ['\u00C5\u017D', '\u015E'],
  ['\u00C5\u009E', '\u015E'],
  ['\u00E2\u20AC\u2122', '\u2019'],
  ['\u00E2\u20AC\u0153', '\u201C'],
  ['\u00E2\u20AC\u009D', '\u201D'],
  ['\u00E2\u20AC\u201C', '\u2013'],
  ['\u00E2\u20AC\u201D', '\u2014'],
  ['\u00E2\u20AC\u00A6', '\u2026'],
  ['\u00C2\u00A0', ' '],
  ['\u00C2', ''],
];

const BROKEN_SCORE_RE = /(\u00C3|\u00C4|\u00C5|\u00C2|\u00E2|Ãƒ|Ã„|Ã…|Ã‚|Ã§|Ã¼|Ã¶|Ä±|Ä°|ÄŸ|ÅŸ|â€™|â€œ|â€|â€“|â€”)/g;
const brokenScore = (value) => (value.match(BROKEN_SCORE_RE) || []).length;

const decodeMixedMojibake = (input) => {
  let output = '';
  let bytes = [];
  let raw = '';

  const flush = () => {
    if (bytes.length === 0) return;
    try {
      output += decoder.decode(new Uint8Array(bytes));
    } catch {
      output += raw;
    }
    bytes = [];
    raw = '';
  };

  for (const char of input) {
    const codePoint = char.codePointAt(0);
    if (codePoint == null) continue;

    if (codePoint <= 0xFF) {
      bytes.push(codePoint);
      raw += char;
      continue;
    }

    const cp1252Byte = CP1252_REVERSE_BYTE_MAP.get(codePoint);
    if (cp1252Byte != null) {
      bytes.push(cp1252Byte);
      raw += char;
      continue;
    }

    flush();
    output += char;
  }

  flush();
  return output;
};

const normalizeText = (content) => {
  let result = content;

  for (let i = 0; i < 4; i += 1) {
    const next = decodeMixedMojibake(result);
    if (next === result) break;
    result = next;
  }

  for (const [from, to] of DIRECT_REPLACEMENTS) {
    result = result.split(from).join(to);
  }

  return result;
};

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

let changedCount = 0;
for (const filePath of files) {
  const original = fs.readFileSync(filePath, 'utf8');
  if (!BROKEN_MARKER_RE.test(original)) continue;

  const normalized = normalizeText(original);
  if (normalized === original) continue;

  const originalScore = brokenScore(original);
  const normalizedScore = brokenScore(normalized);
  if (normalizedScore > originalScore) continue;
  if (normalized.includes('\uFFFD')) continue;

  fs.writeFileSync(filePath, normalized, 'utf8');
  changedCount += 1;
  console.log(`normalized: ${path.relative(ROOT_DIR, filePath)}`);
}

console.log(`encoding-normalize completed, changed files: ${changedCount}`);
