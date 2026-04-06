import fs from 'fs';
import { ICRA_TEMPLATES, IS_HUKUKU_TEMPLATES } from './templates-part1.js';
import { TUKETICI_TEMPLATES, TICARET_TEMPLATES, MIRAS_TEMPLATES } from './templates-part2.js';

// All new templates
const newTemplates = [
    ...ICRA_TEMPLATES,
    ...IS_HUKUKU_TEMPLATES,
    ...TUKETICI_TEMPLATES,
    ...TICARET_TEMPLATES,
    ...MIRAS_TEMPLATES
];

console.log(`Total new templates to add: ${newTemplates.length}`);

// Read server.js as lines
const serverContent = fs.readFileSync('server.js', 'utf8');
const lines = serverContent.split('\n');

// Find line 1439 (index 1438) - the last closing brace before ];
const insertLineIndex = 1438; // Line 1439 = index 1438

if (lines[insertLineIndex].trim() === '}') {
    console.log('Found insertion point at line', insertLineIndex + 1);

    // Generate template JSON strings
    const templateStrings = newTemplates.map(t => {
        // Pretty print with proper indentation
        return JSON.stringify(t, null, 4)
            .split('\n')
            .map((line, i) => (i === 0 ? '    ' + line : '    ' + line))
            .join('\n');
    });

    // Insert after line 1439
    const newLines = [
        ...lines.slice(0, insertLineIndex + 1), // Up to and including line 1439
        ',', // Add comma after the existing template
        ...templateStrings.map((t, i) => t + (i < templateStrings.length - 1 ? ',' : '')),
        ...lines.slice(insertLineIndex + 1) // Rest of file
    ];

    fs.writeFileSync('server.js', newLines.join('\n'), 'utf8');
    console.log('✓ Templates merged successfully!');
} else {
    console.log('Line content:', lines[insertLineIndex]);
    console.log('✗ Unexpected content at insertion point');
}
