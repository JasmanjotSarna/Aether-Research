'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Conversation } from '@/hooks/useChatStore';
import { BrandLogo } from '@/components/ui/BrandLogo';
import {
  Plus,
  Search,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  Edit2,
  Check,
  X,
  FileText,
  Loader2,
} from 'lucide-react';
import { SPRING_SMOOTH } from '@/config/animation';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewResearch: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeId,
  onSelect,
  onNewResearch,
  onDelete,
  onRename,
  onOpenSettings,
  searchQuery,
  onSearchChange,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = (id: string, e?: React.FormEvent) => {
    e?.preventDefault();
    if (editingTitle.trim()) {
      onRename(id, editingTitle);
    }
    setEditingId(null);
  };

  // Chronological grouping
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groups = {
    today: filtered.filter((c) => new Date(c.createdAt).getTime() >= todayStart),
    yesterday: filtered.filter(
      (c) =>
        new Date(c.createdAt).getTime() >= yesterdayStart &&
        new Date(c.createdAt).getTime() < todayStart
    ),
    previous: filtered.filter((c) => new Date(c.createdAt).getTime() < yesterdayStart),
  };

  const renderConversationItem = (conv: Conversation) => {
    const isActive = conv.id === activeId;
    const isEditing = editingId === conv.id;
    const isRunning = Boolean(conv.isStreaming && conv.status === 'running');

    if (isCollapsed) {
      return (
        <motion.button
          key={conv.id}
          layout
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={() => onSelect(conv.id)}
          className={`w-10 h-10 mx-auto rounded-[12px] flex items-center justify-center transition-all ${
            isActive
              ? 'bg-[var(--accent-primary)] text-white shadow-apple-btn'
              : 'text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)]'
          }`}
          title={conv.title}
        >
          {isRunning ? (
            <Loader2 size={16} className="animate-spin text-white" />
          ) : (
            <FileText size={16} />
          )}
        </motion.button>
      );
    }

    return (
      <motion.div
        key={conv.id}
        layout
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={SPRING_SMOOTH}
        onClick={() => {
          onSelect(conv.id);
          onCloseMobile();
        }}
        className={`group relative flex items-center justify-between px-3 py-2 rounded-[14px] text-xs font-medium cursor-pointer transition-all duration-150 select-none ${
          isActive
            ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] shadow-xs font-semibold border border-[var(--glass-border)]'
            : 'text-[var(--text-primary)] hover:bg-white/10 dark:hover:bg-white/5'
        }`}
      >
        {isEditing ? (
          <form
            onSubmit={(e) => handleSaveRename(conv.id, e)}
            className="flex items-center gap-1 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              autoFocus
              className="w-full bg-[var(--bg-surface)] px-2 py-0.5 rounded-md border border-[var(--accent-primary)] outline-none text-xs text-[var(--text-primary)]"
            />
            <button
              type="submit"
              className="p-1 rounded text-[#30D158] hover:bg-black/5 dark:hover:bg-white/10"
              title="Save"
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="p-1 rounded text-[#FF453A] hover:bg-black/5 dark:hover:bg-white/10"
              title="Cancel"
            >
              <X size={12} />
            </button>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2 truncate pr-2">
              {isRunning ? (
                <Loader2 size={14} className="animate-spin text-[var(--accent-primary)] shrink-0" />
              ) : (
                <FileText
                  size={14}
                  className={isActive ? 'text-[var(--accent-primary)] shrink-0' : 'text-[var(--text-tertiary)] shrink-0'}
                />
              )}
              <span className="truncate">{conv.title}</span>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => handleStartRename(conv.id, conv.title, e)}
                className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10"
                title="Rename inquiry"
              >
                <Edit2 size={11} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[#FF453A] hover:bg-black/5 dark:hover:bg-white/10"
                title="Delete inquiry"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </>
        )}
      </motion.div>
    );
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
            onClick={onCloseMobile}
          />
        )}
      </AnimatePresence>

      {/* Floating Glass Sidebar with Smooth Morph */}
      <motion.aside
        layout
        transition={SPRING_SMOOTH}
        className={`fixed md:sticky top-0 left-0 z-40 h-screen glass border-r border-[var(--glass-border)] shadow-glass flex flex-col justify-between ${
          isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'md:w-16' : 'md:w-64'}`}
      >
        {/* Top Header */}
        <div className="p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            {!isCollapsed && <BrandLogo size="sm" />}
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-full hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mx-auto md:mx-0"
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>

          {/* New Research Action Button */}
          <button
            type="button"
            onClick={() => {
              onNewResearch();
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-center gap-2 rounded-full py-2 text-xs font-semibold glass-thin hover:bg-white/15 text-[var(--text-primary)] border border-[var(--glass-border)] shadow-xs transition-all active:scale-95 glass-sheen ${
              isCollapsed ? 'px-0 h-10 w-10 mx-auto' : 'px-4'
            }`}
            title="Start New Research"
          >
            <Plus size={14} className="text-[var(--accent-primary)]" />
            {!isCollapsed && <span>New Research</span>}
          </button>

          {/* Search History Input */}
          {!isCollapsed && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search research..."
                className="w-full bg-[var(--bg-input)] pl-8 pr-3 py-1.5 rounded-full text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] border border-[var(--glass-border)] outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/40 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Conversation List Scroll Area */}
        <div className="flex-1 overflow-y-auto px-2 space-y-4 py-2">
          {conversations.length === 0 ? (
            !isCollapsed && (
              <div className="text-center py-12 px-3 text-xs text-[var(--text-tertiary)]">
                No research sessions yet. Click &ldquo;New Research&rdquo; to begin.
              </div>
            )
          ) : (
            <AnimatePresence initial={false}>
              {groups.today.length > 0 && (
                <div className="space-y-1">
                  {!isCollapsed && (
                    <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Today
                    </span>
                  )}
                  {groups.today.map(renderConversationItem)}
                </div>
              )}

              {groups.yesterday.length > 0 && (
                <div className="space-y-1">
                  {!isCollapsed && (
                    <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Yesterday
                    </span>
                  )}
                  {groups.yesterday.map(renderConversationItem)}
                </div>
              )}

              {groups.previous.length > 0 && (
                <div className="space-y-1">
                  {!isCollapsed && (
                    <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Previous
                    </span>
                  )}
                  {groups.previous.map(renderConversationItem)}
                </div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Bottom Profile & Settings Bar (prevent collision with dev indicator) */}
        <div className="p-3 pb-8 md:pb-5 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30">
          <button
            type="button"
            onClick={onOpenSettings}
            className={`w-full flex items-center justify-between p-2 rounded-[14px] hover:bg-white/10 text-xs font-semibold text-[var(--text-primary)] transition-colors ${
              isCollapsed ? 'justify-center' : ''
            }`}
            title="Settings & Appearance"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#0A84FF] to-[#5E5CE6] flex items-center justify-center text-white text-[10px] font-bold shadow-xs">
                A
              </div>
              {!isCollapsed && (
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    Scholar Engine
                  </span>
                  <span className="text-[10px] text-[#30D158] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
                    Online
                  </span>
                </div>
              )}
            </div>

            {!isCollapsed && <Settings size={14} className="text-[var(--text-tertiary)]" />}
          </button>
        </div>
      </motion.aside>
    </>
  );
};
