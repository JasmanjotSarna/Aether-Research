'use client';

import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Sliders,
  Search,
  BookOpen,
  Sparkles,
  FileText,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { prefersReducedMotion } from '@/config/animation';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export const PipelineVisual: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeStage, setActiveStage] = useState(0);

  const pipelineStages = [
    {
      id: 'plan',
      name: 'Plan',
      icon: <Sliders size={16} />,
      color: '#0A84FF',
      role: 'Inquiry Architect',
      objective: 'Formulate scope, subtopics, and search vectors.',
      output: 'Structured Research Plan with targeted query matrix',
    },
    {
      id: 'search',
      name: 'Search',
      icon: <Search size={16} />,
      color: '#5E5CE6',
      role: 'Evidence Harvester',
      objective: 'Query multi-domain repositories and academic indexes.',
      output: '6–12 authoritative candidate publications & preprints',
    },
    {
      id: 'read',
      name: 'Read',
      icon: <BookOpen size={16} />,
      color: '#32ADE6',
      role: 'Corpus Digestion',
      objective: 'Extract empirical benchmark tables, figures, and author assertions.',
      output: 'Raw unstructured findings parsed into semantic memory',
    },
    {
      id: 'analyze',
      name: 'Analyze',
      icon: <Sparkles size={16} />,
      color: '#FF9F0A',
      role: 'Claim Cross-Auditor',
      objective: 'Identify contradictions, statistical anomalies, and methodology bounds.',
      output: 'Reconciled truth table with 0–100 credibility scores',
    },
    {
      id: 'write',
      name: 'Write',
      icon: <FileText size={16} />,
      color: '#30D158',
      role: 'Synthesis Composer',
      objective: 'Draft executive abstract and structured academic sections.',
      output: 'Structured Markdown with strictly bound [SX] citations',
    },
    {
      id: 'review',
      name: 'Review',
      icon: <ShieldCheck size={16} />,
      color: '#0A84FF',
      role: 'Quality Inspector',
      objective: 'Audit every assertion for proof and compile PDF export.',
      output: 'Audited Technical Report with Quality Score (e.g. 96/100)',
    },
  ];

  useEffect(() => {
    if (prefersReducedMotion() || !sectionRef.current) return;

    const ctx = gsap.context(() => {
      // Connect scroll progress to pipeline sequence
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top center+=100',
        end: 'bottom center',
        scrub: 0.5,
        onUpdate: (self) => {
          const index = Math.min(5, Math.floor(self.progress * 6));
          setActiveStage(index);

          // Update SVG line draw
          const path = document.getElementById('pipeline-draw-path');
          const pulse = document.getElementById('pipeline-data-pulse');
          if (path) {
            const total = 900;
            const drawOffset = total * (1 - self.progress);
            path.style.strokeDashoffset = `${drawOffset}`;

            if (pulse) {
              const xPos = 40 + self.progress * 820;
              pulse.setAttribute('cx', `${xPos}`);
            }
          }
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="pipeline"
      ref={sectionRef}
      className="py-20 px-4 max-w-5xl mx-auto space-y-12"
    >
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
          System Architecture
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
          The Autonomous 6-Stage Pipeline
        </h2>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          Every inquiry executes through a deterministic multi-agent state machine to eliminate hallucinations.
        </p>
      </div>

      {/* SVG Connecting Track with Pulse for Desktop */}
      <div className="relative w-full max-w-4xl mx-auto hidden md:block px-4">
        <svg className="w-full h-8 overflow-visible" viewBox="0 0 900 32">
          {/* Background track line */}
          <line
            x1="40"
            y1="16"
            x2="860"
            y2="16"
            stroke="var(--border-subtle)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* Animated drawn path */}
          <line
            id="pipeline-draw-path"
            x1="40"
            y1="16"
            x2="860"
            y2="16"
            stroke="url(#pipeline-gradient)"
            strokeWidth="3.5"
            strokeDasharray="900"
            strokeDashoffset="900"
            strokeLinecap="round"
          />
          {/* Data Pulse travelling along the line */}
          <circle
            id="pipeline-data-pulse"
            cx="40"
            cy="16"
            r="6"
            fill="#0A84FF"
            filter="url(#pulse-glow)"
          />

          <defs>
            <linearGradient id="pipeline-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0A84FF" />
              <stop offset="50%" stopColor="#5E5CE6" />
              <stop offset="100%" stopColor="#30D158" />
            </linearGradient>
            <filter id="pulse-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
            </filter>
          </defs>
        </svg>
      </div>

      {/* Pipeline Navigation Nodes */}
      <div className="p-2 rounded-full glass border border-[var(--glass-border)] shadow-xs flex items-center justify-between overflow-x-auto gap-2">
        {pipelineStages.map((st, idx) => {
          const isSelected = activeStage === idx;
          const isPassed = activeStage >= idx;

          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setActiveStage(idx)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 flex-shrink-0 select-none ${
                isSelected
                  ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] shadow-md scale-105 border border-[var(--glass-border)]'
                  : isPassed
                  ? 'text-[var(--text-primary)] hover:bg-white/5'
                  : 'text-[var(--text-secondary)] opacity-60 hover:opacity-100'
              }`}
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] shadow-xs"
                style={{ backgroundColor: st.color }}
              >
                {st.icon}
              </span>
              <span>{st.name}</span>
            </button>
          );
        })}
      </div>

      {/* Active Stage Detailed Card */}
      {(() => {
        const currentStage = pipelineStages[activeStage] ?? pipelineStages[0]!;
        return (
          <div className="p-6 md:p-8 rounded-[28px] glass border border-[var(--glass-border)] shadow-glass text-left space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-[14px] flex items-center justify-center text-white shadow-xs"
                  style={{ backgroundColor: currentStage.color }}
                >
                  {currentStage.icon}
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Stage {activeStage + 1} of 6 · {currentStage.role}
                  </span>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    {currentStage.name} Phase
                  </h3>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--glass-border)] shadow-xs">
                <CheckCircle2 size={13} className="text-[#30D158]" />
                <span>Deterministic Protocol</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
              <div className="p-4 rounded-[18px] bg-[var(--bg-surface)]/70 border border-[var(--glass-border)] space-y-1">
                <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">
                  Primary Objective
                </span>
                <p className="text-xs sm:text-sm font-medium text-[var(--text-primary)]">
                  {currentStage.objective}
                </p>
              </div>

              <div className="p-4 rounded-[18px] bg-[var(--bg-surface)]/70 border border-[var(--glass-border)] space-y-1">
                <span className="text-[10px] font-bold uppercase text-[var(--accent-primary)]">
                  Artifact Output
                </span>
                <p className="text-xs sm:text-sm font-medium text-[var(--text-primary)]">
                  {currentStage.output}
                </p>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
};
