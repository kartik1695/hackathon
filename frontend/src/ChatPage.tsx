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
  notifMetadata?: Record<string, unknown>;
  tool_results?: Record<string, any>;
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
  const compOffId = metadata?.comp_off_id;
  const regularizationId = metadata?.regularization_id;
  const wfhId = metadata?.wfh_id;
  const status = metadata?.status as string | undefined;
  const actionRequired = metadata?.action_required;

  // ── Manager action CTAs ──────────────────────────────────────────────────
  if (actionRequired) {
    if (leaveId) {
      ctas.push({ label: "✓ Approve", action: `Approve leave #${leaveId}`, style: "primary" });
      ctas.push({ label: "✗ Reject", action: `Reject leave #${leaveId}`, style: "danger" });
    }
    if (compOffId) {
      ctas.push({ label: "✓ Approve Comp Off", action: `Approve comp off #${compOffId}`, style: "primary" });
      ctas.push({ label: "✗ Reject", action: `Reject comp off #${compOffId}`, style: "danger" });
    }
    if (regularizationId) {
      ctas.push({ label: "✓ Approve", action: `Approve regularization #${regularizationId}`, style: "primary" });
      ctas.push({ label: "✗ Reject", action: `Reject regularization #${regularizationId}`, style: "danger" });
    }
    if (wfhId) {
      ctas.push({ label: "✓ Approve WFH", action: `Approve WFH #${wfhId}`, style: "primary" });
      ctas.push({ label: "✗ Reject", action: `Reject WFH #${wfhId}`, style: "danger" });
    }
  }

  // ── Employee-facing status CTAs ──────────────────────────────────────────
  if (!actionRequired) {
    if (leaveId) {
      ctas.push({ label: "View leaves", action: "Show my leave history", style: "primary" });
      if (!status || status === "PENDING") {
        ctas.push({ label: "Remind manager", action: `__renotify_leave_${leaveId}`, style: "primary" });
      }
    }
    if (regularizationId) {
      ctas.push({ label: "View regularizations", action: "Show my regularization requests", style: "primary" });
    }
    if (wfhId) {
      ctas.push({ label: "View WFH requests", action: "Show my WFH requests", style: "primary" });
    }
    if (compOffId && status === "APPROVED") {
      ctas.push({ label: "View comp off balance", action: "What is my comp off balance?", style: "primary" });
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

const CHART_COLORS = ["#E8D44D", "#111111", "#34D399", "#F87171", "#60A5FA", "#A78BFA"];

function ChartBlock({ spec }: { spec: ChartSpec }) {
  const { type, title, data, xKey, yKeys } = spec;
  return (
    <div className="my-3">
      {title && (
        <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-dark)" }}>{title}</p>
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
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EEEA" />
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
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EEEA" />
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
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EEEA" />
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
type MsgPart =
  | { kind: "text"; text: string }
  | { kind: "chart"; spec: ChartSpec }
  | { kind: "cta"; buttons: string[] };

function parseMessageParts(content: string): MsgPart[] {
  const parts: MsgPart[] = [];
  // Match both ```chart and :::cta blocks
  const regex = /```chart\s*([\s\S]*?)```|:::cta\s*([\s\S]*?):::/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) {
      parts.push({ kind: "text", text: content.slice(last, match.index) });
    }
    if (match[1] !== undefined) {
      // chart block
      try {
        const spec = JSON.parse(match[1].trim()) as ChartSpec;
        parts.push({ kind: "chart", spec });
      } catch {
        parts.push({ kind: "text", text: match[0] });
      }
    } else if (match[2] !== undefined) {
      // cta block
      try {
        const buttons = JSON.parse(match[2].trim()) as string[];
        if (Array.isArray(buttons)) parts.push({ kind: "cta", buttons });
      } catch {
        parts.push({ kind: "text", text: match[0] });
      }
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
      style={{ background: "var(--primary-pale)", borderBottom: "1px solid var(--card-border)", color: "var(--text-dark)" }}>
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-2 text-xs align-top"
      style={{ borderBottom: "1px solid var(--card-border)", color: "var(--text-dark)" }}>
      {children}
    </td>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="transition-colors" style={{ }}>{children}</tr>
  ),
};

function CtaButtons({ buttons, onSelect }: { buttons: string[]; onSelect: (b: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {buttons.map((b, i) => {
        const isSubmit = b.includes("Submit") || b.includes("✅");
        const isDanger = b.includes("Start Over") || b.includes("❌");
        return (
          <button
            key={i}
            onClick={() => onSelect(b)}
            className="text-xs font-semibold px-4 py-2 rounded-xl border transition-all hover:scale-105 active:scale-95"
            style={{
              background: isSubmit ? "var(--primary)" : isDanger ? "transparent" : "var(--primary-pale)",
              color: isSubmit ? "white" : isDanger ? "#FF6B6B" : "var(--primary)",
              borderColor: isDanger ? "#FF6B6B" : isSubmit ? "var(--primary)" : "transparent",
            }}
          >
            {b}
          </button>
        );
      })}
    </div>
  );
}

function AssistantContent({ content, onCta, hideCtas }: { content: string; onCta?: (text: string) => void; hideCtas?: boolean }) {
  const parts = parseMessageParts(content);
  return (
    <div className="prose prose-sm max-w-none overflow-x-auto" style={{ color: "var(--text-dark)" }}>
      {parts.map((part, i) =>
        part.kind === "chart" ? (
          <ChartBlock key={i} spec={part.spec} />
        ) : part.kind === "cta" ? (
          hideCtas ? null : <CtaButtons key={i} buttons={part.buttons} onSelect={b => onCta?.(b)} />
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
  "Your limitation\u2014it's only your imagination.",
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
  "The greatest glory is not in never failing, but in rising every time we fall.",
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

const STEP_STATUS: Record<string, { color: string; label: string }> = {
  PENDING:     { color: "#D1D5DB", label: "Pending" },
  IN_PROGRESS: { color: "#3B82F6", label: "In Progress" },
  SUBMITTED:   { color: "#8B5CF6", label: "Submitted" },
  APPROVED:    { color: "#10B981", label: "Approved" },
  REJECTED:    { color: "#EF4444", label: "Rejected" },
};

const ROADMAP_STATUS: Record<string, { bg: string; color: string }> = {
  PENDING_APPROVAL: { bg: "#FEF3C720", color: "#92400E" },
  IN_PROGRESS:      { bg: "#DBEAFE20", color: "#1E40AF" },
  COMPLETED:        { bg: "#D1FAE520", color: "#065F46" },
  REJECTED:         { bg: "#FEE2E220", color: "#991B1B" },
};

const PHASE_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
  "Foundation":             { bg: "#FEF3C7", color: "#92400E", icon: "🧱" },
  "Tactical Implementation":{ bg: "#DBEAFE", color: "#1E40AF", icon: "⚙️" },
  "Strategic Mastery":      { bg: "#D1FAE5", color: "#065F46", icon: "🎯" },
};

function DraftRoadmapChatCard({ draft, onAction }: { draft: any; onAction: (text: string) => void }) {
  const [modMode, setModMode] = useState(false);
  const [modText, setModText] = useState("");

  const steps: any[] = draft.steps ?? [];
  const phases = Array.from(new Set(steps.map((s: any) => s.phase).filter(Boolean)));
  const draftId = draft.draft_id;
  const skillName = draft.skill_name;

  function handleSubmit() {
    onAction("✅ Submit for Manager Approval");
  }
  function handleStartOver() {
    onAction("❌ Start Over");
  }
  function handleApplyMod() {
    if (!modText.trim()) return;
    onAction(`Modify my ${skillName} roadmap: ${modText.trim()}`);
    setModText("");
    setModMode(false);
  }

  return (
    <div className="mt-3 rounded-2xl overflow-hidden" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)" }}>
      {/* Header */}
      <div className="px-4 py-3" style={{ background: "linear-gradient(135deg, var(--primary-pale) 0%, #fff 100%)", borderBottom: "1px solid var(--card-border)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--text-dark)" }}>{skillName} Roadmap</p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Draft · {steps.length} milestones · Review before submitting</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D40" }}>
            DRAFT
          </span>
        </div>
        {draft.description && (
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{draft.description}</p>
        )}
      </div>

      {/* Steps grouped by phase */}
      <div className="px-4 py-2 space-y-3">
        {phases.length > 0
          ? phases.map((phase) => {
              const phaseSteps = steps.filter((s: any) => s.phase === phase);
              const pc = PHASE_COLORS[phase] ?? { bg: "#F3F4F6", color: "#6B7280", icon: "📌" };
              return (
                <div key={phase}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs">{pc.icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: pc.color }}>{phase}</span>
                    <div className="flex-1 h-px" style={{ background: pc.color + "30" }} />
                  </div>
                  <div className="space-y-1.5">
                    {phaseSteps.map((step: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: pc.bg + "60", border: `1px solid ${pc.color}20` }}>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                          style={{ background: pc.color + "20", color: pc.color }}>
                          {steps.indexOf(step) + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: "var(--text-dark)" }}>{step.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {step.difficulty && (
                              <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{step.difficulty}</span>
                            )}
                            {step.duration && (
                              <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>· {step.duration}h</span>
                            )}
                          </div>
                        </div>
                        {step.resource_url && (
                          <a href={step.resource_url} target="_blank" rel="noopener noreferrer"
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110"
                            style={{ background: "var(--primary)", color: "white" }}
                            title="Watch resource">
                            <span className="text-[10px]">▶</span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          : steps.map((step: any, idx: number) => (
              <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: "var(--page-bg)", border: "1px solid var(--card-border)" }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                  style={{ background: "var(--primary-pale)", color: "var(--primary)" }}>
                  {idx + 1}
                </div>
                <p className="flex-1 text-xs font-medium truncate" style={{ color: "var(--text-dark)" }}>{step.title}</p>
                {step.resource_url && (
                  <a href={step.resource_url} target="_blank" rel="noopener noreferrer"
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--primary)", color: "white" }}>
                    <span className="text-[10px]">▶</span>
                  </a>
                )}
              </div>
            ))
        }
      </div>

      {/* Modification input */}
      {modMode && (
        <div className="px-4 pb-3">
          <div className="p-3 rounded-xl" style={{ background: "var(--page-bg)", border: "1px solid var(--card-border)" }}>
            <p className="text-[10px] font-semibold mb-2" style={{ color: "var(--text-muted)" }}>What would you like to change?</p>
            <textarea
              autoFocus
              rows={2}
              value={modText}
              onChange={e => setModText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleApplyMod(); } }}
              placeholder="e.g. Remove strategic mastery phase, add more beginner content, focus on data analysis..."
              className="w-full text-xs px-3 py-2 rounded-xl resize-none focus:outline-none"
              style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-dark)" }}
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleApplyMod} disabled={!modText.trim()}
                className="text-xs font-semibold px-4 py-1.5 rounded-xl text-white disabled:opacity-40 transition-all"
                style={{ background: "var(--primary-dark)" }}>
                Apply Changes
              </button>
              <button onClick={() => { setModMode(false); setModText(""); }}
                className="text-xs px-3 py-1.5 rounded-xl" style={{ background: "var(--primary-pale)", color: "var(--text-muted)" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CTAs */}
      <div className="px-4 pb-4 pt-1 flex flex-wrap gap-2" style={{ borderTop: "1px solid var(--card-border)" }}>
        <button onClick={handleSubmit}
          className="text-xs font-bold px-4 py-2 rounded-xl text-white transition-all flex items-center gap-1.5"
          style={{ background: "var(--primary-dark)" }}>
          <span>✓</span> Submit to Manager
        </button>
        <button onClick={() => { setModMode(m => !m); setModText(""); }}
          className="text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
          style={{ background: "var(--primary-pale)", color: "var(--primary-dark)", border: "1px solid var(--primary-dark)30" }}>
          <span>✏️</span> I want changes
        </button>
        <button onClick={handleStartOver}
          className="text-xs font-semibold px-4 py-2 rounded-xl bg-red-50 text-red-600 transition-all flex items-center gap-1.5"
          style={{ border: "1px solid #FCA5A540" }}>
          <span>✕</span> Start Over
        </button>
      </div>
    </div>
  );
}

function RoadmapChatCard({ roadmap, role, token, onAction, employeeId }: {
  roadmap: any;
  role: string;
  token: string;
  onAction: (text: string) => void;
  employeeId?: number;
}) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [proofData, setProofData] = useState<Record<number, { url: string; notes: string }>>({});
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [localStatus, setLocalStatus] = useState<Record<number, string>>({});
  const [localRoadmapStatus, setLocalRoadmapStatus] = useState<string>(roadmap.status);
  const [managerAction, setManagerAction] = useState<{ stepId: number; type: "approve" | "reject" } | null>(null);
  const [actionError, setActionError] = useState("");

  const isManagerRole = ["manager", "hr", "cfo", "admin"].includes(role);
  // Only act as manager for OTHER people's roadmaps, not your own.
  // If employee_id absent from roadmap data, assume own roadmap (safe default).
  const isOwnRoadmap = roadmap.employee_id == null
    ? true
    : employeeId != null && roadmap.employee_id === employeeId;
  const isManager = isManagerRole && !isOwnRoadmap;
  const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

  const steps = roadmap.steps ?? [];
  const completed = steps.filter((s: any) => s.is_completed).length;
  const pct = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0;
  const rStyle = ROADMAP_STATUS[localRoadmapStatus] ?? { bg: "#F3F4F620", color: "#6B7280" };

  async function submitProof(stepId: number) {
    const d = proofData[stepId] ?? { url: "", notes: "" };
    if (!d.url) { setActionError("Evidence URL required"); return; }
    setSubmitting(stepId);
    setActionError("");
    try {
      const res = await fetch(`${BASE}/upskilling/steps/${stepId}/submit/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: d.url, notes: d.notes }),
      });
      const data = await res.json();
      if (data.error) { setActionError(data.error); }
      else {
        setLocalStatus(prev => ({ ...prev, [stepId]: "SUBMITTED" }));
        setExpandedStep(null);
      }
    } finally { setSubmitting(null); }
  }

  async function handleManagerStepAction(stepId: number, action: "approve" | "reject") {
    const fb = feedback[stepId] ?? "";
    if (action === "reject" && !fb.trim()) { setActionError("Feedback required for rejection"); return; }
    setSubmitting(stepId);
    setActionError("");
    try {
      const res = await fetch(`${BASE}/upskilling/steps/${stepId}/${action}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ feedback: fb || "Excellent work!" }),
      });
      const data = await res.json();
      if (data.error) { setActionError(data.error); }
      else {
        setLocalStatus(prev => ({ ...prev, [stepId]: action === "approve" ? "APPROVED" : "REJECTED" }));
        setManagerAction(null);
      }
    } finally { setSubmitting(null); }
  }

  async function handleRoadmapApprove() {
    const res = await fetch(`${BASE}/upskilling/roadmaps/${roadmap.id}/approve/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.error) setLocalRoadmapStatus("IN_PROGRESS");
  }

  return (
    <div className="mt-3 rounded-2xl overflow-hidden" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)" }}>
      {/* Header */}
      <div className="px-4 py-3" style={{ background: rStyle.bg, borderBottom: "1px solid var(--card-border)" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">🚀</span>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate" style={{ color: "var(--text-dark)" }}>{roadmap.skill_name}</p>
              {roadmap.employee_name && isManager && (
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{roadmap.employee_name}</p>
              )}
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
            style={{ background: rStyle.bg, color: rStyle.color, border: `1px solid ${rStyle.color}40` }}>
            {localRoadmapStatus.replace(/_/g, " ")}
          </span>
        </div>

        {/* Progress bar */}
        {steps.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-black/10 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: rStyle.color }} />
            </div>
            <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: rStyle.color }}>
              {completed}/{steps.length}
            </span>
          </div>
        )}

        {/* Manager: approve pending roadmap */}
        {isManager && localRoadmapStatus === "PENDING_APPROVAL" && (
          <div className="flex gap-2 mt-3">
            <button onClick={handleRoadmapApprove}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-xl text-white transition-all"
              style={{ background: "var(--primary)" }}>
              ✓ Approve Roadmap
            </button>
            <button onClick={() => onAction(`Reject roadmap #${roadmap.id}`)}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-red-100 text-red-700 transition-all">
              ✗ Reject
            </button>
          </div>
        )}
      </div>

      {/* Steps */}
      {steps.length > 0 && (
        <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
          {steps.map((step: any, idx: number) => {
            const effectiveStatus = localStatus[step.id] ?? step.status;
            const ss = STEP_STATUS[effectiveStatus] ?? STEP_STATUS.PENDING;
            const canSubmit = !isManager && (effectiveStatus === "IN_PROGRESS" || effectiveStatus === "REJECTED");
            const canManagerAct = isManager && effectiveStatus === "SUBMITTED";
            const isExpanded = expandedStep === step.id;
            const isManagerActing = managerAction?.stepId === step.id;

            return (
              <div key={step.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  {/* Step indicator */}
                  <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ background: step.is_completed ? "#10B981" : ss.color + "20", color: step.is_completed ? "white" : ss.color }}>
                      {step.is_completed ? "✓" : idx + 1}
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="w-px mt-1 flex-1" style={{ minHeight: "12px", background: "var(--card-border)" }} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-snug" style={{ color: "var(--text-dark)", textDecoration: step.is_completed ? "line-through" : "none", opacity: step.is_completed ? 0.5 : 1 }}>
                          {step.title}
                        </p>
                        {step.phase && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full mt-0.5 inline-block" style={{ background: "var(--primary-pale)", color: "var(--primary)" }}>
                            {step.phase}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: ss.color + "20", color: ss.color }}>
                          {ss.label}
                        </span>
                        {step.resource_url && (
                          <a href={step.resource_url} target="_blank" rel="noopener noreferrer"
                            className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "var(--primary-pale)", color: "var(--primary)" }}
                            title="Watch resource">
                            ▶
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Manager feedback on rejected step */}
                    {step.feedback && (effectiveStatus === "REJECTED" || effectiveStatus === "APPROVED") && (
                      <p className="text-[10px] mt-1 px-2 py-1 rounded-lg" style={{ background: effectiveStatus === "APPROVED" ? "#D1FAE5" : "#FEE2E2", color: effectiveStatus === "APPROVED" ? "#065F46" : "#991B1B" }}>
                        {effectiveStatus === "APPROVED" ? "✓" : "✗"} {step.feedback}
                      </p>
                    )}

                    {/* Employee: submit proof CTA */}
                    {canSubmit && !isExpanded && (
                      <button onClick={() => { setExpandedStep(step.id); setActionError(""); }}
                        className="mt-2 text-[11px] font-semibold px-3 py-1.5 rounded-xl transition-all"
                        style={{ background: "var(--primary)", color: "white" }}>
                        📎 Submit Proof
                      </button>
                    )}

                    {/* Employee: proof submission form */}
                    {canSubmit && isExpanded && (
                      <div className="mt-2 space-y-2 p-3 rounded-xl" style={{ background: "var(--page-bg)", border: "1px solid var(--card-border)" }}>
                        <p className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                          Submit proof for: <span style={{ color: "var(--text-dark)" }}>{step.title}</span>
                        </p>
                        <input type="url"
                          placeholder="Evidence link (GitHub / Dropbox URL) *"
                          value={proofData[step.id]?.url ?? ""}
                          onChange={e => setProofData(p => ({ ...p, [step.id]: { ...p[step.id], url: e.target.value, notes: p[step.id]?.notes ?? "" } }))}
                          className="w-full text-[11px] px-3 py-2 rounded-xl focus:outline-none"
                          style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-dark)" }}
                        />
                        <textarea rows={2}
                          placeholder="What did you learn? Key takeaways..."
                          value={proofData[step.id]?.notes ?? ""}
                          onChange={e => setProofData(p => ({ ...p, [step.id]: { ...p[step.id], notes: e.target.value, url: p[step.id]?.url ?? "" } }))}
                          className="w-full text-[11px] px-3 py-2 rounded-xl resize-none focus:outline-none"
                          style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-dark)" }}
                        />
                        {actionError && <p className="text-[10px] text-red-600">{actionError}</p>}
                        <div className="flex gap-2">
                          <button onClick={() => submitProof(step.id)}
                            disabled={submitting === step.id || !proofData[step.id]?.url}
                            className="text-[11px] font-semibold px-4 py-1.5 rounded-xl text-white disabled:opacity-50 transition-all"
                            style={{ background: "var(--primary)" }}>
                            {submitting === step.id ? "Submitting…" : "Submit for Review"}
                          </button>
                          <button onClick={() => setExpandedStep(null)}
                            className="text-[11px] px-3 py-1.5 rounded-xl"
                            style={{ background: "var(--primary-pale)", color: "var(--text-muted)" }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Manager: review submitted step */}
                    {canManagerAct && !isManagerActing && (
                      <div className="flex gap-2 mt-2">
                        {step.submission_url && (
                          <a href={step.submission_url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] font-semibold px-2.5 py-1.5 rounded-xl" style={{ background: "var(--primary-pale)", color: "var(--primary)" }}>
                            🔗 View Proof
                          </a>
                        )}
                        <button onClick={() => { setManagerAction({ stepId: step.id, type: "approve" }); setFeedback(p => ({ ...p, [step.id]: "" })); setActionError(""); }}
                          className="text-[10px] font-semibold px-2.5 py-1.5 rounded-xl text-white" style={{ background: "var(--primary)" }}>
                          ✓ Approve
                        </button>
                        <button onClick={() => { setManagerAction({ stepId: step.id, type: "reject" }); setFeedback(p => ({ ...p, [step.id]: "" })); setActionError(""); }}
                          className="text-[10px] font-semibold px-2.5 py-1.5 rounded-xl bg-red-100 text-red-700">
                          ✗ Reject
                        </button>
                      </div>
                    )}

                    {/* Manager: feedback form */}
                    {canManagerAct && isManagerActing && (
                      <div className="mt-2 space-y-2 p-3 rounded-xl" style={{ background: "var(--page-bg)", border: "1px solid var(--card-border)" }}>
                        <p className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                          {managerAction?.type === "approve" ? "✓ Approving" : "✗ Rejecting"}: <span style={{ color: "var(--text-dark)" }}>{step.title}</span>
                        </p>
                        <textarea rows={2}
                          placeholder={managerAction?.type === "approve" ? "Feedback (optional — 'Great work!')" : "Rejection reason (required)"}
                          value={feedback[step.id] ?? ""}
                          onChange={e => setFeedback(p => ({ ...p, [step.id]: e.target.value }))}
                          className="w-full text-[11px] px-3 py-2 rounded-xl resize-none focus:outline-none"
                          style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-dark)" }}
                        />
                        {actionError && <p className="text-[10px] text-red-600">{actionError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleManagerStepAction(step.id, managerAction!.type)}
                            disabled={submitting === step.id}
                            className="text-[11px] font-semibold px-4 py-1.5 rounded-xl text-white disabled:opacity-50 transition-all"
                            style={{ background: managerAction?.type === "approve" ? "var(--primary)" : "#EF4444" }}>
                            {submitting === step.id ? "Saving…" : `Confirm ${managerAction?.type === "approve" ? "Approve" : "Reject"}`}
                          </button>
                          <button onClick={() => setManagerAction(null)}
                            className="text-[11px] px-3 py-1.5 rounded-xl"
                            style={{ background: "var(--primary-pale)", color: "var(--text-muted)" }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function buildInlineCTAs(tool_results: Record<string, any>): NotificationCTA[] {
  const ctas: NotificationCTA[] = [];
  const wfhData = tool_results?.get_wfh_requests;
  const regData = tool_results?.get_regularization_requests;

  if (wfhData?.wfh_requests) {
    const pending = wfhData.wfh_requests.filter((r: any) => r.status === "PENDING");
    pending.forEach((r: any) => {
      ctas.push({ label: `✓ Approve WFH #${r.id}`, action: `Approve WFH #${r.id}`, style: "primary" });
      ctas.push({ label: `✗ Reject WFH #${r.id}`, action: `Reject WFH #${r.id}`, style: "danger" });
    });
  }
  if (regData?.requests) {
    const pending = regData.requests.filter((r: any) => r.status === "PENDING");
    pending.forEach((r: any) => {
      ctas.push({ label: `✓ Approve Reg #${r.id}`, action: `Approve regularization #${r.id}`, style: "primary" });
      ctas.push({ label: `✗ Reject Reg #${r.id}`, action: `Reject regularization #${r.id}`, style: "danger" });
    });
  }
  return ctas;
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
    " \u00b7 " +
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

interface ChatPageProps {
  embedded?: boolean;
  onNav?: (page: string) => void;
}

export default function ChatPage({ embedded, onNav }: ChatPageProps = {}) {
  const navigate = useNavigate();

  const SESSION_STORAGE_KEY = "hrms_active_session_id";

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => sessionStorage.getItem(SESSION_STORAGE_KEY));
  const [collectionState, setCollectionState] = useState<CollectionState>({});

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(false);
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

  // Persist session ID across navigation
  useEffect(() => {
    if (sessionId) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [sessionId]);

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
        unread.forEach((n) => seenNotifIds.current.add(n.id));

        // Restore previous session messages if we have a saved session ID
        const savedId = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (savedId && list.some((s) => s.session_id === savedId)) {
          try {
            const backendMessages = await fetchSessionMessages(token, savedId);
            const restored: Message[] = backendMessages.map((m) => ({
              id: nextId(),
              role: m.role as "user" | "assistant",
              content: m.content,
            }));
            if (restored.length) {
              setMessages(restored);
              setActiveSessionId(savedId);
            }
          } catch {
            // non-critical — just start fresh
          }
        }
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
            notifMetadata: data.metadata || {},
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
          notifMetadata: n.metadata || {},
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
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
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
      const reply = data.reply || "\u2713 Done.";
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant" as const, content: reply, tool_results: data.tool_results },
      ]);

      // Refresh session list so new title appears
      fetchSessions(token).then(setSessions).catch(() => { });
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
    <div
      className={`flex overflow-hidden ${embedded ? "h-full" : "h-screen"}`}
      style={{ background: "#0E1117" }}
    >

      {/* \u2500\u2500 Sidebar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <aside
        className="flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden relative z-20"
        style={{
          width: sidebarOpen ? "300px" : "0px",
          background: "#0E1117",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Brand */}
        <div className="flex-shrink-0 px-4 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black flex-shrink-0"
              style={{ background: "var(--primary)", color: "var(--primary-dark)" }}>
              ✦
            </div>
            <div>
              <p className="text-white text-[13px] font-bold tracking-tight leading-tight">AI Assistant</p>
              <p className="text-white/30 text-[10px]">HRMS Intelligence</p>
            </div>
          </div>

          {/* New chat button */}
          <button
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "white"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)"; }}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New conversation
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
          {grouped.length === 0 ? (
            <p className="text-[11px] px-2 py-2 text-white/25 italic">No conversations yet</p>
          ) : (
            grouped.map(({ label, items }) => (
              <div key={label} className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-1 mb-1" style={{ color: "rgba(255,255,255,0.2)" }}>
                  {label}
                </p>
                {items.map((s) => {
                  const isActive = activeSessionId === s.session_id;
                  return (
                    <button
                      key={s.session_id}
                      onClick={() => loadSession(s)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-all mb-0.5 truncate leading-snug`}
                      style={isActive
                        ? { background: "rgba(255,255,255,0.1)", color: "white", borderLeft: "2px solid var(--primary)" }
                        : { color: "rgba(255,255,255,0.35)", borderLeft: "2px solid transparent" }
                      }
                      onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.65)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; } }}
                      onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.35)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; } }}
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
        <div className="flex-shrink-0 px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <button
            onClick={() => { clearTokens(); navigate("/"); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all"
            style={{ color: "rgba(255,255,255,0.25)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.25)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
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
      <div className="flex flex-col flex-1 min-w-0 relative z-10" style={{ background: "#FAFAFA" }}>

        {!embedded && (
          <header
            className="flex items-center gap-3 px-5 py-0 flex-shrink-0"
            style={{
              background: "var(--primary-dark)",
              minHeight: "56px",
              boxShadow: "0 1px 0 rgba(255,255,255,0.07)",
            }}
          >
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black border border-white/15" style={{ background: "var(--primary)", color: "var(--primary-dark)" }}>
                ✦
              </div>
              <div>
                <p className="text-sm font-bold tracking-tight text-white leading-tight">AI Assistant</p>
                {activeSession && <p className="text-[10px] text-white/40 truncate max-w-[160px]">{sessionDisplayTitle(activeSession)}</p>}
              </div>
            </div>

            <div className="flex-1" />

            <button
              onClick={renotify}
              className="relative flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
              title="Show unread notifications"
            >
              <svg className="w-4 h-4 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold tabular-nums text-white/80">{time}</p>
                <p className="text-[10px] text-white/40">
                  {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </p>
              </div>

              {userProfile ? (
                <div className="relative group cursor-default">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-400 to-orange-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {getInitials(userProfile.name)}
                  </div>
                  <div className="absolute right-0 top-10 w-44 rounded-2xl p-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 bg-white/90 backdrop-blur-xl border border-white/80 shadow-xl">
                    <p className="text-xs font-bold text-gray-900 truncate">{userProfile.name}</p>
                    <p className="text-[10px] truncate mt-0.5 text-gray-500">{userProfile.title || userProfile.role}</p>
                    {userProfile.department && (
                      <p className="text-[10px] truncate text-gray-400">{userProfile.department.name}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-xl bg-gray-200 flex-shrink-0" />
              )}
            </div>
          </header>
        )}

        {/* Embedded sidebar toggle */}
        {embedded && (
          <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--card-border)" }}>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
              style={{ background: "var(--primary-pale)", color: "var(--primary)" }}
              title={sidebarOpen ? "Hide sessions" : "Show sessions"}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              {sidebarOpen ? "Hide history" : "Chat history"}
            </span>
          </div>
        )}

        {/* Loading history */}
        {loadingHistory && (
          <div className="px-4 py-2 text-center text-xs flex-shrink-0 text-purple-600 bg-purple-50/60 border-b border-purple-100">
            Loading messages…
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="space-y-4">

            {/* New chat welcome \u2014 quote + suggestions */}
            {messages.length === 1 && !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl font-black text-2xl mb-6 flex items-center justify-center" style={{ background: "var(--primary-dark)", color: "var(--primary)", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                  ✦
                </div>
                <p className="text-lg font-semibold max-w-sm leading-snug mb-1.5" style={{ color: "#111827" }}>
                  "{quote}"
                </p>
                <p className="text-sm mb-8" style={{ color: "#9CA3AF" }}>What can I help you with today?</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {DEFAULT_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="text-xs rounded-xl px-4 py-2.5 transition-all font-medium"
                      style={{ background: "white", color: "#374151", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: "1px solid rgba(0,0,0,0.06)" }}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "var(--primary-dark)"; b.style.color = "white"; b.style.border = "1px solid transparent"; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "white"; b.style.color = "#374151"; b.style.border = "1px solid rgba(0,0,0,0.06)"; }}
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
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center mr-2.5 mt-0.5 flex-shrink-0 text-sm font-bold" style={{ background: "var(--primary)", color: "var(--primary-dark)" }}>
                    🔔
                  </div>
                  <div
                    className="max-w-[78%] px-5 py-4 text-sm bg-white cursor-pointer" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)", borderRadius: "4px 16px 16px 16px" }}
                    onClick={() => msg.notificationId && markNotificationRead(msg.notificationId)}
                  >
                    <div className="prose prose-sm max-w-none text-gray-900">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                    {msg.notifMetadata && msg.notifMetadata.actioned_by_name ? (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: "var(--primary)", color: "var(--primary-dark)" }}>
                          {String(msg.notifMetadata.actioned_by_name).slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          {msg.notifMetadata.status === "APPROVED" || msg.notifMetadata.status === "approved"
                            ? "Approved"
                            : "Rejected"} by <span className="font-semibold text-gray-700">{String(msg.notifMetadata.actioned_by_name)}</span>
                        </span>
                      </div>
                    ) : null}
                    {msg.ctas && msg.ctas.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                        {msg.ctas.map((cta) => (
                          <button
                            key={cta.label}
                            onClick={() => {
                              if (msg.notificationId) markNotificationRead(msg.notificationId);
                              const renotifyMatch = cta.action.match(/^__renotify_leave_(\d+)$/);
                              if (renotifyMatch) {
                                handleRenotifyLeave(parseInt(renotifyMatch[1], 10));
                                return;
                              }
                              submit(cta.action);
                            }}
                            className={`text-xs font-semibold px-4 py-1.5 rounded-full transition-all ${cta.style === "danger"
                              ? "bg-red-100 text-red-700 hover:bg-red-200"
                              : ""
                              }`}
                          >
                            {cta.label}
                          </button>
                        ))}
                        {msg.notificationId && (
                          <button
                            onClick={() => {
                              markNotificationRead(msg.notificationId!);
                              setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                            }}
                            className="text-xs px-3 py-1.5 rounded-full transition-all text-gray-400 hover:bg-gray-100"
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
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center mr-2.5 mt-1 flex-shrink-0 text-[10px] font-black shadow-sm" style={{ background: "var(--primary-dark)", color: "var(--primary)" }}>
                      ✦
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] text-sm ${msg.role === "user"
                      ? "text-white px-4 py-3"
                      : msg.error
                        ? "bg-red-50 text-gray-800 border border-red-100 px-4 py-3.5"
                        : "bg-white text-gray-800 px-5 py-4"
                      }`}
                    style={{
                      borderRadius: msg.role === "user" ? "20px 20px 6px 20px" : "6px 20px 20px 20px",
                      background: msg.role === "user" ? "var(--primary-dark)" : msg.error ? undefined : "white",
                      boxShadow: msg.role === "user" ? "none" : msg.error ? "none" : "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
                    }}
                  >
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    ) : (
                      <>
                        <AssistantContent
                          content={msg.content}
                          onCta={(btn) => submit(btn)}
                          hideCtas={Boolean(msg.tool_results?.save_roadmap_draft)}
                        />
                        {msg.tool_results && (() => {
                          const inlineCTAs = buildInlineCTAs(msg.tool_results);
                          const roadmapKeys = [
                            "generate_skill_roadmap", "get_roadmap_details",
                            "confirm_roadmap_draft",
                            "submit_roadmap_step", "approve_roadmap_step",
                            "reject_roadmap_step", "approve_roadmap", "reject_roadmap",
                          ];
                          const draftData = msg.tool_results!["save_roadmap_draft"];
                          const hasDraft = Boolean(draftData?.draft_id && Array.isArray(draftData?.steps) && draftData.steps.length > 0);
                          const roadmapData = roadmapKeys
                            .map(k => msg.tool_results![k])
                            .find(v => v?.id && v?.steps);
                          const pendingList: any[] | undefined =
                            msg.tool_results!["get_pending_roadmap_approvals"]?.pending_roadmaps;
                          const roadmapListItem = msg.tool_results!["get_skill_roadmaps"]?.roadmaps?.[0];
                          const resolvedRoadmap = roadmapData ?? (pendingList?.[0]) ?? null;
                          return (
                            <>
                              {inlineCTAs.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                                  {inlineCTAs.map((cta) => (
                                    <button
                                      key={cta.label}
                                      onClick={() => submit(cta.action)}
                                      className={`text-xs font-semibold px-4 py-1.5 rounded-full transition-all ${cta.style === "danger" ? "bg-red-100 text-red-700 hover:bg-red-200" : "text-white"}`}
                                      style={cta.style !== "danger" ? { background: "var(--primary-dark)" } : undefined}
                                    >
                                      {cta.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {hasDraft && (
                                <DraftRoadmapChatCard
                                  draft={draftData}
                                  onAction={submit}
                                />
                              )}
                              {resolvedRoadmap && (
                                <RoadmapChatCard
                                  roadmap={resolvedRoadmap}
                                  role={userProfile?.role ?? "employee"}
                                  token={getAccess() ?? ""}
                                  onAction={submit}
                                  employeeId={userProfile?.employee_id}
                                />
                              )}
                            </>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center mr-2.5 mt-1 flex-shrink-0 text-[10px] font-black shadow-sm" style={{ background: "var(--primary-dark)", color: "var(--primary)" }}>
                  ✦
                </div>
                <div className="px-5 py-4 bg-white" style={{ borderRadius: "6px 20px 20px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)" }}>
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-2 h-2 rounded-full animate-bounce [animation-delay:-0.3s]" style={{ background: "var(--primary)" }} />
                    <span className="w-2 h-2 rounded-full animate-bounce [animation-delay:-0.15s]" style={{ background: "var(--primary)" }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--primary)" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input bar */}
        <div className="px-6 py-4 flex-shrink-0" style={{ background: "#FAFAFA", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          <form
            onSubmit={(e) => { e.preventDefault(); submit(input); }}
          >
            <div className="flex items-end gap-3 px-4 py-3 rounded-2xl transition-all" style={{ background: "white", boxShadow: "0 0 0 1px rgba(0,0,0,0.07), 0 4px 20px rgba(0,0,0,0.06)" }}>
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything — leave, attendance, payroll…"
                className="flex-1 bg-transparent text-sm resize-none outline-none py-1 min-h-[22px] text-gray-900 placeholder-gray-400 leading-relaxed"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all mb-0.5 disabled:opacity-25"
                style={{ background: input.trim() && !loading ? "var(--primary-dark)" : "#E5E7EB" }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={input.trim() && !loading ? "white" : "#9CA3AF"} strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <p className="text-center text-[10px] mt-2" style={{ color: "rgba(0,0,0,0.25)" }}>
              Enter to send · Shift+Enter for new line
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
