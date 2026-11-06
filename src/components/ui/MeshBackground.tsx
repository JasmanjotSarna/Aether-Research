'use client';

import React from 'react';

/**
 * Ambient Liquid Glass mesh background with drifting blurred orbs.
 * In Light Mode: Bright pastel mesh on #F5F7FB with mix-blend-multiply.
 * In Dark Mode: Deep near-black (#0B0B12) with dimmer indigo/violet/teal/magenta at ~35% opacity.
 */
export const MeshBackground: React.FC = () => {
  return (
    <div
      className="mesh-background-container pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[var(--bg-base)] transition-colors duration-250"
      aria-hidden="true"
    >
      {/* Orb 1 (Top Right: Sky Blue in light, Indigo/Blue in dark) */}
      <div
        className="absolute -top-[10%] -right-[5%] h-[550px] w-[550px] rounded-full blur-[125px] animate-drift-slow"
        style={{
          background: 'var(--orb-1)',
          mixBlendMode: 'var(--mesh-mix-blend)' as React.CSSProperties['mixBlendMode'],
        }}
      />

      {/* Orb 2 (Top Left / Center: Lilac in light, Violet in dark) */}
      <div
        className="absolute top-[15%] -left-[10%] h-[600px] w-[600px] rounded-full blur-[130px] animate-drift-reverse"
        style={{
          background: 'var(--orb-2)',
          mixBlendMode: 'var(--mesh-mix-blend)' as React.CSSProperties['mixBlendMode'],
          animationDuration: '38s',
        }}
      />

      {/* Orb 3 (Bottom Right: Peach in light, Magenta in dark) */}
      <div
        className="absolute -bottom-[15%] right-[10%] h-[520px] w-[520px] rounded-full blur-[115px] animate-drift-slow"
        style={{
          background: 'var(--orb-3)',
          mixBlendMode: 'var(--mesh-mix-blend)' as React.CSSProperties['mixBlendMode'],
          animationDuration: '32s',
        }}
      />

      {/* Orb 4 (Bottom Left: Mint in light, Teal in dark) */}
      <div
        className="absolute bottom-[5%] -left-[5%] h-[480px] w-[480px] rounded-full blur-[120px] animate-drift-reverse"
        style={{
          background: 'var(--orb-4)',
          mixBlendMode: 'var(--mesh-mix-blend)' as React.CSSProperties['mixBlendMode'],
          animationDuration: '28s',
        }}
      />

      {/* Center Subtle Glow */}
      <div
        className="absolute top-[45%] left-[35%] h-[400px] w-[400px] rounded-full blur-[140px] animate-pulse-subtle"
        style={{
          background: 'var(--orb-5)',
          mixBlendMode: 'var(--mesh-mix-blend)' as React.CSSProperties['mixBlendMode'],
        }}
      />
    </div>
  );
};
