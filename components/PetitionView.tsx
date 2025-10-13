import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PetitionViewProps } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { DocumentTextIcon, LinkIcon, SparklesIcon, ArrowDownTrayIcon } from './Icon';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

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


export const PetitionView: React.FC<PetitionViewProps> = ({ petition, setGeneratedPetition, sources, isLoading, onRewrite, onReview, isReviewing }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [selectionRange, setSelectionRange] = useState<Range | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{ top: number, left: number } | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);


  useEffect(() => {
    // This now only runs on mount (or when key changes), setting initial content.
    // This prevents the component from fighting with user for control over the content.
    if (editorRef.current) {
      editorRef.current.innerHTML = petition;
    }
  }, []); // <-- CRITICAL CHANGE: Empty dependency array fixes direct editing.

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
      if(editorRef.current) {
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
    if (!editorRef.current) return;
    setIsDownloading(true);
    setIsDownloadMenuOpen(false);
    try {
        const canvas = await html2canvas(editorRef.current, {
            scale: 2, // Higher scale for better quality
            backgroundColor: '#1f2937', // Match editor background (gray-800)
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
        const htmlString = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${editorRef.current.innerHTML}</body></html>`;
        
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
        const textContent = tempDiv.innerText || tempDiv.textContent || '';
        
        // Create blob with UTF-8 encoding
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        saveAs(blob, 'dilekce.txt');
    } catch (error) {
        console.error("Error generating TXT:", error);
    } finally {
        setIsDownloading(false);
    }
  };

  const handleDownloadUdf = async () => {
    if (!editorRef.current) return;
    setIsDownloading(true);
    setIsDownloadMenuOpen(false);
    try {
        // Extract plain text from HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = editorRef.current.innerHTML;
        const textContent = tempDiv.innerText || tempDiv.textContent || '';
        
        // Create XML content for UDF
        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <metadata>
    <title>Dilekçe</title>
    <author>Hukuk Asistanı AI</author>
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
        zip.file('content.xml', xmlContent);
        zip.file('mimetype', 'application/vnd.udf');
        
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
                            <p>Hukuk Asistanı AI tarafından oluşturuldu</p>
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
    <div className="h-full flex flex-col relative">
       <FloatingToolbar 
            position={toolbarPosition}
            onRewrite={handleRewrite}
            isRewriting={isRewriting}
        />
        <div className="flex-shrink-0 p-3 border-b border-gray-700 flex items-center justify-end gap-2">
            <div className="relative">
                <button
                    onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white font-semibold rounded-lg shadow-md transition-all text-sm"
                >
                    {isDownloading ? (
                        <LoadingSpinner className="h-4 w-4" />
                    ) : (
                        <ArrowDownTrayIcon className="h-5 w-5" />
                    )}
                    <span>İndir</span>
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
             <button
                onClick={onReview}
                disabled={isReviewing || isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-md transition-all text-sm"
            >
                {isReviewing ? (
                    <>
                        <LoadingSpinner className="h-4 w-4" />
                        <span>İyileştiriliyor...</span>
                    </>
                ) : (
                    <>
                        <SparklesIcon className="h-5 w-5" />
                        <span>Taslağı Gözden Geçir ve İyileştir</span>
                    </>
                )}
            </button>
        </div>
        <div className="flex-grow overflow-y-auto p-4 bg-gray-900/50 rounded-b-lg">
            <div
                ref={editorRef}
                contentEditable={!isLoading && !isReviewing}
                onInput={handleInput}
                onMouseUp={handleMouseUp}
                className="whitespace-pre-wrap break-words font-sans text-gray-200 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-2"
                suppressContentEditableWarning={true}
            />
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