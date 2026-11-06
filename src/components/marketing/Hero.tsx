'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { APP_NAME } from '@/lib/constants';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Search,
  BookOpen,
  FileText,
} from 'lucide-react';
import { SIGNATURE_EASE, SPRING_SMOOTH } from '@/config/animation';

export const Hero: React.FC = () => {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [simStep, setSimStep] = useState(0);

  const containerRef = useRef<HTMLElement>(null);
  const { scrollY } = useScroll();

  // Scale and fade hero as user scrolls away
  const heroOpacity = useTransform(scrollY, [0, 450], [1, 0.2]);
  const heroScale = useTransform(scrollY, [0, 450], [1, 0.94]);
  const heroY = useTransform(scrollY, [0, 450], [0, -40]);

  // Live Simulation loop
  useEffect(() => {
    const interval = setInterval(() => {
      setSimStep((prev) => (prev + 1) % 5);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (topic.trim()) {
      router.push(`/app?q=${encodeURIComponent(topic.trim())}`);
    } else {
      router.push('/app');
    }
  };

  const simStepsData = [
    {
      title: 'Planning Research Inquiries',
      detail: 'Formulating 4 orthogonal query vectors across peer-reviewed archives...',
      badge: 'Step 1 of 6 · Plan',
      icon: <Sparkles size={14} className="text-[#0A84FF]" />,
    },
    {
      title: 'Searching Academic Repositories',
      detail: 'Harvested 8 papers from arXiv, IEEE Xplore, and Nature Machine Intelligence...',
      badge: 'Step 2 of 6 · Search',
      icon: <Search size={14} className="text-[#5E5CE6]" />,
    },
    {
      title: 'Reading & Parsing Raw Datasets',
      detail: 'Extracting empirical findings, benchmark tables, and methodology limitations...',
      badge: 'Step 3 of 6 · Read',
      icon: <BookOpen size={14} className="text-[#32ADE6]" />,
    },
    {
      title: 'Cross-Checking Evidence & Credibility',
      detail: 'Reconciling claim divergence; scoring structural reliability at 96%...',
      badge: 'Step 4 of 6 · Analyze',
      icon: <ShieldCheck size={14} className="text-[#FF9F0A]" />,
    },
    {
      title: 'Composing Scholarly Synthesis',
      detail: 'Drafted 1,250 words across 4 core sections with 8 verified inline citations...',
      badge: 'Step 5 of 6 · Write',
      icon: <FileText size={14} className="text-[#30D158]" />,
    },
  ];

  return (
    <motion.section
      ref={containerRef}
      style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
      className="relative pt-12 pb-20 md:pt-20 md:pb-28 text-center px-4 max-w-5xl mx-auto space-y-10 will-change-transform"
    >
      {/* Top Floating Badge with Soft Shimmer */}
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.1, ease: SIGNATURE_EASE }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-thin border border-[var(--glass-border)] shadow-xs text-xs font-semibold text-[var(--accent-primary)] glass-sheen"
      >
        <Sparkles size={14} />
        <span>Next-Generation Autonomous Research Intelligence</span>
      </motion.div>

      {/* Main Headline: Masked Word-by-Word Rise */}
      <div className="space-y-4 max-w-4xl mx-auto">
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.08]">
          <span className="inline-block overflow-hidden pb-1">
            <motion.span
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2, ease: SIGNATURE_EASE }}
              className="inline-block"
            >
              Think deeper.
            </motion.span>
          </span>
          <br />
          <span className="inline-block overflow-hidden pb-1">
            <motion.span
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.35, ease: SIGNATURE_EASE }}
              className="inline-block bg-gradient-to-r from-[#0A84FF] via-[#5E5CE6] to-[#0A84FF] bg-clip-text text-transparent"
            >
              Discover further.
            </motion.span>
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45, ease: SIGNATURE_EASE }}
          className="text-lg sm:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed font-normal"
        >
          Autonomous research agent that investigates academic literature, cross-audits factual claims, and synthesizes publication-grade reports with verified inline citations.
        </motion.p>
      </div>

      {/* Interactive Topic Input with Soft Glass Inflation */}
      <motion.form
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ...SPRING_SMOOTH, delay: 0.55 }}
        onSubmit={handleLaunch}
        className="max-w-2xl mx-auto p-2 rounded-full glass-thick border border-[var(--glass-border)] shadow-glass-thick lensing-edge flex items-center gap-2"
      >
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a topic (e.g. State of solid-state lithium-metal batteries)..."
          className="flex-1 bg-transparent px-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none"
        />

        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full text-xs font-semibold bg-gradient-to-r from-[#0A84FF] to-[#5E5CE6] text-white shadow-apple-btn hover:opacity-95 transition-all active:scale-95 flex-shrink-0 glass-sheen"
        >
          <span>Research</span>
          <ArrowRight size={13} />
        </button>
      </motion.form>

      {/* Live Animated Agent Run Simulation Window */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...SPRING_SMOOTH, delay: 0.7 }}
        className="max-w-3xl mx-auto rounded-[28px] glass border border-[var(--glass-border)] shadow-2xl p-4 sm:p-6 text-left space-y-4 ambient-float"
      >
        {/* Window Chrome Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] shadow-xs" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] shadow-xs" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] shadow-xs" />
            </div>
            <span className="text-xs font-semibold text-[var(--text-tertiary)] ml-2">
              {APP_NAME} Research Session · Autonomous Multi-Source Pipeline
            </span>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0A84FF]/10 text-[#0A84FF] text-[11px] font-bold">
            <Loader2 size={11} className="animate-spin" />
            <span>Live Agent Run</span>
          </span>
        </div>

        {/* Dynamic Simulation Card with AnimatePresence */}
        <div className="relative min-h-[140px]">
          <AnimatePresence mode="wait">
            {(() => {
              const currentStep = simStepsData[simStep] ?? simStepsData[0]!;
              return (
                <motion.div
                  key={simStep}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: SIGNATURE_EASE }}
                  className="p-4 rounded-[20px] bg-[var(--bg-surface)]/70 border border-[var(--glass-border)] shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                      {currentStep.badge}
                    </span>
                    <span className="text-[11px] text-[#30D158] font-semibold flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      <span>Telemetry Connected</span>
                    </span>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-7 h-7 rounded-full bg-[var(--bg-surface)] shadow-xs flex items-center justify-center flex-shrink-0 border border-[var(--glass-border)]">
                      {currentStep.icon}
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">
                        {currentStep.title}
                      </h4>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {currentStep.detail}
                      </p>
                    </div>
                  </div>

                  {/* Sample Discovered Sources Chips Preview */}
                  <div className="pt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--glass-border)] shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
                      [S1] arxiv.org · 96%
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--glass-border)] shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
                      [S2] ieee.org · 98%
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--glass-border)] shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
                      [S3] nature.com · 99%
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--glass-border)] shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
                      [S4] stanford.edu · 94%
                    </span>
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.section>
  );
};
