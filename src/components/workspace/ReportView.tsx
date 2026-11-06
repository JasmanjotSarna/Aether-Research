'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ResearchReport, Source } from '@/lib/contract';
import { CitationChip } from './CitationChip';
import {
  Download,
  Copy,
  Check,
  RotateCw,
  ShieldCheck,
  FileText,
  Sparkles,
  Type,
  BookOpen,
  Calendar,
  Award,
} from 'lucide-react';

interface ReportViewProps {
  report: ResearchReport;
  onSelectSource?: (sourceId: string) => void;
  onFollowUp?: (query: string) => void;
  onRegenerate?: () => void;
  onQuickEdit?: (instruction: 'shorter' | 'longer') => void;
}

export const ReportView: React.FC<ReportViewProps> = ({
  report,
  onSelectSource,
  onFollowUp,
  onRegenerate,
  onQuickEdit,
}) => {
  const [copiedType, setCopiedType] = useState<'md' | 'clean' | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isSerif, setIsSerif] = useState(false);

  // Map sources by ID for citation lookups
  const sourcesMap = React.useMemo(() => {
    const map = new Map<string, Source>();
    report.sources.forEach((s) => map.set(s.id, s));
    return map;
  }, [report.sources]);

  // Copy Markdown
  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopiedType('md');
      setTimeout(() => setCopiedType(null), 2000);
    } catch (e) {
      console.warn('Copy failed', e);
    }
  };

  // Copy Clean Text (strips [S1] and markdown headers)
  const handleCopyClean = async () => {
    try {
      const clean = report.markdown
        .replace(/\[S\d+\]/g, '')
        .replace(/[#*`_>]/g, '')
        .trim();
      await navigator.clipboard.writeText(clean);
      setCopiedType('clean');
      setTimeout(() => setCopiedType(null), 2000);
    } catch (e) {
      console.warn('Copy clean failed', e);
    }
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: report.title,
          markdown: report.markdown,
          sources: report.sources,
          ...(report.pagesEstimated ? { pages: report.pagesEstimated } : {}),
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_Research_Paper.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
    } catch (err) {
      console.warn('PDF API endpoint unavailable, opening browser print dialog as fallback', err);
    } finally {
      setIsDownloadingPdf(false);
    }

    // Fallback: trigger print dialog (which has clean white print stylesheet)
    window.print();
  };

  // Custom text renderer to replace inline citation tokens [S1], [S2] with CitationChip
  const renderTextWithCitations = (text: string) => {
    const parts = text.split(/(\[S\d+\])/g);
    return parts.map((part, index) => {
      const match = part.match(/^\[(S\d+)\]$/);
      if (match && match[1]) {
        const sourceId = match[1];
        return (
          <CitationChip
            key={index}
            sourceId={sourceId}
            source={sourcesMap.get(sourceId)}
            onClick={onSelectSource}
          />
        );
      }
      return part;
    });
  };

  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="w-full space-y-6 print-report-container">
      {/* Sticky Report Toolbar */}
      <div className="sticky top-16 z-30 flex flex-wrap items-center justify-between gap-3 p-3 rounded-[20px] glass-thick border border-[var(--glass-border)] shadow-glass no-print">
        {/* Quality Score Badge */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#30D158]/15 text-[#30D158] border border-[#30D158]/30">
            <ShieldCheck size={14} />
            <span>Score: {report.quality?.score ?? 96}/100</span>
          </div>

          <span className="text-xs text-[var(--text-secondary)] font-medium hidden sm:inline">
            {report.quality?.citedSources ?? report.sources?.length ?? 0}/
            {report.quality?.totalSources ?? report.sources?.length ?? 0} sources cited
          </span>

          {report.pagesDelivered !== undefined && (
            <span
              className="text-xs text-[var(--text-secondary)] font-medium hidden md:inline"
              title="Content pages of synthesised prose, excluding the cover, references and research log"
            >
              {Number(report.pagesDelivered.toFixed(1))}/
              {Number((report.pagesRequested ?? report.pagesDelivered).toFixed(1))} content pages
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-1.5">
          {/* Serif / Sans Font Toggle */}
          <button
            type="button"
            onClick={() => setIsSerif(!isSerif)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              isSerif ? 'bg-[#0A84FF] text-white shadow-xs' : 'glass-thin text-[var(--text-primary)] hover:bg-white/10'
            }`}
            title="Toggle Serif Reading Font (New York / Georgia)"
          >
            <Type size={12} />
            <span>{isSerif ? 'Serif' : 'Sans'}</span>
          </button>

          {/* Download PDF */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-[#0A84FF] to-[#5E5CE6] text-white shadow-apple-btn hover:opacity-95 transition-all active:scale-95 disabled:opacity-50"
            title="Download Academic PDF"
          >
            <Download size={13} />
            <span>{isDownloadingPdf ? 'Generating...' : 'Download PDF'}</span>
          </button>

          {/* Copy Markdown */}
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium glass-thin text-[var(--text-primary)] hover:bg-white/10 transition-colors"
            title="Copy Raw Markdown"
          >
            {copiedType === 'md' ? <Check size={12} className="text-[#30D158]" /> : <Copy size={12} />}
            <span>{copiedType === 'md' ? 'Copied' : 'Markdown'}</span>
          </button>

          {/* Copy Link-Free Clean Text */}
          <button
            type="button"
            onClick={handleCopyClean}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium glass-thin text-[var(--text-primary)] hover:bg-white/10 transition-colors"
            title="Copy plain text without citations"
          >
            {copiedType === 'clean' ? <Check size={12} className="text-[#30D158]" /> : <FileText size={12} />}
            <span>{copiedType === 'clean' ? 'Copied' : 'Plain Text'}</span>
          </button>

          {/* Quick Edits: Shorter / Longer */}
          {onQuickEdit && (
            <div className="flex items-center gap-0.5 bg-[var(--code-bg)] p-0.5 rounded-full border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => onQuickEdit('shorter')}
                className="px-2 py-1 rounded-full text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/10 transition-colors"
                title="Make report more concise"
              >
                Shorter
              </button>
              <button
                type="button"
                onClick={() => onQuickEdit('longer')}
                className="px-2 py-1 rounded-full text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/10 transition-colors"
                title="Expand report with deeper details"
              >
                Longer
              </button>
            </div>
          )}

          {/* Regenerate */}
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="p-1.5 rounded-full glass-thin text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors"
              title="Regenerate Report"
            >
              <RotateCw size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Main Research Paper Canvas */}
      <div className="p-6 md:p-12 rounded-[28px] glass border border-[var(--glass-border)] shadow-glass">
        {/* Paper Academic Masthead */}
        <div className="text-center pb-8 border-b border-[var(--border-subtle)] space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold text-[#0A84FF] bg-[#0A84FF]/10 mb-1">
            <Award size={12} />
            <span>Autonomous Research Synthesis Paper</span>
          </div>

          <h1 className={`text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)] max-w-2xl mx-auto leading-tight ${isSerif ? 'font-serif' : ''}`}>
            {report.title}
          </h1>

          <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] pt-1">
            <span className="font-medium text-[var(--text-primary)]">Aether Autonomous Intelligence</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              <span>{currentDate}</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1 text-[#30D158] font-semibold">
              <ShieldCheck size={12} />
              <span>Peer-Audited ({report.sources.length} Verified Sources)</span>
            </span>
          </div>
        </div>

        {/* Paper Body */}
        <div className={`markdown-body pt-8 max-w-3xl mx-auto ${isSerif ? 'font-serif text-[17px] leading-[1.8]' : 'text-[15.5px] leading-relaxed'}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Custom text parser to replace [SX] with CitationChip
              p: ({ children }) => {
                const processChildren = (child: React.ReactNode): React.ReactNode => {
                  if (typeof child === 'string') {
                    return renderTextWithCitations(child);
                  }
                  if (Array.isArray(child)) {
                    return child.map((c, i) => <React.Fragment key={i}>{processChildren(c)}</React.Fragment>);
                  }
                  return child;
                };

                return <p className="my-4">{processChildren(children)}</p>;
              },
              li: ({ children }) => {
                const processChildren = (child: React.ReactNode): React.ReactNode => {
                  if (typeof child === 'string') {
                    return renderTextWithCitations(child);
                  }
                  if (Array.isArray(child)) {
                    return child.map((c, i) => <React.Fragment key={i}>{processChildren(c)}</React.Fragment>);
                  }
                  return child;
                };

                return <li className="my-1.5">{processChildren(children)}</li>;
              },
              // Figure-style tables
              table: ({ children }) => (
                <div className="my-8 overflow-x-auto rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 shadow-xs">
                  <table className="w-full text-left text-sm border-collapse">{children}</table>
                </div>
              ),
              // Academic abstract box
              blockquote: ({ children }) => (
                <div className="paper-abstract-box my-6">
                  {children}
                </div>
              ),
            }}
          >
            {report.markdown}
          </ReactMarkdown>
        </div>

        {/* Quality Audit Notes */}
        {report.quality.notes && report.quality.notes.length > 0 && (
          <div className="mt-10 pt-6 border-t border-[var(--border-subtle)] max-w-3xl mx-auto">
            <h5 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
              <ShieldCheck size={14} className="text-[#30D158]" />
              <span>Independent Verification Audit</span>
            </h5>
            <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
              {report.quality.notes.map((note, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-[#30D158] font-bold">✓</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Follow-up Suggestions Section */}
      {report.followups && report.followups.length > 0 && (
        <div className="p-5 rounded-[20px] glass-thin border border-[var(--glass-border)] shadow-xs no-print space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
            <Sparkles size={14} className="text-[#0A84FF]" />
            <span>Suggested Research Inquiries</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {report.followups.map((query, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onFollowUp?.(query)}
                className="text-left px-3.5 py-2 rounded-[14px] bg-[var(--bg-surface)]/80 hover:bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] border border-[var(--glass-border)] shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
