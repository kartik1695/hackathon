import React, {
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  sendMessage,
  ChatResponse,
  fetchSessions,
  fetchSessionMessages,
  fetchMe,
  fetchUnreadNotifications,
  renotifyLeave,
  RenotifyResult,
  UserProfile,
  SessionMeta,
  WS_BASE,
} from "./api";
import { getAccess, clearTokens, getValidToken } from "./auth";
import { refreshToken } from "./api";

interface NotificationCTA {
  label: string;
  action: string; // chat message to submit
  style?: "primary" | "danger";
}

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  isNotification?: boolean;
  notificationId?: number;
  ctas?: NotificationCTA[];
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

const DEFAULT_SUGGESTIONS = [
  "What is my leave balance?",
  "Apply CL for 2 days from 20th April",
  "Show my pending leave requests",
  "What are my actionables?",
  "Apply half-day AM leave for tomorrow",
];

function getContextSuggestions(lastReply: string): string[] {
  const r = lastReply.toLowerCase();
  if (r.includes("leave balance") || r.includes("casual leave") || r.includes("sick leave") || r.includes("earned leave")) {
    return [
      "Apply CL for tomorrow",
      "Apply half-day leave for today",
      "Show my leave history",
      "What is my sick leave balance?",
      "Apply earned leave for next week",
    ];
  }
  if (r.includes("applied") || r.includes("application") || r.includes("submitted") || r.includes("request")) {
    return [
      "Show my pending leave requests",
      "Cancel my last leave request",
      "What is the status of my leave?",
      "Apply another leave",
      "Show my leave history",
    ];
  }
  if (r.includes("approved") || r.includes("approval")) {
    return [
      "Show all pending approvals",
      "Who approved my leave?",
      "Apply another leave",
      "Show my leave balance",
      "What are my upcoming leaves?",
    ];
  }
  if (r.includes("attendance") || r.includes("check-in") || r.includes("check-out") || r.includes("present") || r.includes("absent")) {
    return [
      "Show my attendance this month",
      "How many days was I absent?",
      "Show attendance trend",
      "Mark my attendance",
      "What is my leave balance?",
    ];
  }
  if (r.includes("payroll") || r.includes("salary") || r.includes("payslip") || r.includes("ctc")) {
    return [
      "Show my latest payslip",
      "What is my CTC breakdown?",
      "When is next payday?",
      "Show payroll history",
      "Download my payslip",
    ];
  }
  if (r.includes("performance") || r.includes("rating") || r.includes("review") || r.includes("goal")) {
    return [
      "Show my performance rating",
      "What are my pending goals?",
      "When is my next review?",
      "Show team performance",
      "Add a performance note",
    ];
  }
  if (r.includes("burnout") || r.includes("workload") || r.includes("overtime") || r.includes("stress")) {
    return [
      "Show burnout risk for my team",
      "Who is at high risk?",
      "Apply leave for rest",
      "Show overtime hours",
      "Schedule a 1:1 meeting",
    ];
  }
  if (r.includes("team") || r.includes("direct report") || r.includes("reportee") || r.includes("manager")) {
    return [
      "Show team leave summary",
      "Who is on leave today?",
      "Show team attendance",
      "Pending approvals for my team",
      "Team performance summary",
    ];
  }
  return DEFAULT_SUGGESTIONS;
}

function buildCTAs(metadata: Record<string, unknown>): NotificationCTA[] {
  const ctas: NotificationCTA[] = [];
  const leaveId = metadata?.leave_id;
  const empName = metadata?.employee_name as string | undefined;
  const compOffId = metadata?.comp_off_id;

  if (metadata?.action_required) {
    if (leaveId) {
      // Always include leave_id in the action so the AI parser can extract it reliably
      ctas.push({ label: "Approve", action: `Approve leave #${leaveId}`, style: "primary" });
      ctas.push({ label: "Reject", action: `Reject leave #${leaveId}`, style: "danger" });
    }
    if (compOffId) {
      ctas.push({ label: "Approve Comp Off", action: `Approve comp off #${compOffId}`, style: "primary" });
      ctas.push({ label: "Reject", action: `Reject comp off #${compOffId}`, style: "danger" });
    }
  }
  if (leaveId && !metadata?.action_required) {
    ctas.push({ label: "View my leaves", action: "Show my leave history", style: "primary" });
    // Employee-facing: allow re-notifying manager if leave is pending
    if (metadata?.status === "PENDING" || (!metadata?.status && metadata?.action_required === undefined)) {
      ctas.push({ label: "Remind manager", action: `__renotify_leave_${leaveId}`, style: "primary" });
    }
  }
  return ctas;
}

// ── Chart support ────────────────────────────────────────────────────────────

interface ChartSpec {
  type: "bar" | "line" | "pie" | "area";
  title?: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
}

const CHART_COLORS = ["#E8622A", "#2C1810", "#8B6147", "#F59E4A", "#B8977E", "#6B4F3A"];

function ChartBlock({ spec }: { spec: ChartSpec }) {
  const { type, title, data, xKey, yKeys } = spec;
  return (
    <div className="my-3">
      {title && (
        <p className="text-xs font-semibold mb-2" style={{ color: "#2C1810" }}>{title}</p>
      )}
      <ResponsiveContainer width="100%" height={240}>
        {type === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey={yKeys[0] || "value"} nameKey={xKey} cx="50%" cy="50%" outerRadius={90} label>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        ) : type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0E4D8" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {yKeys.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        ) : type === "area" ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0E4D8" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {yKeys.map((k, i) => (
              <Area key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length] + "33"} strokeWidth={2} />
            ))}
          </AreaChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0E4D8" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {yKeys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Split message content into parts: text segments and chart specs.
 * Chart blocks: ```chart\n{...}\n```
 */
function parseMessageParts(content: string): Array<{ kind: "text"; text: string } | { kind: "chart"; spec: ChartSpec }> {
  const parts: Array<{ kind: "text"; text: string } | { kind: "chart"; spec: ChartSpec }> = [];
  const regex = /```chart\s*([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) {
      parts.push({ kind: "text", text: content.slice(last, match.index) });
    }
    try {
      const spec = JSON.parse(match[1].trim()) as ChartSpec;
      parts.push({ kind: "chart", spec });
    } catch {
      parts.push({ kind: "text", text: match[0] });
    }
    last = match.index + match[0].length;
  }
  if (last < content.length) {
    parts.push({ kind: "text", text: content.slice(last) });
  }
  return parts;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join("");
}

function useClock(): string {
  const [time, setTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  });
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setTime(now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
    }, 10000);
    return () => clearInterval(id);
  }, []);
  return time;
}

const MD_COMPONENTS = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto w-full my-2">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="text-left px-3 py-2 text-xs font-semibold whitespace-nowrap"
      style={{ background: "#F5EDE4", borderBottom: "1px solid #E8D9CC", color: "#2C1810" }}>
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-2 text-xs align-top"
      style={{ borderBottom: "1px solid #F0E4D8", color: "#3D2010" }}>
      {children}
    </td>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="hover:bg-orange-50 transition-colors">{children}</tr>
  ),
};

function AssistantContent({ content }: { content: string }) {
  const parts = parseMessageParts(content);
  return (
    <div className="prose prose-sm max-w-none overflow-x-auto" style={{ color: "#1C0F07" }}>
      {parts.map((part, i) =>
        part.kind === "chart" ? (
          <ChartBlock key={i} spec={part.spec} />
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={MD_COMPONENTS as never}>
            {part.text}
          </ReactMarkdown>
        )
      )}
    </div>
  );
}

const WELCOME: Message = {
  id: 0,
  role: "assistant",
  content:
    "Hi! I'm your Human Edge AI assistant. I can help you apply leaves, check balances, manage approvals, and more. How can I help you today?",
};

const QUOTES = [
  "Great things in business are never done by one person.",
  "The secret of getting ahead is getting started.",
  "Your work is going to fill a large part of your life.",
  "Innovation distinguishes between a leader and a follower.",
  "The way to get started is to quit talking and begin doing.",
  "Don't watch the clock; do what it does. Keep going.",
  "Success is not final, failure is not fatal: it is the courage to continue that counts.",
  "Believe you can and you're halfway there.",
  "It does not matter how slowly you go as long as you do not stop.",
  "Everything you've ever wanted is on the other side of fear.",
  "Hard work beats talent when talent doesn't work hard.",
  "Opportunities don't happen. You create them.",
  "Dream big and dare to fail.",
  "The best time to plant a tree was 20 years ago. The second best is now.",
  "What you do today can improve all your tomorrows.",
  "Don't limit your challenges. Challenge your limits.",
  "Act as if what you do makes a difference. It does.",
  "Success usually comes to those who are too busy to be looking for it.",
  "If you are not willing to risk the usual, you will have to settle for the ordinary.",
  "Don't be afraid to give up the good to go for the great.",
  "I find that the harder I work, the more luck I seem to have.",
  "There are no shortcuts to any place worth going.",
  "The only place where success comes before work is in the dictionary.",
  "Nothing will work unless you do.",
  "Start where you are. Use what you have. Do what you can.",
  "Your limitation—it's only your imagination.",
  "Push yourself, because no one else is going to do it for you.",
  "Great minds discuss ideas; average minds discuss events; small minds discuss people.",
  "You are never too old to set another goal or to dream a new dream.",
  "The future belongs to those who believe in the beauty of their dreams.",
  "If you want to achieve greatness, stop asking for permission.",
  "Work hard in silence, let your success be the noise.",
  "Don't stop when you're tired. Stop when you're done.",
  "Wake up with determination. Go to bed with satisfaction.",
  "Do something today that your future self will thank you for.",
  "Little things make big days.",
  "It's going to be hard, but hard is not impossible.",
  "Don't wait for opportunity. Create it.",
  "Sometimes we're tested not to show our weaknesses, but to discover our strengths.",
  "Strive for greatness.",
  "Wanting to be someone else is a waste of who you are.",
  "You get what you work for, not what you wish for.",
  "Be so good they can't ignore you.",
  "The harder the battle, the sweeter the victory.",
  "Dream it. Wish it. Do it.",
  "Stay focused and never give up.",
  "Every expert was once a beginner.",
  "Hustle until your haters ask if you're hiring.",
  "Don't count the days, make the days count.",
  "The man who has confidence in himself gains the confidence of others.",
  "You didn't come this far to only come this far.",
  "The key to success is to focus on goals, not obstacles.",
  "Be the change you wish to see in the world.",
  "Doubt kills more dreams than failure ever will.",
  "Failure is the condiment that gives success its flavor.",
  "If you can dream it, you can do it.",
  "Well done is better than well said.",
  "The secret to success is to know something nobody else knows.",
  "Motivation is what gets you started. Habit is what keeps you going.",
  "You miss 100% of the shots you don't take.",
  "I have not failed. I've just found 10,000 ways that won't work.",
  "In the middle of every difficulty lies opportunity.",
  "It always seems impossible until it's done.",
  "The road to success and the road to failure are almost exactly the same.",
  "Success is walking from failure to failure with no loss of enthusiasm.",
  "You only fail when you stop trying.",
  "We generate fears while we sit. We overcome them by action.",
  "Whether you think you can or think you can't, you're right.",
  "Security is mostly a superstition. Life is either a daring adventure or nothing.",
  "The only way to do great work is to love what you do.",
  "If you can't explain it simply, you don't understand it well enough.",
  "Life is what happens when you're busy making other plans.",
  "The greatest glory in living lies not in never falling, but in rising every time we fall.",
  "In the end, it's not the years in your life that count. It's the life in your years.",
  "It is during our darkest moments that we must focus to see the light.",
  "You will face many defeats in life, but never let yourself be defeated.",
  "The greatest glory is not in never failing, but in rising every time we fail.",
  "In the beginning was the word. In the end is the deed.",
  "Never let the fear of striking out keep you from playing the game.",
  "Money and success don't change people; they merely amplify what is already there.",
  "Your time is limited, so don't waste it living someone else's life.",
  "If life were predictable it would cease to be life, and be without flavor.",
  "If you look at what you have in life, you'll always have more.",
  "If you want to live a happy life, tie it to a goal, not to people or things.",
  "Never let the fear of striking out keep you from playing the game.",
  "The only impossible journey is the one you never begin.",
  "In this life we cannot do great things. We can only do small things with great love.",
  "Spread love everywhere you go. Let no one ever come to you without leaving happier.",
  "When you reach the end of your rope, tie a knot in it and hang on.",
  "Always remember that you are absolutely unique. Just like everyone else.",
  "Don't judge each day by the harvest you reap but by the seeds that you plant.",
  "The future belongs to those who prepare for it today.",
  "Tell me and I forget. Teach me and I remember. Involve me and I learn.",
  "The best and most beautiful things in the world cannot be seen or even touched.",
  "It is only a life lived for others that is worth living.",
  "Perfection is not attainable, but if we chase it, we can catch excellence.",
  "If you can't outwork them, out-think them.",
  "You are braver than you believe, stronger than you seem.",
  "The purpose of our lives is to be happy.",
  "Get busy living or get busy dying.",
  "You only live once, but if you do it right, once is enough.",
];

function getRandomQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sessionDisplayTitle(s: SessionMeta): string {
  if (s.title && s.title.trim()) return s.title.trim();
  // Fallback: formatted datetime
  const d = new Date(s.last_active_at);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// Group sessions by recency label
function groupSessions(sessions: SessionMeta[]): { label: string; items: SessionMeta[] }[] {
  const groups: Record<string, SessionMeta[]> = {};
  sessions.forEach((s) => {
    const label = formatSessionDate(s.last_active_at);
    if (!groups[label]) groups[label] = [];
    groups[label].push(s);
  });
  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

export default function ChatPage() {
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [collectionState, setCollectionState] = useState<CollectionState>({});

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [quote, setQuote] = useState(getRandomQuote);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  // Track notification IDs already shown via initial REST fetch — prevents double-counting
  // when WS flushes the same unread notifications on connect.
  const seenNotifIds = useRef<Set<number>>(new Set());
  const time = useClock();

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = await getValidToken(refreshToken);
        const [list, me, unread] = await Promise.all([
          fetchSessions(token),
          fetchMe(token),
          fetchUnreadNotifications(token),
        ]);
        setSessions(list);
        if (me) setUserProfile(me);
        setUnreadCount(unread.length);
        // Pre-populate seenNotifIds so WS flush won't double-count these
        unread.forEach((n) => seenNotifIds.current.add(n.id));
      } catch {
        // non-critical
      }
    }
    load();
  }, []);

  // WebSocket — real-time notifications
  useEffect(() => {
    let ws: WebSocket;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let destroyed = false;

    async function connect() {
      if (destroyed) return;

      let token: string;
      try {
        token = await getValidToken(refreshToken);
      } catch {
        return; // not logged in or refresh failed — stop retrying
      }

      ws = new WebSocket(`${WS_BASE}/ws/notifications/?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type !== "notification") return;

          const ctas = buildCTAs(data.metadata || {});
          const notifMsg: Message = {
            id: nextId(),
            role: "assistant",
            content: `**${data.subject}**\n\n${data.body}`,
            isNotification: true,
            notificationId: data.id,
            ctas,
          };
          // Deduplicate: skip if this notification ID is already shown as a bubble
          setMessages((prev) => {
            const alreadyShown = prev.some((m) => m.notificationId === data.id);
            if (alreadyShown) return prev;
            return [...prev, notifMsg];
          });
          // Only increment counter for truly NEW notifications (not WS flush of already-counted ones)
          if (!seenNotifIds.current.has(data.id)) {
            setUnreadCount((c) => c + 1);
          }
          seenNotifIds.current.add(data.id);
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = (ev) => {
        if (destroyed) return;
        // 4001 = auth failed — wait longer before retry (token may need refresh)
        const delay = ev.code === 4001 ? 10000 : 5000;
        retryTimeout = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(retryTimeout);
      wsRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  /** Get a fresh token (proactive refresh if within 60s of expiry). */
  async function freshToken(): Promise<string> {
    return getValidToken(refreshToken);
  }

  function markNotificationRead(notificationId: number) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "mark_read", id: notificationId }));
    }
    // Remove bubble from chat + decrement badge
    setMessages((prev) => prev.filter((m) => m.notificationId !== notificationId));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  /** Bell button: re-surface all unread notifications into chat */
  async function renotify() {
    try {
      const token = await freshToken();
      const items = await fetchUnreadNotifications(token);
      // Always sync badge to actual server count
      setUnreadCount(items.length);
      // Sync seenNotifIds so future WS pushes of these are not double-counted
      items.forEach((n) => seenNotifIds.current.add(n.id));
      if (items.length === 0) {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", content: "✅ No unread notifications right now.", isNotification: true, ctas: [] },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        ...items.map((n) => ({
          id: nextId(),
          role: "assistant" as const,
          content: `**${n.subject}**\n\n${n.body}`,
          isNotification: true,
          notificationId: n.id,
          ctas: buildCTAs(n.metadata),
        })),
      ]);
    } catch {
      // non-critical
    }
  }

  /** Employee reminds manager about a specific pending leave */
  async function handleRenotifyLeave(leaveId: number) {
    try {
      const token = await freshToken();
      const result: RenotifyResult = await renotifyLeave(token, leaveId);
      let content = "";
      switch (result.status) {
        case "re_pushed":
          content = `🔁 **Reminder sent!** Your manager hasn't read the notification yet — we've re-sent it. `
            + `(${result.reminders_left} reminder${result.reminders_left === 1 ? "" : "s"} remaining)`;
          break;
        case "new_reminder":
          content = `🔁 **Reminder sent!** Your manager had seen the original notification but hasn't acted yet — a fresh reminder has been delivered. `
            + `(${result.reminders_left} reminder${result.reminders_left === 1 ? "" : "s"} remaining)`;
          break;
        case "limit_reached":
          content = `⚠️ You've already sent the maximum 3 reminders for this leave. Please contact your manager directly.`;
          break;
        case "cooldown":
          content = `⏳ You can send another reminder in ${result.next_available_in_minutes} minute(s). Please wait a bit.`;
          break;
        case "not_found":
          content = `❌ Could not find a pending leave #${leaveId} to remind about. It may have already been actioned.`;
          break;
        default:
          content = `❌ Something went wrong: ${result.error || "unknown error"}`;
      }
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content, isNotification: true, ctas: [] },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: `❌ Renotify failed: ${msg}`, error: true },
      ]);
    }
  }

  async function loadSession(session: SessionMeta) {
    if (activeSessionId === session.session_id) return;
    setLoadingHistory(true);
    try {
      const token = await freshToken();
      const backendMessages = await fetchSessionMessages(token, session.session_id);
      const restored: Message[] = backendMessages.map((m) => ({
        id: nextId(),
        role: m.role,
        content: m.content,
      }));
      setMessages(restored.length ? restored : [WELCOME]);
      setSessionId(session.session_id);
      setActiveSessionId(session.session_id);
      setCollectionState({});
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }

  function startNewChat() {
    setMessages([{ ...WELCOME, id: nextId() }]);
    setSessionId(null);
    setActiveSessionId(null);
    setCollectionState({});
    setInput("");
    setQuote(getRandomQuote());
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // Intercept renotify intent client-side — avoid chat round-trip
    const renotifyPattern = /(?:re[-\s]?notify|remind)\s+(?:my\s+)?manager(?:\s+about)?(?:\s+(?:leave|request))?\s+#?(\d+)/i;
    const renotifyMatch = trimmed.match(renotifyPattern);
    if (renotifyMatch) {
      const leaveId = parseInt(renotifyMatch[1], 10);
      setMessages((prev) => [...prev, { id: nextId(), role: "user", content: trimmed }]);
      setInput("");
      await handleRenotifyLeave(leaveId);
      return;
    }

    setMessages((prev) => [...prev, { id: nextId(), role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const token = await freshToken();
      const data = await sendMessage(token, trimmed, sessionId, collectionState);

      const newCS = {
        collection_stage: data.collection_stage,
        collecting_index: data.collecting_index,
        leave_items: data.leave_items,
        policy_violations: data.policy_violations,
      };
      setSessionId(data.session_id);
      setActiveSessionId(data.session_id);
      setCollectionState(newCS);
      const reply = data.reply || "✓ Done.";
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant" as const, content: reply },
      ]);

      // Refresh session list so new title appears
      fetchSessions(token).then(setSessions).catch(() => {});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      if (
        message.toLowerCase().includes("not logged in") ||
        message.toLowerCase().includes("session expired")
      ) {
        clearTokens();
        navigate("/");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: `**Error:** ${message}`, error: true },
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

  const activeSession = sessions.find((s) => s.session_id === activeSessionId);
  const grouped = groupSessions(sessions);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#FBF4ED" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className="flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden"
        style={{
          width: sidebarOpen ? "260px" : "0px",
          background: "#1C0F07",
        }}
      >
        {/* Brand */}
        <div className="flex-shrink-0 px-4 pt-5 pb-3">
          <div className="flex items-center gap-2.5 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: "#E8622A" }}
            >
              HE
            </div>
            <span className="text-white text-sm font-semibold tracking-tight truncate">
              Human Edge
            </span>
          </div>

          {/* New chat button */}
          <button
            onClick={startNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: "rgba(232,98,42,0.15)",
              color: "#E8622A",
              border: "1px solid rgba(232,98,42,0.3)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(232,98,42,0.25)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(232,98,42,0.15)";
            }}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New chat
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
          {grouped.length === 0 ? (
            <p className="text-xs px-3 py-3" style={{ color: "#6B4F3A" }}>
              No previous chats
            </p>
          ) : (
            grouped.map(({ label, items }) => (
              <div key={label} className="mb-3">
                <p
                  className="text-[10px] font-semibold uppercase tracking-wider px-3 py-1"
                  style={{ color: "#6B4F3A" }}
                >
                  {label}
                </p>
                {items.map((s) => {
                  const isActive = activeSessionId === s.session_id;
                  return (
                    <button
                      key={s.session_id}
                      onClick={() => loadSession(s)}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all mb-0.5 truncate"
                      style={{
                        background: isActive ? "rgba(232,98,42,0.2)" : "transparent",
                        color: isActive ? "#E8622A" : "#C4A99A",
                        borderLeft: isActive ? "2px solid #E8622A" : "2px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            "rgba(255,255,255,0.05)";
                          (e.currentTarget as HTMLButtonElement).style.color = "#E8D5C8";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                          (e.currentTarget as HTMLButtonElement).style.color = "#C4A99A";
                        }
                      }}
                      title={sessionDisplayTitle(s)}
                    >
                      {sessionDisplayTitle(s)}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Sign out */}
        <div
          className="flex-shrink-0 p-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button
            onClick={() => { clearTokens(); navigate("/"); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all"
            style={{ color: "#6B4F3A" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#E8622A";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(232,98,42,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#6B4F3A";
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Top bar */}
        <header
          className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ background: "#FBF4ED", borderBottom: "1px solid #E8D9CC" }}
        >
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: "#8B6147" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#EDE3D9")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Brand logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold"
              style={{ background: "#E8622A" }}
            >
              HE
            </div>
            <span className="text-sm font-semibold tracking-tight" style={{ color: "#2C1810" }}>
              Human Edge
            </span>
          </div>

          <div className="flex-1" />

          {/* Notification bell — click to re-surface unread notifications */}
          <button
            onClick={renotify}
            className="relative flex-shrink-0 p-1.5 rounded-lg transition-colors"
            title="Show unread notifications"
            style={{ color: "#8B6147" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#EDE3D9"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span
                className="absolute top-0 right-0 w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                style={{ background: "#E8622A" }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* User avatar + time */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Live time */}
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold tabular-nums" style={{ color: "#2C1810" }}>
                {time}
              </p>
              <p className="text-[10px]" style={{ color: "#B8977E" }}>
                {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </p>
            </div>

            {/* User initials circle */}
            {userProfile ? (
              <div className="relative group cursor-default">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ background: "#2C1810" }}
                >
                  {getInitials(userProfile.name)}
                </div>
                {/* Tooltip */}
                <div
                  className="absolute right-0 top-10 w-44 rounded-xl p-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10"
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E8D9CC",
                    boxShadow: "0 4px 16px rgba(44,24,16,0.12)",
                  }}
                >
                  <p className="text-xs font-semibold truncate" style={{ color: "#2C1810" }}>
                    {userProfile.name}
                  </p>
                  <p className="text-[10px] truncate mt-0.5" style={{ color: "#8B6147" }}>
                    {userProfile.title || userProfile.role}
                  </p>
                  {userProfile.department && (
                    <p className="text-[10px] truncate" style={{ color: "#B8977E" }}>
                      {userProfile.department.name}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="w-8 h-8 rounded-full flex-shrink-0"
                style={{ background: "#E8D9CC" }}
              />
            )}
          </div>
        </header>

        {/* Loading history */}
        {loadingHistory && (
          <div
            className="px-4 py-2 text-center text-xs flex-shrink-0"
            style={{ background: "#FDF0E6", color: "#E8622A", borderBottom: "1px solid #F2DECE" }}
          >
            Loading messages…
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto space-y-5">

            {/* New chat welcome — quote + suggestions */}
            {messages.length === 1 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-base mb-6"
                  style={{ background: "#E8622A" }}
                >
                  HE
                </div>
                <p
                  className="text-lg font-semibold max-w-md leading-snug mb-2"
                  style={{ color: "#2C1810" }}
                >
                  "{quote}"
                </p>
                <p className="text-xs mb-8" style={{ color: "#B8977E" }}>
                  How can I help you today?
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {DEFAULT_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="text-xs rounded-full px-3 py-1.5 transition-all"
                      style={{
                        background: "#FFFFFF",
                        color: "#8B6147",
                        border: "1px solid #E8D9CC",
                        boxShadow: "0 1px 2px rgba(44,24,16,0.06)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8622A";
                        (e.currentTarget as HTMLButtonElement).style.color = "#E8622A";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8D9CC";
                        (e.currentTarget as HTMLButtonElement).style.color = "#8B6147";
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              msg.id === 0 ? null : msg.isNotification ? (
                /* ── Notification bubble ── */
                <div key={msg.id} className="flex justify-start">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center mr-2.5 mt-0.5 flex-shrink-0 text-white text-[9px] font-bold"
                    style={{ background: "#E8622A" }}
                  >
                    🔔
                  </div>
                  <div
                    className="max-w-[82%] rounded-2xl px-4 py-3 text-sm"
                    style={{
                      background: "#FEF5EE",
                      border: "1px solid #F2DECE",
                      borderRadius: "4px 18px 18px 18px",
                      boxShadow: "0 1px 3px rgba(232,98,42,0.1)",
                    }}
                    onClick={() => msg.notificationId && markNotificationRead(msg.notificationId)}
                  >
                    <div className="prose prose-sm max-w-none" style={{ color: "#1C0F07" }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                    {msg.ctas && msg.ctas.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: "1px solid #F2DECE" }}>
                        {msg.ctas.map((cta) => (
                          <button
                            key={cta.label}
                            onClick={() => {
                              if (msg.notificationId) markNotificationRead(msg.notificationId);
                              // Intercept renotify actions — call REST directly instead of chat
                              const renotifyMatch = cta.action.match(/^__renotify_leave_(\d+)$/);
                              if (renotifyMatch) {
                                handleRenotifyLeave(parseInt(renotifyMatch[1], 10));
                                return;
                              }
                              submit(cta.action);
                            }}
                            className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-all"
                            style={
                              cta.style === "danger"
                                ? { background: "#FEE2E2", color: "#991B1B", border: "1px solid #FCA5A5" }
                                : { background: "#E8622A", color: "#FFFFFF" }
                            }
                            onMouseEnter={(e) => {
                              if (cta.style === "danger") {
                                (e.currentTarget as HTMLButtonElement).style.background = "#FECACA";
                              } else {
                                (e.currentTarget as HTMLButtonElement).style.background = "#C94E1E";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (cta.style === "danger") {
                                (e.currentTarget as HTMLButtonElement).style.background = "#FEE2E2";
                              } else {
                                (e.currentTarget as HTMLButtonElement).style.background = "#E8622A";
                              }
                            }}
                          >
                            {cta.label}
                          </button>
                        ))}
                        {msg.notificationId && (
                          <button
                            onClick={() => {
                              /* dismiss — mark read, remove from view */
                              markNotificationRead(msg.notificationId!);
                              setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg transition-all"
                            style={{ background: "transparent", color: "#8B6147", border: "1px solid #E8D9CC" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F5EDE4"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : // hide the WELCOME placeholder bubble
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center mr-2.5 mt-0.5 flex-shrink-0 text-white text-[9px] font-bold"
                    style={{ background: "#E8622A" }}
                  >
                    HE
                  </div>
                )}
                <div
                  className="max-w-[82%] rounded-2xl px-4 py-3 text-sm"
                  style={
                    msg.role === "user"
                      ? {
                          background: "#2C1810",
                          color: "#FBF4ED",
                          borderRadius: "18px 18px 4px 18px",
                        }
                      : msg.error
                      ? {
                          background: "#FEF2F2",
                          color: "#1C0F07",
                          border: "1px solid #FCA5A5",
                          borderRadius: "4px 18px 18px 18px",
                        }
                      : {
                          background: "#FFFFFF",
                          color: "#1C0F07",
                          border: "1px solid #E8D9CC",
                          borderRadius: "4px 18px 18px 18px",
                          boxShadow: "0 1px 3px rgba(44,24,16,0.06)",
                        }
                  }
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  ) : (
                    <AssistantContent content={msg.content} />
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center mr-2.5 mt-0.5 flex-shrink-0 text-white text-[9px] font-bold"
                  style={{ background: "#E8622A" }}
                >
                  HE
                </div>
                <div
                  className="rounded-2xl px-4 py-3"
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E8D9CC",
                    borderRadius: "4px 18px 18px 18px",
                    boxShadow: "0 1px 3px rgba(44,24,16,0.06)",
                  }}
                >
                  <div className="flex gap-1 items-center h-4">
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s]"
                      style={{ background: "#E8622A" }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s]"
                      style={{ background: "#E8622A" }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: "#E8622A" }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input bar */}
        <div
          className="px-4 py-4 flex-shrink-0"
          style={{ background: "#FBF4ED", borderTop: "1px solid #E8D9CC" }}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); submit(input); }}
            className="max-w-2xl mx-auto"
          >
            <div
              className="flex items-end gap-2 px-4 py-3 rounded-2xl transition-all"
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8D9CC",
                boxShadow: "0 2px 8px rgba(44,24,16,0.08)",
              }}
              onFocus={() => {}}
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything — leave, balance, approvals…"
                className="flex-1 bg-transparent text-sm resize-none outline-none py-0.5 min-h-[22px]"
                style={{ color: "#1C0F07" }}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all mb-0.5 disabled:opacity-40"
                style={{ background: "#E8622A" }}
                onMouseEnter={(e) => {
                  if (!loading && input.trim())
                    (e.currentTarget as HTMLButtonElement).style.background = "#C94E1E";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#E8622A";
                }}
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <p className="text-center text-[10px] mt-1.5" style={{ color: "#B8977E" }}>
              Enter to send · Shift+Enter for new line
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
