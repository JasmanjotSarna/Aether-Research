import React from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { ArrowLeft, ShieldCheck, Lock, Database, EyeOff } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen py-12 px-4 max-w-4xl mx-auto space-y-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <BrandLogo size="md" />
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold glass-thin hover:bg-[var(--surface-hover)] text-[var(--text-primary)] transition-all"
        >
          <ArrowLeft size={13} />
          <span>Return to Workspace</span>
        </Link>
      </div>

      {/* Main Privacy Card */}
      <div className="p-8 sm:p-12 rounded-[28px] glass border border-[var(--glass-border)] shadow-glass space-y-8 text-left">
        <div className="space-y-2 border-b border-[var(--border-subtle)] pb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#30D158]/10 text-[#30D158] text-xs font-bold">
            <ShieldCheck size={14} />
            <span>Strict Privacy Architecture</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text-primary)] tracking-tight">
            Privacy Policy & Data Principles
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Last updated: November 2026 · {APP_NAME} Autonomous Intelligence
          </p>
        </div>

        <div className="space-y-6 text-xs sm:text-sm text-[var(--text-primary)] leading-relaxed">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-[#0A84FF]/10 text-[#0A84FF] flex-shrink-0 mt-0.5">
              <EyeOff size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">
                1. Zero User Tracking & No Login Accounts
              </h3>
              <p className="text-[var(--text-secondary)]">
                {APP_NAME} does not require an email address, login credentials, or personal telemetry. We do not track your IP address, use marketing cookies, or fingerprint user environments.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-[#5E5CE6]/10 text-[#5E5CE6] flex-shrink-0 mt-0.5">
              <Database size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">
                2. Local Browser-Only Persistence
              </h3>
              <p className="text-[var(--text-secondary)]">
                All research histories, generated papers, and query vectors are stored entirely on your local machine using standard browser <code>localStorage</code> and <code>IndexedDB</code> APIs. Clearing your browser data immediately purges all research records.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-[#30D158]/10 text-[#30D158] flex-shrink-0 mt-0.5">
              <Lock size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">
                3. Direct Client-Held API Keys
              </h3>
              <p className="text-[var(--text-secondary)]">
                When you optionally configure custom LLM or search provider keys (e.g., Google Gemini, Groq, or Tavily), those keys are saved strictly on your local device. They are forwarded exclusively via HTTPS headers directly to verify request quotas.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-[#FF9F0A]/10 text-[#FF9F0A] flex-shrink-0 mt-0.5">
              <ShieldCheck size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">
                4. Academic Provenance Verification
              </h3>
              <p className="text-[var(--text-secondary)]">
                All sources fetched during research execution originate from public academic indexes and open-web publications. No private intranet resources are probed without explicit operator configuration.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-[var(--border-subtle)] text-xs text-[var(--text-tertiary)] text-center">
          Inquiries regarding security policy can be directed to the open-source repository governance board.
        </div>
      </div>
    </main>
  );
}

