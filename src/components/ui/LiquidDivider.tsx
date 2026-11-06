'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const LiquidDivider: React.FC<{ flip?: boolean; className?: string }> = ({
  flip = false,
  className = '',
}) => {
  return (
    <div
      className={`w-full overflow-hidden leading-none pointer-events-none opacity-40 select-none py-4 ${
        flip ? 'rotate-180' : ''
      } ${className}`}
    >
      <svg
        className="relative block w-full h-8 sm:h-12 text-[var(--glass-border)]"
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
        fill="currentColor"
      >
        <path d="M0,0 C150,90 350,-40 500,50 C650,140 900,10 1200,60 L1200,120 L0,120 Z" />
      </svg>
    </div>
  );
};
