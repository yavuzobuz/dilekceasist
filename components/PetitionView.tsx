import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PetitionViewProps } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { DocumentTextIcon, LinkIcon, SparklesIcon, ArrowDownTrayIcon } from './Icon';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { marked } from 'marked';

// Configure marked for proper line breaks and formatting
marked.setOptions({
  breaks: true, // Convert \n to <br>
  gfm: true, // GitHub Flavored Markdown
});

// Extend Window interface for find method (non-standard but widely supported)
declare global {
  interface Window {
    find(string: string, caseSensitive?: boolean, backwards?: boolean, wrapAround?: boolean): boolean;
  }
}

// Helper function to convert markdown to HTML
const convertMarkdownToHtml = (text: string): string => {
  if (!text) return '';

  // First, normalize newlines and ensure proper paragraph separation
  let processed = text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines to max 2
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') // Bold
    .replace(/\*([^*]+)\*/g, '<em>$1</em>'); // Italic

  // Use marked to convert to HTML
  const html = marked.parse(processed) as string;

  return html;
};

const FloatingToolbar: React.FC<{
  position: { top: number; left: number } | null;
  onRewrite: () => void;
  isRewriting: boolean;
}> = ({ position, onRewrite, isRewriting }) => {
  if (!position) return null;

  return (
    <div
      className="absolute z-10"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <button
        onClick={onRewrite}
        disabled={isRewriting}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border border-blue-500 text-white rounded-lg shadow-xl hover:bg-gray-800 transition-all text-sm"
      >
        {isRewriting ? (
          <LoadingSpinner className="h-4 w-4" />
        ) : (
          <SparklesIcon className="h-4 w-4 text-blue-400" />
        )}
        <span>Yeniden Yaz</span>
      </button>
    </div>
  );
};


export const PetitionView: React.FC<PetitionViewProps> = ({ petition, setGeneratedPetition, sources, isLoading, onRewrite, onReview, isReviewing, petitionVersion, officeLogoUrl, corporateHeader }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectionRange, setSelectionRange] = useState<Range | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{ top: number, left: number } | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showFormattingToolbar, setShowFormattingToolbar] = useState(true);

  // Find & Replace state
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [totalMatches, setTotalMatches] = useState(0);


  // Update editor content when petition changes or petitionVersion updates
  useEffect(() => {
    const updateContent = () => {
      if (editorRef.current && petition) {
        // Convert markdown to HTML for proper display
        const htmlContent = convertMarkdownToHtml(petition);
        editorRef.current.innerHTML = htmlContent;
      }
    };

    // Try immediately first
    updateContent();

    // Also try with a small delay for cases where DOM isn't ready
    const timer = setTimeout(updateContent, 50);

    return () => clearTimeout(timer);
  }, [petition, petitionVersion]); // Update when either changes

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (!range.collapsed) {
        setSelectionRange(range.cloneRange());
        const rect = range.getBoundingClientRect();
        const editorBounds = editorRef.current?.getBoundingClientRect();
        if (editorBounds) {
          // Position toolbar above the selection
          const top = rect.top - editorBounds.top - 40;
          const left = rect.left - editorBounds.left + (rect.width / 2);
          setToolbarPosition({ top, left });
        }
      } else {
        setToolbarPosition(null);
        setSelectionRange(null);
      }
    }
  }, []);

  const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
    // Sync state for direct edits
    setGeneratedPetition(event.currentTarget.innerHTML);
  };

  const handleRewrite = async () => {
    if (!selectionRange) return;

    const selectedText = selectionRange.toString();
    setIsRewriting(true);
    setToolbarPosition(null);

    try {
      const rewrittenText = await onRewrite(selectedText);

      // Restore selection to ensure we're acting on the right part of the DOM
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(selectionRange);
      }

      // Use modern range manipulation instead of deprecated execCommand.
      // This is safer and more reliable.
      selectionRange.deleteContents();
      selectionRange.insertNode(document.createTextNode(rewrittenText));

      // Update the main state with the new editor content
      if (editorRef.current) {
        setGeneratedPetition(editorRef.current.innerHTML);
      }

    } catch (error) {
      console.error("Rewrite failed:", error);
      // Optional: Show an error to the user
    } finally {
      setIsRewriting(false);
      setSelectionRange(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!contentRef.current) return;
    setIsDownloading(true);
    setIsDownloadMenuOpen(false);
    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2, // Higher scale for better quality
        backgroundColor: '#ffffff', // White background to match editor
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save('dilekce.pdf');
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!editorRef.current) return;
    setIsDownloading(true);
    setIsDownloadMenuOpen(false);
    try {
      // Construct HTML with branding if available
      let contentHtml = editorRef.current.innerHTML;

      if (officeLogoUrl || corporateHeader) {
        let brandingHtml = '<div style="margin-bottom: 20px; display: flex; gap: 20px; align-items: center;">';
        if (officeLogoUrl) {
          brandingHtml += `<img src="${officeLogoUrl}" width="80" height="80" style="width: 80px; height: 80px; object-fit: contain;" />`;
        }
        if (corporateHeader) {
          brandingHtml += `<div style="font-family: 'Times New Roman'; white-space: pre-line;">${corporateHeader}</div>`;
        }
        brandingHtml += '</div><hr />';
        contentHtml = brandingHtml + contentHtml;
      }

      const htmlString = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${contentHtml}</body></html>`;

      // Call API endpoint to generate DOCX
      const response = await fetch('/api/html-to-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html: htmlString,
          options: {
            font: 'Calibri',
            fontSize: '22', // Corresponds to 11pt
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate DOCX');
      }

      const blob = await response.blob();
      saveAs(blob, 'dilekce.docx');
    } catch (error) {
      console.error("Error generating DOCX:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadTxt = () => {
    if (!editorRef.current) return;
    setIsDownloading(true);
    setIsDownloadMenuOpen(false);
    try {
      // Extract plain text from HTML content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = editorRef.current.innerHTML;
      let textContent = tempDiv.innerText || tempDiv.textContent || '';

      // Prepend corporate header to text content
      if (corporateHeader) {
        textContent = `${corporateHeader}\n\n${textContent}`;
      }

      // Create blob with UTF-8 encoding
      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      saveAs(blob, 'dilekce.txt');
    } catch (error) {
      console.error("Error generating TXT:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  // Text formatting functions
  const formatText = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  // Find & Replace functions
  const highlightMatches = useCallback((searchTerm: string) => {
    if (!editorRef.current || !searchTerm) {
      setTotalMatches(0);
      setCurrentMatchIndex(-1);
      return;
    }

    const content = editorRef.current.innerText;
    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const matches = content.match(regex);
    setTotalMatches(matches ? matches.length : 0);
  }, [matchCase]);

  const findNext = useCallback(() => {
    if (!editorRef.current || !findText) return;

    const content = editorRef.current.innerText;
    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const matches = Array.from(content.matchAll(regex));

    if (matches.length === 0) {
      setTotalMatches(0);
      setCurrentMatchIndex(-1);
      return;
    }

    const nextIndex = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIndex);
    setTotalMatches(matches.length);

    // Highlight and scroll to the match
    window.find(findText, matchCase, false, true);
  }, [findText, matchCase, currentMatchIndex]);

  const findPrevious = useCallback(() => {
    if (!editorRef.current || !findText) return;

    const content = editorRef.current.innerText;
    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const matches = Array.from(content.matchAll(regex));

    if (matches.length === 0) {
      setTotalMatches(0);
      setCurrentMatchIndex(-1);
      return;
    }

    const prevIndex = currentMatchIndex <= 0 ? matches.length - 1 : currentMatchIndex - 1;
    setCurrentMatchIndex(prevIndex);
    setTotalMatches(matches.length);

    // Highlight and scroll to the match
    window.find(findText, matchCase, true, true);
  }, [findText, matchCase, currentMatchIndex]);

  const replaceOne = useCallback(() => {
    if (!editorRef.current || !findText) return;

    const selection = window.getSelection();
    if (selection && selection.toString().toLowerCase() === findText.toLowerCase()) {
      document.execCommand('insertText', false, replaceText);
      setGeneratedPetition(editorRef.current.innerHTML);
    }
    findNext();
  }, [findText, replaceText, findNext, setGeneratedPetition]);

  const replaceAll = useCallback(() => {
    if (!editorRef.current || !findText) return;

    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const newContent = editorRef.current.innerHTML.replace(regex, replaceText);

    editorRef.current.innerHTML = newContent;
    setGeneratedPetition(newContent);
    setTotalMatches(0);
    setCurrentMatchIndex(-1);
  }, [findText, replaceText, matchCase, setGeneratedPetition]);

  // Update matches when find text or match case changes
  useEffect(() => {
    if (findText) {
      highlightMatches(findText);
    }
  }, [findText, matchCase, highlightMatches]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F or Ctrl+H to open Find & Replace
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'h' || e.key === 'F' || e.key === 'H')) {
        e.preventDefault();
        setShowFindReplace(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDownloadUdf = async () => {
    if (!editorRef.current) return;
    setIsDownloading(true);
    setIsDownloadMenuOpen(false);
    try {
      // Extract plain text from HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = editorRef.current.innerHTML;
      let textContent = tempDiv.innerText || tempDiv.textContent || '';

      // Prepend corporate header to text content for UDF
      if (corporateHeader) {
        textContent = `${corporateHeader}\n\n${textContent}`;
      }

      // Create XML content for UDF - Reverted to documented structure
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <metadata>
    <title>Dilekçe</title>
    <author>DilekAI</author>
    <date>${new Date().toISOString()}</date>
  </metadata>
  <content>
    <![CDATA[
${textContent}
    ]]>
  </content>
</document>`;

      // Create ZIP archive (UDF is a ZIP file)
      const zip = new JSZip();

      // Critical: mimetype must be the first file and uncompressed (STORE)
      // We try 'application/udf' this time as a fallback if vnd.udf fails, or stick to standard.
      // Let's stick to the documented one but ensure STORE is effective.
      zip.file('mimetype', 'application/vnd.udf', { compression: "STORE" });
      zip.file('content.xml', xmlContent);

      // Generate ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      // Create a temporary URL for the blob
      const blobUrl = URL.createObjectURL(zipBlob);

      // Create a download link and trigger it
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = 'dilekce.udf';
      document.body.appendChild(downloadLink);
      downloadLink.click();


      // Clean up
      document.body.removeChild(downloadLink);

      // After a short delay, try to open the file
      // Note: Modern browsers prevent automatic opening for security reasons,
      // but we'll create a clickable link for the user
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);

        // Create a viewer that opens the UDF content in a new window
        const viewerWindow = window.open('', '_blank');
        if (viewerWindow) {
          viewerWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>UDF İçeriği - Dilekçe</title>
                        <style>
                            body {
                                font-family: 'Calibri', 'Arial', sans-serif;
                                max-width: 800px;
                                margin: 40px auto;
                                padding: 20px;
                                background: #f5f5f5;
                                line-height: 1.6;
                            }
                            .content {
                                background: white;
                                padding: 40px;
                                box-shadow: 0 0 10px rgba(0,0,0,0.1);
                                white-space: pre-wrap;
                            }
                            .header {
                                background: #2563eb;
                                color: white;
                                padding: 20px;
                                margin: -20px -20px 20px -20px;
                                text-align: center;
                            }
                            .footer {
                                text-align: center;
                                margin-top: 20px;
                                color: #666;
                                font-size: 12px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>📄 Dilekçe - UDF İçeriği</h1>
                            <p>Oluşturulma: ${new Date().toLocaleString('tr-TR')}</p>
                        </div>
                        <div class="content">${textContent}</div>
                        <div class="footer">
                            <p>DilekAI tarafından oluşturuldu</p>
                        </div>
                    </body>
                    </html>
                `);
          viewerWindow.document.close();
        }
      }, 500);
    } catch (error) {
      console.error("Error generating UDF:", error);
    } finally {
      setIsDownloading(false);
    }
  };


  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 p-6">
        <LoadingSpinner className="h-10 w-10 mb-4" />
        <p className="text-lg font-semibold">Dilekçeniz oluşturuluyor...</p>
        <p className="text-sm">AI, belgeleri analiz ediyor ve web'de araştırma yapıyor.</p>
      </div>
    );
  }

  if (!petition) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 p-6">
        <DocumentTextIcon className="h-16 w-16 mb-4" />
        <h3 className="text-xl font-bold text-gray-300">Dilekçeniz Burada Görüntülenecek</h3>
        <p className="mt-2 max-w-md">Sol taraftaki bilgileri doldurduktan sonra "Dilekçeyi Oluştur" butonuna tıklayarak başlayın.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative bg-gradient-to-br from-gray-900 to-gray-800">
      <FloatingToolbar
        position={toolbarPosition}
        onRewrite={handleRewrite}
        isRewriting={isRewriting}
      />

      {/* Compact Toolbar */}
      <div className="flex-shrink-0 bg-gray-800/50 border-b border-gray-700/50 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-2">
          {/* Left side - Tools */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setShowFormattingToolbar(!showFormattingToolbar)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-all text-sm"
              title="Biçimlendirme araçlarını göster/gizle"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="hidden sm:inline">Biçimlendirme</span>
            </button>

            <button
              onClick={() => setShowFindReplace(!showFindReplace)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-all text-sm"
              title="Bul ve Değiştir (Ctrl+H)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden sm:inline">Bul & Değiştir</span>
            </button>
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                disabled={isDownloading}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white font-medium rounded-lg transition-all text-sm"
              >
                {isDownloading ? (
                  <LoadingSpinner className="h-4 w-4" />
                ) : (
                  <ArrowDownTrayIcon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">İndir</span>
              </button>
              {isDownloadMenuOpen && (
                <div
                  onMouseLeave={() => setIsDownloadMenuOpen(false)}
                  className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-20"
                >
                  <ul className="py-1">
                    <li>
                      <button
                        onClick={handleDownloadPdf}
                        className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                      >
                        📕 PDF olarak indir
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={handleDownloadDocx}
                        className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                      >
                        📘 Word (.docx) olarak indir
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={handleDownloadUdf}
                        className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                      >
                        📄 UDF olarak indir
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={handleDownloadTxt}
                        className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                      >
                        📝 Metin (.txt) olarak indir
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Formatting Toolbar */}
      {showFormattingToolbar && (
        <div className="flex-shrink-0 border-b border-gray-700/50 bg-gray-800/30 overflow-x-auto">
          <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-2 flex items-center gap-1 min-w-max">
            {/* Text Formatting */}
            <div className="flex items-center gap-1 border-r border-gray-600 pr-2">
              <button
                onClick={() => formatText('bold')}
                className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                title="Kalın (Ctrl+B)"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 5a1 1 0 011-1h5.5a3.5 3.5 0 110 7H4v5a1 1 0 11-2 0V5zm2 5h5.5a1.5 1.5 0 100-3H5v3z" />
                </svg>
              </button>
              <button
                onClick={() => formatText('italic')}
                className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                title="İtalik (Ctrl+I)"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8 5a1 1 0 100 2h1.586l-4.293 4.293a1 1 0 101.414 1.414L11 8.414V10a1 1 0 102 0V5H8z" transform="matrix(1 0 -0.3 1 0 0)" />
                  <text x="7" y="14" fontSize="12" fontStyle="italic" fill="currentColor">I</text>
                </svg>
              </button>
              <button
                onClick={() => formatText('underline')}
                className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                title="Altı Çizili (Ctrl+U)"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 3a1 1 0 011 1v6a5 5 0 0010 0V4a1 1 0 112 0v6a7 7 0 11-14 0V4a1 1 0 011-1z" />
                  <path d="M2 17h16v1H2v-1z" />
                </svg>
              </button>
              <button
                onClick={() => formatText('strikeThrough')}
                className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                title="Üstü Çizili"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h18M9 5l-3 7m0 0l3 7m-3-7h12" />
                </svg>
              </button>
            </div>

            {/* Alignment */}
            <div className="flex items-center gap-1 border-r border-gray-600 pr-2">
              <button
                onClick={() => formatText('justifyLeft')}
                className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                title="Sola Hizala"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => formatText('justifyCenter')}
                className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                title="Ortala"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => formatText('justifyRight')}
                className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                title="Sağa Hizala"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => formatText('justifyFull')}
                className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                title="İki Yana Yasla"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* Lists */}
            <div className="flex items-center gap-1 border-r border-gray-600 pr-2">
              <button
                onClick={() => formatText('insertUnorderedList')}
                className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                title="Madde İşaretli Liste"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                </svg>
              </button>
              <button
                onClick={() => formatText('insertOrderedList')}
                className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                title="Numaralı Liste"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5h12M9 12h12M9 19h12M3 5v4m0 4v4" />
                </svg>
              </button>
            </div>

            {/* Font Size */}
            <div className="flex items-center gap-1 border-r border-gray-600 pr-2">
              <select
                onChange={(e) => formatText('fontSize', e.target.value)}
                className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded border border-gray-600 focus:border-red-500 focus:outline-none"
                title="Font Boyutu"
                defaultValue="3"
              >
                <option value="1">Çok Küçük</option>
                <option value="2">Küçük</option>
                <option value="3">Normal</option>
                <option value="4">Büyük</option>
                <option value="5">Çok Büyük</option>
                <option value="6">Başlık</option>
              </select>
            </div>

            {/* Text Color */}
            <div className="flex items-center gap-1">
              <input
                type="color"
                onChange={(e) => formatText('foreColor', e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-gray-600"
                title="Metin Rengi"
                defaultValue="#e5e7eb"
              />
              <button
                onClick={() => formatText('removeFormat')}
                className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                title="Biçimlendirmeyi Temizle"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Find & Replace Panel */}
      {showFindReplace && (
        <div className="flex-shrink-0 border-b border-gray-700/50 bg-gray-800/50">
          <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-3 sm:py-4">
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              {/* Find Section */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-medium">Bul:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') findNext();
                      if (e.key === 'Escape') setShowFindReplace(false);
                    }}
                    placeholder="Aranacak metin..."
                    className="flex-1 px-3 py-2 bg-gray-700 text-white text-sm rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={findPrevious}
                    disabled={!findText || totalMatches === 0}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-all"
                    title="Önceki (Shift+Enter)"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={findNext}
                    disabled={!findText || totalMatches === 0}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-all"
                    title="Sonraki (Enter)"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                {findText && (
                  <div className="text-xs text-gray-400">
                    {totalMatches > 0 ? (
                      <span>{currentMatchIndex + 1} / {totalMatches} sonuç</span>
                    ) : (
                      <span className="text-orange-400">Sonuç bulunamadı</span>
                    )}
                  </div>
                )}
              </div>

              {/* Replace Section */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-medium">Değiştir:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) replaceAll();
                      if (e.key === 'Escape') setShowFindReplace(false);
                    }}
                    placeholder="Yeni metin..."
                    className="flex-1 px-3 py-2 bg-gray-700 text-white text-sm rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={replaceOne}
                    disabled={!findText || totalMatches === 0}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-all text-sm font-medium whitespace-nowrap"
                    title="Değiştir"
                  >
                    Değiştir
                  </button>
                  <button
                    onClick={replaceAll}
                    disabled={!findText || totalMatches === 0}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-all text-sm font-medium whitespace-nowrap"
                    title="Tümünü Değiştir (Ctrl+Enter)"
                  >
                    Tümünü
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matchCase}
                      onChange={(e) => setMatchCase(e.target.checked)}
                      className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    Büyük/küçük harf duyarlı
                  </label>
                </div>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={() => setShowFindReplace(false)}
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-white transition-colors"
              title="Kapat (Esc)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Rich Text Editor Area - Spacious and Clean */}
      <div className="flex-grow overflow-y-auto">
        <div ref={contentRef} className="max-w-[1200px] mx-auto px-3 sm:px-6 py-4 sm:py-8">
          {/* Office Branding Header */}
          {(officeLogoUrl || corporateHeader) && (
            <div
              className="office-branding bg-white text-gray-900 shadow-lg rounded-xl p-6 mb-4 flex items-center gap-6"
              style={{ fontFamily: '"Times New Roman", Georgia, serif' }}
            >
              {officeLogoUrl && (
                <img
                  src={officeLogoUrl}
                  alt="Büro Logosu"
                  className="w-20 h-20 object-contain flex-shrink-0"
                />
              )}
              {corporateHeader && (
                <div className="flex-1 whitespace-pre-line text-sm leading-relaxed">
                  {corporateHeader}
                </div>
              )}
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable={!isLoading && !isReviewing}
            onInput={handleInput}
            onMouseUp={handleMouseUp}
            className="petition-editor bg-white text-gray-900 shadow-2xl rounded-lg sm:rounded-xl p-4 sm:p-8 md:p-16 min-h-[calc(100vh-250px)] sm:min-h-[calc(100vh-300px)] focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all"
            style={{
              fontFamily: '"Times New Roman", Georgia, serif',
              fontSize: '12px',
              lineHeight: '1.8',
              letterSpacing: '0.02em',
              textAlign: 'justify',
              wordSpacing: '0.05em'
            }}
            suppressContentEditableWarning={true}
          />
        </div>
      </div>
      {sources.length > 0 && (
        <div className="flex-shrink-0 p-4 border-t border-gray-700">
          <h4 className="font-semibold text-white mb-2 flex items-center">
            <LinkIcon className="h-5 w-5 mr-2 text-blue-400" />
            Kullanılan Web Kaynakları
          </h4>
          <ul className="space-y-1 text-sm">
            {sources.map((source, index) => (
              <li key={index}>
                <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline break-all">
                  {source.title || source.uri}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};