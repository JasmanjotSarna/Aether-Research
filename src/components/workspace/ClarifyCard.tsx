'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClarifyPayload, ClarifyAnswer, ClarifyQuestion } from '@/lib/contract';
import { Sparkles, Check, HelpCircle, ArrowRight, Clock, AlertCircle, Wrench } from 'lucide-react';
import { SPRING_SMOOTH, SPRING_BOUNCY } from '@/config/animation';

interface ClarifyCardProps {
  payload: ClarifyPayload;
  answersSummary?: ClarifyAnswer[] | null;
  onSubmitAnswers: (answers: ClarifyAnswer[]) => void;
  disabled?: boolean;
}

export const ClarifyCard: React.FC<ClarifyCardProps> = ({
  payload,
  answersSummary,
  onSubmitAnswers,
  disabled = false,
}) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [activeOtherQuestionId, setActiveOtherQuestionId] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(20);
  const [isTimedOut, setIsTimedOut] = useState<boolean>(false);

  // 20s timeout countdown indicator
  useEffect(() => {
    if (answersSummary || disabled) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsTimedOut(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [answersSummary, disabled]);

  const handleSelectOption = (questionId: string, option: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: option,
    }));
    if (activeOtherQuestionId === questionId) {
      setActiveOtherQuestionId(null);
    }
  };

  const handleCustomInputChange = (questionId: string, text: string) => {
    setCustomInputs((prev) => ({ ...prev, [questionId]: text }));
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: text }));
  };

  const handleDecideForMe = (questionId: string) => {
    handleSelectOption(questionId, 'Decide for me');
  };

  const handleDecideAll = () => {
    const allDefaults: Record<string, string> = {};
    payload.questions.forEach((q) => {
      allDefaults[q.id] = q.options[0] || 'Decide for me';
    });
    setSelectedAnswers(allDefaults);
  };

  const handleSubmit = () => {
    const answers: ClarifyAnswer[] = payload.questions.map((q) => {
      const answerVal = selectedAnswers[q.id]?.trim() || q.options[0] || 'Decide for me';
      return {
        questionId: q.id,
        question: q.question,
        answer: answerVal,
      };
    });
    onSubmitAnswers(answers);
  };

  // If already answered, render tidy "Your choices" summary card
  if (answersSummary && answersSummary.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SMOOTH}
        className="w-full max-w-3xl mx-auto p-4 sm:p-5 rounded-[22px] glass border border-[var(--glass-border)] shadow-glass space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-[#30D158]/20 flex items-center justify-center text-[#30D158]">
              <Check size={12} strokeWidth={3} />
            </div>
            <span className="text-xs font-bold text-[var(--text-primary)]">Your Scoping Choices</span>
          </div>
          <span className="text-[11px] font-medium text-[#30D158] bg-[#30D158]/10 px-2 py-0.5 rounded-full border border-[#30D158]/20">
            Specifications Locked
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {answersSummary.map((item, idx) => (
            <div
              key={idx}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium glass-thin text-[var(--text-primary)] border border-[var(--glass-border)]"
            >
              <span className="text-[var(--text-secondary)] font-normal">
                {item.question?.split(' ')[0] || `Scope`}:
              </span>
              <span className="font-semibold text-[var(--accent-primary)]">
                {Array.isArray(item.answer) ? item.answer.join(', ') : item.answer}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  // Active Clarification Form Card (All questions in ONE card)
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={SPRING_SMOOTH}
      className="w-full max-w-3xl mx-auto p-5 sm:p-7 rounded-[26px] glass-thick border border-[var(--glass-border)] shadow-glass-thick space-y-5"
    >
      {/* Header & Status Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#0A84FF] to-[#5E5CE6] flex items-center justify-center text-white shadow-xs">
            <Sparkles size={14} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Research Scope Specifications</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {payload.intro || 'Calibrate parameters to ensure highest empirical quality'}
            </p>
          </div>
        </div>

        {/* 20-second timeout hint */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] glass-thin px-2.5 py-1 rounded-full border border-[var(--glass-border)]">
          <Clock size={12} className={isTimedOut ? 'text-[#FF9F0A]' : 'text-[var(--accent-primary)]'} />
          <span>
            {isTimedOut ? (
              <span className="text-[#FF9F0A] font-semibold">Ready to proceed</span>
            ) : (
              <span>Waiting for answer ({secondsRemaining}s)</span>
            )}
          </span>
        </div>
      </div>

      {/* Limitation Notice (if present) */}
      {payload.notice && (
        <div className="flex items-start gap-2.5 p-3 rounded-[16px] bg-[#FF9F0A]/10 border border-[#FF9F0A]/20 text-xs text-[var(--text-primary)]">
          <AlertCircle size={15} className="text-[#FF9F0A] shrink-0 mt-0.5" />
          <span>{payload.notice}</span>
        </div>
      )}

      {/* Questions List */}
      <div className="space-y-5">
        {payload.questions.map((q, qIndex) => {
          const currentAnswer = selectedAnswers[q.id];
          const isOtherOpen = activeOtherQuestionId === q.id;

          return (
            <div key={q.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[var(--code-bg)] text-[10px] font-bold flex items-center justify-center text-[var(--accent-primary)]">
                    {qIndex + 1}
                  </span>
                  <span>{q.question}</span>
                </span>

                <button
                  type="button"
                  onClick={() => handleDecideForMe(q.id)}
                  disabled={disabled}
                  className="text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors underline-offset-2 hover:underline"
                >
                  Decide for me
                </button>
              </div>

              {/* Options Pills */}
              <div className="flex flex-wrap gap-2 pt-0.5">
                {q.options.map((opt) => {
                  const isSelected = currentAnswer === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSelectOption(q.id, opt)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 active:scale-95 ${
                        isSelected
                          ? 'bg-[var(--accent-primary)] text-white shadow-apple-btn border border-transparent'
                          : 'glass-thin text-[var(--text-primary)] hover:bg-white/15 dark:hover:bg-white/10 border border-[var(--glass-border)]'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}

                {/* Other / Custom Option */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setActiveOtherQuestionId(isOtherOpen ? null : q.id);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isOtherOpen || (currentAnswer && !q.options.includes(currentAnswer))
                      ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/40 font-semibold'
                      : 'glass-thin text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--glass-border)]'
                  }`}
                >
                  Other...
                </button>
              </div>

              {/* Inline Other Input Field */}
              <AnimatePresence>
                {(isOtherOpen || (currentAnswer && !q.options.includes(currentAnswer) && isOtherOpen)) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-1.5 overflow-hidden"
                  >
                    <input
                      type="text"
                      disabled={disabled}
                      value={customInputs[q.id] || ''}
                      onChange={(e) => handleCustomInputChange(q.id, e.target.value)}
                      placeholder="Specify your custom preference..."
                      className="w-full bg-[var(--bg-input)] px-3.5 py-2 rounded-[14px] text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] border border-[var(--glass-border)] outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30 transition-all"
                      autoFocus
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Action Footer with Submit and Quick Fallback */}
      <div className="flex flex-wrap items-center justify-between pt-4 border-t border-[var(--border-subtle)] gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={handleDecideAll}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition-colors"
        >
          Decide all for me
        </button>

        <div className="flex items-center gap-2">
          {isTimedOut && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleDecideAll}
              className="px-3 py-2 rounded-full text-xs font-semibold glass text-[var(--text-primary)] border border-[var(--glass-border)] hover:bg-white/10 transition-all"
            >
              Use Defaults
            </button>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold bg-gradient-to-r from-[#0A84FF] to-[#5E5CE6] text-white shadow-apple-btn hover:opacity-95 active:scale-95 transition-all"
          >
            <span>Submit Specifications</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

