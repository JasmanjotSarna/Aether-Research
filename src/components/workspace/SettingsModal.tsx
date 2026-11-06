'use client';

import React, { useState, useEffect } from 'react';
import { HealthResponse } from '@/lib/contract';
import { X, Key, ShieldCheck, Activity, Check, ExternalLink, Palette, Database } from 'lucide-react';
import { ThemeSegmentedControl } from '@/components/ui/ThemeToggle';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);

  // Load stored keys from localStorage
  useEffect(() => {
    if (isOpen) {
      setOpenrouterKey(localStorage.getItem('aether_openrouter_key') || '');
      setGroqKey(localStorage.getItem('aether_groq_key') || '');
      setTavilyKey(localStorage.getItem('aether_tavily_key') || '');

      // Check /api/health
      setIsLoadingHealth(true);
      fetch('/api/health')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setHealth(data);
        })
        .catch(() => {
          // Fallback mock health for offline
          setHealth({
            llm: { groq: true, openrouter: false },
            search: { tavily: true, keyless: true },
            model: 'llama-3.3-70b-versatile',
          });
        })
        .finally(() => setIsLoadingHealth(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (openrouterKey.trim()) {
      localStorage.setItem('aether_openrouter_key', openrouterKey.trim());
    } else {
      localStorage.removeItem('aether_openrouter_key');
    }

    if (groqKey.trim()) {
      localStorage.setItem('aether_groq_key', groqKey.trim());
    } else {
      localStorage.removeItem('aether_groq_key');
    }

    if (tavilyKey.trim()) {
      localStorage.setItem('aether_tavily_key', tavilyKey.trim());
    } else {
      localStorage.removeItem('aether_tavily_key');
    }

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg p-6 rounded-[28px] glass-thick border border-[var(--glass-border)] shadow-glass-thick space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-full bg-[#0A84FF]/15 text-[#0A84FF]">
              <Key size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Workspace Settings</h3>
              <p className="text-xs text-[var(--text-secondary)]">Appearance, Local Storage & API Keys</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 1. Theme Control (Appearance) */}
        <div className="p-4 rounded-[18px] glass border border-[var(--glass-border)] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette size={15} className="text-[#0A84FF]" />
              <span className="text-xs font-bold text-[var(--text-primary)]">Theme Appearance</span>
            </div>
            <ThemeSegmentedControl />
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            Choose between System (follows OS preference live), pure Light Liquid Glass, or deep iOS-style Dark Liquid Glass.
          </p>
        </div>

        {/* 2. Privacy & Storage Notice */}
        <div className="p-3.5 rounded-[16px] glass border border-[var(--glass-border)] flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
          <Database size={15} className="text-[#5E5CE6] shrink-0 mt-0.5" />
          <div className="leading-relaxed text-[11px]">
            <strong className="text-[var(--text-primary)] block mb-0.5">Zero Account · Complete Local Privacy</strong>
            Chats are saved in this browser only (no account, no cost). Export a backup to move them to another device.
          </div>
        </div>

        {/* 3. Live Engine Status Banner */}
        <div className="p-3.5 rounded-[16px] glass border border-[var(--glass-border)] shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity size={16} className="text-[#30D158]" />
            <div>
              <span className="text-xs font-bold text-[var(--text-primary)] block">
                Engine Telemetry
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">
                Active Provider:{' '}
                <span className="font-semibold text-[#0A84FF]">
                  {health?.model || 'llama-3.3-70b-versatile'}
                </span>
              </span>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#30D158] bg-[#30D158]/10 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
            Active
          </span>
        </div>

        {/* 4. API Keys Form */}
        <form onSubmit={handleSave} className="space-y-4 pt-1">
          <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
            API keys are optional. When provided, they are stored <strong>strictly inside your browser&rsquo;s localStorage</strong> and sent directly as custom request headers (<code className="text-[#0A84FF]">x-groq-key</code>, <code className="text-[#0A84FF]">x-openrouter-key</code>, <code className="text-[#0A84FF]">x-tavily-key</code>).
          </div>

          {/* OpenRouter API Key */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center justify-between">
              <span>OpenRouter API Key (GPT-4o, Claude 3.5, Gemini)</span>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-[#0A84FF] hover:underline inline-flex items-center gap-0.5"
              >
                <span>openrouter.ai/keys</span>
                <ExternalLink size={9} />
              </a>
            </label>
            <input
              type="password"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full bg-[var(--bg-input)] px-3 py-2 rounded-[12px] text-xs text-[var(--text-primary)] border border-[var(--glass-border)] outline-none focus:ring-2 focus:ring-[#0A84FF]/25"
            />
          </div>

          {/* Groq API Key */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center justify-between">
              <span>Groq Cloud API Key (Optional free tier)</span>
              <a
                href="https://console.groq.com/"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-[#0A84FF] hover:underline inline-flex items-center gap-0.5"
              >
                <span>console.groq.com</span>
                <ExternalLink size={9} />
              </a>
            </label>
            <input
              type="password"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full bg-[var(--bg-input)] px-3 py-2 rounded-[12px] text-xs text-[var(--text-primary)] border border-[var(--glass-border)] outline-none focus:ring-2 focus:ring-[#0A84FF]/25"
            />
          </div>

          {/* Tavily Search Key */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center justify-between">
              <span>Tavily Search API Key (Optional)</span>
              <a
                href="https://tavily.com/"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-[#0A84FF] hover:underline inline-flex items-center gap-0.5"
              >
                <span>tavily.com</span>
                <ExternalLink size={9} />
              </a>
            </label>
            <input
              type="password"
              value={tavilyKey}
              onChange={(e) => setTavilyKey(e.target.value)}
              placeholder="tvly-..."
              className="w-full bg-[var(--bg-input)] px-3 py-2 rounded-[12px] text-xs text-[var(--text-primary)] border border-[var(--glass-border)] outline-none focus:ring-2 focus:ring-[#0A84FF]/25"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-semibold bg-gradient-to-r from-[#0A84FF] to-[#5E5CE6] text-white shadow-apple-btn hover:opacity-95 transition-all active:scale-95"
            >
              {savedSuccess ? (
                <>
                  <Check size={13} />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save Settings</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
