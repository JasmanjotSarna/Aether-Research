import React from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { ArrowLeft, SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
      <div className="p-8 sm:p-12 rounded-[28px] glass border border-[var(--glass-border)] shadow-glass max-w-md w-full space-y-6">
        <div className="w-14 h-14 mx-auto rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
          <SearchX size={26} />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
            404 Error
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            Inquiry Not Found
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            The page or research artifact you requested does not exist or has been cleared from local storage.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-semibold bg-gradient-to-r from-[#0A84FF] to-[#5E5CE6] text-white shadow-apple-btn hover:opacity-95 transition-all"
          >
            <ArrowLeft size={14} />
            <span>Return to Workspace</span>
          </Link>
        </div>
      </div>
    </main>
  );
}

