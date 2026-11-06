'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ResearchSpec, CitationStyle } from '@/lib/contract';
import { FileText, Check, Play, BookOpen, Layers, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { SPRING_SMOOTH, SPRING_BOUNCY } from '@/config/animation';

interface ProposalCardProps {
  spec: ResearchSpec;
  summary?: string;
  onApprove: (approvedSpec: ResearchSpec) => void;
  isApproved?: boolean;
  disabled?: boolean;
}

export const ProposalCard: React.FC<ProposalCardProps> = ({
  spec,
  summary,
  onApprove,
  isApproved = false,
  disabled = false,
}) => {
  const [currentSpec, setCurrentSpec] = useState<ResearchSpec>(spec);
  const [isOutlineExpanded, setIsOutlineExpanded] = useState<boolean>(true);

  const handleAdjustPages = (delta: number) => {
    setCurrentSpec((prev) => {
      const newPages = Math.max(2, Math.min(40, prev.pages + delta));
      // Proportionally scale outline
      const scale = newPages / prev.pages;
      const updatedOutline = prev.outline.map((item) => ({
        ...item,
        pages: Math.max(0.5, Math.round(item.pages * scale * 10) / 10),
      }));
      return {
        ...prev,
        pages: newPages,
        outline: updatedOutline,
      };
    });
  };

  const handleCitationStyleChange = (style: CitationStyle) => {
    setCurrentSpec((prev) => ({
      ...prev,
      citationStyle: style,
    }));
  };

  if (isApproved) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SMOOTH}
        className="w-full max-w-3xl mx-auto p-4 rounded-[22px] glass border border-[var(--glass-border)] shadow-glass space-y-2"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-[#30D158]/20 flex items-center justify-center text-[#30D158]">
              <Check size={12} strokeWidth={3} />
            </div>
            <span className="text-xs font-bold text-[var(--text-primary)]">Research Plan Approved</span>
          </div>
          <span className="text-[11px] font-semibold text-[#0A84FF] bg-[#0A84FF]/10 px-2.5 py-0.5 rounded-full border border-[#0A84FF]/20">
            {currentSpec.pages} A4 Pages · {currentSpec.outline.length} Sections
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          {summary || `Execution authorized for ${currentSpec.topic}. Multi-pass autonomous investigation active.`}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={SPRING_SMOOTH}
      className="w-full max-w-3xl mx-auto p-5 sm:p-7 rounded-[26px] glass-thick border border-[var(--glass-border)] shadow-glass-thick space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#30D158] to-[#0A84FF] flex items-center justify-center text-white shadow-xs">
            <BookOpen size={14} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Research Blueprint & Proposal</h3>
            <p className="text-xs text-[var(--text-secondary)]">Review outline and parameters before starting</p>
          </div>
        </div>

        <span className="text-xs font-semibold px-2.5 py-1 rounded-full glass-thin text-[var(--accent-primary)] border border-[var(--glass-border)]">
          Awaiting Approval
        </span>
      </div>

      {/* Summary Brief */}
      {summary && (
        <p className="text-xs text-[var(--text-primary)] leading-relaxed p-3.5 rounded-[16px] glass-thin border border-[var(--glass-border)]">
          {summary}
        </p>
      )}

      {/* Parameter Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-[16px] glass-thin border border-[var(--glass-border)] space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Volume</span>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-primary)]">{currentSpec.pages} A4 Pages</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleAdjustPages(-1)}
                disabled={disabled || currentSpec.pages <= 2}
                className="w-5 h-5 rounded-full glass text-[var(--text-primary)] flex items-center justify-center text-xs font-bold hover:bg-white/20 disabled:opacity-40"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => handleAdjustPages(1)}
                disabled={disabled || currentSpec.pages >= 30}
                className="w-5 h-5 rounded-full glass text-[var(--text-primary)] flex items-center justify-center text-xs font-bold hover:bg-white/20 disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-[16px] glass-thin border border-[var(--glass-border)] space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Audience</span>
          <p className="text-xs font-bold text-[var(--text-primary)] truncate" title={currentSpec.audience}>
            {currentSpec.audience}
          </p>
        </div>

        <div className="p-3 rounded-[16px] glass-thin border border-[var(--glass-border)] space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Tone</span>
          <p className="text-xs font-bold text-[var(--text-primary)] truncate" title={currentSpec.tone}>
            {currentSpec.tone}
          </p>
        </div>

        <div className="p-3 rounded-[16px] glass-thin border border-[var(--glass-border)] space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Citations</span>
          <div className="flex items-center gap-1">
            {(['numbered', 'apa', 'ieee'] as CitationStyle[]).map((style) => (
              <button
                key={style}
                type="button"
                disabled={disabled}
                onClick={() => handleCitationStyleChange(style)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase transition-colors ${
                  currentSpec.citationStyle === style
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Planned Sections Outline */}
      <div className="space-y-2">
        <div
          onClick={() => setIsOutlineExpanded(!isOutlineExpanded)}
          className="flex items-center justify-between cursor-pointer select-none text-xs font-bold text-[var(--text-primary)]"
        >
          <span className="flex items-center gap-1.5 text-[var(--accent-primary)]">
            <Layers size={13} />
            <span>Planned Paper Structure ({currentSpec.outline.length} Sections)</span>
          </span>
          <span className="text-[11px] font-medium text-[var(--text-secondary)] flex items-center gap-1">
            <span>{isOutlineExpanded ? 'Collapse' : 'Expand'}</span>
            {isOutlineExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        </div>

        {isOutlineExpanded && (
          <div className="space-y-1.5 p-3 rounded-[18px] bg-[var(--code-bg)] border border-[var(--border-subtle)] max-h-52 overflow-y-auto">
            {currentSpec.outline.map((sec, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-3 py-1.5 rounded-[12px] glass-thin text-xs text-[var(--text-primary)] border border-[var(--glass-border)]"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-[10px] font-bold text-[var(--accent-primary)]">{idx + 1}.</span>
                  <span className="font-medium truncate">{sec.heading}</span>
                </div>
                <span className="text-[11px] text-[var(--text-tertiary)] shrink-0 ml-2">
                  ~{sec.pages} pg
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end pt-3 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onApprove(currentSpec)}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold bg-gradient-to-r from-[#0A84FF] to-[#5E5CE6] text-white shadow-apple-btn hover:opacity-95 active:scale-95 transition-all"
        >
          <Play size={13} fill="currentColor" />
          <span>Approve Blueprint & Run Research</span>
        </button>
      </div>
    </motion.div>
  );
};

