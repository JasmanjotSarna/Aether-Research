'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { ShieldCheck, ArrowRight, ExternalLink, Sparkles, BookOpen } from 'lucide-react';
import { SIGNATURE_EASE, SPRING_BOUNCY, SPRING_SMOOTH, prefersReducedMotion } from '@/config/animation';

export const ReportPreview: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });
  const [activeCitation, setActiveCitation] = useState<string | null>('S1');
  const [typedChars, setTypedChars] = useState(0);

  const sampleSources: Record<string, { title: string; domain: string; score: number; snippet: string }> = {
    S1: {
      title: 'Empirical Evaluation of Emerging Architectures in Distributed AI Systems',
      domain: 'arxiv.org',
      score: 96,
      snippet: 'Cross-cluster benchmarking demonstrates a 34% reduction in memory overhead.',
    },
    S2: {
      title: 'IEEE Transactions on Systems Engineering: Architectural Trade-offs at Scale',
      domain: 'ieee.org',
      score: 98,
      snippet: 'Deterministic caching structures mitigate cold-start degradation across high-throughput endpoints.',
    },
    S3: {
      title: 'Nature Machine Intelligence: Mechanistic Interpretability & Verification',
      domain: 'nature.com',
      score: 99,
      snippet: 'Cross-encoder verification bounds hallucination rates to under 0.8% across technical domains.',
    },
  };

  const fullAbstract =
    'Recent trials establish that solid-state lithium metal interfaces achieve 480 Wh/kg specific energy density when engineered with dynamic polymer interlayers. Factual synthesis cross-references 12 peer-reviewed publications across IEEE, arXiv, and Nature Machine Intelligence with zero claim contradictions.';

  useEffect(() => {
    if (!isInView || prefersReducedMotion()) {
      if (isInView) setTypedChars(fullAbstract.length);
      return;
    }

    let current = 0;
    const interval = setInterval(() => {
      current += 4;
      if (current >= fullAbstract.length) {
        setTypedChars(fullAbstract.length);
        clearInterval(interval);
      } else {
        setTypedChars(current);
      }
    }, 25);

    return () => clearInterval(interval);
  }, [isInView, fullAbstract.length]);

  return (
    <section
      ref={containerRef}
      className="py-20 px-4 max-w-5xl mx-auto space-y-12"
    >
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
          Publication Grade Artifacts
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
          See What Aether Produces
        </h2>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          The paper preview writes itself live on scroll. Interact with citations below to inspect active verification badges.
        </p>
      </div>

      <div className="relative p-6 sm:p-10 rounded-[28px] glass border border-[var(--glass-border)] shadow-2xl text-left space-y-6 overflow-hidden">
        {/* Card Header Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#30D158]/10 text-[#30D158] border border-[#30D158]/20">
              <ShieldCheck size={14} />
              <span>Score: 98/100 · Verified</span>
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">8 sources cited · 1,450 words</span>
          </div>

          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-[#0A84FF] to-[#5E5CE6] text-white shadow-apple-btn hover:opacity-95 transition-all glass-sheen"
          >
            <span>Launch Live Inquiry</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        {/* Report Content Sample */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Paper Text Column */}
          <div className="lg:col-span-8 space-y-4">
            <motion.h3
              initial={{ opacity: 0, y: 15 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, ease: SIGNATURE_EASE }}
              className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight"
            >
              State-of-the-Art Analysis: Solid-State Electrolyte Interfaces
            </motion.h3>

            {/* Self-Writing Executive Abstract */}
            <div className="p-4 rounded-[18px] bg-[var(--accent-primary)]/10 border-l-4 border-[var(--accent-primary)] text-xs sm:text-sm text-[var(--text-primary)] leading-relaxed relative">
              <strong>Executive Abstract</strong>: {fullAbstract.slice(0, typedChars)}
              {typedChars < fullAbstract.length && (
                <span className="inline-block w-1.5 h-3.5 bg-[var(--accent-primary)] ml-1 animate-pulse align-middle" />
              )}

              {/* Popping Citation Chips */}
              <div className="inline-flex items-center gap-1 ml-1.5 align-middle">
                <motion.button
                  type="button"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={typedChars > 80 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                  transition={SPRING_BOUNCY}
                  onClick={() => setActiveCitation('S1')}
                  className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold shadow-xs transition-colors ${
                    activeCitation === 'S1'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--accent-primary)]/30'
                  }`}
                >
                  [S1]
                </motion.button>

                <motion.button
                  type="button"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={typedChars > 160 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                  transition={SPRING_BOUNCY}
                  onClick={() => setActiveCitation('S3')}
                  className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold shadow-xs transition-colors ${
                    activeCitation === 'S3'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--accent-primary)]/30'
                  }`}
                >
                  [S3]
                </motion.button>
              </div>
            </div>

            {/* Sample Table with Staggered Rows */}
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/60">
                    <th className="p-2.5 font-bold text-[var(--text-primary)]">Metric</th>
                    <th className="p-2.5 font-bold text-[var(--text-primary)]">Conventional Liquid Li-ion</th>
                    <th className="p-2.5 font-bold text-[var(--text-primary)]">Solid-State (Current)</th>
                    <th className="p-2.5 font-bold text-[var(--text-primary)]">Attribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <tr>
                    <td className="p-2.5 font-semibold text-[var(--text-primary)]">Energy Density</td>
                    <td className="p-2.5">260 Wh/kg</td>
                    <td className="p-2.5 font-bold text-[var(--accent-primary)]">480 Wh/kg (+84%)</td>
                    <td className="p-2.5 font-bold text-[var(--accent-primary)]">[S1]</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-[var(--text-primary)]">Cycle Degradation (1k)</td>
                    <td className="p-2.5">18.4% capacity loss</td>
                    <td className="p-2.5 font-bold text-[#30D158]">4.1% capacity loss</td>
                    <td className="p-2.5 font-bold text-[var(--accent-primary)]">[S2]</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-[var(--text-primary)]">Thermal Runaway Point</td>
                    <td className="p-2.5">135°C</td>
                    <td className="p-2.5 font-bold text-[#30D158]">310°C (Non-flammable)</td>
                    <td className="p-2.5 font-bold text-[var(--accent-primary)]">[S3]</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Sliding Sources Drawer Preview Column */}
          <div className="lg:col-span-4">
            <motion.div
              initial={{ x: 40, opacity: 0 }}
              animate={isInView ? { x: 0, opacity: 1 } : {}}
              transition={{ ...SPRING_SMOOTH, delay: 0.3 }}
              className="p-4 rounded-[20px] glass border border-[var(--glass-border)] shadow-md space-y-3"
            >
              <div className="flex items-center justify-between text-xs font-bold text-[var(--accent-primary)]">
                <span className="flex items-center gap-1.5">
                  <BookOpen size={13} />
                  <span>Sources Inspector</span>
                </span>
                <span className="text-[#30D158] bg-[#30D158]/10 px-2 py-0.5 rounded-full text-[10px]">
                  Live Audit
                </span>
              </div>

              {activeCitation && sampleSources[activeCitation] && (
                <motion.div
                  key={activeCitation}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="p-3.5 rounded-[14px] bg-[var(--bg-surface)]/80 border border-[var(--accent-primary)]/30 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[var(--accent-primary)]">
                      [{activeCitation}] · {sampleSources[activeCitation].domain}
                    </span>
                    <span className="text-[#30D158] font-bold">
                      {sampleSources[activeCitation].score}%
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)] leading-tight">
                    {sampleSources[activeCitation].title}
                  </h4>
                  <p className="text-[11px] text-[var(--text-secondary)] italic pt-1 border-t border-[var(--border-subtle)]">
                    &ldquo;{sampleSources[activeCitation].snippet}&rdquo;
                  </p>
                </motion.div>
              )}

              <div className="text-[10px] text-[var(--text-tertiary)] flex items-center justify-between pt-1">
                <span>Click citation chips to switch source</span>
                <span className="text-[#30D158] font-semibold">● Verified</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
