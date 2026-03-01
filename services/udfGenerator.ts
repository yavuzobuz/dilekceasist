/**
 * UDF File Generator — ODF-based UYAP Document Format
 * 
 * UYAP UDF files are ODF-based: a ZIP package containing content.xml,
 * meta.xml, styles.xml, and META-INF/manifest.xml following the
 * OpenDocument Format specification.
 */
import JSZip from 'jszip';

// ── HTML to ODF Text Conversion ─────────────────────

/**
 * Escapes special XML characters.
 */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Converts HTML content from the petition editor into ODF text:p elements.
 */
function htmlToOdfParagraphs(html: string): string {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const paragraphs: string[] = [];

    function processNode(node: Node): void {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            if (text.trim()) {
                paragraphs.push(`<text:p text:style-name="Standard">${escapeXml(text)}</text:p>`);
            }
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();

        // Block-level elements
        if (['p', 'div'].includes(tag)) {
            const content = inlineContent(el);
            const styleName = getStyleForElement(el);
            paragraphs.push(`<text:p text:style-name="${styleName}">${content}</text:p>`);
        } else if (tag === 'h1') {
            paragraphs.push(`<text:p text:style-name="Heading_1">${inlineContent(el)}</text:p>`);
        } else if (tag === 'h2') {
            paragraphs.push(`<text:p text:style-name="Heading_2">${inlineContent(el)}</text:p>`);
        } else if (tag === 'h3') {
            paragraphs.push(`<text:p text:style-name="Heading_3">${inlineContent(el)}</text:p>`);
        } else if (tag === 'h4') {
            paragraphs.push(`<text:p text:style-name="Heading_4">${inlineContent(el)}</text:p>`);
        } else if (tag === 'ul' || tag === 'ol') {
            const listStyle = tag === 'ol' ? 'List_Number' : 'List_Bullet';
            paragraphs.push(`<text:list text:style-name="${listStyle}">`);
            el.querySelectorAll(':scope > li').forEach((li) => {
                paragraphs.push(`<text:list-item><text:p text:style-name="List_Content">${inlineContent(li as HTMLElement)}</text:p></text:list-item>`);
            });
            paragraphs.push(`</text:list>`);
        } else if (tag === 'blockquote') {
            paragraphs.push(`<text:p text:style-name="Quotation">${inlineContent(el)}</text:p>`);
        } else if (tag === 'hr') {
            paragraphs.push(`<text:p text:style-name="Horizontal_Line"/>`);
        } else if (tag === 'br') {
            paragraphs.push(`<text:p text:style-name="Standard"/>`);
        } else if (tag === 'table') {
            processTable(el, paragraphs);
        } else {
            // Recurse into unknown block elements
            el.childNodes.forEach(child => processNode(child));
        }
    }

    function getStyleForElement(el: HTMLElement): string {
        const align = el.style.textAlign;
        if (align === 'center') return 'Center';
        if (align === 'right') return 'Right';
        return 'Standard';
    }

    function inlineContent(el: HTMLElement): string {
        let result = '';
        el.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
                result += escapeXml(child.textContent || '');
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const childEl = child as HTMLElement;
                const childTag = childEl.tagName.toLowerCase();
                const inner = inlineContent(childEl);

                if (childTag === 'strong' || childTag === 'b') {
                    result += `<text:span text:style-name="Bold">${inner}</text:span>`;
                } else if (childTag === 'em' || childTag === 'i') {
                    result += `<text:span text:style-name="Italic">${inner}</text:span>`;
                } else if (childTag === 'u') {
                    result += `<text:span text:style-name="Underline">${inner}</text:span>`;
                } else if (childTag === 'br') {
                    result += '<text:line-break/>';
                } else if (childTag === 'a') {
                    const href = childEl.getAttribute('href') || '';
                    result += `<text:a xlink:type="simple" xlink:href="${escapeXml(href)}">${inner}</text:a>`;
                } else {
                    result += inner;
                }
            }
        });
        return result;
    }

    function processTable(table: HTMLElement, out: string[]): void {
        const rows = table.querySelectorAll('tr');
        if (rows.length === 0) return;
        const cols = rows[0].querySelectorAll('td, th').length || 1;

        out.push(`<table:table table:style-name="Table1">`);
        for (let c = 0; c < cols; c++) {
            out.push(`<table:table-column/>`);
        }
        rows.forEach((row) => {
            out.push(`<table:table-row>`);
            row.querySelectorAll('td, th').forEach((cell) => {
                const isHeader = cell.tagName.toLowerCase() === 'th';
                const styleName = isHeader ? 'TableHeaderCell' : 'TableCell';
                out.push(`<table:table-cell table:style-name="${styleName}" office:value-type="string">`);
                out.push(`<text:p text:style-name="Standard">${inlineContent(cell as HTMLElement)}</text:p>`);
                out.push(`</table:table-cell>`);
            });
            out.push(`</table:table-row>`);
        });
        out.push(`</table:table>`);
    }

    tempDiv.childNodes.forEach(child => processNode(child));

    // If no block-level elements were found, treat entire content as one paragraph
    if (paragraphs.length === 0 && tempDiv.textContent?.trim()) {
        paragraphs.push(`<text:p text:style-name="Standard">${escapeXml(tempDiv.textContent)}</text:p>`);
    }

    return paragraphs.join('\n');
}

// ── ODF XML Templates ───────────────────────────────

function buildContentXml(bodyParagraphs: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="Bold" style:family="text">
      <style:text-properties fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Italic" style:family="text">
      <style:text-properties fo:font-style="italic"/>
    </style:style>
    <style:style style:name="Underline" style:family="text">
      <style:text-properties style:text-underline-style="solid" style:text-underline-width="auto"/>
    </style:style>
    <style:style style:name="Center" style:family="paragraph">
      <style:paragraph-properties fo:text-align="center"/>
    </style:style>
    <style:style style:name="Right" style:family="paragraph">
      <style:paragraph-properties fo:text-align="end"/>
    </style:style>
    <style:style style:name="TableHeaderCell" style:family="table-cell">
      <style:table-cell-properties fo:padding="0.2cm" fo:border="0.5pt solid #000000" fo:background-color="#f0f0f0"/>
    </style:style>
    <style:style style:name="TableCell" style:family="table-cell">
      <style:table-cell-properties fo:padding="0.2cm" fo:border="0.5pt solid #000000"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:text>
${bodyParagraphs}
    </office:text>
  </office:body>
</office:document-content>`;
}

function buildMetaXml(title: string): string {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  office:version="1.2">
  <office:meta>
    <dc:title>${escapeXml(title)}</dc:title>
    <meta:generator>DilekAI</meta:generator>
    <meta:creation-date>${now}</meta:creation-date>
    <dc:date>${now}</dc:date>
  </office:meta>
</office:document-meta>`;
}

function buildStylesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.2">
  <office:styles>
    <style:style style:name="Standard" style:family="paragraph">
      <style:paragraph-properties fo:margin-bottom="0.35cm" fo:text-align="justify"/>
      <style:text-properties fo:font-size="12pt" style:font-name="Times New Roman" fo:font-family="'Times New Roman'" fo:color="#000000"/>
    </style:style>
    <style:style style:name="Heading_1" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:text-align="center" fo:margin-top="1cm" fo:margin-bottom="0.5cm"/>
      <style:text-properties fo:font-size="16pt" fo:font-weight="bold" fo:text-transform="uppercase"/>
    </style:style>
    <style:style style:name="Heading_2" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:text-align="center" fo:margin-top="0.8cm" fo:margin-bottom="0.4cm"/>
      <style:text-properties fo:font-size="14pt" fo:font-weight="bold" fo:text-transform="uppercase"/>
    </style:style>
    <style:style style:name="Heading_3" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:margin-top="0.6cm" fo:margin-bottom="0.3cm"/>
      <style:text-properties fo:font-size="13pt" fo:font-weight="bold" style:text-underline-style="solid"/>
    </style:style>
    <style:style style:name="Heading_4" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:margin-top="0.5cm" fo:margin-bottom="0.25cm"/>
      <style:text-properties fo:font-size="12pt" fo:font-weight="bold" style:text-underline-style="solid"/>
    </style:style>
    <style:style style:name="List_Content" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:margin-left="1cm"/>
    </style:style>
    <style:style style:name="Quotation" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:margin-left="2cm" fo:margin-right="1cm"/>
      <style:text-properties fo:font-style="italic"/>
    </style:style>
    <text:list-style style:name="List_Bullet">
      <text:list-level-style-bullet text:level="1" text:bullet-char="•">
        <style:list-level-properties text:space-before="0.5cm" text:min-label-width="0.5cm"/>
      </text:list-level-style-bullet>
    </text:list-style>
    <text:list-style style:name="List_Number">
      <text:list-level-style-number text:level="1" style:num-format="1" text:start-value="1">
        <style:list-level-properties text:space-before="0.5cm" text:min-label-width="0.5cm"/>
      </text:list-level-style-number>
    </text:list-style>
  </office:styles>
  <office:automatic-styles>
    <style:page-layout style:name="PageLayout1">
      <style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm"
        fo:margin-top="2.5cm" fo:margin-bottom="2cm" fo:margin-left="2.5cm" fo:margin-right="2cm"
        style:print-orientation="portrait"/>
    </style:page-layout>
  </office:automatic-styles>
  <office:master-styles>
    <style:master-page style:name="Standard" style:page-layout-name="PageLayout1"/>
  </office:master-styles>
</office:document-styles>`;
}

function buildManifestXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;
}

// ── Public API ──────────────────────────────────────

export interface GenerateUdfOptions {
    /** HTML content from the editor */
    html: string;
    /** Document title */
    title?: string;
    /** Optional corporate header text to prepend */
    corporateHeader?: string;
}

/**
 * Generates a UDF file (ODF-based) as a Blob.
 * The result is a ZIP containing content.xml, meta.xml, styles.xml,
 * and META-INF/manifest.xml following the ODF 1.2 specification.
 */
export async function generateUdfBlob(options: GenerateUdfOptions): Promise<Blob> {
    const { html, title = 'Dilekçe', corporateHeader } = options;

    // Build header paragraph if corporate header exists
    let headerParagraphs = '';
    if (corporateHeader) {
        const headerLines = corporateHeader.split('\n');
        headerParagraphs = headerLines
            .map(line => `<text:p text:style-name="Standard">${escapeXml(line)}</text:p>`)
            .join('\n');
        headerParagraphs += '\n<text:p text:style-name="Standard"/>\n'; // Empty line separator
    }

    // Convert HTML to ODF paragraphs
    const bodyParagraphs = headerParagraphs + htmlToOdfParagraphs(html);

    // Build ODF XML files
    const contentXml = buildContentXml(bodyParagraphs);
    const metaXml = buildMetaXml(title);
    const stylesXml = buildStylesXml();
    const manifestXml = buildManifestXml();

    // Create ZIP (ODF container)
    const zip = new JSZip();

    // mimetype MUST be first file, uncompressed (ODF spec requirement)
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', {
        compression: 'STORE',
    });

    // Content files
    zip.file('content.xml', contentXml);
    zip.file('meta.xml', metaXml);
    zip.file('styles.xml', stylesXml);

    // Manifest directory
    zip.file('META-INF/manifest.xml', manifestXml);

    // Generate ZIP blob
    return await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.oasis.opendocument.text',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
}
