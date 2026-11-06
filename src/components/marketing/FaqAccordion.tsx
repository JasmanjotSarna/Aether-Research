'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const FaqAccordion: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: 'How does Aether prevent hallucinations?',
      a: 'Aether executes a deterministic 6-stage pipeline (Plan, Search, Read, Analyze, Write, Review). Before any assertion is drafted, the agent extracts raw empirical data tables from peer-reviewed literature. A secondary cross-encoder verification pass audits that every citation [SX] mathematically corresponds to published findings.',
    },
    {
      q: 'Where are my research sessions and API keys stored?',
      a: 'All conversations and optional API keys (Gemini, Groq, Tavily) are persisted strictly inside your browser’s localStorage and IndexedDB. There are no user logins, server tracking databases, or telemetry cookies.',
    },
    {
      q: 'Can I run Aether completely for free?',
      a: 'Yes. Aether connects out-of-the-box to free tier LLM inference models (such as Meta Llama 3.3 70B via Groq and Google Gemini 2.0 Flash) and free Tavily search APIs, ensuring zero cost to investigate complex research topics.',
    },
    {
      q: 'What is the difference between Quick, Standard, and Deep modes?',
      a: 'Quick Mode delivers rapid 30-second overviews using single-pass retrieval. Standard Mode queries 6–10 multi-domain sources in 1–2 minutes with full claim verification. Deep Mode executes recursive multi-agent inquiry for formal academic theses over 3–5 minutes.',
    },
    {
      q: 'Can I export reports for academic or professional publishing?',
      a: 'Yes. You can export verified reports directly to publication-ready PDF, clean Markdown, or link-free plain text. The PDF exporter formats tables, abstracts, and formal bibliographies according to academic standards.',
    },
  ];

  return (
    <section id="faq" className="py-20 px-4 max-w-4xl mx-auto space-y-10">
      <div className="text-center space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
          Frequently Asked Questions
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Common Inquiries
        </h2>
        <p className="text-sm sm:text-base text-[var(--text-secondary)]">
          Everything you need to know about the architecture and privacy guarantees.
        </p>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              className="rounded-[20px] glass border border-[var(--glass-border)] overflow-hidden shadow-xs transition-all duration-200"
            >
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <span>{faq.q}</span>
                <span className="text-[var(--text-secondary)] flex-shrink-0">
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed border-t border-[var(--border-subtle)] bg-[var(--surface)]">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

