'use client';

import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Cpu, BatteryCharging, BrainCircuit, Dna, Network, ArrowUpRight } from 'lucide-react';
import { prefersReducedMotion } from '@/config/animation';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export const HorizontalRail: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const useCases = [
    {
      domain: 'Quantum Computing',
      title: 'Fault-Tolerant Topological Qubit Synthesis',
      icon: <Cpu size={22} className="text-[#0A84FF]" />,
      author: 'Quantum Systems Lab',
      institution: 'arXiv · Nature Physics',
      score: '99/100',
      highlight: 'Benchmarked 14 Majorana zero-mode candidate architectures with zero claim divergence.',
      badgeColor: '#0A84FF',
    },
    {
      domain: 'Energy Storage',
      title: 'Solid-State Lithium Interface Kinetics',
      icon: <BatteryCharging size={22} className="text-[#30D158]" />,
      author: 'Advanced Materials Group',
      institution: 'IEEE Transactions · Science',
      score: '98/100',
      highlight: 'Extracted 480 Wh/kg specific energy metrics and polymer electrolyte impedance thresholds.',
      badgeColor: '#30D158',
    },
    {
      domain: 'Artificial Intelligence',
      title: 'Mechanistic Foundation Model Interpretability',
      icon: <BrainCircuit size={22} className="text-[#5E5CE6]" />,
      author: 'Frontier Alignment Initiative',
      institution: 'OpenReview · NeurIPS',
      score: '97/100',
      highlight: 'Validated sparse autoencoder circuit decomposition with 0.8% hallucination ceiling.',
      badgeColor: '#5E5CE6',
    },
    {
      domain: 'Biotechnology',
      title: 'Targeted mRNA Lipid Nanoparticle Delivery',
      icon: <Dna size={22} className="text-[#FF9F0A]" />,
      author: 'Therapeutics Research Unit',
      institution: 'Nature Medicine · Lancet',
      score: '99/100',
      highlight: 'Reconciled biodistribution assays across 1,200 peer-reviewed patient trial datasets.',
      badgeColor: '#FF9F0A',
    },
    {
      domain: 'Distributed Systems',
      title: 'Byzantine Fault Tolerance at Internet Scale',
      icon: <Network size={22} className="text-[#32ADE6]" />,
      author: 'Consensus Architecture Group',
      institution: 'ACM SIGCOMM · USENIX',
      score: '96/100',
      highlight: 'Synthesized high-throughput partition tolerance across cross-region clusters.',
      badgeColor: '#32ADE6',
    },
  ];

  useEffect(() => {
    if (prefersReducedMotion() || !sectionRef.current || !railRef.current) return;

    const ctx = gsap.context(() => {
      const rail = railRef.current;
      if (!rail) return;

      const totalScroll = rail.scrollWidth - rail.clientWidth;

      if (totalScroll > 0) {
        gsap.to(rail, {
          x: -totalScroll,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top top+=80',
            end: () => `+=${totalScroll + 600}`,
            pin: true,
            scrub: 0.8,
            invalidateOnRefresh: true,
          },
        });
      }
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="use-cases"
      ref={sectionRef}
      className="py-20 px-4 max-w-6xl mx-auto space-y-10 overflow-hidden"
    >
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
          Real-World Investigation
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Pioneering Research Across Disciplines
        </h2>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          From quantum hardware to biomedical therapeutics, Aether powers formal literature audits.
        </p>
      </div>

      {/* Horizontal Scroll Rail */}
      <div
        ref={railRef}
        className="flex gap-6 overflow-x-auto pb-6 pt-2 scrollbar-none cursor-grab active:cursor-grabbing will-change-transform"
      >
        {useCases.map((uc, idx) => (
          <div
            key={idx}
            className="w-[340px] sm:w-[400px] flex-shrink-0 p-7 rounded-[26px] glass border border-[var(--glass-border)] shadow-md hover:shadow-xl transition-all duration-300 space-y-5 text-left relative overflow-hidden glass-sheen"
          >
            <div className="flex items-center justify-between">
              <div
                className="w-11 h-11 rounded-[16px] flex items-center justify-center text-white shadow-xs"
                style={{ backgroundColor: uc.badgeColor }}
              >
                {uc.icon}
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#30D158]/10 text-[#30D158] border border-[#30D158]/20">
                <span>Score: {uc.score}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                {uc.domain}
              </span>
              <h3 className="text-lg font-bold text-[var(--text-primary)] leading-tight tracking-tight">
                {uc.title}
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              {uc.highlight}
            </p>

            <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-[var(--text-primary)] block">
                  {uc.author}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {uc.institution}
                </span>
              </div>

              <span className="w-7 h-7 rounded-full bg-[var(--bg-surface)] flex items-center justify-center text-[var(--text-secondary)] border border-[var(--glass-border)]">
                <ArrowUpRight size={13} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
