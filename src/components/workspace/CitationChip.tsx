'use client';

import React, { useState } from 'react';
import { Source } from '@/lib/contract';
import { ExternalLink, ShieldCheck, Globe, GraduationCap, BookOpen, FileText } from 'lucide-react';

interface CitationChipProps {
  sourceId: string;
  source?: Source;
  onClick?: (sourceId: string) => void;
}

export const CitationChip: React.FC<CitationChipProps> = ({
  sourceId,
  source,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const getSourceIcon = (kind?: string) => {
    switch (kind) {
      case 'academic':
        return <GraduationCap size={11} className="text-[#5E5CE6]" />;
      case 'encyclopedia':
        return <BookOpen size={11} className="text-[#32ADE6]" />;
      case 'docs':
        return <FileText size={11} className="text-[#30D158]" />;
      default:
        return <Globe size={11} className="text-[#0A84FF]" />;
    }
  };

  return (
    <span className="relative inline-block align-baseline mx-0.5">
      <button
        type="button"
        onClick={() => onClick?.(sourceId)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 -translate-y-1 text-[11px] font-semibold text-[#0A84FF] glass-thin rounded-full hover:bg-white/15 hover:text-[#5E5CE6] transition-all duration-200 border border-[var(--glass-border)] shadow-xs cursor-pointer select-none"
        title={source?.title || `Citation ${sourceId}`}
        aria-label={`Source citation ${sourceId}`}
      >
        <span>[{sourceId}]</span>
      </button>

      {/* Floating Glass Popover on Hover */}
      {isHovered && source && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 glass-thick rounded-[16px] border border-[var(--glass-border)] shadow-glass-thick text-left animate-in fade-in zoom-in-95 duration-150 pointer-events-auto"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)]">
              {getSourceIcon(source.kind)}
              <span>{source.id} · {source.kind}</span>
            </span>

            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#30D158] bg-[#30D158]/10 px-1.5 py-0.5 rounded-full">
              <ShieldCheck size={11} />
              <span>{source.credibility}%</span>
            </span>
          </div>

          <h4 className="text-xs font-bold text-[var(--text-primary)] line-clamp-2 leading-snug mb-1">
            {source.title}
          </h4>

          <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed mb-2">
            &ldquo;{source.snippet}&rdquo;
          </p>

          <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-tertiary)]">
            <span className="font-medium text-[var(--text-primary)] truncate max-w-[140px]">{source.domain}</span>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[#0A84FF] hover:underline font-semibold"
              onClick={(e) => e.stopPropagation()}
            >
              <span>Visit</span>
              <ExternalLink size={9} />
            </a>
          </div>
        </div>
      )}
    </span>
  );
};
