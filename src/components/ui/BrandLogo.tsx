import React from 'react';
import Link from 'next/link';
import { APP_NAME } from '@/lib/constants';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  withLink?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  withLink = true,
  className = '',
}) => {
  const iconSizes = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  }[size];

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
  }[size];

  const content = (
    <div className={`flex items-center gap-2.5 font-semibold tracking-tight text-[var(--text-primary)] select-none ${className}`}>
      {/* Liquid Glass Apple Emblem */}
      <div
        className={`${iconSizes} relative flex items-center justify-center rounded-[10px] bg-gradient-to-br from-[#0A84FF] to-[#5E5CE6] text-white shadow-apple-btn border border-white/30 overflow-hidden`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 drop-shadow-sm"
        >
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
        <div className="absolute inset-x-0 top-0 h-1/2 bg-white/20 pointer-events-none" />
      </div>

      <div className="flex flex-col">
        <span className={`${textSizes} font-bold tracking-tight text-[var(--text-primary)]`}>{APP_NAME}</span>
      </div>
    </div>
  );

  if (withLink) {
    return (
      <Link href="/" className="inline-flex items-center transition-opacity hover:opacity-85">
        {content}
      </Link>
    );
  }

  return content;
};
