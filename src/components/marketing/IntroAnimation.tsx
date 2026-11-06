'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { prefersReducedMotion, SIGNATURE_EASE, SPRING_TRANSITION } from '@/config/animation';

const SESSION_KEY = 'aether_intro_shown';

export const IntroAnimation: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<'drop' | 'ripple' | 'morph' | 'wordmark' | 'exit'>('drop');

  const finishIntro = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, 'true');
    } catch {
      // Ignore sessionStorage errors
    }
    setVisible(false);
    if (onComplete) onComplete();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aether-intro-complete'));
    }
  }, [onComplete]);

  useEffect(() => {
    // Check if user already saw the intro in this session or prefers reduced motion
    try {
      const alreadyShown = sessionStorage.getItem(SESSION_KEY);
      if (alreadyShown || prefersReducedMotion()) {
        if (onComplete) onComplete();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aether-intro-complete'));
        }
        return;
      }
    } catch {
      // Fallback
    }

    // Auto-dismiss if opened in background tab
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      finishIntro();
      return;
    }

    setVisible(true);

    const t1 = setTimeout(() => setPhase('ripple'), 400);
    const t2 = setTimeout(() => setPhase('morph'), 700);
    const t3 = setTimeout(() => setPhase('wordmark'), 1050);
    const t4 = setTimeout(() => setPhase('exit'), 1500);
    const t5 = setTimeout(() => finishIntro(), 1800);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        finishIntro();
      }
    };

    const handleUserInteraction = () => {
      finishIntro();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleUserInteraction, { once: true, passive: true });
    window.addEventListener('touchstart', handleUserInteraction, { once: true, passive: true });

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
    };
  }, [finishIntro, onComplete]);

  const letters = ['A', 'E', 'T', 'H', 'E', 'R'];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="intro-curtain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.35, ease: SIGNATURE_EASE }}
          onClick={finishIntro}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--bg-base)]/50 backdrop-blur-lg cursor-pointer select-none"
        >
          {/* Skip Pill Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              finishIntro();
            }}
            className="absolute top-6 right-6 px-4 py-1.5 rounded-full text-xs font-semibold glass border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-white/10 transition-all flex items-center gap-1.5 shadow-md"
          >
            <span>Skip</span>
            <span className="text-[10px] opacity-70">Esc</span>
          </button>

          {/* Liquid Glass Droplet and Logo Area */}
          <div className="relative flex flex-col items-center justify-center">
            {/* Expanding Liquid Ripples */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {phase !== 'drop' && (
                <svg className="w-64 h-64 overflow-visible" viewBox="0 0 200 200">
                  <motion.circle
                    cx="100"
                    cy="100"
                    initial={{ r: 10, opacity: 0.9, strokeWidth: 4 }}
                    animate={{ r: 90, opacity: 0, strokeWidth: 0.5 }}
                    transition={{ duration: 1.0, ease: 'easeOut' }}
                    fill="none"
                    stroke="var(--accent-primary)"
                  />
                  <motion.circle
                    cx="100"
                    cy="100"
                    initial={{ r: 5, opacity: 0.8, strokeWidth: 3 }}
                    animate={{ r: 75, opacity: 0, strokeWidth: 0.5 }}
                    transition={{ duration: 0.9, delay: 0.1, ease: 'easeOut' }}
                    fill="none"
                    stroke="var(--accent-gradient-end)"
                  />
                </svg>
              )}
            </div>

            {/* Liquid Falling Droplet & Morphing Logo Mark */}
            <div className="relative w-24 h-24 flex items-center justify-center mb-6">
              {phase === 'drop' ? (
                <motion.div
                  initial={{ y: -80, scaleX: 0.8, scaleY: 1.25, opacity: 1 }}
                  animate={{ y: 0, scaleX: [0.8, 1.3, 1], scaleY: [1.25, 0.7, 1], opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.33, 0, 0.67, 1] }}
                  className="w-9 h-9 rounded-full bg-gradient-to-tr from-[var(--accent-primary)] to-[var(--accent-gradient-end)] shadow-lg shadow-[var(--accent-primary)]/50 relative"
                >
                  {/* Droplet Highlight */}
                  <div className="absolute top-1 left-1.5 w-2.5 h-2 rounded-full bg-white/80" />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ scale: 0.4, rotate: -45, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={SPRING_TRANSITION}
                  className="relative flex items-center justify-center"
                >
                  {/* Glowing Aura */}
                  <div className="absolute -inset-4 rounded-full bg-[var(--accent-primary)]/30 blur-xl animate-pulse" />

                  {/* 4-point Spark Logo */}
                  <svg
                    className="w-16 h-16 drop-shadow-md text-[var(--accent-primary)]"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4772 12 22C12 16.4772 16.4772 12 22 12C16.4772 12 12 7.52285 12 2Z"
                      fill="url(#intro-spark-gradient)"
                    />
                    <defs>
                      <linearGradient id="intro-spark-gradient" x1="2" y1="2" x2="22" y2="22">
                        <stop offset="0%" stopColor="#0A84FF" />
                        <stop offset="100%" stopColor="#5E5CE6" />
                      </linearGradient>
                    </defs>
                  </svg>
                </motion.div>
              )}
            </div>

            {/* Staggered Wordmark Letters */}
            <div className="flex items-center gap-2 overflow-hidden h-12">
              {letters.map((char, idx) => (
                <motion.span
                  key={idx}
                  initial={{ y: 35, opacity: 0, filter: 'blur(6px)' }}
                  animate={
                    phase === 'wordmark' || phase === 'exit'
                      ? { y: 0, opacity: 1, filter: 'blur(0px)' }
                      : { y: 35, opacity: 0, filter: 'blur(6px)' }
                  }
                  transition={{
                    duration: 0.35,
                    delay: idx * 0.04,
                    ease: SIGNATURE_EASE,
                  }}
                  className="text-3xl sm:text-4xl font-extrabold tracking-widest text-[var(--text-primary)]"
                >
                  {char}
                </motion.span>
              ))}
            </div>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={
                phase === 'wordmark' || phase === 'exit'
                  ? { opacity: 0.85, y: 0 }
                  : { opacity: 0, y: 10 }
              }
              transition={{ duration: 0.4, delay: 0.25 }}
              className="text-xs sm:text-sm font-medium tracking-wide text-[var(--text-secondary)] mt-2"
            >
              Autonomous Research Intelligence
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
