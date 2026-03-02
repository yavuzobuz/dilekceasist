/**
 * UDF File Generator
 *
 * UYAP UDF files are ZIP archives containing a single 'content.xml' file.
 * The XML uses a proprietary format with `<template format_id="1.8">` at the root,
 * containing `<content>` (with CDATA text), `<properties>`, `<elements>` (offsets and formatting),
 * and `<styles>`.
 */
import JSZip from 'jszip';

export interface GenerateUdfOptions {
  /** HTML content from the editor */
  html: string;
  /** Document title */
  title?: string;
  /** Optional corporate header text to prepend */
  corporateHeader?: string;
}

/**
 * Escapes characters for XML properties
 */
function escapeXmlAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a UDF compliant blob format expected by UYAP Doküman Editörü
 */
export async function generateUdfBlob(options: GenerateUdfOptions): Promise<Blob> {
  const { html, corporateHeader } = options;

  let plainText = '';
  const elements: string[] = [];
  let currentOffset = 0;

  // Convert HTML elements to plain text + styles definitions
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Helper to process nodes and extract text while generating element tags
  function processNode(node: Node, align: string = "0", indent: string = "", customStyles: string = "") {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text) return;

      const length = text.length;
      plainText += text;

      const elementTag = `<paragraph Alignment="${align}" ${indent}><content startOffset="${currentOffset}" length="${length}" ${customStyles}/></paragraph>`;
      elements.push(elementTag);
      currentOffset += length;
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      let nextAlign = align;
      if (el.style.textAlign === 'center') nextAlign = "1";
      if (el.style.textAlign === 'right') nextAlign = "2";
      if (el.style.textAlign === 'justify') nextAlign = "3";

      // We'll keep it simple for bold/italic support natively. The UYAP editor supports inline styles via <content> properties.
      let nextStyles = customStyles;
      if (tag === 'strong' || tag === 'b') nextStyles += ' bold="true"';
      if (tag === 'em' || tag === 'i') nextStyles += ' italic="true"';
      if (tag === 'u') nextStyles += ' underline="true"';

      if (tag === 'p' || tag === 'div' || tag === 'h1' || tag === 'h2' || tag === 'h3') {
        // Block element
        el.childNodes.forEach(child => processNode(child, nextAlign, indent, nextStyles));
        // Add newline
        plainText += '\n';
        elements.push(`<paragraph Alignment="${nextAlign}"><content startOffset="${currentOffset}" length="1" /></paragraph>`);
        currentOffset += 1;
      } else if (tag === 'br') {
        plainText += '\n';
        elements.push(`<paragraph Alignment="${nextAlign}"><content startOffset="${currentOffset}" length="1" /></paragraph>`);
        currentOffset += 1;
      } else if (tag === 'li') {
        // Simple list support
        const bulletText = '• ';
        plainText += bulletText;
        elements.push(`<paragraph Alignment="${nextAlign}"><content startOffset="${currentOffset}" length="${bulletText.length}" /></paragraph>`);
        currentOffset += bulletText.length;

        el.childNodes.forEach(child => processNode(child, nextAlign, indent, nextStyles));

        plainText += '\n';
        elements.push(`<paragraph Alignment="${nextAlign}"><content startOffset="${currentOffset}" length="1" /></paragraph>`);
        currentOffset += 1;
      } else {
        // Recurse
        el.childNodes.forEach(child => processNode(child, nextAlign, indent, nextStyles));
      }
    }
  }

  // Prepend corporate header if given
  if (corporateHeader) {
    const headerHtml = corporateHeader.split('\n').map(line => `<p style="text-align: center;"><strong>${line}</strong></p>`).join('');
    const container = document.createElement('div');
    container.innerHTML = headerHtml;
    container.childNodes.forEach(child => processNode(child));

    // Add spacer
    plainText += '\n';
    elements.push(`<paragraph Alignment="0"><content startOffset="${currentOffset}" length="1" /></paragraph>`);
    currentOffset += 1;
  }

  // Process actual document content
  tempDiv.childNodes.forEach(child => processNode(child));

  // Ensure there's at least one empty paragraph at the end if the text is empty
  if (currentOffset === 0) {
    plainText += '\u200B'; // zero width space
    elements.push(`<paragraph Alignment="0" LeftIndent="0.0" RightIndent="0.0"><content startOffset="${currentOffset}" length="1" /></paragraph>`);
    currentOffset += 1;
  }

  // Construct the final XML content expected by UYAP Editor
  const xmlContent = `<?xml version="1.0" encoding="UTF-8" ?>
<template format_id="1.8">
<content><![CDATA[${plainText}]]></content>
<properties><pageFormat mediaSizeName="1" leftMargin="42.51968479156494" rightMargin="28.34645652770996" topMargin="14.17322826385498" bottomMargin="14.17322826385498" paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" /></properties>
<elements resolver="hvl-default">
${elements.join('\n')}
</elements>
<styles><style name="default" description="Geçerli" family="Dialog" size="12" bold="false" italic="false" foreground="-13421773" FONT_ATTRIBUTE_KEY="javax.swing.plaf.FontUIResource[family=Dialog,name=Dialog,style=plain,size=12]" /><style name="hvl-default" family="Times New Roman" size="12" description="Gövde" /></styles>
</template>`;

  // Create ZIP archive
  const zip = new JSZip();
  // Simply add content.xml to the root of the ZIP
  zip.file('content.xml', xmlContent);

  // Generate ZIP blob
  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
