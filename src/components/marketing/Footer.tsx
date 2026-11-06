'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { APP_NAME, APP_DESCRIPTION } from '@/lib/constants';
import { SIGNATURE_EASE } from '@/config/animation';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-[var(--border-subtle)] bg-[var(--glass-bg)] backdrop-blur-md py-14 px-4 mt-20 relative overflow-hidden">
      <div className="max-w-5xl mx-auto space-y-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="space-y-1">
            <BrandLogo size="sm" />
            <p className="text-xs text-[var(--text-tertiary)] max-w-sm">
              {APP_DESCRIPTION}. Built for rigorous academic exploration and evidence cross-verification.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-[var(--text-secondary)]">
            <Link href="/app" className="hover:text-[var(--text-primary)] transition-colors">
              Workspace
            </Link>
            <a href="#features" className="hover:text-[var(--text-primary)] transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[var(--text-primary)] transition-colors">
              How it works
            </a>
            <a href="#pipeline" className="hover:text-[var(--text-primary)] transition-colors">
              Pipeline
            </a>
            <a href="#use-cases" className="hover:text-[var(--text-primary)] transition-colors">
              Use Cases
            </a>
            <Link href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">
              Privacy Policy
            </Link>
          </div>

          <div className="text-xs text-[var(--text-tertiary)] space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#30D158]/10 text-[#30D158] font-semibold text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
              <span>Operational · V2 Engine</span>
            </div>
            <div>© {new Date().getFullYear()} {APP_NAME} Research. All rights reserved.</div>
          </div>
        </div>

        {/* Big Wordmark Scroll Reveal */}
        <div className="pt-8 overflow-hidden text-center select-none pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 0.12, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: SIGNATURE_EASE }}
            className="text-6xl sm:text-8xl md:text-9xl font-black tracking-widest text-[var(--text-primary)] uppercase"
          >
            A E T H E R
          </motion.div>
        </div>
      </div>
    </footer>
  );
};
