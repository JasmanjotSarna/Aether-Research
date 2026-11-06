'use client';

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mode } from '@/lib/contract';
import { MODES } from '@/lib/constants';
import { ArrowUp, Square, Loader2, Clock } from 'lucide-react';
import { SPRING_BOUNCY, SPRING_SMOOTH } from '@/config/animation';

interface ComposerProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  isRunning?: boolean;
  isWaitingForAnswer?: boolean;
  statusHint?: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const Composer: React.FC<ComposerProps> = ({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  isRunning = false,
  isWaitingForAnswer = false,
  statusHint,
  mode,
  onModeChange,
  disabled = false,
  placeholder = 'What would you like to investigate today?',
  className = '',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to 200px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSubmit();
      }
    }
  };

  const isExecuting = isStreaming && isRunning;
  const hasInput = Boolean(value.trim());

  return (
    <motion.div
      layout
      transition={SPRING_SMOOTH}
      className={`relative w-full rounded-[24px] glass-thick border border-[var(--glass-border)] shadow-glass-thick transition-all duration-300 focus-within:ring-2 focus-within:ring-[var(--accent-primary)]/40 focus-within:shadow-[0_0_24px_rgba(10,132,255,0.22)] ${className}`}
    >
      <div className="p-3 sm:p-4 flex flex-col gap-2.5">
        {/* Dynamic Status Pill (Thinking / Waiting for your answer) */}
        {(statusHint || isWaitingForAnswer || isExecuting) && (
          <div className="flex items-center gap-2 pb-1">
            {isWaitingForAnswer ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FF9F0A]/10 text-[#FF9F0A] border border-[#FF9F0A]/20">
                <Clock size={11} />
                <span>Waiting for your answer</span>
              </span>
            ) : isExecuting ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#0A84FF]/10 text-[#0A84FF] border border-[#0A84FF]/20">
                <Loader2 size={11} className="animate-spin" />
                <span>{statusHint || 'Thinking...'}</span>
              </span>
            ) : statusHint ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                <span>{statusHint}</span>
              </span>
            ) : null}
          </div>
        )}

        {/* Textarea is ALWAYS interactive - never disabled mid-run */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full bg-transparent resize-none border-0 outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-base text-[var(--text-primary)] placeholder-[var(--text-tertiary)] leading-relaxed max-h-[200px] overflow-y-auto appearance-none shadow-none"
        />

        {/* Bottom Toolbar: Mode Pill Selector & Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] gap-2">
          {/* Mode Selector Segmented Pills with sliding layoutId */}
          <div className="flex items-center gap-1 bg-[var(--code-bg)] p-1 rounded-full border border-[var(--border-subtle)] relative">
            {MODES.map((m) => {
              const isSelected = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onModeChange(m.id as Mode)}
                  className={`relative z-10 px-3 py-1 rounded-full text-xs font-semibold transition-colors duration-200 select-none ${
                    isSelected
                      ? 'text-[var(--accent-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title={`${m.name}: ${m.description} (${m.duration})`}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="active-composer-mode"
                      transition={{ ...SPRING_SMOOTH, duration: 0.25 }}
                      className="absolute inset-0 bg-[var(--bg-surface)] rounded-full border border-[var(--glass-border)] shadow-xs -z-10"
                    />
                  )}
                  <span>{m.name}</span>
                </button>
              );
            })}
          </div>

          {/* Action Buttons: Stop button and/or Send button */}
          <div className="flex items-center gap-1.5">
            {isExecuting && onStop && (
              <motion.button
                key="stop-btn"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={SPRING_BOUNCY}
                type="button"
                onClick={onStop}
                className="relative flex items-center justify-center w-8 h-8 rounded-full bg-[#FF453A] text-white shadow-md hover:opacity-90 active:scale-90"
                title="Stop current research run"
                aria-label="Stop generation"
              >
                <Square size={12} fill="currentColor" />
              </motion.button>
            )}

            <motion.button
              key="send-btn"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING_BOUNCY}
              type="button"
              onClick={onSubmit}
              disabled={!hasInput || disabled}
              className={`flex items-center justify-center w-8 h-8 rounded-full text-white shadow-apple-btn transition-all duration-200 active:scale-95 glass-sheen ${
                hasInput
                  ? 'bg-gradient-to-r from-[#0A84FF] to-[#5E5CE6] hover:opacity-95 cursor-pointer'
                  : 'bg-[var(--border-subtle)] opacity-40 cursor-not-allowed'
              }`}
              title={
                isExecuting
                  ? 'Send feedback & redirect research (Enter)'
                  : 'Send message / Submit inquiry (Enter)'
              }
              aria-label="Send message"
            >
              <ArrowUp size={16} strokeWidth={2.6} />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
