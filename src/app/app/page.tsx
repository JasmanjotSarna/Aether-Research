'use client';

import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useChatStore, Conversation, ToolCallItem, ChatMessage, MessageStatus } from '@/hooks/useChatStore';
import { useAgentStream } from '@/hooks/useAgentStream';
import {
  Mode,
  Source,
  ResearchReport,
  AgentMessage,
  ClarifyAnswer,
  ResearchSpec,
  AgentEvent,
} from '@/lib/contract';
import { Sidebar } from '@/components/workspace/Sidebar';
import { EmptyState } from '@/components/workspace/EmptyState';
import { Composer } from '@/components/workspace/Composer';
import { ClaudeWorkingView } from '@/components/workspace/ClaudeWorkingView';
import { ClarifyCard } from '@/components/workspace/ClarifyCard';
import { ProposalCard } from '@/components/workspace/ProposalCard';
import { StreamingPaperView } from '@/components/workspace/StreamingPaperView';
import { ReportView } from '@/components/workspace/ReportView';
import { SourcesDrawer } from '@/components/workspace/SourcesDrawer';
import { SettingsModal } from '@/components/workspace/SettingsModal';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { QuickThemeToggle } from '@/components/ui/ThemeToggle';
import { Menu, BookOpen, ArrowDown, Loader2, AlertCircle, RotateCcw, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q');
  const demoParam = searchParams.get('demo');

  const {
    conversations,
    activeConversation,
    activeId,
    isLoaded,
    searchQuery,
    setSearchQuery,
    createConversation,
    selectConversation,
    updateConversation,
    appendMessagePair,
    updateChatMessage,
    finalizeActiveRun,
    renameConversation,
    deleteConversation,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('standard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSourcesDrawerOpen, setIsSourcesDrawerOpen] = useState(false);
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousActiveIdRef = useRef<string | null>(null);

  // Helper to extract user-provided API keys
  const getHeaders = useCallback(() => {
    const customHeaders: Record<string, string> = {};
    if (typeof window !== 'undefined') {
      const openrouter = localStorage.getItem('aether_openrouter_key');
      const groq = localStorage.getItem('aether_groq_key');
      const tavily = localStorage.getItem('aether_tavily_key');
      if (openrouter) customHeaders['x-openrouter-key'] = openrouter;
      if (groq) customHeaders['x-groq-key'] = groq;
      if (tavily) customHeaders['x-tavily-key'] = tavily;
    }
    return customHeaders;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    isNearBottomRef.current = true;
    setShowJumpToBottom(false);
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
    }

    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
    if (scrollRef.current) {
      if (behavior === 'auto') {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      } else {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior,
        });
      }
    }

    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      if (scrollRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 160;
      }
    }, behavior === 'smooth' ? 350 : 50);
  }, []);

  // Multi-stream event dispatcher strictly keyed by chatId and mapped to active turn
  const handleStreamEvent = useCallback(
    (chatId: string, event: AgentEvent) => {
      updateConversation(chatId, (prev) => {
        // Find latest assistant message in this conversation
        const messages = [...(prev.messages || [])];
        let lastAsstIdx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i]?.role === 'assistant') {
            lastAsstIdx = i;
            break;
          }
        }

        const activeMsg: ChatMessage =
          lastAsstIdx >= 0
            ? { ...messages[lastAsstIdx]! }
            : {
              id: `asst_${Date.now()}`,
              seq: (messages.length || 0) + 1,
              role: 'assistant',
              content: '',
              status: 'streaming',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };

        switch (event.type) {
          case 'title':
            return { ...prev, title: event.title };

          case 'intent':
            if (event.intent === 'clarify') {
              activeMsg.status = 'streaming';
              if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
              return { ...prev, status: 'clarifying', messages };
            }
            if (event.intent === 'proposal') {
              activeMsg.status = 'streaming';
              if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
              return { ...prev, status: 'proposed', messages };
            }
            if (event.intent === 'research') {
              activeMsg.status = 'streaming';
              if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
              return { ...prev, status: 'running', messages };
            }
            return prev;

          case 'clarify': {
            const clarifyPayload = {
              intro: event.intro,
              notice: event.notice,
              questions:
                event.questions && event.questions.length > 0
                  ? event.questions
                  : [{ id: 'q1', question: event.question, options: event.options }],
            };
            activeMsg.clarifyPayload = clarifyPayload;
            activeMsg.status = 'done';
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
            return {
              ...prev,
              status: 'clarifying',
              clarifyPayload,
              messages,
              isStreaming: false,
            };
          }

          case 'proposal':
            activeMsg.proposalSpec = event.spec;
            activeMsg.proposalSummary = event.summary;
            activeMsg.status = 'done';
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
            return {
              ...prev,
              status: 'proposed',
              proposalSpec: event.spec,
              proposalSummary: event.summary,
              messages,
              isStreaming: false,
            };

          case 'run':
            activeMsg.status = 'streaming';
            activeMsg.streamingReportMarkdown = '';
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
            return {
              ...prev,
              status: 'running',
              streamingReportMarkdown: '',
              isStreaming: true,
              messages,
            };

          case 'step': {
            const existingIndex = prev.steps.findIndex((s) => s.id === event.id);
            const updatedSteps = [...prev.steps];
            const newStep = {
              id: event.id,
              status: event.status,
              title: event.title,
              detail: event.detail,
            };
            if (existingIndex >= 0) {
              updatedSteps[existingIndex] = newStep;
            } else {
              updatedSteps.push(newStep);
            }
            return { ...prev, steps: updatedSteps };
          }

          case 'plan':
            return {
              ...prev,
              plan: { objective: event.objective, subtopics: event.subtopics, queries: event.queries },
            };

          case 'thinking': {
            const notes = [...(activeMsg.thinkingNotes || []), event.text];
            activeMsg.thinkingNotes = notes;
            activeMsg.status = 'streaming';
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
            return {
              ...prev,
              thinkingNotes: [...(prev.thinkingNotes || []), event.text],
              messages,
            };
          }

          case 'todo': {
            activeMsg.todos = event.items;
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
            return { ...prev, todos: event.items, messages };
          }

          case 'tool': {
            const existingToolIndex = (prev.tools || []).findIndex((t) => t.id === event.id);
            const updatedTools = [...(prev.tools || [])];
            const toolItem: ToolCallItem = {
              id: event.id,
              name: event.name,
              input: event.input,
              status: event.status,
              summary: event.summary,
              timestamp: Date.now(),
            };
            if (existingToolIndex >= 0) {
              updatedTools[existingToolIndex] = toolItem;
            } else {
              updatedTools.push(toolItem);
            }

            // Sync onto activeMsg tools
            const msgToolIdx = (activeMsg.tools || []).findIndex((t) => t.id === event.id);
            const msgTools = [...(activeMsg.tools || [])];
            if (msgToolIdx >= 0) {
              msgTools[msgToolIdx] = toolItem;
            } else {
              msgTools.push(toolItem);
            }
            activeMsg.tools = msgTools;
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;

            return { ...prev, tools: updatedTools, messages };
          }

          case 'source': {
            if ((prev.sources || []).some((s) => s.id === event.source.id)) return prev;
            const updatedSources = [...(prev.sources || []), event.source];
            activeMsg.sources = [...(activeMsg.sources || []), event.source];
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
            return { ...prev, sources: updatedSources, messages };
          }

          case 'report_token': {
            const streamed = (activeMsg.streamingReportMarkdown || '') + event.text;
            activeMsg.streamingReportMarkdown = streamed;
            activeMsg.status = 'streaming';
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
            return {
              ...prev,
              streamingReportMarkdown: (prev.streamingReportMarkdown || '') + event.text,
              messages,
            };
          }

          case 'token': {
            activeMsg.content = (activeMsg.content || '') + event.text;
            activeMsg.status = 'streaming';
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
            return { ...prev, messages };
          }

          case 'report': {
            const rep: ResearchReport = {
              title: event.title,
              markdown: event.markdown,
              sources: event.sources,
              quality: event.quality,
              followups: event.followups,
              version: event.version,
              pagesEstimated: event.pagesEstimated,
              pagesDelivered: event.pagesDelivered,
              pagesRequested: event.pagesRequested,
              changes: event.changes,
            };
            activeMsg.report = rep;
            activeMsg.status = 'done';
            activeMsg.streamingReportMarkdown = '';
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;

            const existingReports = prev.reports || [];
            return {
              ...prev,
              report: rep,
              reports: [
                ...existingReports.filter((r) => r.version !== event.version),
                {
                  version: event.version || 1,
                  title: event.title,
                  markdown: event.markdown,
                  sources: event.sources,
                  quality: event.quality,
                  followups: event.followups,
                  pagesEstimated: event.pagesEstimated,
                  pagesDelivered: event.pagesDelivered,
                  pagesRequested: event.pagesRequested,
                  changes: event.changes,
                  createdAt: new Date().toISOString(),
                },
              ],
              status: 'completed',
              isStreaming: false,
              messages,
            };
          }

          case 'done': {
            activeMsg.status = 'done';
            // Finalize any tool calls that were left in 'running'
            if (activeMsg.tools) {
              activeMsg.tools = activeMsg.tools.map((t) =>
                t.status === 'running' ? { ...t, status: 'done' as const } : t
              );
            }
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;

            const updatedGlobalTools = (prev.tools || []).map((t) =>
              t.status === 'running' ? { ...t, status: 'done' as const } : t
            );

            return {
              ...prev,
              isStreaming: false,
              tools: updatedGlobalTools,
              status:
                prev.report || activeMsg.report || (prev.status as string) === 'completed'
                  ? 'completed'
                  : prev.status === 'clarifying' || prev.status === 'proposed'
                    ? prev.status
                    : 'idle',
              messages,
            };
          }

          case 'error': {
            activeMsg.status = 'error';
            activeMsg.errorMessage = event.message;
            if (lastAsstIdx >= 0) messages[lastAsstIdx] = activeMsg;
            return {
              ...prev,
              errorMessage: event.message,
              isStreaming: false,
              status: 'error',
              messages,
            };
          }

          default:
            return prev;
        }
      });

      // Auto-scroll if this event is for the currently viewed conversation and user was near bottom
      if (chatId === activeId && isNearBottomRef.current) {
        setTimeout(() => scrollToBottom('smooth'), 40);
      }
    },
    [activeId, scrollToBottom, updateConversation]
  );

  const { startStream, stopStream, isChatStreaming } = useAgentStream({
    onEvent: handleStreamEvent,
  });

  // Track scroll position and "Jump to bottom" visibility
  const handleScroll = () => {
    if (!scrollRef.current || isProgrammaticScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 140;
    isNearBottomRef.current = isNearBottom;
    setShowJumpToBottom(!isNearBottom && scrollHeight > clientHeight + 200);
  };

  // Scroll restoration on chat switch
  useEffect(() => {
    const prevId = previousActiveIdRef.current;
    if (prevId && prevId !== activeId && scrollRef.current) {
      const currentScroll = scrollRef.current.scrollTop;
      updateConversation(prevId, { scrollPosition: currentScroll });
    }

    if (activeId && scrollRef.current) {
      const targetScroll = activeConversation?.scrollPosition ?? scrollRef.current.scrollHeight;
      scrollRef.current.scrollTop = targetScroll;
      isNearBottomRef.current = true;
      setShowJumpToBottom(false);
    }

    previousActiveIdRef.current = activeId;
  }, [activeId, activeConversation?.scrollPosition, updateConversation]);

  // Keep scroll at bottom when new messages mount in active conversation
  useEffect(() => {
    if (isNearBottomRef.current) {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      setShowJumpToBottom(false);
    }
  }, [activeConversation?.messages.length]);

  // Handle URL query parameter ?q=
  useEffect(() => {
    if (isLoaded && initialQuery && !activeId) {
      handleLaunchInquiry(initialQuery);
    }
  }, [isLoaded, initialQuery, activeId]);

  // Handle demo param
  useEffect(() => {
    if (isLoaded && demoParam === 'complete' && !activeId) {
      const demoTopic = 'Comparative Analysis: RAG vs Fine-Tuning in Production LLM Systems';
      const demoConv = createConversation(demoTopic, 'standard', {
        title: 'RAG vs Fine-Tuning Synthesis',
        status: 'completed',
        isStreaming: false,
        streamingReportMarkdown: '',
      });
      selectConversation(demoConv.id);
    }
  }, [isLoaded, demoParam, activeId, createConversation, selectConversation]);

  // Launch a new research inquiry from empty state
  const handleLaunchInquiry = async (topicToRun?: string, chosenMode: Mode = mode) => {
    const clean = (topicToRun || input).trim();
    if (!clean) return;

    const newConv = createConversation(clean, chosenMode, {
      status: 'idle',
      isStreaming: true,
    });
    setInput('');
    setTimeout(() => scrollToBottom('smooth'), 50);

    await startStream(
      newConv.id,
      {
        messages: [{ role: 'user', content: clean }],
        mode: chosenMode,
        report: null,
      },
      getHeaders()
    );
  };

  // User sends a message inside active conversation (handles follow-up, mid-run interrupt, and scoping text)
  const handleUserSend = async (customText?: string) => {
    const textToSubmit = (customText || input).trim();
    if (!textToSubmit || !activeConversation) return;

    // Check if clarifying is active: user text answers clarifying questions
    if (activeConversation.status === 'clarifying') {
      const answer: ClarifyAnswer = {
        questionId: 'custom_reply',
        answer: textToSubmit,
      };
      await handleClarifySubmit([answer], textToSubmit);
      return;
    }

    // Check if proposal is active: user text can approve or modify
    if (activeConversation.status === 'proposed' && activeConversation.proposalSpec) {
      const isApproval = /^(approve|looks good|proceed|run|yes|go ahead|confirm)/i.test(textToSubmit);
      if (isApproval) {
        await handleProposalApprove(activeConversation.proposalSpec, textToSubmit);
        return;
      }
    }

    // Check if a run is currently active: sending mid-run ABORTS current run and redirects with feedback
    if (isChatStreaming(activeConversation.id) && activeConversation.status === 'running') {
      stopStream(activeConversation.id);
      finalizeActiveRun(activeConversation.id, 'interrupted');
    }

    // Append new User message and new Assistant pending message at the end
    isNearBottomRef.current = true;
    setShowJumpToBottom(false);
    appendMessagePair(activeConversation.id, textToSubmit);
    setInput('');
    scrollToBottom('smooth');

    const updatedMessagesForApi: AgentMessage[] = [
      ...activeConversation.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: textToSubmit },
    ];

    await startStream(
      activeConversation.id,
      {
        messages: updatedMessagesForApi,
        mode: activeConversation.mode,
        report: activeConversation.report || null,
      },
      getHeaders()
    );
  };

  // Submit clarify answers (either via option pills or typed in composer)
  const handleClarifySubmit = async (answers: ClarifyAnswer[], customUserText?: string) => {
    if (!activeConversation) return;

    const answerContent =
      customUserText ||
      answers.map((a) => `${a.questionId}: ${a.answer}`).join(' · ');

    isNearBottomRef.current = true;
    setShowJumpToBottom(false);
    appendMessagePair(activeConversation.id, answerContent);
    setInput('');
    scrollToBottom('smooth');

    updateConversation(activeConversation.id, {
      clarifyAnswers: answers,
      status: 'idle',
      isStreaming: true,
    });

    const messagesForApi: AgentMessage[] = [
      ...activeConversation.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: answerContent },
    ];

    await startStream(
      activeConversation.id,
      {
        messages: messagesForApi,
        mode: activeConversation.mode,
        answers,
        report: activeConversation.report || null,
      },
      getHeaders()
    );
  };

  // Approve proposal blueprint (via button or typed confirmation in composer)
  const handleProposalApprove = async (approvedSpec: ResearchSpec, customUserText?: string) => {
    if (!activeConversation) return;

    const approvalText = customUserText || 'Approved research blueprint and outline.';
    isNearBottomRef.current = true;
    setShowJumpToBottom(false);
    appendMessagePair(activeConversation.id, approvalText);
    setInput('');
    scrollToBottom('smooth');

    updateConversation(activeConversation.id, {
      proposalSpec: approvedSpec,
      status: 'running',
      isStreaming: true,
    });

    const messagesForApi: AgentMessage[] = [
      ...activeConversation.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: approvalText },
    ];

    await startStream(
      activeConversation.id,
      {
        messages: messagesForApi,
        mode: activeConversation.mode,
        spec: approvedSpec,
        report: activeConversation.report || null,
      },
      getHeaders()
    );
  };

  // Retry an errored or connection-lost message
  const handleRetryMessage = async (msg: ChatMessage) => {
    if (!activeConversation) return;
    updateChatMessage(activeConversation.id, msg.id, {
      status: 'pending',
      errorMessage: undefined,
    });
    updateConversation(activeConversation.id, {
      isStreaming: true,
      status: 'running',
    });

    const messagesForApi: AgentMessage[] = activeConversation.messages
      .filter((m) => m.seq < msg.seq)
      .map((m) => ({ role: m.role, content: m.content }));

    await startStream(
      activeConversation.id,
      {
        messages: messagesForApi,
        mode: activeConversation.mode,
        report: activeConversation.report || null,
      },
      getHeaders()
    );
  };

  // Resume an interrupted message
  const handleResumeMessage = async (msg: ChatMessage) => {
    if (!activeConversation) return;
    updateChatMessage(activeConversation.id, msg.id, {
      status: 'pending',
      content: '',
      errorMessage: undefined,
    });
    updateConversation(activeConversation.id, {
      isStreaming: true,
      status: 'running',
    });

    const messagesForApi: AgentMessage[] = activeConversation.messages
      .filter((m) => m.seq <= msg.seq && m.role === 'user')
      .map((m) => ({ role: m.role, content: m.content }));

    await startStream(
      activeConversation.id,
      {
        messages: messagesForApi,
        mode: activeConversation.mode,
        report: activeConversation.report || null,
      },
      getHeaders()
    );
  };

  // Select source chip to open drawer and highlight
  const handleSelectSource = (sourceId: string) => {
    setHighlightedSourceId(sourceId);
    setIsSourcesDrawerOpen(true);
    setTimeout(() => {
      const el = document.getElementById(`source-card-${sourceId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  };

  // Quick edits: shorter or longer
  const handleQuickEdit = (instruction: 'shorter' | 'longer') => {
    const prompt =
      instruction === 'shorter'
        ? 'Please synthesize a more concise executive version of this report, keeping all key citations.'
        : 'Please expand this research report with deeper empirical analysis and additional technical derivations.';
    handleUserSend(prompt);
  };

  const isCurrentActiveStreaming = isChatStreaming(activeId);
  const isCurrentActiveRunning = Boolean(
    activeConversation && activeConversation.status === 'running'
  );
  const isWaitingForAnswer = Boolean(
    activeConversation &&
    (activeConversation.status === 'clarifying' || activeConversation.status === 'proposed')
  );
  const activeSources = activeConversation?.sources || [];

  // Sort messages strictly by monotonic seq number
  const sortedMessages = (activeConversation?.messages || []).slice().sort((a, b) => a.seq - b.seq);
  const latestAssistantMsg = sortedMessages.filter((m) => m.role === 'assistant').slice(-1)[0];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-transparent">
      {/* Left Glass Sidebar */}
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNewResearch={() => {
          selectConversation('');
          setInput('');
        }}
        onDelete={deleteConversation}
        onRename={renameConversation}
        onOpenSettings={() => setIsSettingsOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Floating App Bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 py-3.5 glass border-b border-[var(--glass-border)] shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-secondary)]"
              aria-label="Open sidebar"
            >
              <Menu size={18} />
            </button>

            <BrandLogo size="sm" withLink={true} />

            {activeConversation && (
              <span className="hidden sm:inline-block text-xs font-semibold text-[var(--text-secondary)] truncate max-w-sm border-l border-[var(--border-subtle)] pl-3">
                {activeConversation.title}
              </span>
            )}
          </div>

          {/* Quick Actions & Sources Toggle */}
          <div className="flex items-center gap-2">
            <QuickThemeToggle />

            {activeSources.length > 0 && (
              <button
                type="button"
                onClick={() => setIsSourcesDrawerOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${isSourcesDrawerOpen
                    ? 'bg-[#0A84FF] text-white shadow-apple-btn'
                    : 'glass-thin text-[var(--text-primary)] hover:bg-white/10'
                  }`}
                title="View Discovered Sources"
              >
                <BookOpen size={13} />
                <span>Sources ({activeSources.length})</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Conversation Content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6"
        >
          {!activeConversation ? (
            <EmptyState
              input={input}
              onInputChange={setInput}
              onSubmit={handleLaunchInquiry}
              mode={mode}
              onModeChange={setMode}
              isStreaming={isCurrentActiveStreaming}
            />
          ) : (
            <div
              className={`mx-auto space-y-8 pb-48 ${activeConversation.report || activeConversation.streamingReportMarkdown
                  ? 'max-w-[880px]'
                  : 'max-w-[760px]'
                }`}
            >
              {/* Chronological Append-Only Message Thread */}
              {sortedMessages.map((msg) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex flex-col items-end w-full">
                      <div className="max-w-[85%] p-4 rounded-[22px] rounded-br-[6px] glass border border-[var(--glass-border)] shadow-xs text-base text-[var(--text-primary)] font-medium leading-relaxed break-words">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                // Assistant Message Turn
                const isLatest = msg.id === latestAssistantMsg?.id;
                const isStreamingThisTurn = isCurrentActiveStreaming && isLatest;

                return (
                  <div key={msg.id} className="w-full space-y-4">
                    {/* Assistant Header Avatar */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#0A84FF] to-[#5E5CE6] flex items-center justify-center text-white text-[10px] font-bold shadow-xs">
                        A
                      </div>
                      <span className="text-xs font-bold text-[var(--text-primary)]">Aether Agent</span>
                      {isStreamingThisTurn && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--accent-primary)] font-semibold">
                          <Loader2 size={11} className="animate-spin" />
                          <span>Thinking...</span>
                        </span>
                      )}
                    </div>

                    {/* Pending State Indicator */}
                    {msg.status === 'pending' && !msg.content && !msg.clarifyPayload && !msg.proposalSpec && (
                      <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full glass border border-[var(--glass-border)] text-xs text-[var(--text-secondary)] font-medium shadow-xs">
                        <Loader2 size={13} className="animate-spin text-[var(--accent-primary)]" />
                        <span className="shimmer-text">Formulating inquiry response...</span>
                      </div>
                    )}

                    {/* 1. Clarifying Questions Component */}
                    {msg.clarifyPayload && (
                      <ClarifyCard
                        payload={msg.clarifyPayload}
                        answersSummary={msg.clarifyAnswers || activeConversation.clarifyAnswers}
                        onSubmitAnswers={(answers) => handleClarifySubmit(answers)}
                        disabled={msg.status === 'done' && !isLatest}
                      />
                    )}

                    {/* 2. Proposal Card */}
                    {msg.proposalSpec && (
                      <ProposalCard
                        spec={msg.proposalSpec}
                        summary={msg.proposalSummary || activeConversation.proposalSummary || undefined}
                        onApprove={(spec) => handleProposalApprove(spec)}
                        isApproved={msg.status === 'done' && !isLatest}
                        disabled={msg.status === 'done' && !isLatest}
                      />
                    )}

                    {/* 3. Claude-Style Working View (tools, todos, thinking) */}
                    {((msg.tools && msg.tools.length > 0) ||
                      (msg.todos && msg.todos.length > 0) ||
                      (isLatest && activeConversation.tools && activeConversation.tools.length > 0)) && (
                        <ClaudeWorkingView
                          isStreaming={isStreamingThisTurn}
                          thinkingNotes={msg.thinkingNotes || (isLatest ? activeConversation.thinkingNotes || [] : [])}
                          todos={msg.todos || (isLatest ? activeConversation.todos || [] : [])}
                          tools={msg.tools || (isLatest ? activeConversation.tools || [] : [])}
                          sources={msg.sources || (isLatest ? activeConversation.sources || [] : [])}
                          onSelectSource={handleSelectSource}
                          onOpenSettings={() => setIsSettingsOpen(true)}
                          onRetryTool={(toolId) => {
                            handleUserSend(`Please retry the search for tool ${toolId}`);
                          }}
                        />
                      )}

                    {/* 4. Live Streaming Paper Draft with Markdown */}
                    {msg.streamingReportMarkdown && !msg.report && (
                      <StreamingPaperView
                        markdown={msg.streamingReportMarkdown}
                        sources={msg.sources || activeConversation.sources || []}
                        topic={activeConversation.title}
                        onSelectSource={handleSelectSource}
                      />
                    )}

                    {/* 5. Completed Verified Report View */}
                    {msg.report && (
                      <ReportView
                        report={msg.report}
                        onSelectSource={handleSelectSource}
                        onFollowUp={handleUserSend}
                        onRegenerate={() => {
                          handleLaunchInquiry(activeConversation.title);
                        }}
                        onQuickEdit={handleQuickEdit}
                      />
                    )}

                    {/* 6. Formatted Conversational Text / Follow-up Answer */}
                    {msg.content && (
                      <div className="text-base text-[var(--text-primary)] leading-relaxed p-4 rounded-[20px] glass border border-[var(--glass-border)] shadow-xs markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    )}

                    {/* 7. Error State Card with Retry Button */}
                    {msg.status === 'error' && (
                      <div className="p-4 rounded-[20px] bg-[#FF453A]/10 border border-[#FF453A]/30 text-xs sm:text-sm text-[var(--text-primary)] flex items-center justify-between gap-3 shadow-xs">
                        <div className="flex items-center gap-2 text-[#FF453A] font-semibold">
                          <AlertCircle size={16} />
                          <span>{msg.errorMessage || 'Connection lost. Retry'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRetryMessage(msg)}
                          className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#FF453A] text-white hover:opacity-90 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <span>Retry</span>
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    )}

                    {/* 8. Interrupted State Card with Resume Button */}
                    {msg.status === 'interrupted' && (
                      <div className="p-4 rounded-[20px] bg-[var(--bg-surface)]/80 border border-[var(--glass-border)] text-xs sm:text-sm text-[var(--text-primary)] flex items-center justify-between gap-3 shadow-xs">
                        <div>
                          <span className="font-semibold text-[var(--text-primary)]">
                            This run was interrupted.
                          </span>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            Resume research or send a follow-up inquiry below.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResumeMessage(msg)}
                          className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-[#0A84FF] to-[#5E5CE6] text-white hover:opacity-95 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <span>Resume</span>
                          <Play size={12} fill="currentColor" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Message scroll end anchor */}
              <div ref={messagesEndRef} className="h-6 w-full shrink-0" />
            </div>
          )}
        </div>

        {/* Floating "Jump to latest" Pill */}
        <AnimatePresence>
          {showJumpToBottom && activeConversation && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 16, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.9 }}
              onClick={() => scrollToBottom('smooth')}
              className="absolute bottom-28 right-8 z-30 flex items-center gap-2 px-4 py-2 rounded-full glass-thick text-xs font-bold text-[var(--text-primary)] border border-[var(--glass-border)] shadow-glass hover:bg-white/20 transition-all select-none cursor-pointer"
            >
              <ArrowDown size={14} className="text-[var(--accent-primary)] animate-bounce" />
              <span>Jump to latest</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Persistent Bottom Floating Composer */}
        {activeConversation && (
          <div className="absolute bottom-0 inset-x-0 z-30 pb-6 pt-10 pointer-events-none bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)]/85 to-transparent no-print">
            <div className="max-w-3xl mx-auto px-4 pointer-events-auto">
              <Composer
                value={input}
                onChange={setInput}
                onSubmit={() => handleUserSend()}
                onStop={() => stopStream(activeConversation.id)}
                isStreaming={isCurrentActiveStreaming}
                isRunning={isCurrentActiveRunning}
                isWaitingForAnswer={isWaitingForAnswer}
                statusHint={
                  isWaitingForAnswer
                    ? 'Waiting for your answer'
                    : isCurrentActiveStreaming
                      ? 'Thinking...'
                      : undefined
                }
                mode={activeConversation.mode}
                onModeChange={(newMode: Mode) => {
                  updateConversation(activeConversation.id, { mode: newMode });
                }}
                placeholder={
                  activeConversation.status === 'clarifying'
                    ? 'Answer clarifying questions or type your custom preference...'
                    : activeConversation.status === 'proposed'
                      ? 'Approve blueprint (Enter) or type requested modifications...'
                      : isCurrentActiveRunning
                        ? 'Send feedback to adjust research direction mid-run...'
                        : 'Ask a follow-up inquiry about the paper...'
                }
              />
            </div>
          </div>
        )}
      </main>

      {/* Right Slide-out Sources Drawer */}
      <SourcesDrawer
        sources={activeSources}
        isOpen={isSourcesDrawerOpen}
        onClose={() => setIsSourcesDrawerOpen(false)}
        highlightedSourceId={highlightedSourceId}
      />

      {/* Workspace Settings & API Keys Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center">
          <div className="text-sm font-semibold text-[#6E6E73]">
            Initializing Aether Workspace...
          </div>
        </div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
