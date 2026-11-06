/**
 * Central Animation System for Aether Research
 * High-end Apple / Awwwards design engineering tokens.
 * All animations prioritize compositor properties (transform, opacity) at 60fps.
 */

// Signature Apple fluid cubic bezier
export const SIGNATURE_EASE = [0.16, 1, 0.3, 1] as const;
export const SIGNATURE_EASE_CSS = 'cubic-bezier(0.16, 1, 0.3, 1)';

// GSAP ease equivalents
export const GSAP_EASE = 'power3.out';
export const GSAP_EASE_EXPO = 'expo.out';

// Framer Motion Spring Presets
export const SPRING_TRANSITION = {
  type: 'spring',
  damping: 28,
  stiffness: 320,
  mass: 0.8,
} as const;

export const SPRING_SMOOTH = {
  type: 'spring',
  damping: 34,
  stiffness: 240,
  mass: 1,
} as const;

export const SPRING_BOUNCY = {
  type: 'spring',
  damping: 18,
  stiffness: 380,
  mass: 0.7,
} as const;

export const SPRING_SNAPPY = {
  type: 'spring',
  damping: 24,
  stiffness: 420,
  mass: 0.6,
} as const;

// Standard Durations (in seconds)
export const DURATION = {
  micro: 0.15,
  fast: 0.25,
  normal: 0.45,
  slow: 0.75,
  cinematic: 1.2,
  intro: 2.4,
} as const;

// Stagger Presets
export const STAGGER = {
  fast: 0.04,
  normal: 0.08,
  slow: 0.14,
} as const;

/**
 * Check if the user has requested reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Perform a circular view-transition reveal from a trigger element
 * (Apple-style theme switch, zero mouse tracking)
 */
export function triggerCircularThemeTransition(
  triggerElement: HTMLElement | null,
  callback: () => void
) {
  if (typeof document === 'undefined') {
    callback();
    return;
  }

  // If browser does not support View Transitions or reduced motion is requested
  const doc = document as unknown as {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  };

  if (!doc.startViewTransition || prefersReducedMotion()) {
    callback();
    return;
  }

  let x = window.innerWidth / 2;
  let y = 40;

  if (triggerElement) {
    const rect = triggerElement.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  }

  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const transition = doc.startViewTransition(callback);

  transition.ready.then(() => {
    document.documentElement.animate(
      [
        { clipPath: `circle(0px at ${x}px ${y}px)` },
        { clipPath: `circle(${endRadius}px at ${x}px ${y}px)` },
      ],
      {
        duration: 480,
        easing: SIGNATURE_EASE_CSS,
        pseudoElement: '::view-transition-new(root)',
      }
    );
  }).catch(() => {
    // Graceful fallback if animation is cancelled
  });
}
