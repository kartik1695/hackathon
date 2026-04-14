import {
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
  FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sendMessage, ChatResponse } from "./api";
import { getAccess, getRefresh, saveTokens, clearTokens } from "./auth";
import { refreshToken } from "./api";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface CollectionState {
  collection_stage?: string | null;
  collecting_index?: number;
  leave_items?: unknown[];
  policy_violations?: unknown[];
}

let _msgId = 0;
function nextId() {
  return ++_msgId;
}

const SUGGESTIONS = [
  "What is my leave balance?",
  "Apply CL for 2 days from 20th April",
  "Show my pending leave requests",
  "What are my actionables?",
  "Apply half-day AM leave for tomorrow",
];

export default function ChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      role: "assistant",
      content:
        "Hi! I'm your HRMS assistant. I can help you apply leaves, check balances, manage approvals, and more. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [collectionState, setCollectionState] = useState<CollectionState>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  async function getValidToken(): Promise<string> {
    let token = getAccess();
    if (!token) throw new Error("Not logged in");
    // Try the call; if 401, refresh once
    return token;
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: nextId(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      let token = await getValidToken();
      let data: ChatResponse;

      try {
        data = await sendMessage(token, trimmed, sessionId, collectionState);
      } catch (err: unknown) {
        // Attempt token refresh once on auth error
        if (err instanceof Error && err.message.includes("401")) {
          const refresh = getRefresh();
          if (!refresh) throw err;
          const newAccess = await refreshToken(refresh);
          saveTokens(newAccess, refresh);
          data = await sendMessage(newAccess, trimmed, sessionId, collectionState);
        } else {
          throw err;
        }
      }

      setSessionId(data.session_id);
      setCollectionState({
        collection_stage: data.collection_stage,
        collecting_index: data.collecting_index,
        leave_items: data.leave_items,
        policy_violations: data.policy_violations,
      });

      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: data.reply || "✓ Done." },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      if (message.toLowerCase().includes("not logged in") || message.toLowerCase().includes("session expired")) {
        clearTokens();
        navigate("/");
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: `**Error:** ${message}`,
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    submit(input);
  }

  function handleLogout() {
    clearTokens();
    navigate("/");
  }

  function handleNewChat() {
    setMessages([
      {
        id: nextId(),
        role: "assistant",
        content:
          "Hi! I'm your HRMS assistant. I can help you apply leaves, check balances, manage approvals, and more. How can I help you today?",
      },
    ]);
    setSessionId(null);
    setCollectionState({});
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white text-sm font-bold">H</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900">HRMS-AI</h1>
            <p className="text-xs text-slate-500">HR Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewChat}
            className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-400 rounded-lg px-3 py-1.5 transition-colors"
          >
            New Chat
          </button>
          <button
            onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                  <span className="text-indigo-600 text-xs font-bold">AI</span>
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : msg.error
                    ? "bg-red-50 border border-red-200 text-slate-800 rounded-tl-sm"
                    : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"
                }`}
              >
                {msg.role === "user" ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-sm max-w-none prose-headings:text-slate-800 prose-p:text-slate-700 prose-strong:text-slate-900 prose-table:text-xs prose-th:bg-slate-100 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                <span className="text-indigo-600 text-xs font-bold">AI</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Suggestions — only on first message */}
      {messages.length === 1 && !loading && (
        <div className="px-4 pb-2">
          <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                className="text-xs bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 text-slate-600 rounded-full px-3 py-1.5 transition-colors shadow-sm"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 flex-shrink-0">
        <form onSubmit={handleFormSubmit} className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-slate-50 border border-slate-300 rounded-2xl px-4 py-2 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-200 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything — apply leave, check balance, approve requests…"
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 resize-none outline-none py-1 min-h-[24px]"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex-shrink-0 w-8 h-8 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors mb-0.5"
            >
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-2">
            Press Enter to send · Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}
