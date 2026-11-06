'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, useScroll, useSpring } from 'framer-motion';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { QuickThemeToggle } from '@/components/ui/ThemeToggle';
import { ArrowRight, Menu, X } from 'lucide-react';
import { SPRING_SMOOTH, SIGNATURE_EASE } from '@/config/animation';

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...SPRING_SMOOTH, delay: 0.2 }}
      className="sticky top-4 z-40 w-full max-w-5xl mx-auto px-4 transition-all duration-300"
    >
      <nav
        className={`relative flex items-center justify-between px-5 rounded-full glass-thick border border-[var(--glass-border)] shadow-glass-thick lensing-edge overflow-hidden transition-all duration-300 ${
          isScrolled ? 'py-2.5 backdrop-blur-3xl shadow-xl' : 'py-3.5 backdrop-blur-xl'
        }`}
      >
        {/* Scroll Progress Bar across Top Rim of Navbar */}
        <motion.div
          style={{ scaleX }}
          className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-[var(--accent-primary)] via-[#5E5CE6] to-[#30D158] origin-left z-20 pointer-events-none opacity-90"
        />

        {/* Logo */}
        <BrandLogo size="md" />

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-7 text-xs font-semibold text-[var(--text-secondary)]">
          <a
            href="#features"
            className="hover:text-[var(--text-primary)] hover:scale-105 transition-all duration-200"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="hover:text-[var(--text-primary)] hover:scale-105 transition-all duration-200"
          >
            How it works
          </a>
          <a
            href="#pipeline"
            className="hover:text-[var(--text-primary)] hover:scale-105 transition-all duration-200"
          >
            Pipeline
          </a>
          <a
            href="#use-cases"
            className="hover:text-[var(--text-primary)] hover:scale-105 transition-all duration-200"
          >
            Use Cases
          </a>
          <a
            href="#faq"
            className="hover:text-[var(--text-primary)] hover:scale-105 transition-all duration-200"
          >
            FAQ
          </a>
        </div>

        {/* Quick Theme Toggle & CTA Button */}
        <div className="flex items-center gap-2">
          <QuickThemeToggle />

          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-r from-[#0A84FF] to-[#5E5CE6] text-white shadow-apple-btn hover:opacity-95 transition-all active:scale-95 glass-sheen"
          >
            <span>Open Aether</span>
            <ArrowRight size={13} />
          </Link>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-secondary)]"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.2, ease: SIGNATURE_EASE }}
          className="md:hidden mt-2 p-4 rounded-[20px] glass-thick border border-[var(--glass-border)] shadow-2xl flex flex-col gap-3 text-xs font-semibold text-[var(--text-primary)]"
        >
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 hover:bg-white/10 rounded-[10px]"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 hover:bg-white/10 rounded-[10px]"
          >
            How it works
          </a>
          <a
            href="#pipeline"
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 hover:bg-white/10 rounded-[10px]"
          >
            Pipeline
          </a>
          <a
            href="#use-cases"
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 hover:bg-white/10 rounded-[10px]"
          >
            Use Cases
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 hover:bg-white/10 rounded-[10px]"
          >
            FAQ
          </a>
        </motion.div>
      )}
    </motion.header>
  );
};
