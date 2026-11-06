'use client';

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Sliders, Search, ShieldCheck, FileText, CheckCircle2, ArrowRight } from 'lucide-react';
import { prefersReducedMotion, SIGNATURE_EASE } from '@/config/animation';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export const HowItWorks: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      num: '01',
      phase: 'Formulation',
      icon: <Sliders size={20} className="text-[#0A84FF]" />,
      title: 'Decompose Inquiry Scope',
      shortTitle: 'Deconstruct Scope',
      description:
        'The agent analyzes the prompt, formulates an objective, and produces 4 orthogonal search vectors across semantic axes to prevent confirmation bias.',
      metrics: '4 Orthogonal Facets · Zero Confirmation Bias',
      outputPreview: 'Target query matrix structured for multi-domain coverage',
      badgeColor: '#0A84FF',
    },
    {
      num: '02',
      phase: 'Harvesting',
      icon: <Search size={20} className="text-[#5E5CE6]" />,
      title: 'Multi-Source Evidence Harvesting',
      shortTitle: 'Evidence Harvesting',
      description:
        'Concurrently queries peer-reviewed archives, standards bodies, and authoritative documentation to harvest raw empirical corpora without rate degradation.',
      metrics: 'arXiv · IEEE Xplore · Nature · PubMed',
      outputPreview: '8–14 verified candidate papers extracted and tokenized',
      badgeColor: '#5E5CE6',
    },
    {
      num: '03',
      phase: 'Cross-Audit',
      icon: <ShieldCheck size={20} className="text-[#FF9F0A]" />,
      title: 'Claim Auditing & Reconciling',
      shortTitle: 'Claim Cross-Audit',
      description:
        'Extracts numerical assertions, cross-references conflicting findings, and rates publisher credibility from 0 to 100 with secondary cross-encoder checks.',
      metrics: '0–100 Credibility Scoring · Claim Discrepancy Audits',
      outputPreview: 'Truth table with validated statistical bounds',
      badgeColor: '#FF9F0A',
    },
    {
      num: '04',
      phase: 'Synthesis',
      icon: <FileText size={20} className="text-[#30D158]" />,
      title: 'Executive Synthesis & PDF Delivery',
      shortTitle: 'Verified Synthesis',
      description:
        'Drafts formatted markdown with clickable [SX] citations, an academic quality score, and one-click PDF/Markdown export with mathematical rigor.',
      metrics: 'Publication-Ready Markdown & Vector PDF Export',
      outputPreview: 'Fully referenced white paper ready for review',
      badgeColor: '#30D158',
    },
  ];

  useEffect(() => {
    if (prefersReducedMotion() || !containerRef.current || !pinRef.current) {
      return;
    }

    const ctx = gsap.context(() => {
      // Create scroll-driven pinned storytelling
      ScrollTrigger.create({
        trigger: containerRef.current,
        start: 'top top+=80',
        end: '+=1600',
        pin: pinRef.current,
        scrub: 0.5,
        onUpdate: (self) => {
          const progress = self.progress;
          const stepIndex = Math.min(3, Math.floor(progress * 4));
          setActiveStep(stepIndex);

          // Update SVG path draw
          const path = document.getElementById('how-progress-line');
          if (path) {
            const length = 280;
            const drawLength = length * progress;
            path.style.strokeDashoffset = `${length - drawLength}`;
          }
        },
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const current = steps[activeStep] ?? steps[0]!;

  return (
    <section
      id="how-it-works"
      ref={containerRef}
      className="relative py-20 px-4 max-w-5xl mx-auto space-y-12"
    >
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
          Execution Flow
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
          How Aether Researches
        </h2>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          Four automated passes transforming raw questions into verified technical intelligence.
        </p>
      </div>

      {/* Pinned Container for Desktop Scroll Choreography */}
      <div ref={pinRef} className="w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center min-h-[440px]">
          {/* Left Column: Progress Line & Step Milestones */}
          <div className="lg:col-span-5 relative space-y-6">
            {/* SVG Connecting Track Line */}
            <div className="absolute left-6 top-6 bottom-6 w-0.5 pointer-events-none hidden lg:block">
              <svg className="h-full w-2" viewBox="0 0 2 280" fill="none">
                <line x1="1" y1="0" x2="1" y2="280" stroke="var(--border-subtle)" strokeWidth="2" />
                <line
                  id="how-progress-line"
                  x1="1"
                  y1="0"
                  x2="1"
                  y2="280"
                  stroke="var(--accent-primary)"
                  strokeWidth="2.5"
                  strokeDasharray="280"
                  strokeDashoffset="280"
                />
              </svg>
            </div>

            {/* Step Indicators */}
            <div className="space-y-4">
              {steps.map((st, idx) => {
                const isActive = activeStep === idx;
                return (
                  <button
                    key={st.num}
                    type="button"
                    onClick={() => setActiveStep(idx)}
                    className={`w-full flex items-center gap-4 p-3.5 rounded-[20px] transition-all duration-300 text-left ${
                      isActive
                        ? 'glass border border-[var(--glass-border)] shadow-md translate-x-2'
                        : 'opacity-50 hover:opacity-80'
                    }`}
                  >
                    <div
                      className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300 flex-shrink-0 ${
                        isActive
                          ? 'bg-[var(--accent-primary)] text-white shadow-md scale-110'
                          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--glass-border)]'
                      }`}
                    >
                      {st.num}
                    </div>

                    <div className="flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                        Phase {idx + 1} · {st.phase}
                      </span>
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">
                        {st.shortTitle}
                      </h4>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Dynamic Stage Showcase Card */}
          <div className="lg:col-span-7">
            <div className="p-6 sm:p-8 rounded-[28px] glass border border-[var(--glass-border)] shadow-glass-thick relative overflow-hidden text-left space-y-6">
              {/* Header Badge */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-10 h-10 rounded-[14px] flex items-center justify-center shadow-xs text-white"
                    style={{ backgroundColor: current.badgeColor }}
                  >
                    {current.icon}
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Phase {activeStep + 1} of 4
                    </span>
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">
                      {current.title}
                    </h3>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--glass-border)] text-[var(--text-primary)]">
                  <CheckCircle2 size={13} className="text-[#30D158]" />
                  <span>Deterministic Audit</span>
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {current.description}
              </p>

              {/* Telemetry & Metrics Box */}
              <div className="p-4 rounded-[18px] bg-[var(--bg-surface)]/70 border border-[var(--glass-border)] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--text-tertiary)] uppercase text-[10px]">
                    Pipeline Vector
                  </span>
                  <span className="font-semibold text-[var(--accent-primary)]">
                    {current.metrics}
                  </span>
                </div>
                <div className="text-xs font-medium text-[var(--text-primary)] pt-1 border-t border-[var(--border-subtle)] flex items-center gap-2">
                  <ArrowRight size={12} className="text-[var(--accent-primary)]" />
                  <span>{current.outputPreview}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
