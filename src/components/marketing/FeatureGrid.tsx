'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  FileCheck2,
  Search,
  MessageSquare,
  Download,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { SIGNATURE_EASE, prefersReducedMotion } from '@/config/animation';

// Animated Counter Component
const AnimatedCounter: React.FC<{ target: number; suffix?: string; prefix?: string; duration?: number }> = ({
  target,
  suffix = '',
  prefix = '',
  duration = 1.6,
}) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  useEffect(() => {
    if (!isInView || prefersReducedMotion()) {
      if (isInView) setCount(target);
      return;
    }

    let start = 0;
    const startTime = performance.now();

    const update = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const progress = Math.min(1, elapsed / duration);
      // Apple ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(start + (target - start) * eased));

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        setCount(target);
      }
    };

    requestAnimationFrame(update);
  }, [isInView, target, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {count}
      {suffix}
    </span>
  );
};

export const FeatureGrid: React.FC = () => {
  const features = [
    {
      icon: <FileCheck2 size={20} className="text-[#0A84FF]" />,
      stat: <AnimatedCounter target={98} suffix="%" />,
      statLabel: 'Citation Grounding',
      title: 'Cited Academic Reports',
      description:
        'Every factual claim is directly attributed to verified literature using interactive [SX] superscript chips with instant popovers.',
    },
    {
      icon: <Search size={20} className="text-[#5E5CE6]" />,
      stat: <AnimatedCounter target={12} prefix="Up to " suffix=" Sources" />,
      statLabel: 'Multi-Archive Pull',
      title: 'Multi-Source Retrieval',
      description:
        'Simultaneously searches academic archives, institutional preprints, technical standards, and verified documentation feeds.',
    },
    {
      icon: <MessageSquare size={20} className="text-[#32ADE6]" />,
      stat: <AnimatedCounter target={100} suffix="% Recall" />,
      statLabel: 'Context Memory',
      title: 'Follow-up Inquiries & Q&A',
      description:
        'Conversational intelligence remembers report context. Request targeted expansions, deeper proof derivations, or concise summaries.',
    },
    {
      icon: <Download size={20} className="text-[#30D158]" />,
      stat: <AnimatedCounter target={4} suffix=" Formats" />,
      statLabel: 'Vector PDF / Markdown',
      title: 'Institutional PDF Export',
      description:
        'Download publication-grade PDFs with academic formatting, bibliography tables, and clean print styles with zero glass clutter.',
    },
    {
      icon: <Lock size={20} className="text-[#FF9F0A]" />,
      stat: <AnimatedCounter target={0} suffix=" Cookies" />,
      statLabel: 'Browser-Only Storage',
      title: '100% Free & Private',
      description:
        'No sign-up or session accounts required. All conversation histories and optional API keys remain securely inside your browser.',
    },
    {
      icon: <ShieldCheck size={20} className="text-[#FF453A]" />,
      stat: <AnimatedCounter target={96} suffix="/100 Quality" />,
      statLabel: 'Hallucination Gate',
      title: 'Autonomous Claim Auditing',
      description:
        'Multi-agent cross-verification bounds hallucinations by verifying that citations match actual published empirical figures.',
    },
  ];

  return (
    <section id="features" className="py-20 px-4 max-w-5xl mx-auto space-y-12">
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
          Core Capabilities
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Engineered for Rigorous Inquiries
        </h2>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          Combining the analytical rigor of academic literature reviews with the responsiveness of modern AI agents.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {features.map((feat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 35, filter: 'blur(10px)' }}
            whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{
              duration: 0.6,
              delay: (idx % 3) * 0.12,
              ease: SIGNATURE_EASE,
            }}
            className="p-6 rounded-[24px] glass border border-[var(--glass-border)] shadow-xs hover:shadow-lg transition-all duration-300 hover:-translate-y-1.5 space-y-4 text-left relative overflow-hidden glass-sheen group"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-[14px] bg-[var(--bg-surface)] shadow-xs flex items-center justify-center border border-[var(--glass-border)] group-hover:scale-110 transition-transform duration-300">
                {feat.icon}
              </div>

              <div className="text-right">
                <span className="text-base font-extrabold text-[var(--text-primary)] block tracking-tight">
                  {feat.stat}
                </span>
                <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                  {feat.statLabel}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                {feat.title}
              </h3>

              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                {feat.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
