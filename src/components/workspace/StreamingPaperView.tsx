'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Source } from '@/lib/contract';
import { CitationChip } from './CitationChip';
import { Award, ShieldCheck, PenTool, Calendar } from 'lucide-react';

interface StreamingPaperViewProps {
  markdown: string;
  sources: Source[];
  topic: string;
  onSelectSource?: (sourceId: string) => void;
}

export const StreamingPaperView: React.FC<StreamingPaperViewProps> = ({
  markdown,
  sources,
  topic,
  onSelectSource,
}) => {
  const sourcesMap = React.useMemo(() => {
    const map = new Map<string, Source>();
    sources.forEach((s) => map.set(s.id, s));
    return map;
  }, [sources]);

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
    <div className="w-full p-6 sm:p-10 md:p-12 rounded-[28px] glass-thick border border-[var(--glass-border)] shadow-glass-thick space-y-6">
      {/* Live Writing Masthead */}
      <div className="text-center pb-6 border-b border-[var(--border-subtle)] space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold text-[#0A84FF] bg-[#0A84FF]/10 mb-1">
          <PenTool size={12} className="animate-pulse" />
          <span>Live Academic Drafting in Progress...</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] max-w-2xl mx-auto leading-tight">
          {topic}
        </h1>

        <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] pt-1">
          <span className="font-medium text-[var(--text-primary)]">Aether Scholarly Engine</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            <span>{currentDate}</span>
          </span>
          {sources.length > 0 && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1 text-[#30D158] font-semibold">
                <ShieldCheck size={12} />
                <span>{sources.length} Verified Citations</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Formatted Streaming Markdown Body with ReactMarkdown & remarkGfm */}
      <div className="markdown-body max-w-3xl mx-auto text-base leading-relaxed text-[var(--text-primary)]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
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

              return <p className="my-4 leading-relaxed">{processChildren(children)}</p>;
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
            table: ({ children }) => (
              <div className="my-6 overflow-x-auto rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 shadow-xs">
                <table className="w-full text-left text-sm border-collapse">{children}</table>
              </div>
            ),
            blockquote: ({ children }) => (
              <div className="paper-abstract-box my-6">
                {children}
              </div>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>

        {/* Soft Blinking Caret */}
        <span className="inline-block w-2 h-4 bg-[var(--accent-primary)]/80 animate-pulse ml-1 align-middle rounded-xs" />
      </div>
    </div>
  );
};

