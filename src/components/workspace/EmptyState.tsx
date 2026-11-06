'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Mode } from '@/lib/contract';
import { APP_NAME, APP_TAGLINE, MODES, SUGGESTED_RESEARCH_PROMPTS } from '@/lib/constants';
import { Composer } from './Composer';
import { Sparkles, ArrowRight } from 'lucide-react';
import { SIGNATURE_EASE, SPRING_SMOOTH, SPRING_BOUNCY } from '@/config/animation';

interface EmptyStateProps {
  input: string;
  onInputChange: (val: string) => void;
  onSubmit: (prompt: string) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  isStreaming?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  input,
  onInputChange,
  onSubmit,
  mode,
  onModeChange,
  isStreaming = false,
}) => {
  const words = ['What', 'would', 'you', 'like', 'to', 'discover', 'today?'];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-6 sm:py-8 px-4 max-w-3xl mx-auto text-center space-y-8">
      {/* Brand Descriptor & Tagline */}
      <div className="space-y-3">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: SIGNATURE_EASE }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass-thin border border-[var(--glass-border)] shadow-xs text-xs font-semibold text-[var(--accent-primary)] glass-sheen"
        >
          <Sparkles size={13} />
          <span>{APP_NAME} Research Intelligence</span>
        </motion.div>

        {/* Word-by-Word Masked Reveal */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight flex flex-wrap justify-center gap-x-2.5">
          {words.map((word, idx) => (
            <span key={idx} className="inline-block overflow-hidden">
              <motion.span
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  duration: 0.6,
                  delay: 0.08 + idx * 0.04,
                  ease: SIGNATURE_EASE,
                }}
                className="inline-block"
              >
                {word}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: SIGNATURE_EASE }}
          className="text-base sm:text-lg text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed"
        >
          {APP_TAGLINE} Investigate evidence, cross-reference academic publications, and generate peer-reviewed reports.
        </motion.p>
      </div>

      {/* Hero Big Glass Composer with Inflate Spring */}
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ...SPRING_SMOOTH, delay: 0.45 }}
        className="w-full"
      >
        <Composer
          value={input}
          onChange={onInputChange}
          onSubmit={() => onSubmit(input)}
          mode={mode}
          onModeChange={onModeChange}
          isStreaming={isStreaming}
          placeholder="Ask a complex research question or enter a topic..."
          className="shadow-2xl"
        />
      </motion.div>

      {/* Mode One-Line Descriptions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        className="text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-2"
      >
        <span className="font-semibold text-[var(--text-primary)]">
          {MODES.find((m) => m.id === mode)?.name} Mode:
        </span>
        <span>{MODES.find((m) => m.id === mode)?.description}</span>
      </motion.div>

      {/* Staggered Floating Suggestion Chips */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="w-full space-y-3"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Suggested Inquiries
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
          {SUGGESTED_RESEARCH_PROMPTS.map((item, idx) => (
            <motion.button
              key={idx}
              type="button"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.65 + idx * 0.06,
                ease: SIGNATURE_EASE,
              }}
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onInputChange(item.title);
                onModeChange(item.mode);
                onSubmit(item.title);
              }}
              className="group p-3.5 rounded-[18px] glass hover:bg-white/10 dark:hover:bg-white/5 border border-[var(--glass-border)] shadow-xs transition-all duration-200 hover:shadow-md flex items-center justify-between gap-3 text-left glass-sheen"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors truncate">
                  {item.title}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)] truncate">
                  {item.subtitle}
                </span>
              </div>

              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--bg-subtle)] group-hover:bg-[var(--accent-primary)] group-hover:text-white flex items-center justify-center text-[var(--text-tertiary)] transition-colors shadow-xs">
                <ArrowRight size={12} />
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
