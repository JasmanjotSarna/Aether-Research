import React from 'react';

/**
 * Invisible SVG defining the Liquid Glass refraction lensing filter
 * using feTurbulence and feDisplacementMap.
 */
export const RefractionFilter: React.FC = () => {
  return (
    <svg
      className="pointer-events-none fixed -top-[9999px] -left-[9999px] h-0 w-0 opacity-0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="liquid-glass-lens" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04 0.08"
            numOctaves="2"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="4"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
};

