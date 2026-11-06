'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Source,
  ResearchReport,
  ResearchPlan,
  StepId,
  StepStatus,
  Mode,
  AgentMessage,
  TodoItem,
  ToolName,
  ToolStatus,
  ClarifyPayload,
  ClarifyAnswer,
  ResearchSpec,
  ReportVersion,
} from '@/lib/contract';

export interface TimelineStep {
  id: StepId;
  status: StepStatus;
  title: string;
  detail?: string;
  durationMs?: number;
}

export interface ToolCallItem {
  id: string;
  name: ToolName;
  input: string;
  status: ToolStatus;
  summary?: string;
  timestamp?: number;
}

export type ChatStatus = 'idle' | 'clarifying' | 'proposed' | 'running' | 'completed' | 'error';
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error' | 'interrupted';

export interface ChatMessage {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatus;
  createdAt: number;
  updatedAt: number;
  errorMessage?: string;

  // Attached interactive turn data
  clarifyPayload?: ClarifyPayload | null;
  clarifyAnswers?: ClarifyAnswer[];
  proposalSpec?: ResearchSpec | null;
  proposalSummary?: string | null;
  report?: ResearchReport | null;
  streamingReportMarkdown?: string;
  thinkingNotes?: string[];
  todos?: TodoItem[];
  tools?: ToolCallItem[];
  sources?: Source[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mode: Mode;
  messages: ChatMessage[];
  status?: ChatStatus;

  // Scoping & Proposal
  clarifyPayload?: ClarifyPayload | null;
  clarifyAnswers?: ClarifyAnswer[];
  proposalSpec?: ResearchSpec | null;
  proposalSummary?: string | null;

  // Execution & Live Data
  plan?: ResearchPlan | null;
  steps: TimelineStep[];
  sources: Source[];
  report?: ResearchReport | null;
  reports?: ReportVersion[];
  streamingReportMarkdown?: string;
  streamingAssistantText?: string;
  isStreaming?: boolean;
  thinkingNotes?: string[];
  todos?: TodoItem[];
  tools?: ToolCallItem[];
  workedDurationSeconds?: number;

  // UI state per chat
  scrollPosition?: number;
  errorMessage?: string | null;
}

const STORAGE_KEY = 'aether_conversations_v3';
const LEGACY_STORAGE_KEY = 'aether_conversations_v2';
const ACTIVE_ID_KEY = 'aether_active_conversation_id_v2';

export function generateId(prefix = 'msg'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeLoadedConversation(raw: any): Conversation {
  const messages: ChatMessage[] = (raw.messages || []).map((m: any, idx: number) => {
    const isInterrupted = m.status === 'pending' || m.status === 'streaming';
    return {
      id: m.id || generateId('msg'),
      seq: typeof m.seq === 'number' ? m.seq : idx + 1,
      role: m.role || 'user',
      content: isInterrupted && !m.content ? 'This run was interrupted. Resume?' : (m.content || ''),
      status: isInterrupted ? ('interrupted' as MessageStatus) : (m.status || 'done'),
      createdAt: m.createdAt || Date.now(),
      updatedAt: m.updatedAt || Date.now(),
      errorMessage: m.errorMessage,
      clarifyPayload: m.clarifyPayload,
      clarifyAnswers: m.clarifyAnswers,
      proposalSpec: m.proposalSpec,
      proposalSummary: m.proposalSummary,
      report: m.report,
      streamingReportMarkdown: m.streamingReportMarkdown,
      thinkingNotes: m.thinkingNotes,
      todos: (m.todos || []).map((t: any) => (t.status === 'running' ? { ...t, status: 'pending' } : t)),
      tools: (m.tools || []).map((t: any) => (t.status === 'running' ? { ...t, status: 'error' } : t)),
      sources: m.sources,
    };
  });

  const tools = (raw.tools || []).map((t: any) => (t.status === 'running' ? { ...t, status: 'error' } : t));
  const todos = (raw.todos || []).map((t: any) => (t.status === 'running' ? { ...t, status: 'pending' } : t));

  return {
    ...raw,
    status: raw.status === 'running' ? 'idle' : (raw.status || 'idle'),
    isStreaming: false,
    messages,
    tools,
    todos,
  };
}

export function useChatStore() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;

  // Load from localStorage on mount (migrating and sanitizing interrupted runs)
  useEffect(() => {
    try {
      let stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        stored = localStorage.getItem(LEGACY_STORAGE_KEY);
      }
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map(sanitizeLoadedConversation);
          setConversations(sanitized);
          conversationsRef.current = sanitized;
          // Persist sanitized state so stale pending/streaming runs are cleaned up
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
          } catch {}
        }
      }
      const storedActiveId = localStorage.getItem(ACTIVE_ID_KEY);
      if (storedActiveId) {
        setActiveId(storedActiveId);
      }
    } catch (e) {
      console.warn('Failed to load conversations from localStorage', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save conversations to localStorage
  const persistConversations = useCallback((updated: Conversation[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to persist conversations', e);
    }
  }, []);

  const persistActiveId = useCallback((id: string | null) => {
    try {
      if (id) {
        localStorage.setItem(ACTIVE_ID_KEY, id);
      } else {
        localStorage.removeItem(ACTIVE_ID_KEY);
      }
    } catch (e) {
      console.warn('Failed to persist activeId', e);
    }
  }, []);

  const createConversation = useCallback(
    (topic: string, mode: Mode = 'standard', overrides?: Partial<Conversation>): Conversation => {
      const cleanTitle = topic.slice(0, 60).trim() || 'New Research';
      const userMsg: ChatMessage = {
        id: generateId('user'),
        seq: 1,
        role: 'user',
        content: topic,
        status: 'done',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const asstMsg: ChatMessage = {
        id: generateId('asst'),
        seq: 2,
        role: 'assistant',
        content: '',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const newConv: Conversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: cleanTitle,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mode,
        status: 'idle',
        messages: [userMsg, asstMsg],
        steps: [],
        sources: [],
        thinkingNotes: [],
        todos: [],
        tools: [],
        reports: [],
        streamingReportMarkdown: '',
        isStreaming: false,
        ...overrides,
      };

      setConversations((prev) => {
        const next = [newConv, ...prev];
        persistConversations(next);
        return next;
      });

      setActiveId(newConv.id);
      persistActiveId(newConv.id);
      return newConv;
    },
    [persistConversations, persistActiveId]
  );

  const selectConversation = useCallback(
    (id: string) => {
      setActiveId(id);
      persistActiveId(id);
    },
    [persistActiveId]
  );

  const updateConversation = useCallback(
    (
      id: string,
      updatesOrFn: Partial<Conversation> | ((prev: Conversation) => Conversation | Partial<Conversation>)
    ) => {
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id === id) {
            const updates = typeof updatesOrFn === 'function' ? updatesOrFn(c) : updatesOrFn;
            return {
              ...c,
              ...updates,
              updatedAt: new Date().toISOString(),
            };
          }
          return c;
        });
        persistConversations(next);
        return next;
      });
    },
    [persistConversations]
  );

  // Append a user message and its pending assistant reply in an append-only, monotonically increasing seq order
  const appendMessagePair = useCallback(
    (
      chatId: string,
      userContent: string,
      conversationOverrides: Partial<Conversation> = {}
    ): { userMsg: ChatMessage; assistantMsg: ChatMessage } => {
      const userMsgId = generateId('user');
      const assistantMsgId = generateId('asst');

      const userMsg: ChatMessage = {
        id: userMsgId,
        seq: 1,
        role: 'user',
        content: userContent,
        status: 'done',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        seq: 2,
        role: 'assistant',
        content: '',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id !== chatId) return c;
          const currentMessages = c.messages || [];
          const maxSeq = currentMessages.reduce((max, m) => Math.max(max, m.seq || 0), 0);

          userMsg.seq = maxSeq + 1;
          assistantMsg.seq = maxSeq + 2;

          return {
            ...c,
            ...conversationOverrides,
            isStreaming: true,
            status: conversationOverrides.status || 'running',
            errorMessage: null,
            messages: [...currentMessages, userMsg, assistantMsg],
            updatedAt: new Date().toISOString(),
          };
        });
        persistConversations(next);
        return next;
      });

      return { userMsg, assistantMsg };
    },
    [persistConversations]
  );

  // Update a specific message immutably by messageId
  const updateChatMessage = useCallback(
    (
      chatId: string,
      messageId: string,
      updatesOrFn: Partial<ChatMessage> | ((prev: ChatMessage) => Partial<ChatMessage>)
    ) => {
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id !== chatId) return c;
          const messages = (c.messages || []).map((m) => {
            if (m.id !== messageId) return m;
            const updates = typeof updatesOrFn === 'function' ? updatesOrFn(m) : updatesOrFn;
            return {
              ...m,
              ...updates,
              updatedAt: Date.now(),
            };
          });
          return {
            ...c,
            messages,
            updatedAt: new Date().toISOString(),
          };
        });
        persistConversations(next);
        return next;
      });
    },
    [persistConversations]
  );

  // Finalize any running or streaming messages and tools when a run concludes or interrupts
  const finalizeActiveRun = useCallback(
    (chatId: string, status: 'done' | 'error' | 'interrupted', errorMsg?: string) => {
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id !== chatId) return c;
          const messages = (c.messages || []).map((m) => {
            if (m.status === 'pending' || m.status === 'streaming') {
              return {
                ...m,
                status,
                content:
                  status === 'interrupted' && !m.content
                    ? 'This run was interrupted. Resume?'
                    : m.content,
                errorMessage: errorMsg || m.errorMessage,
                updatedAt: Date.now(),
              };
            }
            return m;
          });

          const tools = (c.tools || []).map((t) =>
            t.status === 'running'
              ? { ...t, status: status === 'done' ? ('done' as ToolStatus) : ('error' as ToolStatus) }
              : t
          );

          const nextStatus: ChatStatus =
            status === 'done'
              ? c.report
                ? 'completed'
                : 'idle'
              : status === 'error'
              ? 'error'
              : 'idle';

          return {
            ...c,
            status: nextStatus,
            isStreaming: false,
            messages,
            tools,
            errorMessage: errorMsg || c.errorMessage,
            updatedAt: new Date().toISOString(),
          };
        });
        persistConversations(next);
        return next;
      });
    },
    [persistConversations]
  );

  const renameConversation = useCallback(
    (id: string, newTitle: string) => {
      updateConversation(id, { title: newTitle.trim() || 'Untitled Research' });
    },
    [updateConversation]
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        persistConversations(next);
        return next;
      });

      setActiveId((curr) => {
        if (curr === id) {
          persistActiveId(null);
          return null;
        }
        return curr;
      });
    },
    [persistConversations, persistActiveId]
  );

  const clearAllConversations = useCallback(() => {
    setConversations([]);
    setActiveId(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_ID_KEY);
  }, []);

  const activeConversation = conversations.find((c) => c.id === activeId) || null;

  // Group conversations chronologically: Today, Yesterday, Previous
  const groupedConversations = useCallback(() => {
    const filtered = conversations.filter((c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const today: Conversation[] = [];
    const yesterday: Conversation[] = [];
    const previous: Conversation[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;

    filtered.forEach((conv) => {
      const created = new Date(conv.createdAt).getTime();
      if (created >= todayStart) {
        today.push(conv);
      } else if (created >= yesterdayStart) {
        yesterday.push(conv);
      } else {
        previous.push(conv);
      }
    });

    return { today, yesterday, previous };
  }, [conversations, searchQuery]);

  return {
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
    clearAllConversations,
    groupedConversations,
  };
}
