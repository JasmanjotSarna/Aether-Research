'use client';

import React from 'react';

export type GlassTier = 'thin' | 'default' | 'thick';
export type GlassRadius = '14' | '20' | '28' | 'pill' | 'none';

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  tier?: GlassTier;
  radius?: GlassRadius;
  lensing?: boolean;
  sheen?: boolean;
  interactive?: boolean;
  children?: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  tier = 'default',
  radius = '20',
  lensing = false,
  sheen = false,
  interactive = false,
  children,
  className = '',
  as: Component = 'div',
  ...rest
}) => {
  const tierClasses = {
    thin: 'glass-thin',
    default: 'glass',
    thick: 'glass-thick',
  }[tier];

  const radiusClasses = {
    '14': 'rounded-[14px]',
    '20': 'rounded-[20px]',
    '28': 'rounded-[28px]',
    pill: 'rounded-full',
    none: 'rounded-none',
  }[radius];

  const interactiveClasses = interactive
    ? 'transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0'
    : '';

  const lensingClasses = lensing ? 'lensing-edge' : '';
  const sheenClasses = sheen ? 'specular-sheen' : '';

  return (
    <Component
      className={`${tierClasses} ${radiusClasses} ${interactiveClasses} ${lensingClasses} ${sheenClasses} ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
};

