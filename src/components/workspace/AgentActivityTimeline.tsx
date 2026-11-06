'use client';

import React, { useState } from 'react';
import { Source, ResearchPlan, StepId, TodoItem } from '@/lib/contract';
import { TimelineStep } from '@/hooks/useChatStore';
import type { LiveTool } from '@/hooks/useAgentStream';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Search,
  BookOpen,
  FileText,
  Sliders,
  Check,
  Globe,
  Sparkles,
} from 'lucide-react';

interface AgentActivityTimelineProps {
  steps: TimelineStep[];
  plan?: ResearchPlan | null;
  sources: Source[];
  thinking?: string[];
  todos?: TodoItem[];
  tools?: LiveTool[];
  isStreaming?: boolean;
  onSelectSource?: (sourceId: string) => void;
}

export const AgentActivityTimeline: React.FC<AgentActivityTimelineProps> = ({
  steps,
  plan,
  sources,
  thinking = [],
  todos = [],
  tools = [],
  isStreaming = false,
  onSelectSource,
}) => {
  const isFinished = !isStreaming && steps.length > 0 && steps.every((s) => s.status === 'done');
  const [isExpanded, setIsExpanded] = useState(!isFinished);

  const getStepIcon = (id: StepId) => {
    switch (id) {
      case 'plan':
        return <Sliders size={14} className="text-[#0A84FF]" />;
      case 'search':
        return <Search size={14} className="text-[#5E5CE6]" />;
      case 'read':
        return <BookOpen size={14} className="text-[#32ADE6]" />;
      case 'analyze':
        return <Sparkles size={14} className="text-[#FF9F0A]" />;
      case 'write':
        return <FileText size={14} className="text-[#30D158]" />;
      case 'review':
        return <Check size={14} className="text-[#0A84FF]" />;
      default:
        return <Globe size={14} />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 size={13} className="text-[#0A84FF] animate-spin" />;
      case 'done':
        return <CheckCircle2 size={14} className="text-[#30D158]" />;
      case 'error':
        return <AlertCircle size={14} className="text-[#FF453A]" />;
      default:
        return <div className="w-2.5 h-2.5 rounded-full bg-black/15" />;
    }
  };

  return (
    <div className="w-full my-4 rounded-[20px] glass overflow-hidden border border-white/80 shadow-xs transition-all duration-300">
      {/* Header Banner */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/40 hover:bg-white/60 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          {isStreaming ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0A84FF] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#0A84FF]" />
            </span>
          ) : (
            <CheckCircle2 size={16} className="text-[#30D158]" />
          )}

          <div className="flex flex-col">
            <span className="text-xs font-bold text-[#1D1D1F] tracking-tight">
              {isFinished
                ? `Researched ${sources.length} sources in ${steps.length * 6}s`
                : isStreaming
                ? 'Autonomous Research Pipeline Executing...'
                : 'Research Execution Timeline'}
            </span>
            <span className="text-[11px] text-[#6E6E73]">
              {isStreaming ? 'Multi-source synthesis & claim auditing' : 'All claims verified with peer-reviewed provenance'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[#6E6E73]">
          <span className="text-[11px] font-medium hidden sm:inline">
            {isExpanded ? 'Collapse' : 'Expand details'}
          </span>
          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </button>

      {/* Expandable Body */}
      {isExpanded && (
        <div className="p-4 border-t border-black/5 space-y-4 text-xs">
          {/* Task list (Claude-style todos) */}
          {todos.length > 0 && (
            <div className="p-3 rounded-[14px] bg-white/70 border border-white/90 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px] uppercase tracking-wider text-[#0A84FF]">
                  Task list
                </span>
                <span className="text-[10px] text-[#86868B]">
                  {todos.filter((item) => item.status === 'done').length}/{todos.length} complete
                </span>
              </div>
              {todos.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <span className="flex-shrink-0">{getStatusBadge(item.status)}</span>
                  <span
                    className={
                      item.status === 'done'
                        ? 'text-[11px] text-[#6E6E73] line-through'
                        : 'text-[11px] font-medium text-[#1D1D1F]'
                    }
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Live thinking notes */}
          {thinking.length > 0 && (
            <div className="p-3 rounded-[14px] bg-[#0A84FF]/[0.04] border border-[#0A84FF]/10 space-y-1.5">
              <span className="font-bold text-[11px] uppercase tracking-wider text-[#0A84FF]">
                Working notes
              </span>
              {thinking.slice(-4).map((note, index) => (
                <p key={`${index}-${note.slice(0, 12)}`} className="text-[11px] text-[#4B5563] leading-relaxed">
                  {note}
                </p>
              ))}
            </div>
          )}

          {/* Real tool calls */}
          {tools.length > 0 && (
            <div className="space-y-1.5">
              <span className="font-bold text-[11px] uppercase tracking-wider text-[#1D1D1F]">
                Tool calls
              </span>
              {tools.map((tool) => (
                <div
                  key={`${tool.name}-${tool.id}`}
                  className="flex items-start gap-2 p-2 rounded-[12px] bg-white/60 border border-white/80"
                >
                  <span className="mt-0.5 flex-shrink-0">{getStatusBadge(tool.status)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[11px] text-[#1D1D1F]">
                        {tool.name.replace(/_/g, ' ')}
                      </span>
                      {tool.summary && (
                        <span className="text-[10px] text-[#6E6E73] truncate">{tool.summary}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#6E6E73] truncate">{tool.input}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Research Plan Callout */}
          {plan && (
            <div className="p-3 rounded-[14px] bg-white/70 border border-white/90 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px] uppercase tracking-wider text-[#0A84FF]">
                  Research Objective
                </span>
                <span className="text-[10px] text-[#86868B]">
                  {plan.queries.length} targeted query vectors
                </span>
              </div>
              <p className="text-[12px] font-medium text-[#1D1D1F] leading-snug">
                {plan.objective}
              </p>

              {/* Subtopics */}
              {plan.subtopics && plan.subtopics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {plan.subtopics.map((sub, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-black/[0.03] text-[10px] font-medium text-[#4B5563] border border-black/[0.04]"
                    >
                      {sub}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Vertical Timeline Steps */}
          <div className="space-y-2">
            {steps.map((st) => (
              <div
                key={st.id}
                className="flex items-start gap-2.5 p-2 rounded-[12px] hover:bg-white/40 transition-colors"
              >
                <div className="mt-0.5 flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-white/80 shadow-xs border border-white">
                  {getStepIcon(st.id)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1D1D1F] text-xs">
                      {st.title}
                    </span>
                    <span className="flex-shrink-0">{getStatusBadge(st.status)}</span>
                  </div>
                  {st.detail && (
                    <p className="text-[11px] text-[#6E6E73] mt-0.5 leading-relaxed">
                      {st.detail}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Sources Discovered Chips Live */}
          {sources.length > 0 && (
            <div className="pt-2 border-t border-black/5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-[11px] uppercase tracking-wider text-[#1D1D1F]">
                  Discovered Sources ({sources.length})
                </span>
                <span className="text-[10px] text-[#86868B]">Click chip to inspect</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {sources.map((src) => (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => onSelectSource?.(src.id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] bg-white/70 hover:bg-white text-[#1D1D1F] border border-white/80 shadow-xs transition-all hover:scale-105"
                    title={src.title}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
                    <span className="font-bold text-[#0A84FF]">[{src.id}]</span>
                    <span className="max-w-[120px] truncate">{src.domain}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

