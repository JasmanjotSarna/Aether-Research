'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  FileSearch,
  Globe,
  Layers,
  ListTodo,
  Loader2,
  Search,
  ShieldCheck,
  Terminal,
  Wrench,
  AlertCircle,
  Key,
} from 'lucide-react';
import { TodoItem, Source } from '@/lib/contract';
import { ToolCallItem } from '@/hooks/useChatStore';
import { SPRING_SMOOTH, SPRING_BOUNCY } from '@/config/animation';

interface ClaudeWorkingViewProps {
  isStreaming: boolean;
  thinkingNotes: string[];
  todos: TodoItem[];
  tools: ToolCallItem[];
  sources: Source[];
  workedDurationSeconds?: number;
  onSelectSource?: (sourceId: string) => void;
  onOpenSettings?: () => void;
  onRetryTool?: (toolId: string) => void;
  className?: string;
}

// Animated Drawing Checkmark Component
const AnimatedCheckmark: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#30D158"
    strokeWidth="2.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
  >
    <motion.path
      d="M20 6L9 17L4 12"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    />
  </svg>
);

export const ClaudeWorkingView: React.FC<ClaudeWorkingViewProps> = ({
  isStreaming,
  thinkingNotes,
  todos,
  tools,
  sources,
  workedDurationSeconds,
  onSelectSource,
  onOpenSettings,
  onRetryTool,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(isStreaming);
  const [isThinkingOpen, setIsThinkingOpen] = useState<boolean>(true);
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);

  // Auto-expand on streaming start
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  // Expand the first tool if none is expanded
  useEffect(() => {
    if (tools.length > 0 && !expandedToolId) {
      setExpandedToolId(tools[0].id);
    }
  }, [tools, expandedToolId]);

  const duration = workedDurationSeconds || 0;
  const toolCallsCount = tools.length;
  const sourcesCount = sources.length;
  const completedTasksCount = todos.filter((t) => t.status === 'done').length;

  const getToolMeta = (tool: ToolCallItem) => {
    switch (tool.name) {
      case 'web_search':
        return {
          icon: <Search size={13} className="text-[#0A84FF]" />,
          title: `Searched web · "${tool.input.slice(0, 42)}"`,
          badge: 'Web Search',
        };
      case 'academic_search':
        return {
          icon: <FileSearch size={13} className="text-[#5E5CE6]" />,
          title: `Queried academic archives · arXiv, IEEE, OpenAlex`,
          badge: 'Academic',
        };
      case 'read_page':
        return {
          icon: <Globe size={13} className="text-[#30D158]" />,
          title: `Read page · ${tool.input.replace(/^https?:\/\//, '').slice(0, 38)}`,
          badge: 'Page Reader',
        };
      case 'fact_check':
        return {
          icon: <ShieldCheck size={13} className="text-[#FF9F0A]" />,
          title: `Fact-check & cross-encoder verification`,
          badge: 'Audit',
        };
      default:
        return {
          icon: <Wrench size={13} className="text-[var(--text-secondary)]" />,
          title: `Invoked tool · ${tool.name}`,
          badge: 'Tool',
        };
    }
  };

  return (
    <motion.div
      layout
      transition={SPRING_SMOOTH}
      className={`w-full max-w-3xl mx-auto space-y-3 ${className}`}
    >
      {/* Collapsed One-Liner / Header Bar with Satisfying Squeeze */}
      <motion.div
        layout
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ scale: 1.006 }}
        whileTap={{ scale: 0.985 }}
        className="w-full flex items-center justify-between p-3.5 px-4 rounded-[20px] glass border border-[var(--glass-border)] shadow-glass cursor-pointer hover:bg-white/10 transition-all select-none"
      >
        <div className="flex items-center gap-2.5">
          {isStreaming ? (
            <div className="relative flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)] animate-ping absolute opacity-75" />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)]" />
            </div>
          ) : (
            <CheckCircle2 size={16} className="text-[#30D158]" />
          )}

          <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-xs font-semibold text-[var(--text-primary)]">
            {isStreaming ? (
              <span className="text-[var(--accent-primary)] flex items-center gap-1.5 font-bold">
                <Loader2 size={13} className="animate-spin" />
                <span>Autonomous Agent Working...</span>
              </span>
            ) : (
              <span className="text-[var(--text-primary)]">
                {duration > 0 ? `Worked for ${duration}s` : 'Research completed'} · {sourcesCount} source{sourcesCount !== 1 ? 's' : ''} · {toolCallsCount} tool call{toolCallsCount !== 1 ? 's' : ''}
              </span>
            )}

            {todos.length > 0 && (
              <span className="text-[11px] font-normal text-[var(--text-secondary)]">
                {isStreaming
                  ? `${completedTasksCount}/${todos.length} tasks done`
                  : 'All evidence verified'}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className="p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center gap-1 text-[11px] font-medium"
        >
          <span>{isExpanded ? 'Collapse' : 'Expand details'}</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </motion.div>

      {/* Expanded Working Tray with Framer Height Transitions */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="working-tray"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING_SMOOTH}
            className="space-y-3 overflow-hidden"
          >
            {/* 1. Live Task List (Todo items) with Drawing Checkmarks */}
            {todos.length > 0 && (
              <div className="p-4 rounded-[22px] glass border border-[var(--glass-border)] shadow-xs space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
                  <span className="flex items-center gap-1.5 text-[var(--accent-primary)]">
                    <ListTodo size={14} />
                    <span>Research Execution Plan</span>
                  </span>
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                    {completedTasksCount} of {todos.length} completed
                  </span>
                </div>

                <div className="space-y-1.5 pt-1">
                  {todos.map((todo) => {
                    const isDone = todo.status === 'done';
                    const isRunning = todo.status === 'running';
                    const isError = todo.status === 'error';

                    return (
                      <motion.div
                        key={todo.id}
                        layout
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-[12px] text-xs transition-colors ${
                          isRunning
                            ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-semibold border border-[var(--accent-primary)]/25'
                            : isDone
                            ? 'text-[var(--text-secondary)] bg-[var(--bg-subtle)]/40'
                            : 'text-[var(--text-tertiary)] bg-[var(--bg-subtle)]/20'
                        }`}
                      >
                        {isDone && <AnimatedCheckmark size={13} />}
                        {isRunning && (
                          <Loader2 size={13} className="animate-spin text-[var(--accent-primary)] shrink-0" />
                        )}
                        {isError && <AlertCircle size={13} className="text-[#FF453A] shrink-0" />}
                        {!isDone && !isRunning && !isError && (
                          <Circle size={13} className="text-[var(--text-tertiary)] opacity-40 shrink-0" />
                        )}

                        <span className={isDone ? 'line-through text-[var(--text-tertiary)]' : ''}>
                          {todo.label}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Collapsible Thinking Block with Text Shimmer */}
            {thinkingNotes.length > 0 && (
              <div className="p-3.5 rounded-[22px] glass border border-[var(--glass-border)] shadow-xs space-y-2">
                <div
                  onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                  className="flex items-center justify-between cursor-pointer select-none"
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold text-[#5E5CE6]">
                    <Brain size={14} className="text-[#5E5CE6]" />
                    <span>Reasoning & Thought Process</span>
                  </span>
                  <span className="text-[11px] font-medium text-[var(--text-secondary)] flex items-center gap-1">
                    <span>{isThinkingOpen ? 'Hide' : 'Show notes'}</span>
                    {isThinkingOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </span>
                </div>

                <AnimatePresence>
                  {isThinkingOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="p-3 rounded-[16px] bg-[var(--code-bg)] border border-[var(--code-border)] max-h-48 overflow-y-auto space-y-1.5 text-[13px] font-mono text-[var(--text-secondary)] leading-relaxed"
                    >
                      {thinkingNotes.map((note, idx) => (
                        <p key={idx} className="flex items-start gap-1.5">
                          <span className="text-[#5E5CE6] font-bold not-italic select-none">›</span>
                          <span className={isStreaming && idx === thinkingNotes.length - 1 ? 'shimmer-text font-semibold' : ''}>
                            {note}
                          </span>
                        </p>
                      ))}
                      {isStreaming && (
                        <span className="inline-block w-1.5 h-3.5 bg-[#5E5CE6]/60 animate-pulse ml-1" />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* 3. Claude-Style Tool-Call Rows with Height Spring & Error Handling */}
            {tools.length > 0 && (
              <div className="p-4 rounded-[22px] glass border border-[var(--glass-border)] shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)] pb-1 border-b border-[var(--border-subtle)]">
                  <span className="flex items-center gap-1.5 text-[var(--text-primary)]">
                    <Terminal size={14} className="text-[var(--accent-primary)]" />
                    <span>Tool Invocations & Verified Queries</span>
                  </span>
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                    {tools.length} executed
                  </span>
                </div>

                <div className="space-y-1.5">
                  {tools.map((tool) => {
                    const meta = getToolMeta(tool);
                    const isToolExpanded = expandedToolId === tool.id;
                    const isToolError = tool.status === 'error';

                    return (
                      <motion.div
                        key={tool.id}
                        layout
                        transition={SPRING_SMOOTH}
                        className={`rounded-[14px] glass border overflow-hidden text-xs transition-all ${
                          isToolError
                            ? 'border-[#FF453A]/40 bg-[#FF453A]/5'
                            : 'border-[var(--glass-border)] hover:border-[var(--accent-primary)]/40'
                        }`}
                      >
                        <div
                          onClick={() => setExpandedToolId(isToolExpanded ? null : tool.id)}
                          className="flex items-center justify-between p-2.5 px-3 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {meta.icon}
                            <span className="font-semibold text-[var(--text-primary)] truncate">
                              {meta.title}
                            </span>
                            {tool.summary && (
                              <span className="text-[11px] text-[var(--text-secondary)] hidden sm:inline truncate">
                                · {tool.summary}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {tool.status === 'running' ? (
                              <Loader2 size={12} className="animate-spin text-[var(--accent-primary)]" />
                            ) : tool.status === 'done' ? (
                              <CheckCircle2 size={12} className="text-[#30D158]" />
                            ) : (
                              <AlertCircle size={12} className="text-[#FF453A]" />
                            )}
                            {isToolExpanded ? (
                              <ChevronUp size={12} className="text-[var(--text-tertiary)]" />
                            ) : (
                              <ChevronDown size={12} className="text-[var(--text-tertiary)]" />
                            )}
                          </div>
                        </div>

                        {/* Expandable Tool Detail Tray with Smooth Height */}
                        <AnimatePresence>
                          {isToolExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={SPRING_SMOOTH}
                              className="p-3 bg-[var(--code-bg)] border-t border-[var(--border-subtle)] space-y-2 text-[11px] font-mono overflow-hidden"
                            >
                              <div>
                                <span className="text-[var(--text-secondary)] font-bold block mb-0.5">
                                  Input Query / Target:
                                </span>
                                <div className="p-2 rounded-[8px] bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] break-all">
                                  {tool.input}
                                </div>
                              </div>

                              {tool.summary && (
                                <div>
                                  <span className="text-[var(--text-secondary)] font-bold block mb-0.5">
                                    Output Summary:
                                  </span>
                                  <div
                                    className={`p-2 rounded-[8px] border font-sans font-medium ${
                                      isToolError
                                        ? 'bg-[#FF453A]/10 text-[#FF453A] border-[#FF453A]/20'
                                        : 'bg-[var(--bg-input)] text-[#30D158] border-[var(--border-subtle)]'
                                    }`}
                                  >
                                    {tool.summary}
                                  </div>
                                </div>
                              )}

                              {/* Friendly Error Note & Recovery Options (Issue 10) */}
                              {isToolError && (
                                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-[10px] bg-[#FF453A]/10 border border-[#FF453A]/20 text-xs font-sans">
                                  <div className="flex items-center gap-1.5 text-[#FF453A]">
                                    <AlertCircle size={13} />
                                    <span>
                                      Search query rate limit reached or endpoint unavailable.
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {onRetryTool && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onRetryTool(tool.id);
                                        }}
                                        className="text-[11px] font-semibold text-[var(--text-primary)] hover:underline"
                                      >
                                        Try again
                                      </button>
                                    )}

                                    {onOpenSettings && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenSettings();
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#FF453A]/20 text-[#FF453A] hover:bg-[#FF453A]/30 transition-colors"
                                      >
                                        <Key size={11} />
                                        <span>Add a Tavily key in Settings</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Discovered Sources Chips with Spring Fly-In */}
            {sources.length > 0 && (
              <div className="p-3.5 rounded-[22px] glass-thin border border-[var(--glass-border)] shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1.5">
                    <Layers size={13} className="text-[var(--accent-primary)]" />
                    <span>Discovered Domain Evidence ({sources.length})</span>
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    Click chip to inspect in drawer
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {sources.map((src, idx) => (
                    <motion.button
                      key={src.id}
                      type="button"
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ ...SPRING_BOUNCY, delay: idx * 0.04 }}
                      onClick={() => onSelectSource?.(src.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium glass-thin text-[var(--text-primary)] hover:bg-white/15 hover:border-[var(--accent-primary)]/40 transition-colors shadow-2xs glass-sheen"
                    >
                      <span className="font-bold text-[var(--accent-primary)]">[{src.id}]</span>
                      <span className="truncate max-w-[130px]">{src.domain}</span>
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            src.credibility >= 0.9 || src.credibility >= 90
                              ? '#30D158'
                              : src.credibility >= 0.7 || src.credibility >= 70
                              ? '#0A84FF'
                              : '#FF9F0A',
                        }}
                      />
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
