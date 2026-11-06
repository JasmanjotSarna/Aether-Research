'use client';

import React from 'react';
import { Source } from '@/lib/contract';
import { X, ExternalLink, ShieldCheck, Globe, GraduationCap, BookOpen, FileText } from 'lucide-react';

interface SourcesDrawerProps {
  sources: Source[];
  isOpen: boolean;
  onClose: () => void;
  highlightedSourceId?: string | null;
}

export const SourcesDrawer: React.FC<SourcesDrawerProps> = ({
  sources,
  isOpen,
  onClose,
  highlightedSourceId,
}) => {
  if (!isOpen) return null;

  const getSourceIcon = (kind?: string) => {
    switch (kind) {
      case 'academic':
        return <GraduationCap size={13} className="text-[#5E5CE6]" />;
      case 'encyclopedia':
        return <BookOpen size={13} className="text-[#32ADE6]" />;
      case 'docs':
        return <FileText size={13} className="text-[#30D158]" />;
      default:
        return <Globe size={13} className="text-[#0A84FF]" />;
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
        onClick={onClose}
      />

      {/* Drawer: Right Slide-out on Desktop, Bottom Sheet on Mobile */}
      <aside
        className={`fixed z-50 transition-all duration-300 ease-out glass-thick
          md:top-0 md:right-0 md:h-screen md:w-[380px] md:border-l md:border-[var(--glass-border)] md:shadow-glass-thick
          bottom-0 inset-x-0 max-h-[85vh] rounded-t-[28px] md:rounded-none border-t border-[var(--glass-border)] shadow-2xl flex flex-col`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/40">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-tight text-[var(--text-primary)]">
              Verified Sources
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--bg-surface)] text-[#0A84FF] border border-[var(--glass-border)]">
              {sources.length}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title="Close Sources Drawer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Sources List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sources.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
              No sources discovered yet. Sources will appear here live during research.
            </div>
          ) : (
            sources.map((src) => {
              const isHighlighted = highlightedSourceId === src.id;

              return (
                <div
                  key={src.id}
                  id={`source-card-${src.id}`}
                  className={`p-3.5 rounded-[16px] transition-all duration-200 border ${
                    isHighlighted
                      ? 'bg-[var(--bg-surface)] shadow-md border-[#0A84FF] ring-2 ring-[#0A84FF]/25 scale-[1.01]'
                      : 'bg-[var(--bg-surface)]/60 hover:bg-[var(--bg-surface)]/90 border-[var(--glass-border)] shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-primary)]">
                      <span className="px-1.5 py-0.5 rounded-md bg-[#0A84FF]/10 text-[#0A84FF]">
                        [{src.id}]
                      </span>
                      {getSourceIcon(src.kind)}
                      <span className="truncate max-w-[150px]">{src.domain}</span>
                    </span>

                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#30D158] bg-[#30D158]/10 px-2 py-0.5 rounded-full">
                      <ShieldCheck size={12} />
                      <span>{src.credibility}%</span>
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-[var(--text-primary)] leading-snug mb-1.5">
                    {src.title}
                  </h4>

                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-2 bg-[var(--code-bg)] p-2 rounded-[8px] border border-[var(--code-border)]">
                    &ldquo;{src.snippet}&rdquo;
                  </p>

                  {src.credibilityReason && (
                    <div className="text-[10px] text-[var(--text-tertiary)] mb-2 italic">
                      Audit: {src.credibilityReason}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)] text-[10px]">
                    <span className="text-[var(--text-tertiary)]">
                      {src.publishedAt ? `Published ${src.publishedAt}` : 'Verified Academic Source'}
                    </span>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[#0A84FF] hover:underline"
                    >
                      <span>Read Original</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};
