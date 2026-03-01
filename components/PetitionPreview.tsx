import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { GroundingSource } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { SparklesIcon, ArrowDownTrayIcon, LinkIcon } from './Icon';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

// ── Types ─────────────────────────────────────────────
export interface PetitionPreviewProps {
    petition: string;
    setPetition: (value: string) => void;
    onRewrite: (text: string) => Promise<string>;
    onReview: () => void;
    isReviewing: boolean;
    petitionVersion: number;
    officeLogoUrl?: string | null;
    corporateHeader?: string | null;
    sources: GroundingSource[];
    onGoBack: () => void;
}

// ── Helpers ───────────────────────────────────────────
const convertMarkdownToHtml = (text: string): string => {
    if (!text) return '';
    let processed = text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return marked.parse(processed) as string;
};

// ── Floating AI Toolbar ───────────────────────────────
const FloatingAIToolbar: React.FC<{
    position: { top: number; left: number } | null;
    onRewrite: () => void;
    isRewriting: boolean;
}> = ({ position, onRewrite, isRewriting }) => {
    if (!position) return null;
    return (
        <div className="absolute z-30" style={{ top: `${position.top}px`, left: `${position.left}px` }}>
            <div className="flex items-center gap-1 bg-[#111113] border border-red-500/50 rounded-xl shadow-2xl shadow-red-900/30 px-2 py-1.5 animate-fade-in">
                <button
                    onClick={onRewrite}
                    disabled={isRewriting}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:opacity-50 text-white rounded-lg transition-all text-sm font-medium"
                >
                    {isRewriting ? (
                        <LoadingSpinner className="h-4 w-4" />
                    ) : (
                        <SparklesIcon className="h-4 w-4" />
                    )}
                    <span>AI ile Yeniden Yaz</span>
                </button>
            </div>
        </div>
    );
};

// ── Main Component ────────────────────────────────────
export const PetitionPreview: React.FC<PetitionPreviewProps> = ({
    petition,
    setPetition,
    onRewrite,
    onReview,
    isReviewing,
    petitionVersion,
    officeLogoUrl,
    corporateHeader,
    sources,
    onGoBack,
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectionRange, setSelectionRange] = useState<Range | null>(null);
    const [toolbarPosition, setToolbarPosition] = useState<{ top: number; left: number } | null>(null);
    const [isRewriting, setIsRewriting] = useState(false);
    const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

    // Stats
    const stats = useMemo(() => {
        if (!petition) return { words: 0, chars: 0 };
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = convertMarkdownToHtml(petition);
        const text = tempDiv.innerText || tempDiv.textContent || '';
        const words = text.split(/\s+/).filter(Boolean).length;
        return { words, chars: text.length };
    }, [petition]);

    // Update editor content
    useEffect(() => {
        if (editorRef.current && petition) {
            const htmlContent = convertMarkdownToHtml(petition);
            editorRef.current.innerHTML = htmlContent;
        }
    }, [petition, petitionVersion, isEditMode]);

    // Handle text selection for AI rewrite
    const handleMouseUp = useCallback(() => {
        if (!isEditMode) return;
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (!range.collapsed && range.toString().trim().length > 5) {
                setSelectionRange(range.cloneRange());
                const rect = range.getBoundingClientRect();
                const editorBounds = editorRef.current?.getBoundingClientRect();
                if (editorBounds) {
                    const top = rect.top - editorBounds.top - 50;
                    const left = rect.left - editorBounds.left + (rect.width / 2) - 80;
                    setToolbarPosition({ top, left: Math.max(0, left) });
                }
            } else {
                setToolbarPosition(null);
                setSelectionRange(null);
            }
        }
    }, [isEditMode]);

    // AI rewrite selected text
    const handleRewriteSelected = useCallback(async () => {
        if (!selectionRange) return;
        const selectedText = selectionRange.toString();
        setIsRewriting(true);
        setToolbarPosition(null);
        try {
            const rewrittenText = await onRewrite(selectedText);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(selectionRange);
            }
            selectionRange.deleteContents();
            selectionRange.insertNode(document.createTextNode(rewrittenText));
            if (editorRef.current) {
                setPetition(editorRef.current.innerHTML);
            }
        } catch (error) {
            console.error('AI rewrite failed:', error);
        } finally {
            setIsRewriting(false);
            setSelectionRange(null);
        }
    }, [selectionRange, onRewrite, setPetition]);

    // Handle manual edit
    const handleInput = useCallback((event: React.FormEvent<HTMLDivElement>) => {
        setPetition(event.currentTarget.innerHTML);
    }, [setPetition]);

    // Download handlers
    const handleDownloadPdf = async () => {
        if (!contentRef.current) return;
        setIsDownloading(true);
        setIsDownloadMenuOpen(false);
        try {
            const canvas = await html2canvas(contentRef.current, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'px',
                format: [canvas.width, canvas.height],
            });
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save('dilekce.pdf');
            setDownloadSuccess('PDF');
            setTimeout(() => setDownloadSuccess(null), 3000);
        } catch (error) {
            console.error('Error generating PDF:', error);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadDocx = async () => {
        if (!editorRef.current) return;
        setIsDownloading(true);
        setIsDownloadMenuOpen(false);
        try {
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
            const response = await fetch('/api/html-to-docx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html: htmlString, options: { font: 'Calibri', fontSize: '22' } }),
            });
            if (!response.ok) throw new Error('Failed to generate DOCX');
            const blob = await response.blob();
            saveAs(blob, 'dilekce.docx');
            setDownloadSuccess('DOCX');
            setTimeout(() => setDownloadSuccess(null), 3000);
        } catch (error) {
            console.error('Error generating DOCX:', error);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadTxt = () => {
        if (!editorRef.current) return;
        setIsDownloading(true);
        setIsDownloadMenuOpen(false);
        try {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = editorRef.current.innerHTML;
            let textContent = tempDiv.innerText || tempDiv.textContent || '';
            if (corporateHeader) {
                textContent = `${corporateHeader}\n\n${textContent}`;
            }
            const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            saveAs(blob, 'dilekce.txt');
            setDownloadSuccess('TXT');
            setTimeout(() => setDownloadSuccess(null), 3000);
        } catch (error) {
            console.error('Error generating TXT:', error);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadUdf = async () => {
        if (!editorRef.current) return;
        setIsDownloading(true);
        setIsDownloadMenuOpen(false);
        try {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = editorRef.current.innerHTML;
            let textContent = tempDiv.innerText || tempDiv.textContent || '';
            if (corporateHeader) {
                textContent = `${corporateHeader}\n\n${textContent}`;
            }
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
            const zip = new JSZip();
            zip.file('mimetype', 'application/vnd.udf', { compression: 'STORE' });
            zip.file('content.xml', xmlContent);
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            saveAs(zipBlob, 'dilekce.udf');
            setDownloadSuccess('UDF');
            setTimeout(() => setDownloadSuccess(null), 3000);
        } catch (error) {
            console.error('Error generating UDF:', error);
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-[#0A0A0B]">
            {/* ── Top Toolbar ────────────────────────────── */}
            <div className="sticky top-0 z-20 bg-[#111113]/95 backdrop-blur-xl border-b border-white/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
                    {/* Left: Back + Title */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onGoBack}
                            className="group flex items-center gap-2 px-3 py-2 bg-[#1C1C1F] hover:bg-[#27272A] border border-white/10 hover:border-amber-400/40 text-white rounded-xl transition-all text-sm font-medium"
                        >
                            <svg className="w-4 h-4 text-amber-300 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            <span className="hidden sm:inline">Geri</span>
                        </button>
                        <div className="hidden sm:block">
                            <h2 className="text-base font-semibold text-white tracking-tight">Ön İzleme & İndirme</h2>
                            <p className="text-xs text-gray-500">{stats.words} kelime · {stats.chars} karakter</p>
                        </div>
                    </div>

                    {/* Center: Mode Toggle */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsEditMode(false)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${!isEditMode
                                    ? 'bg-white/10 text-white border border-white/20 shadow-lg'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Ön İzleme
                        </button>
                        <button
                            onClick={() => setIsEditMode(true)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${isEditMode
                                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 shadow-lg shadow-blue-900/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Düzenle
                        </button>
                    </div>

                    {/* Right: AI + Download */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onReview}
                            disabled={isReviewing}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all text-sm font-medium shadow-lg shadow-violet-900/30"
                            title="Tüm dilekçeyi AI ile iyileştir"
                        >
                            {isReviewing ? (
                                <LoadingSpinner className="h-4 w-4" />
                            ) : (
                                <SparklesIcon className="h-4 w-4" />
                            )}
                            <span className="hidden sm:inline">{isReviewing ? 'İyileştiriliyor...' : 'AI ile İyileştir'}</span>
                        </button>

                        {/* Download Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                                disabled={isDownloading}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 disabled:opacity-50 text-white rounded-xl transition-all text-sm font-medium shadow-lg shadow-emerald-900/30"
                            >
                                {isDownloading ? (
                                    <LoadingSpinner className="h-4 w-4" />
                                ) : (
                                    <ArrowDownTrayIcon className="h-4 w-4" />
                                )}
                                <span className="hidden sm:inline">İndir</span>
                                <svg className={`w-3 h-3 transition-transform ${isDownloadMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {isDownloadMenuOpen && (
                                <div
                                    onMouseLeave={() => setIsDownloadMenuOpen(false)}
                                    className="absolute right-0 mt-2 w-56 bg-[#1C1C1F] border border-white/10 rounded-xl shadow-2xl shadow-black/50 z-30 overflow-hidden animate-fade-in"
                                >
                                    <div className="py-1">
                                        <button
                                            onClick={handleDownloadPdf}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition-colors"
                                        >
                                            <span className="text-lg">📕</span>
                                            <div className="text-left">
                                                <p className="font-medium">PDF</p>
                                                <p className="text-xs text-gray-500">Yazdırmaya hazır format</p>
                                            </div>
                                        </button>
                                        <button
                                            onClick={handleDownloadDocx}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition-colors"
                                        >
                                            <span className="text-lg">📘</span>
                                            <div className="text-left">
                                                <p className="font-medium">Word (.docx)</p>
                                                <p className="text-xs text-gray-500">Microsoft Word formatı</p>
                                            </div>
                                        </button>
                                        <button
                                            onClick={handleDownloadUdf}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition-colors"
                                        >
                                            <span className="text-lg">📄</span>
                                            <div className="text-left">
                                                <p className="font-medium">UDF</p>
                                                <p className="text-xs text-gray-500">UYAP uyumlu format</p>
                                            </div>
                                        </button>
                                        <button
                                            onClick={handleDownloadTxt}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-white/5 transition-colors"
                                        >
                                            <span className="text-lg">📝</span>
                                            <div className="text-left">
                                                <p className="font-medium">Metin (.txt)</p>
                                                <p className="text-xs text-gray-500">Düz metin formatı</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Download Success Toast ────────────────── */}
            {downloadSuccess && (
                <div className="fixed top-20 right-6 z-50 animate-fade-in">
                    <div className="flex items-center gap-3 px-5 py-3 bg-emerald-600/90 backdrop-blur-lg text-white rounded-xl shadow-2xl shadow-emerald-900/40 border border-emerald-400/30">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-medium text-sm">{downloadSuccess} başarıyla indirildi!</span>
                    </div>
                </div>
            )}

            {/* ── Edit Mode Banner ─────────────────────── */}
            {isEditMode && (
                <div className="bg-blue-600/10 border-b border-blue-500/20 px-4 py-2">
                    <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 text-sm text-blue-300">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Düzenleme modu aktif — Metni doğrudan düzenleyebilir veya bir bölüm seçip <strong>AI ile yeniden yazdırabilirsiniz</strong></span>
                    </div>
                </div>
            )}

            {/* ── A4 Preview Area ──────────────────────── */}
            <div className="flex-1 overflow-y-auto py-8 px-4" style={{ background: 'linear-gradient(180deg, #0A0A0B 0%, #111118 100%)' }}>
                <div className="max-w-[850px] mx-auto relative">
                    {/* Paper shadow effect */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent rounded-t-2xl blur-xl -top-4" />

                    {/* A4 Paper */}
                    <div ref={contentRef} className="relative bg-white rounded-xl shadow-2xl shadow-black/50 overflow-hidden" style={{ minHeight: '1123px' /* A4 aspect ratio approx */ }}>
                        {/* Office Branding Header */}
                        {(officeLogoUrl || corporateHeader) && (
                            <div
                                className="bg-gray-50 border-b border-gray-200 px-12 pt-8 pb-6 flex items-center gap-6"
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
                                    <div className="flex-1 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                                        {corporateHeader}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Content Editor / Preview */}
                        <FloatingAIToolbar
                            position={toolbarPosition}
                            onRewrite={handleRewriteSelected}
                            isRewriting={isRewriting}
                        />
                        <div
                            ref={editorRef}
                            contentEditable={isEditMode}
                            onInput={isEditMode ? handleInput : undefined}
                            onMouseUp={handleMouseUp}
                            className={`petition-preview-editor px-12 py-10 text-gray-900 min-h-[900px] focus:outline-none transition-all ${isEditMode
                                    ? 'cursor-text ring-2 ring-inset ring-blue-400/20'
                                    : 'cursor-default'
                                }`}
                            style={{
                                fontFamily: '"Times New Roman", Georgia, serif',
                                fontSize: '12px',
                                lineHeight: '1.8',
                                letterSpacing: '0.02em',
                                textAlign: 'justify',
                                wordSpacing: '0.05em',
                            }}
                            suppressContentEditableWarning={true}
                        />
                    </div>

                    {/* Sources */}
                    {sources.length > 0 && (
                        <div className="mt-6 bg-[#111113] border border-white/5 rounded-xl p-5">
                            <h4 className="font-semibold text-white mb-3 flex items-center text-sm">
                                <LinkIcon className="h-4 w-4 mr-2 text-blue-400" />
                                Kullanılan Web Kaynakları
                            </h4>
                            <ul className="space-y-1 text-sm">
                                {sources.map((source, index) => (
                                    <li key={index}>
                                        <a
                                            href={source.uri}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300 hover:underline break-all text-xs"
                                        >
                                            {source.title || source.uri}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Quick Actions Footer */}
                    <div className="mt-6 mb-8 flex items-center justify-center gap-4">
                        <button
                            onClick={onGoBack}
                            className="group flex items-center gap-2 px-6 py-3 bg-[#1C1C1F] hover:bg-[#27272A] border border-white/10 hover:border-amber-400/40 text-white rounded-xl transition-all font-medium shadow-lg shadow-black/30"
                        >
                            <svg className="w-4 h-4 text-amber-300 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Düzenlemeye Dön
                        </button>
                        <button
                            onClick={() => setIsDownloadMenuOpen(true)}
                            className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl transition-all font-medium shadow-lg shadow-emerald-900/40"
                        >
                            <ArrowDownTrayIcon className="w-5 h-5" />
                            Dilekçeyi İndir
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
